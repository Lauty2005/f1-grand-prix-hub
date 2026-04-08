import jwt from 'jsonwebtoken';

const EXPIRATION = 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === 'production';

export const login = (req, res) => {
    const { password } = req.body;

    // LOG TEMPORAL - borralo después
    console.log('ENV CHECK:', {
        hasPassword: !!process.env.ADMIN_PASSWORD,
        hasSecret: !!process.env.JWT_SECRET,
        nodeEnv: process.env.NODE_ENV,
        match: password === process.env.ADMIN_PASSWORD
    });

    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
        { role: 'admin' }, 
        process.env.JWT_SECRET, 
        { expiresIn: '24h' }
    );

    res.cookie('jwt_token', token, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'strict',
        maxAge: EXPIRATION
    });

    res.json({ success: true, message: 'Login exitoso' });
};

export const logout = (req, res) => {
    res.clearCookie('jwt_token', {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'strict'
    });
    res.json({ success: true, message: 'Logout exitoso' });
};

export const checkAuth = (req, res) => {
    const token = req.cookies?.jwt_token;
    if (!token) return res.status(401).json({ authenticated: false });

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        return res.json({ authenticated: true });
    } catch (err) {
        return res.status(401).json({ authenticated: false });
    }
};
