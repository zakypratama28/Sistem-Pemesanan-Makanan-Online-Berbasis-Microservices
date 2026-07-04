/**
 * notification-service/src/index.js
 *
 * PROTECTED. Notifikasi user login.
 * GET / — list notifikasi user, terbaru dulu.
 * PATCH /:id/read — tandai sebagai read.
 */
'use strict';
require('dotenv').config();

const express = require('express');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'notification-service';

app.use(express.json());

function getUser(req) {
  return {
    id: parseInt(req.headers['x-user-id'], 10),
    email: req.headers['x-user-email'],
    role: req.headers['x-user-role'],
  };
}

app.get('/health', (req, res) => {
  res.json({ service: serviceName, status: 'OK', timestamp: new Date().toISOString() });
});

// ── GET / — notifikasi milik user login ───────────────────────
app.get('/', async (req, res) => {
  try {
    const { id: userId } = getUser(req);
    const result = await pool.query(
      `SELECT id, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    const unreadCount = result.rows.filter((n) => !n.is_read).length;
    res.json({ data: result.rows, total: result.rowCount, unread: unreadCount });
  } catch (err) {
    console.error('[GET /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PATCH /:id/read — tandai notifikasi sebagai read ──────────
app.patch('/:id/read', async (req, res) => {
  try {
    const { id: userId } = getUser(req);
    const notifId = parseInt(req.params.id, 10);
    if (isNaN(notifId)) return res.status(400).json({ error: 'ID tidak valid.' });

    const result = await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [notifId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notifikasi tidak ditemukan atau bukan milik Anda.' });
    }
    res.json({ message: 'Notifikasi ditandai sebagai telah dibaca.' });
  } catch (err) {
    console.error('[PATCH /:id/read] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} tidak ditemukan.` }));

app.listen(port, () => console.log(`[${serviceName}] Listening on port ${port}`));
