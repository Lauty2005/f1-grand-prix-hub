// server/src/config/upload.js
import multer from 'multer';
import path from 'path';
import { randomBytes } from 'crypto';
import { uploadToR2 } from './r2.js';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

const fileFilter = (req, file, cb) => {
    ALLOWED_MIME.includes(file.mimetype)
        ? cb(null, true)
        : cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`), false);
};

// multer con memoryStorage: el archivo queda en req.file.buffer (no toca el disco)
const multerMemory = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ─── Middleware interno: sube el buffer a R2 ────────────────────────────────
function makeR2SingleMiddleware(folderName, fieldName) {
    return async (req, res, next) => {
        if (!req.file) return next();
        try {
            const ext = path.extname(req.file.originalname).toLowerCase();
            const key = `${folderName}/${Date.now()}-${randomBytes(3).toString('hex')}${ext}`;
            // req.fileUrl queda disponible para el handler de la ruta
            req.fileUrl = await uploadToR2(req.file.buffer, key, req.file.mimetype);
            next();
        } catch (err) {
            console.error(`[Upload R2] Error subiendo ${fieldName}:`, err.message);
            res.status(500).json({ error: 'Error al subir la imagen al storage.' });
        }
    };
}

function makeR2FieldsMiddleware(folderName) {
    return async (req, res, next) => {
        if (!req.files || Object.keys(req.files).length === 0) return next();
        try {
            req.fileUrls = {};
            for (const [fieldName, files] of Object.entries(req.files)) {
                const file = files[0];
                const ext  = path.extname(file.originalname).toLowerCase();
                const key  = `${folderName}/${fieldName}/${Date.now()}-${randomBytes(3).toString('hex')}${ext}`;
                req.fileUrls[fieldName] = await uploadToR2(file.buffer, key, file.mimetype);
            }
            next();
        } catch (err) {
            console.error('[Upload R2] Error subiendo fields:', err.message);
            res.status(500).json({ error: 'Error al subir la imagen al storage.' });
        }
    };
}

// ─── API pública ────────────────────────────────────────────────────────────
/**
 * Crea un helper de upload para una carpeta de R2.
 *
 * Uso en rutas:
 *   const upload = createUpload('articles');
 *   router.post('/...', adminAuth, ...upload.single('cover'), handler);
 *   router.post('/...', adminAuth, ...upload.fields([...]), handler);
 *
 * En el handler:
 *   req.fileUrl   → URL absoluta (para .single)
 *   req.fileUrls  → { fieldName: url, ... } (para .fields)
 */
export const createUpload = (folderName) => ({

    single: (fieldName) => [
        multerMemory.single(fieldName),
        makeR2SingleMiddleware(folderName, fieldName),
    ],

    fields: (fieldsConfig) => [
        multerMemory.fields(fieldsConfig),
        makeR2FieldsMiddleware(folderName),
    ],
});
