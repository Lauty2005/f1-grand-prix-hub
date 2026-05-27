import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../config/db.js';
import * as strategyService from './strategy.service.js';

const PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
const ANTHROPIC_MODEL = process.env.AI_MODEL || 'claude-3-5-haiku-20241022';
const GEMINI_MODEL    = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const SYSTEM_PROMPT = `Sos un experto en estrategia de Fórmula 1. Generás datos estructurados de estrategias de carrera (stints de neumáticos) en formato JSON.
Conocés en profundidad las tácticas de neumáticos: undercuts, overcuts, safety car windows, ventanas de pit stop y características de cada circuito.
Siempre respondés con JSON válido, sin markdown ni bloques de código.`;

async function collectStrategyContext(raceId) {
    const raceRes = await query(`
        SELECT id, name, circuit_name, total_laps, circuit_length, circuit_notes, date, country_code, has_sprint
        FROM races WHERE id = $1
    `, [raceId]);
    if (!raceRes.rows.length) throw new Error(`Carrera ${raceId} no encontrada`);
    const race = raceRes.rows[0];

    const year = new Date(race.date).getFullYear();

    const driversRes = await query(`
        SELECT d.id AS driver_id, d.first_name, d.last_name, d.permanent_number,
               c.name AS team,
               res.position, res.dnf, res.dsq, res.dns, res.fastest_lap
        FROM results res
        JOIN drivers d         ON res.driver_id = d.id
        JOIN driver_seasons ds ON ds.driver_id = d.id AND ds.year = $2
        JOIN constructors c    ON c.id = ds.constructor_id
        WHERE res.race_id = $1
        ORDER BY res.position ASC NULLS LAST
    `, [raceId, year]);

    const qualyRes = await query(`
        SELECT d.last_name, q.position, q.q3, q.q1
        FROM qualifying q
        JOIN drivers d ON q.driver_id = d.id
        WHERE q.race_id = $1
        ORDER BY q.position ASC
        LIMIT 10
    `, [raceId]);

    return { race, year, drivers: driversRes.rows, qualifying: qualyRes.rows };
}

function buildPrompt(ctx) {
    const { race, drivers, qualifying } = ctx;
    const year = new Date(race.date).getFullYear();
    const totalLaps = race.total_laps || '?';

    const qualyLines = qualifying.length
        ? '\n## CLASIFICACIÓN (referencia de posición en parrilla):\n' +
          qualifying.map(q => `P${q.position}: ${q.last_name} — ${q.q3 || q.q1 || 'N/D'}`).join('\n')
        : '';

    const driverLines = drivers
        .filter(d => !d.dns)
        .map(d => {
            const status = d.dnf ? ' [DNF]' : d.dsq ? ' [DSQ]' : ` → P${d.position}`;
            const fl = d.fastest_lap ? ' ⚡VR' : '';
            return `  driver_id:${d.driver_id} | ${d.first_name} ${d.last_name} (${d.team})${status}${fl}`;
        })
        .join('\n');

    const circuitNotes = race.circuit_notes ? `\nNotas del circuito: ${race.circuit_notes}` : '';

    return `Generá la estrategia de neumáticos real del Gran Premio de ${race.name} ${year}.

## CARRERA:
Circuito: ${race.circuit_name} (${race.country_code})
Total de vueltas: ${totalLaps}
Longitud por vuelta: ${race.circuit_length || 'N/D'}${circuitNotes}
${qualyLines}

## PILOTOS (excluidos DNS):
${driverLines}

## REGLAS PARA GENERAR LOS STINTS:
- Compuestos válidos: SOFT, MEDIUM, HARD (INTER y WET solo si la carrera fue en mojado)
- El stint 1 de cada piloto SIEMPRE empieza en la vuelta 1
- El último stint de cada piloto que terminó termina en la vuelta ${totalLaps}
- Para pilotos con DNF: el último stint termina en la vuelta estimada del abandono (basándose en la posición y circuito)
- Los start_lap y end_lap de los stints deben ser continuos y sin solapamientos
- pit_duration: tiempo en segundos del pit stop al FINAL de ese stint (ej: 2.4). El último stint de cada piloto NO tiene pit_duration (usar null)
- notes: opcional, string corto y simple SIN comillas internas ni caracteres especiales (ej: undercut, safety car L12, overcut). Usá null si no hay nada relevante
- Usá estrategias realistas para este circuito: qué compuestos suelen usarse, cuántos stops, etc.
- stint_number empieza en 1 para cada piloto

Respondé ÚNICAMENTE con este JSON (sin texto adicional, sin markdown):
{
  "stints": [
    {
      "driver_id": 123,
      "stint_number": 1,
      "tire_compound": "SOFT",
      "start_lap": 1,
      "end_lap": 20,
      "pit_duration": 2.4,
      "notes": null
    }
  ],
  "summary": "Breve resumen (1-2 oraciones) de la estrategia dominante de la carrera en español rioplatense"
}`;
}

