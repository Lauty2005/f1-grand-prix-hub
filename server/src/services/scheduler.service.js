// server/src/services/scheduler.service.js
// ─────────────────────────────────────────────────────────────────────────────
// AUTOMATED ARTICLE SCHEDULER
//
//   checkAndGenerateWeeklyPreview()     → lunes, 7 días antes del GP
//   checkAndGenerateQualyArticle()      → sábado, tras clasificación
//   checkAndGenerateWeeklyStandings()   → lunes post-carrera
// ─────────────────────────────────────────────────────────────────────────────

import { query }           from '../config/db.js';
import { generateArticle } from './aiArticle.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateOffset(daysAhead = 0) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
}

function normalizeRaceName(name = '') {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/gran premio\s+(de|del|de la|de los)?\s*/i, '')
        .replace(/grand prix\s+(of)?\s*/i, '')
        .replace(/gp\s+/i, '')
        .replace(/\d{4}/, '')
        .trim();
}

async function findPreviousYearRace(raceName, currentYear) {
    const prevYear   = currentYear - 1;
    const normalized = normalizeRaceName(raceName);

    const { rows } = await query(`
        SELECT id, name, date FROM races
        WHERE date >= $1 AND date < $2
          AND LOWER(
                REGEXP_REPLACE(
                  UNACCENT(name),
                  'gran premio (de |del |de la |de los )?|grand prix (of )?|gp |\\d{4}',
                  '', 'gi'
                )
              ) ILIKE $3
        ORDER BY date ASC LIMIT 1
    `, [`${prevYear}-01-01`, `${currentYear}-01-01`, `%${normalized}%`]);

    if (rows.length) return rows[0];

    // Fallback fuzzy
    const keywords = normalized.split(/\s+/).slice(0, 3).join('%');
    const { rows: fuzzy } = await query(`
        SELECT id, name, date FROM races
        WHERE date >= $1 AND date < $2
          AND LOWER(UNACCENT(name)) ILIKE $3
        ORDER BY date ASC LIMIT 1
    `, [`${prevYear}-01-01`, `${currentYear}-01-01`, `%${keywords}%`]);

    return fuzzy[0] || null;
}

