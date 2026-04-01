import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../config/db.js';

// ── Provider config ───────────────────────────────────────────
const PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

const ANTHROPIC_MODEL = process.env.AI_MODEL || 'claude-3-5-haiku-20241022';
const GEMINI_MODEL    = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

// ── System prompt: voz editorial ─────────────────────────────
const SYSTEM_PROMPT = `Sos un periodista especializado en Fórmula 1 que escribe para un sitio web en español rioplatense (Argentina).
Tu estilo es dinámico, técnico pero accesible, apasionado. Usás "vos" en lugar de "tú".
Escribís artículos originales basados ÚNICAMENTE en los datos que te proporcionan — nunca inventés tiempos, posiciones o citas.
Cuando faltan datos, mencionás los hechos disponibles de forma interesante sin especular.

Siempre respondés con un JSON válido (sin markdown, sin bloques de código) con esta estructura exacta:
{
  "title": "Título atractivo y SEO-friendly (máx 80 caracteres)",
  "excerpt": "Resumen de 1-2 oraciones para preview de la nota (máx 200 caracteres)",
  "content": "Contenido HTML completo usando solo <p>, <h2>, <h3>, <strong>, <em>, <ul>, <li>. IMPORTANTE: el HTML debe estar en una sola línea, sin saltos de línea reales dentro del string.",
  "category": "noticias|analisis|tecnica",
  "tags": ["tag1", "tag2", "tag3"]
}
CRÍTICO: El valor de "content" debe ser un string JSON válido en UNA SOLA LÍNEA. No uses saltos de línea reales (\\n literal está bien, pero Enter/newline real no).`;

// ── Recopilar contexto de la carrera desde la DB ─────────────
async function collectRaceContext(raceId) {
    const ctx = {};

    // Información básica de la carrera
    const raceRes = await query(`
        SELECT r.*,
               r.first_gp_year, r.drs_zones, r.circuit_notes
        FROM races r
        WHERE r.id = $1
    `, [raceId]);
    if (!raceRes.rows.length) throw new Error(`Carrera ${raceId} no encontrada`);
    ctx.race = raceRes.rows[0];

    // Top 10 resultados de carrera
    const resultsRes = await query(`
        SELECT res.position, res.points, res.dnf, res.dsq, res.dns,
               res.fastest_lap,
               d.first_name, d.last_name, d.permanent_number,
               c.name AS team
        FROM results res
        JOIN drivers d ON res.driver_id = d.id
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = EXTRACT(YEAR FROM (SELECT date FROM races WHERE id = $1))::int
        JOIN constructors c ON c.id = ds.constructor_id
        WHERE res.race_id = $1
        ORDER BY res.position ASC NULLS LAST
        LIMIT 15
    `, [raceId]);
    ctx.results = resultsRes.rows;

    // Top 5 clasificación
    const qualyRes = await query(`
        SELECT q.position, d.last_name, c.name AS team, q.q3, q.q1
        FROM qualifying q
        JOIN drivers d ON q.driver_id = d.id
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = EXTRACT(YEAR FROM (SELECT date FROM races WHERE id = $1))::int
        JOIN constructors c ON c.id = ds.constructor_id
        WHERE q.race_id = $1
        ORDER BY q.position ASC
        LIMIT 5
    `, [raceId]);
    ctx.qualifying = qualyRes.rows;

    // Datos de estrategia (si existen)
    const stratRes = await query(`
        SELECT d.last_name, rs.stint_number, rs.tire_compound,
               rs.start_lap, rs.end_lap, rs.pit_duration,
               (rs.end_lap - rs.start_lap + 1) AS laps
        FROM race_strategies rs
        JOIN drivers d ON rs.driver_id = d.id
        JOIN results res ON (res.race_id = rs.race_id AND res.driver_id = rs.driver_id)
        WHERE rs.race_id = $1
        ORDER BY res.position ASC NULLS LAST, rs.stint_number ASC
        LIMIT 40
    `, [raceId]);
    ctx.strategy = stratRes.rows;

    // Momentos clave de esta carrera
    const momentsRes = await query(`
        SELECT type, title, description, driver_name, team_name
        FROM timeline_moments
        WHERE race_id = $1
        ORDER BY id ASC
    `, [raceId]);
    ctx.moments = momentsRes.rows;

    // Top 5 campeonato del año de la carrera
    const year = new Date(ctx.race.date).getFullYear();
    const standingsRes = await query(`
        SELECT d.first_name, d.last_name, c.name AS team,
               SUM(res.points + COALESCE(sp.points, 0)) AS total_points
        FROM results res
        JOIN races r ON res.race_id = r.id
        JOIN drivers d ON res.driver_id = d.id
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = $3::int
        JOIN constructors c ON c.id = ds.constructor_id
        LEFT JOIN sprint_results sp ON (sp.race_id = res.race_id AND sp.driver_id = res.driver_id)
        WHERE r.date >= $1 AND r.date <= $2
        GROUP BY d.id, d.first_name, d.last_name, c.name
        ORDER BY total_points DESC
        LIMIT 5
    `, [`${year}-01-01`, ctx.race.date, year]);
    ctx.standings = standingsRes.rows;

    // Sprint (si aplica)
    if (ctx.race.has_sprint) {
        const sprintRes = await query(`
            SELECT sp.position, sp.points, d.last_name, c.name AS team
            FROM sprint_results sp
            JOIN drivers d ON sp.driver_id = d.id
            JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = EXTRACT(YEAR FROM (SELECT date FROM races WHERE id = $1))::int
            JOIN constructors c ON c.id = ds.constructor_id
            WHERE sp.race_id = $1
            ORDER BY sp.position ASC
            LIMIT 8
        `, [raceId]);
        ctx.sprint = sprintRes.rows;
    }

    return ctx;
}

