/**
 * index.js — Entry point auth-service
 *
 * Endpoint:
 *   GET  /health   → status service
 *   GET  /metrics  → Prometheus metrics
 *   POST /register → daftar user baru
 *   POST /login    → login + JWT
 *   GET  /verify   → validasi JWT (untuk Traefik ForwardAuth)
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { register, metricsMiddleware } = require('./metrics');
const authRoutes = require('./routes/auth');

// ─────────────────────────────────────────────────
// Validasi environment variable wajib
// ─────────────────────────────────────────────────
const requiredEnv = ['JWT_SECRET', 'DATABASE_URL'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[startup] FATAL: Environment variable "${key}" tidak di-set.`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────
// Setup Express
// ─────────────────────────────────────────────────
const app = express();
const port = parseInt(process.env.PORT, 10) || 3000;
const serviceName = process.env.SERVICE_NAME || 'auth-service';

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json());

// Prometheus middleware (catat semua request)
app.use(metricsMiddleware);

// ─────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────

// Health check — tidak butuh auth
app.get('/health', (req, res) => {
  res.status(200).json({
    service: serviceName,
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// Prometheus metrics
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// Auth routes: /register, /login, /verify
app.use('/', authRoutes);

// ─────────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} tidak ditemukan.` });
});

// ─────────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`[${serviceName}] Listening on port ${port}`);
  console.log(`[${serviceName}] DATABASE_URL host: ${(process.env.DATABASE_URL || '').split('@')[1] || 'not set'}`);
});