async function articleAlreadyExists(category, raceName, daysWindow = 8) {
    const normalized = normalizeRaceName(raceName);
    const { rows } = await query(`
        SELECT id, title FROM articles
        WHERE category = $1
          AND created_at >= NOW() - ($2 || ' days')::INTERVAL
          AND LOWER(title) ILIKE $3
        LIMIT 1
    `, [category, daysWindow.toString(), `%${normalized}%`]);
    return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PREVIEW PRE-CARRERA — lunes, 7 días antes del GP
// ─────────────────────────────────────────────────────────────────────────────
export const checkAndGenerateWeeklyPreview = async () => {
    const targetDate  = getDateOffset(7);
    const currentYear = new Date().getFullYear();

    console.log(`[Preview] Buscando GP en: ${targetDate}`);

    const { rows: upcoming } = await query(`
        SELECT id, name, round, date FROM races
        WHERE date = $1 ORDER BY round ASC LIMIT 1
    `, [targetDate]);

    if (!upcoming.length) {
        return { triggered: false, message: `No hay GP programado para ${targetDate}.` };
    }

    const upcomingRace = upcoming[0];
    console.log(`[Preview] GP encontrado: "${upcomingRace.name}"`);

    const prevRace = await findPreviousYearRace(upcomingRace.name, currentYear);
    if (!prevRace) {
        return {
            triggered:     false,
            upcoming_race: upcomingRace.name,
            message:       `No se encontró carrera equivalente en ${currentYear - 1}.`,
        };
    }

    const existing = await articleAlreadyExists('preview', upcomingRace.name);
    if (existing) {
        return {
            triggered:           false,
            upcoming_race:       upcomingRace.name,
            message:             `Ya existe un preview reciente: "${existing.title}"`,
            existing_article_id: existing.id,
        };
    }

    console.log(`[Preview] Generando desde race_id: ${prevRace.id}`);
    const result = await generateArticle(prevRace.id, 'preview', 'IA Redacción');

    return {
        triggered:     true,
        upcoming_race: upcomingRace.name,
        based_on:      prevRace.name,
        article:       result.article,
        tokens_used:   result.usage,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ARTÍCULO DE CLASIFICACIÓN — sábado 18:00 UTC
// ─────────────────────────────────────────────────────────────────────────────
export const checkAndGenerateQualyArticle = async () => {
    const today = getDateOffset(0);

    console.log(`[Qualy] Buscando GP con clasificación hoy: ${today}`);

    const { rows: races } = await query(`
        SELECT id, name, round, date FROM races
        WHERE date::date BETWEEN $1::date + INTERVAL '1 day'
                              AND $1::date + INTERVAL '2 days'
        ORDER BY date ASC LIMIT 1
    `, [today]);

    if (!races.length) {
        return { triggered: false, message: `No hay GP este fin de semana.` };
    }

    const race = races[0];
    console.log(`[Qualy] GP del fin de semana: "${race.name}"`);

    const { rows: qualyData } = await query(`
        SELECT COUNT(*) AS total FROM qualifying WHERE race_id = $1
    `, [race.id]);

    const totalQualyRows = parseInt(qualyData[0]?.total || 0);
    if (totalQualyRows < 5) {
        return {
            triggered: false,
            race:      race.name,
            message:   `Solo hay ${totalQualyRows} registros de qualy. Esperando datos completos.`,
        };
    }

    const existing = await articleAlreadyExists('noticias', race.name, 3);
    if (existing) {
        return {
            triggered:           false,
            race:                race.name,
            message:             `Ya existe un artículo de qualy reciente: "${existing.title}"`,
            existing_article_id: existing.id,
        };
    }

    console.log(`[Qualy] Generando para race_id: ${race.id} (${totalQualyRows} registros)`);
    const result = await generateArticle(race.id, 'qualifying', 'IA Redacción');

    return {
        triggered:   true,
        race:        race.name,
        qualy_rows:  totalQualyRows,
        article:     result.article,
        tokens_used: result.usage,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. STANDINGS SEMANAL — lunes 10:00 UTC
// ─────────────────────────────────────────────────────────────────────────────
export const checkAndGenerateWeeklyStandings = async () => {
    const today = getDateOffset(0);

    console.log(`[Standings] Buscando carrera reciente para: ${today}`);

    const { rows: races } = await query(`
        SELECT id, name, round, date FROM races
        WHERE date::date BETWEEN $1::date - INTERVAL '2 days'
                              AND $1::date - INTERVAL '1 day'
        ORDER BY date DESC LIMIT 1
    `, [today]);

    if (!races.length) {
        return { triggered: false, message: `No hubo GP en los últimos 2 días.` };
    }

    const race = races[0];
    console.log(`[Standings] Carrera reciente: "${race.name}" (${race.date})`);

    const { rows: resultsData } = await query(`
        SELECT COUNT(*) AS total FROM results WHERE race_id = $1
    `, [race.id]);

    const totalResults = parseInt(resultsData[0]?.total || 0);
    if (totalResults < 10) {
        return {
            triggered: false,
            race:      race.name,
            message:   `Solo hay ${totalResults} resultados. Esperando datos completos.`,
        };
    }

    const existing = await articleAlreadyExists('noticias', race.name, 4);
    if (existing) {
        return {
            triggered:           false,
            race:                race.name,
            message:             `Ya existe un artículo de standings para esta carrera: "${existing.title}"`,
            existing_article_id: existing.id,
        };
    }

    console.log(`[Standings] Generando para race_id: ${race.id}`);
    const result = await generateArticle(race.id, 'standings', 'IA Redacción');

    return {
        triggered:   true,
        race:        race.name,
        article:     result.article,
        tokens_used: result.usage,
    };
};