// ── Formateadores de contexto por tipo de artículo ────────────
function formatContext(ctx) {
    const { race, results, qualifying, strategy, moments, standings, sprint } = ctx;
    const parts = [];

    parts.push(`## GRAN PREMIO: ${race.name}`);
    parts.push(`Circuito: ${race.circuit_name} | País: ${race.country_code} | Ronda: ${race.round}`);
    parts.push(`Vueltas: ${race.total_laps || 'N/D'} | Distancia: ${race.race_distance || 'N/D'} | Longitud: ${race.circuit_length || 'N/D'}`);
    if (race.lap_record) parts.push(`Récord de vuelta: ${race.lap_record}`);
    if (race.circuit_notes) parts.push(`Notas del circuito: ${race.circuit_notes}`);

    if (qualifying.length) {
        parts.push(`\n## CLASIFICACIÓN (Top 5)`);
        qualifying.forEach(q => {
            parts.push(`P${q.position}: ${q.last_name} (${q.team}) — ${q.q3 || q.q1 || 'N/D'}`);
        });
    }

    if (sprint?.length) {
        parts.push(`\n## SPRINT (Top 8)`);
        sprint.forEach(s => parts.push(`P${s.position}: ${s.last_name} (${s.team}) +${s.points}pts`));
    }

    if (results.length) {
        parts.push(`\n## RESULTADOS DE CARRERA`);
        results.forEach(r => {
            if (r.dnf) parts.push(`DNF: ${r.first_name} ${r.last_name} (${r.team})`);
            else if (r.dsq) parts.push(`DSQ: ${r.first_name} ${r.last_name} (${r.team})`);
            else if (r.dns) parts.push(`DNS: ${r.first_name} ${r.last_name} (${r.team})`);
            else {
                const fl = r.fastest_lap ? ' [VR]' : '';
                parts.push(`P${r.position}: ${r.first_name} ${r.last_name} (${r.team}) +${r.points}pts${fl}`);
            }
        });
    }

    if (strategy.length) {
        parts.push(`\n## ESTRATEGIA DE NEUMÁTICOS`);
        let currentDriver = null;
        strategy.forEach(s => {
            if (s.last_name !== currentDriver) {
                currentDriver = s.last_name;
                parts.push(`${s.last_name}:`);
            }
            const pit = s.pit_duration ? ` (pit: ${s.pit_duration})` : '';
            parts.push(`  Stint ${s.stint_number}: ${s.tire_compound} — ${s.laps} vueltas (L${s.start_lap}–L${s.end_lap})${pit}`);
        });
    }

    if (moments.length) {
        parts.push(`\n## MOMENTOS CLAVE`);
        moments.forEach(m => {
            const who = m.driver_name ? ` [${m.driver_name}]` : '';
            parts.push(`[${m.type.toUpperCase()}] ${m.title}${who}: ${m.description || ''}`);
        });
    }

    if (standings.length) {
        parts.push(`\n## CAMPEONATO (tras esta carrera)`);
        standings.forEach((s, i) => {
            parts.push(`P${i+1}: ${s.first_name} ${s.last_name} (${s.team}) — ${s.total_points} pts`);
        });
    }

    return parts.join('\n');
}

