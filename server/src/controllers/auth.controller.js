import jwt from 'jsonwebtoken';

const EXPIRATION = 24 * 60 * 60 * 1000; 

export const login = (req, res) => {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
        { role: 'admin' }, 
        process.env.ADMIN_SECRET, 
        { expiresIn: '24h' }
    );

    res.cookie('jwt_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: EXPIRATION
    });

    res.json({ success: true, message: 'Login exitoso' });
};

export const logout = (req, res) => {
    res.clearCookie('jwt_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.json({ success: true, message: 'Logout exitoso' });
};

export const checkAuth = (req, res) => {
    const token = req.cookies?.jwt_token;
    if (!token) return res.status(401).json({ authenticated: false });

    try {
        jwt.verify(token, process.env.ADMIN_SECRET);
        return res.json({ authenticated: true });
    } catch (err) {
        return res.status(401).json({ authenticated: false });
    }
};
