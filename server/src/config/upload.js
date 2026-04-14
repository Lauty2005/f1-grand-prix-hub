import multer from 'multer';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'images';

/**
 * Sube un buffer a Supabase Storage y retorna la URL pública.
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} originalname - Nombre original (para extraer extensión)
 * @param {string} folder - Subcarpeta dentro del bucket (ej: 'articles', 'pilots')
 */
export async function uploadToSupabase(buffer, originalname, folder) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_KEY');
    }

    const ext = path.extname(originalname).toLowerCase() || '.jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const filePath = `${folder}/${filename}`;

    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/octet-stream',
            'x-upsert': 'true',
        },
        body: buffer,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase Storage error (${res.status}): ${text}`);
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filePath}`;
}

/**
 * Crea el middleware multer con memoryStorage.
 * El parámetro folderName se mantiene por compatibilidad pero ya no determina el destino en disco.
 */
export const createUpload = (_folderName) => {
    const storage = multer.memoryStorage();

    const fileFilter = (req, file, cb) => {
        const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
        if (ALLOWED.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('¡Solo se permiten archivos de imagen!'), false);
        }
    };

    return multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });
};
