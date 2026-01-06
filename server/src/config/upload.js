import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para crear el middleware según la carpeta destino
export const createUpload = (folderName) => {
    
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            // Guardar en server/public/images/[folderName]
            // Desde src/config subimos 2 niveles (../../) hasta server, luego public/images/
            const destPath = path.join(__dirname, '../../public/images', folderName);
            cb(null, destPath);
        },
        filename: function (req, file, cb) {
            // Generar nombre único: nombreOriginal-timestamp.ext
            // Ej: norris-167888888.avif
            const name = file.originalname.split('.')[0].replace(/\s+/g, '-').toLowerCase();
            const uniqueSuffix = Date.now();
            cb(null, `${name}-${uniqueSuffix}${path.extname(file.originalname)}`);
        }
    });

    const fileFilter = (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('¡Solo se permiten archivos de imagen!'), false);
        }
    };

    return multer({ 
        storage: storage,
        fileFilter: fileFilter,
        limits: { fileSize: 5 * 1024 * 1024 } // 5MB
    });
};