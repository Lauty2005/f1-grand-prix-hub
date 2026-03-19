export const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR GLOBAL] ${req.method} ${req.originalUrl} ->`, err.stack || err);
    res.status(err.status || 500).json({ 
        success: false, 
        error: err.message || 'Error interno del servidor. Consulte logs para detalles.'
    });
};