// ── Prompts por tipo ──────────────────────────────────────────
function buildPrompt(ctx, type) {
    const context = formatContext(ctx);

    const instructions = {
        race_report: `Escribí una CRÓNICA DE CARRERA completa y emocionante.
Cubrí: la largada, los momentos decisivos, el desenlace, actuaciones destacadas y análisis del resultado.
Extensión: ~500 palabras. Incluí mínimo 3 secciones con <h2>.`,

        strategy: `Escribí un ANÁLISIS DE ESTRATEGIA centrado en las decisiones tácticas de neumáticos y pit stops.
Explicá qué estrategias se usaron, cuál fue la más efectiva, qué role jugaron los undercuts/overcuts.
Si no hay datos de estrategia, hacé un análisis táctico general basándote en los resultados.
Extensión: ~400 palabras. Incluí mínimo 2 secciones con <h2>.`,

        standings: `Escribí un ANÁLISIS DEL CAMPEONATO enfocado en cómo este resultado impacta la lucha por los títulos.
Analizá la situación de los líderes, los que ganaron/perdieron posiciones y qué se viene.
Extensión: ~350 palabras. Incluí mínimo 2 secciones con <h2>.`,
    };

    return `${instructions[type] || instructions.race_report}

DATOS DISPONIBLES:
${context}

IMPORTANTE:
- Respondé SOLO con el JSON, sin texto adicional ni bloques de código
- El campo "content" debe ser HTML válido
- Los "tags" deben incluir el nombre del GP, pilotos destacados y el equipo ganador`;
}

// ── Llamadas a cada proveedor ─────────────────────────────────
async function callAnthropic(userPrompt) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY no está configurada en el servidor.');
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
        model:      ANTHROPIC_MODEL,
        max_tokens: 8192,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userPrompt }],
    });
    return {
        text:   message.content[0]?.text || '',
        usage:  message.usage,
    };
}

async function callGemini(userPrompt) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model:          GEMINI_MODEL,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens:  8192,
        },
    });
    const result = await model.generateContent(userPrompt);
    const text   = result.response.text();
    const meta   = result.response.usageMetadata;
    return {
        text,
        usage: {
            input_tokens:  meta?.promptTokenCount  || 0,
            output_tokens: meta?.candidatesTokenCount || 0,
        },
    };
}

async function callAI(userPrompt) {
    if (PROVIDER === 'gemini') return callGemini(userPrompt);
    return callAnthropic(userPrompt);
}

// ── Entry point principal ─────────────────────────────────────
export const generateArticle = async (raceId, type = 'race_report', authorName = 'IA Redacción') => {
    // 1. Recopilar datos
    const ctx = await collectRaceContext(raceId);
    if (!ctx.results.length && !ctx.standings.length) {
        throw new Error('No hay suficientes datos de carrera para generar el artículo. Cargá los resultados primero.');
    }

    // 2. Construir prompt
    const userPrompt = buildPrompt(ctx, type);

    // 3. Llamar al proveedor activo
    const { text: rawText, usage } = await callAI(userPrompt);

    // 4. Parsear JSON
    let parsed;
    try {
        // Strip accidental markdown fences
        let clean = rawText.replace(/^```json?\s*/m, '').replace(/```\s*$/m, '').trim();

        // Attempt 1: direct parse
        try {
            parsed = JSON.parse(clean);
        } catch {
            // Attempt 2: extract outermost {...} block (handles extra text before/after)
            const match = clean.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('no JSON object found');
            // Attempt 3: inside the block, collapse literal newlines inside JSON string values
            // This handles models that put real \n inside the "content" field
            const sanitized = match[0].replace(/(?<=":[\s]*"[^"\\]*)(\r?\n)(?=[^"]*")/g, '\\n');
            parsed = JSON.parse(sanitized);
        }
    } catch (parseErr) {
        console.error('[AI Article] Parse error:', parseErr.message);
        console.error('[AI Article] Raw response:', rawText.slice(0, 1000));
        throw new Error(`La IA devolvió una respuesta inesperada. Intentá de nuevo.\n\nRespuesta: ${rawText.slice(0, 300)}`);
    }

    // 5. Guardar como borrador en articles
    const { title, excerpt, content, category, tags } = parsed;
    const slug = title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        + '-' + Date.now();

    const insertRes = await query(`
        INSERT INTO articles
            (title, slug, excerpt, content, author, category, tags, published, featured, cover_image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, false, null)
        RETURNING id, slug
    `, [
        title,
        slug,
        excerpt || null,
        content,
        authorName,
        category || 'noticias',
        tags || [],
    ]);

    return {
        article:   insertRes.rows[0],
        usage,
        race_name: ctx.race.name,
        provider:  PROVIDER,
    };
};
