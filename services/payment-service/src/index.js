/**
 * payment-service/src/index.js
 *
 * PROTECTED. Simulasi pembayaran.
 * POST / hanya CUSTOMER.
 * GET /order/:orderId bebas (semua role yang sudah login).
 */
'use strict';
require('dotenv').config();

const express = require('express');
const pool = require('./db');
const { publishEvent } = require('./redisClient');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'payment-service';

app.use(express.json());

function getUser(req) {
  return {
    id: parseInt(req.headers['x-user-id'], 10),
    email: req.headers['x-user-email'],
    role: req.headers['x-user-role'],
  };
}

const VALID_METHODS = ['TRANSFER', 'COD', 'QRIS', 'EWALLET', 'CREDIT_CARD'];

app.get('/health', (req, res) => {
  res.json({ service: serviceName, status: 'OK', timestamp: new Date().toISOString() });
});

// ── GET /order/:orderId — payment berdasarkan order ────────────
app.get('/order/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'order_id tidak valid.' });

    const result = await pool.query(
      `SELECT p.id, p.order_id, p.amount, p.status, p.payment_method, p.created_at
       FROM payments p WHERE p.order_id = $1`,
      [orderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment tidak ditemukan untuk order ini.' });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[GET /order/:orderId] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST / — buat pembayaran (simulasi) ───────────────────────
app.post('/', async (req, res) => {
  const user = getUser(req);
  if (user.role !== 'CUSTOMER') {
    return res.status(403).json({ error: 'Hanya CUSTOMER yang dapat melakukan pembayaran.' });
  }

  const { order_id, payment_method } = req.body;
  if (!order_id || !payment_method) {
    return res.status(400).json({ error: 'Field order_id dan payment_method wajib diisi.' });
  }
  if (!VALID_METHODS.includes(payment_method.toUpperCase())) {
    return res.status(400).json({ error: `Metode tidak valid. Pilihan: ${VALID_METHODS.join(', ')}.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validasi order
    const orderRes = await client.query(
      'SELECT id, user_id, total_price, status FROM orders WHERE id = $1',
      [order_id]
    );
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order tidak ditemukan.' });
    }
    const order = orderRes.rows[0];

    // CUSTOMER hanya boleh bayar order miliknya
    if (order.user_id !== user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke order ini.' });
    }
    if (order.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Order tidak bisa dibayar. Status saat ini: ${order.status}.` });
    }

    // Cek belum ada payment
    const existPay = await client.query('SELECT id FROM payments WHERE order_id = $1', [order_id]);
    if (existPay.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order ini sudah memiliki payment.' });
    }

    // Insert payment
    const payRes = await client.query(
      `INSERT INTO payments (order_id, amount, status, payment_method)
       VALUES ($1, $2, 'PAID', $3)
       RETURNING id, order_id, amount, status, payment_method, created_at`,
      [order_id, order.total_price, payment_method.toUpperCase()]
    );

    // Update order status → PAID
    await client.query('UPDATE orders SET status = $1 WHERE id = $2', ['PAID', order_id]);

    // Notifikasi customer
    await client.query(
      'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
      [
        user.id,
        'Pembayaran Berhasil',
        `Pembayaran untuk Order #${order_id} sebesar Rp ${Number(order.total_price).toLocaleString('id-ID')} berhasil melalui ${payment_method.toUpperCase()}.`,
      ]
    );

    await client.query('COMMIT');

    // Publish event
    await publishEvent('PAYMENT_SUCCESS', {
      order_id: order_id,
      user_id: user.id,
      amount: order.total_price,
      payment_method: payment_method.toUpperCase(),
      status: 'PAID',
      message: `Pembayaran Order #${order_id} berhasil.`
    });

    res.status(201).json({ message: 'Pembayaran berhasil.', data: payRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} tidak ditemukan.` }));

app.listen(port, () => console.log(`[${serviceName}] Listening on port ${port}`));
