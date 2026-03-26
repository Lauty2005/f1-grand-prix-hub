import { AppError } from '../errors/AppError.js';

export const errorHandler = (err, req, res, next) => {
    // Known application errors: log concisely, respond with their own status/message.
    if (err instanceof AppError) {
        console.error(`[${err.code}] ${req.method} ${req.originalUrl} -> ${err.message}`);
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            code: err.code,
        });
    }

    // Unknown errors: log full stack, respond with generic 500.
    console.error(`[ERROR GLOBAL] ${req.method} ${req.originalUrl} ->`, err.stack || err);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor.',
    });
};
