// server/src/services/scheduler.service.js
// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY PREVIEW SCHEDULER
// Busca si hay un GP exactamente en N días (por defecto 7).
// Si lo encuentra, busca la carrera equivalente del año anterior y
// genera un artículo de tipo "preview" como borrador en articles.
// ─────────────────────────────────────────────────────────────────────────────

import { query } from '../config/db.js';
import { generateArticle } from './aiArticle.service.js';

const LOOKAHEAD_DAYS = 7;

/**
 * Normaliza el nombre de un GP para poder comparar entre temporadas.
 * Ejemplo: "Gran Premio de Miami 2025" → "miami"
 * La lógica es simple: se queda con la parte más distintiva del nombre.
 */
function normalizeRaceName(name = '') {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // quita tildes
        .replace(/gran premio\s+(de|del|de la|de los)?\s*/i, '')
        .replace(/grand prix\s+(of)?\s*/i, '')
        .replace(/gp\s+/i, '')
        .replace(/\d{4}/, '')               // quita el año si está en el nombre
        .trim();
}

/**
 * Calcula la fecha objetivo: hoy + LOOKAHEAD_DAYS en formato YYYY-MM-DD
 */
function getTargetDate(daysAhead = LOOKAHEAD_DAYS) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
}

/**
 * Busca la carrera del año pasado que mejor matchea con un nombre dado.
 * Usa ILIKE para tolerancia a mayúsculas/diferencias menores.
 */
async function findPreviousYearRace(raceName, currentYear) {
    const previousYear = currentYear - 1;
    const normalized = normalizeRaceName(raceName);

    // Intento 1: match exacto por nombre normalizado en el año anterior
    const { rows: exactMatch } = await query(`
        SELECT id, name, date
        FROM races
        WHERE date >= $1 AND date < $2
          AND LOWER(
                REGEXP_REPLACE(
                  UNACCENT(name),
                  'gran premio (de |del |de la |de los )?|grand prix (of )?|gp |\\d{4}',
                  '', 'gi'
                )
              ) ILIKE $3
        ORDER BY date ASC
        LIMIT 1
    `, [
        `${previousYear}-01-01`,
        `${currentYear}-01-01`,
        `%${normalized}%`
    ]);

    if (exactMatch.length) return exactMatch[0];

    // Intento 2: fallback — buscar por las primeras 3 palabras significativas
    const keywords = normalized.split(/\s+/).slice(0, 3).join('%');
    const { rows: fuzzyMatch } = await query(`
        SELECT id, name, date
        FROM races
        WHERE date >= $1 AND date < $2
          AND LOWER(UNACCENT(name)) ILIKE $3
        ORDER BY date ASC
        LIMIT 1
    `, [
        `${previousYear}-01-01`,
        `${currentYear}-01-01`,
        `%${keywords}%`
    ]);

    return fuzzyMatch[0] || null;
}

/**
 * Entry point principal.
 * Retorna un objeto con el resultado de la operación para que el
 * controller pueda devolvérselo a GitHub Actions en el response body.
 */
export const checkAndGenerateWeeklyPreview = async () => {
    const targetDate = getTargetDate();
    const currentYear = new Date().getFullYear();

    console.log(`[Scheduler] Buscando GP en fecha: ${targetDate}`);

    // 1. ¿Hay un GP en exactamente 7 días?
    const { rows: upcomingRaces } = await query(`
        SELECT id, name, date, round
        FROM races
        WHERE date = $1
        ORDER BY round ASC
        LIMIT 1
    `, [targetDate]);

    if (!upcomingRaces.length) {
        return {
            triggered: false,
            message: `No hay GP programado para ${targetDate}. Nada que generar.`,
        };
    }

    const upcomingRace = upcomingRaces[0];
    console.log(`[Scheduler] GP encontrado: "${upcomingRace.name}" el ${upcomingRace.date}`);

    // 2. Buscar la carrera equivalente del año anterior
    const previousRace = await findPreviousYearRace(upcomingRace.name, currentYear);

    if (!previousRace) {
        return {
            triggered: false,
            upcoming_race: upcomingRace.name,
            message: `No se encontró una carrera equivalente en ${currentYear - 1} para "${upcomingRace.name}".`,
        };
    }

    console.log(`[Scheduler] Carrera del año anterior: "${previousRace.name}" (id: ${previousRace.id})`);

    // 3. ¿Ya existe un preview generado recientemente para esta carrera?
    // Evita duplicados si el workflow se corre dos veces en la misma semana.
    const { rows: existing } = await query(`
        SELECT id, title FROM articles
        WHERE category = 'preview'
          AND created_at >= NOW() - INTERVAL '8 days'
          AND (
            title ILIKE $1
            OR tags && ARRAY[$2]::text[]
          )
        LIMIT 1
    `, [
        `%${normalizeRaceName(upcomingRace.name)}%`,
        upcomingRace.name,
    ]);

    if (existing.length) {
        return {
            triggered: false,
            upcoming_race: upcomingRace.name,
            message: `Ya existe un preview reciente para "${upcomingRace.name}": "${existing[0].title}". Se omite la generación.`,
            existing_article_id: existing[0].id,
        };
    }

    // 4. Generar el artículo de preview
    console.log(`[Scheduler] Generando preview basado en race_id: ${previousRace.id}`);
    const result = await generateArticle(
        previousRace.id,
        'preview',
        'IA Redacción'
    );

    console.log(`[Scheduler] ✓ Preview generado: "${result.article.slug}"`);

    return {
        triggered: true,
        upcoming_race: upcomingRace.name,
        based_on: previousRace.name,
        article: result.article,
        tokens_used: result.usage,
    };
};
