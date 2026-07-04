/**
 * delivery-service/src/index.js
 *
 * PROTECTED. Manajemen pengiriman.
 * GET /order/:orderId — lihat delivery by order.
 * PATCH /:id/status — update status (ADMIN atau COURIER).
 */
'use strict';
require('dotenv').config();

const express = require('express');
const pool = require('./db');
const { publishEvent } = require('./redisClient');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'delivery-service';

app.use(express.json());

function getUser(req) {
  return {
    id: parseInt(req.headers['x-user-id'], 10),
    email: req.headers['x-user-email'],
    role: req.headers['x-user-role'],
  };
}

const VALID_DELIVERY_STATUSES = ['WAITING', 'ASSIGNED', 'ON_DELIVERY', 'DELIVERED'];

// Mapping delivery status → order status
const DELIVERY_TO_ORDER_STATUS = {
  ON_DELIVERY: 'ON_DELIVERY',
  DELIVERED: 'DELIVERED',
};

app.get('/health', (req, res) => {
  res.json({ service: serviceName, status: 'OK', timestamp: new Date().toISOString() });
});

// ── GET /order/:orderId — delivery by order ────────────────────
app.get('/order/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'order_id tidak valid.' });

    const result = await pool.query(
      `SELECT d.id, d.order_id, d.courier_id,
              u.name AS courier_name, d.status, d.address, d.created_at
       FROM deliveries d
       LEFT JOIN users u ON u.id = d.courier_id
       WHERE d.order_id = $1`,
      [orderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery tidak ditemukan untuk order ini.' });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[GET /order/:orderId] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PATCH /:id/status — update delivery status ─────────────────
app.patch('/:id/status', async (req, res) => {
  const user = getUser(req);
  if (!['ADMIN', 'COURIER'].includes(user.role)) {
    return res.status(403).json({ error: 'Akses ditolak. Hanya ADMIN atau COURIER.' });
  }

  const deliveryId = parseInt(req.params.id, 10);
  if (isNaN(deliveryId)) return res.status(400).json({ error: 'ID tidak valid.' });

  const { status } = req.body;
  if (!status || !VALID_DELIVERY_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status tidak valid. Pilihan: ${VALID_DELIVERY_STATUSES.join(', ')}.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ambil delivery + order + customer
    const deliveryRes = await client.query(
      `SELECT d.id, d.order_id, d.status AS delivery_status,
              o.user_id AS customer_id
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       WHERE d.id = $1`,
      [deliveryId]
    );
    if (deliveryRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Delivery tidak ditemukan.' });
    }
    const delivery = deliveryRes.rows[0];

    // Update delivery status
    await client.query('UPDATE deliveries SET status = $1 WHERE id = $2', [status, deliveryId]);

    // Sync order status jika perlu
    if (DELIVERY_TO_ORDER_STATUS[status]) {
      await client.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [DELIVERY_TO_ORDER_STATUS[status], delivery.order_id]
      );
    }

    // Notifikasi customer
    const messages = {
      ASSIGNED: `Kurir sedang menuju restoran untuk mengambil pesanan Order #${delivery.order_id}.`,
      ON_DELIVERY: `Pesanan Order #${delivery.order_id} sedang dalam perjalanan menuju Anda.`,
      DELIVERED: `Pesanan Order #${delivery.order_id} telah tiba. Selamat menikmati!`,
    };
    if (messages[status]) {
      await client.query(
        'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
        [delivery.customer_id, `Update Pengiriman`, messages[status]]
      );
    }

    await client.query('COMMIT');

    // Publish event
    await publishEvent('DELIVERY_STATUS_UPDATED', {
      order_id: delivery.order_id,
      delivery_id: deliveryId,
      user_id: delivery.customer_id,
      status: status,
      message: `Delivery Order #${delivery.order_id} berubah menjadi status ${status}.`
    });

    res.json({ message: `Status delivery #${deliveryId} diperbarui menjadi ${status}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /:id/status] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} tidak ditemukan.` }));

app.listen(port, () => console.log(`[${serviceName}] Listening on port ${port}`));
