import 'dotenv/config';

// server/src/config/r2.js
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';

// ─── Cliente R2 (compatible con S3) ────────────────────────────────────────
const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId:     process.env.CLOUDFLARE_R2_ACCESS_KEY,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY,
    },
});

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
const CDN    = process.env.CLOUDFLARE_R2_PUBLIC_URL; // ej: https://pub-xxx.r2.dev

// ─── Subir archivo ──────────────────────────────────────────────────────────
/**
 * Sube un Buffer a R2 y devuelve la URL pública.
 * @param {Buffer} buffer
 * @param {string} key   — Ruta dentro del bucket, ej: "articles/abc123.webp"
 * @param {string} mimeType
 * @returns {Promise<string>} URL pública absoluta
 */
export async function uploadToR2(buffer, key, mimeType) {
    await r2Client.send(
        new PutObjectCommand({
            Bucket:       BUCKET,
            Key:          key,
            Body:         buffer,
            ContentType:  mimeType,
            // Cache agresivo: Cloudflare CDN sirve con estos headers
            CacheControl: 'public, max-age=31536000, immutable',
        })
    );
    return `${CDN}/${key}`;
}

// ─── Eliminar archivo ────────────────────────────────────────────────────────
/**
 * Elimina un archivo del bucket. No lanza error si no existe.
 * @param {string} key — Ruta del archivo en el bucket
 */
export async function deleteFromR2(key) {
    if (!key) return;
    try {
        await r2Client.send(
            new DeleteObjectCommand({ Bucket: BUCKET, Key: key })
        );
    } catch (err) {
        // No es fatal si falla el delete (ej: archivo ya borrado)
        console.warn(`[R2] No se pudo eliminar "${key}":`, err.message);
    }
}

// ─── Listar archivos por prefijo ─────────────────────────────────────────────
/**
 * Lista todos los objetos que coincidan con un prefijo.
 * @param {string} prefix — ej: "schedule/" o "circuits/"
 * @returns {Promise<Array<{name: string, url: string}>>}
 */
export async function listR2Objects(prefix) {
    const objects = [];
    let continuationToken;

    do {
        const res = await r2Client.send(
            new ListObjectsV2Command({
                Bucket:            BUCKET,
                Prefix:            prefix,
                ContinuationToken: continuationToken,
            })
        );

        for (const obj of res.Contents ?? []) {
            const name = obj.Key.replace(prefix, '');
            if (name) {
                objects.push({ name, url: `${CDN}/${obj.Key}` });
            }
        }

        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);

    return objects;
}

// ─── Extraer key de una URL pública ─────────────────────────────────────────
/**
 * Convierte una URL pública de R2 en su key del bucket.
 * Útil para eliminar el archivo antiguo al actualizar recursos.
 * @param {string|null} publicUrl
 * @returns {string|null}
 */
export function getKeyFromUrl(publicUrl) {
    if (!publicUrl) return null;
    const base = CDN;
    if (!base || !publicUrl.startsWith(base)) return null;
    return publicUrl.replace(`${base}/`, '');
}
