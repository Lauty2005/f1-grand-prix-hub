export const validateArticle = (req, res, next) => {
    const { title, content } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'El título es requerido.' });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'El contenido es requerido.' });
    }
    next();
};

export const validateResult = (req, res, next) => {
    const { race_id, driver_id, position } = req.body;

    if (!race_id || !driver_id) {
        return res.status(400).json({ error: 'race_id y driver_id son requeridos' });
    }

    const pos = parseInt(position);
    if (isNaN(pos) || pos < 1 || pos > 22) {
        return res.status(400).json({ error: 'Posición inválida (1-22)' });
    }

    next();
};

export const validateRace = (req, res, next) => {
    const { name, round, country_code, date } = req.body;

    if (!name || !round || !country_code || !date) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    if (isNaN(new Date(date).getTime())) {
        return res.status(400).json({ error: 'Fecha inválida' });
    }

    next();
};