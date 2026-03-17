export const validateResult = (req, res, next) => {
    const { race_id, driver_id, position } = req.body;

    if (!race_id || !driver_id) {
        return res.status(400).json({ error: 'race_id y driver_id son requeridos' });
    }

    const pos = parseInt(position);
    if (isNaN(pos) || pos < 1 || pos > 20) {
        return res.status(400).json({ error: 'Posición inválida (1-20)' });
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