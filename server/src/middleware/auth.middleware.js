import jwt from 'jsonwebtoken';

export const adminAuth = (req, res, next) => {
    const token = req.cookies?.jwt_token;

    if (!token) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};