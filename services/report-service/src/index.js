/**
 * report-service/src/index.js
 *
 * PROTECTED. Hanya ADMIN.
 * GET /summary — ringkasan statistik sistem.
 */
'use strict';
require('dotenv').config();

const express = require('express');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'report-service';

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

// ── GET /summary — ringkasan statistik (ADMIN only) ───────────
app.get('/summary', async (req, res) => {
  const user = getUser(req);
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Akses ditolak. Hanya ADMIN.' });
  }

  try {
    const [
      usersRes, restaurantsRes, menusRes, ordersRes,
      revenueRes, orderByStatusRes, paymentByStatusRes
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM users'),
      pool.query('SELECT COUNT(*) AS total FROM restaurants'),
      pool.query('SELECT COUNT(*) AS total FROM menus'),
      pool.query('SELECT COUNT(*) AS total FROM orders'),
      pool.query("SELECT COALESCE(SUM(amount), 0) AS total_revenue FROM payments WHERE status = 'PAID'"),
      pool.query(
        `SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC`
      ),
      pool.query(
        `SELECT status, COUNT(*) AS count FROM payments GROUP BY status ORDER BY count DESC`
      ),
    ]);

    res.json({
      data: {
        total_users: parseInt(usersRes.rows[0].total, 10),
        total_restaurants: parseInt(restaurantsRes.rows[0].total, 10),
        total_menus: parseInt(menusRes.rows[0].total, 10),
        total_orders: parseInt(ordersRes.rows[0].total, 10),
        total_revenue: parseInt(revenueRes.rows[0].total_revenue, 10),
        orders_by_status: orderByStatusRes.rows.map((r) => ({
          status: r.status,
          count: parseInt(r.count, 10),
        })),
        payments_by_status: paymentByStatusRes.rows.map((r) => ({
          status: r.status,
          count: parseInt(r.count, 10),
        })),
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /summary] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} tidak ditemukan.` }));

app.listen(port, () => console.log(`[${serviceName}] Listening on port ${port}`));
