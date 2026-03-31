import { query } from '../config/db.js';

export const getArticles = async ({ category, tag, featured, limit = 20, offset = 0 } = {}) => {
    const conditions = ['published = true'];
    const params = [];
    let p = 1;

    if (category) {
        conditions.push(`category = $${p++}`);
        params.push(category);
    }
    if (tag) {
        conditions.push(`$${p++} = ANY(tags)`);
        params.push(tag);
    }
    if (featured !== undefined) {
        conditions.push(`featured = $${p++}`);
        params.push(featured);
    }

    params.push(limit, offset);

    const sql = `
        SELECT id, title, slug, excerpt, author, cover_image_url, category, tags, featured, created_at
        FROM articles
        WHERE ${conditions.join(' AND ')}
        ORDER BY featured DESC, created_at DESC
        LIMIT $${p++} OFFSET $${p++}
    `;

    const result = await query(sql, params);
    return result.rows;
};

export const getArticleBySlug = async (slug) => {
    const result = await query(
        `SELECT id, title, slug, excerpt, content, author, cover_image_url, category, tags, featured, created_at
         FROM articles
         WHERE slug = $1 AND published = true`,
        [slug]
    );
    return result.rows[0] || null;
};

export const getRelatedArticles = async (articleId, category, limit = 3) => {
    const result = await query(
        `SELECT id, title, slug, excerpt, author, cover_image_url, category, created_at
         FROM articles
         WHERE published = true AND id != $1 AND category = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [articleId, category, limit]
    );
    return result.rows;
};

const slugify = (text) =>
    text
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

export const createArticle = async (data) => {
    const { title, excerpt, content, author = 'Redacción', cover_image_url, category = 'noticias', tags = [], published = false, featured = false } = data;

    const baseSlug = slugify(title);
    // Ensure unique slug by appending timestamp if collision
    const slug = `${baseSlug}-${Date.now()}`;

    const result = await query(
        `INSERT INTO articles (title, slug, excerpt, content, author, cover_image_url, category, tags, published, featured)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, slug`,
        [title, slug, excerpt || null, content, author, cover_image_url || null, category, tags, published, featured]
    );
    return result.rows[0];
};

export const updateArticle = async (id, data) => {
    const { title, excerpt, content, author, cover_image_url, category, tags, published, featured } = data;
    await query(
        `UPDATE articles
         SET title = $1, excerpt = $2, content = $3, author = $4, cover_image_url = $5,
             category = $6, tags = $7, published = $8, featured = $9, updated_at = NOW()
         WHERE id = $10`,
        [title, excerpt || null, content, author, cover_image_url || null, category, tags, published, featured, id]
    );
};

export const publishArticle = async (id, published) => {
    await query(
        `UPDATE articles SET published = $1, updated_at = NOW() WHERE id = $2`,
        [published, id]
    );
};

export const deleteArticle = async (id) => {
    await query('DELETE FROM articles WHERE id = $1', [id]);
};

export const getAllArticlesAdmin = async () => {
    const result = await query(
        `SELECT id, title, slug, category, published, featured, author, created_at
         FROM articles
         ORDER BY created_at DESC`
    );
    return result.rows;
};
