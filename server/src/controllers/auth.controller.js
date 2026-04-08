import jwt from 'jsonwebtoken';

const EXPIRATION = 24 * 60 * 60 * 1000;
const IS_PROD = process.env.NODE_ENV === 'production';

export const login = (req, res) => {
    const { password } = req.body;
    if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
        { role: 'admin' }, 
        process.env.JWT_SECRET, 
        { expiresIn: '24h' }
    );

    // Devolver el token en el body en vez de cookie
    res.json({ success: true, token});
};

export const logout = (req, res) => {
    res.json({ success: true, message: 'Logout exitoso' });
};

export const checkAuth = (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1]; // Bearer <token>

    if (!token) return res.status(401).json({ authenticated: false });

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        return res.json({ authenticated: true });
    } catch (err) {
        return res.status(401).json({ authenticated: false });
    }
};