async function callAnthropic(prompt) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada.');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
        model:      ANTHROPIC_MODEL,
        max_tokens: 8192,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: prompt }],
    });
    return { text: message.content[0]?.text || '', usage: message.usage };
}

async function callGemini(prompt) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada.');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
            // Desactivar thinking para output JSON estructurado (Gemini 2.5 Flash)
            thinkingConfig: { thinkingBudget: 0 },
        },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const meta = result.response.usageMetadata;
    return {
        text,
        usage: { input_tokens: meta?.promptTokenCount || 0, output_tokens: meta?.candidatesTokenCount || 0 },
    };
}

export const generateStrategyWithAI = async (raceId) => {
    const ctx = await collectStrategyContext(raceId);

    const activeDrivers = ctx.drivers.filter(d => !d.dns);
    if (!activeDrivers.length) {
        throw new Error('No hay resultados cargados para esta carrera. Cargá los resultados primero.');
    }

    const prompt = buildPrompt(ctx);
    const { text: rawText, usage } = PROVIDER === 'gemini'
        ? await callGemini(prompt)
        : await callAnthropic(prompt);

    let parsed;
    try {
        let clean = rawText.replace(/^```json?\s*/m, '').replace(/```\s*$/m, '').trim();
        // Attempt 1: direct parse
        try {
            parsed = JSON.parse(clean);
        } catch {
            // Attempt 2: extract outermost {...} block (handles extra text around JSON)
            const match = clean.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('no JSON object found');
            // Attempt 3: sanitize literal newlines inside string values
            try {
                parsed = JSON.parse(match[0]);
            } catch {
                const sanitized = match[0].replace(/(?<=":[\s]*"[^"\\]*)(\r?\n)(?=[^"]*")/g, '\\n');
                parsed = JSON.parse(sanitized);
            }
        }
    } catch (err) {
        console.error('[AI Strategy] Parse error:', err.message);
        console.error('[AI Strategy] Raw response:', rawText.slice(0, 1000));
        throw new Error(`La IA devolvió una respuesta inesperada. Intentá de nuevo.\n\nRespuesta: ${rawText.slice(0, 300)}`);
    }

    const stints = parsed.stints || [];
    let saved = 0;
    const errors = [];

    for (const stint of stints) {
        try {
            await strategyService.addStint({
                race_id:       raceId,
                driver_id:     stint.driver_id,
                stint_number:  stint.stint_number,
                tire_compound: stint.tire_compound,
                start_lap:     stint.start_lap,
                end_lap:       stint.end_lap,
                pit_duration:  stint.pit_duration ?? null,
                notes:         stint.notes ?? null,
            });
            saved++;
        } catch (err) {
            errors.push(`driver_id ${stint.driver_id} stint ${stint.stint_number}: ${err.message}`);
        }
    }

    return {
        stints_generated: stints.length,
        stints_saved:     saved,
        errors,
        summary:  parsed.summary || null,
        usage,
        provider: PROVIDER,
    };
};
