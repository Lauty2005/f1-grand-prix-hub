#!/usr/bin/env node
/**
 * dev-token.js — firma un token de agente con el JWT_SECRET local y lo imprime.
 *
 * Mismo payload que GET /api/auth/agent-token (ver auth.controller.js), pero
 * sin tener que conocer CRON_SECRET ni levantar el servidor.
 *
 * SOLO PARA DESARROLLO. Nunca se usa en producción.
 *
 *   make token
 *   docker compose exec api node scripts/dev-token.js
 *   cd server && node scripts/dev-token.js
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

if (process.env.NODE_ENV === 'production') {
    console.error('dev-token.js no se ejecuta con NODE_ENV=production.');
    process.exit(1);
}

const secret = process.env.JWT_SECRET;
if (!secret) {
    console.error('Falta JWT_SECRET. Copiá .env.example a .env en la raíz.');
    process.exit(1);
}

const token = jwt.sign({ role: 'admin', source: 'dev-token' }, secret, { expiresIn: '7d' });
console.log(token);
