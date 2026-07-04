/**
 * order-service/src/index.js
 *
 * PROTECTED (Traefik ForwardAuth).
 * POST / hanya CUSTOMER.
 * GET / filtered by role.
 * PATCH /:id/status hanya ADMIN atau RESTAURANT_ADMIN.
 */
'use strict';
require('dotenv').config();

const express = require('express');
const pool = require('./db');
const { publishEvent } = require('./redisClient');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'order-service';

app.use(express.json());

function getUser(req) {
  return {
    id: parseInt(req.headers['x-user-id'], 10),
    email: req.headers['x-user-email'],
    role: req.headers['x-user-role'],
  };
}

const VALID_ORDER_STATUSES = ['PENDING', 'PAID', 'COOKING', 'READY', 'ON_DELIVERY', 'DELIVERED', 'CANCELLED'];

// Helper: insert notifikasi
async function insertNotification(client, userId, title, message) {
  await client.query(
    'INSERT INTO notifications (user_id, title, message) VALUES ($1, $2, $3)',
    [userId, title, message]
  );
}

// ── Health ──────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ service: serviceName, status: 'OK', timestamp: new Date().toISOString() });
});

// ── GET / — list order (filtered by role) ──────────────────────
app.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    let result;

    if (user.role === 'CUSTOMER') {
      result = await pool.query(
        `SELECT o.id, o.user_id, o.restaurant_id, r.name AS restaurant_name,
                o.total_price, o.status, o.created_at
         FROM orders o
         JOIN restaurants r ON r.id = o.restaurant_id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC`,
        [user.id]
      );
    } else {
      // ADMIN, RESTAURANT_ADMIN, COURIER — lihat semua
      result = await pool.query(
        `SELECT o.id, o.user_id, u.name AS customer_name, o.restaurant_id,
                r.name AS restaurant_name, o.total_price, o.status, o.created_at
         FROM orders o
         JOIN restaurants r ON r.id = o.restaurant_id
         JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC`
      );
    }
    res.json({ data: result.rows, total: result.rowCount });
  } catch (err) {
    console.error('[GET /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /:id — detail order dengan order_items ─────────────────
app.get('/:id', async (req, res) => {
  try {
    const user = getUser(req);
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: 'ID tidak valid.' });

    const orderRes = await pool.query(
      `SELECT o.id, o.user_id, u.name AS customer_name,
              o.restaurant_id, r.name AS restaurant_name,
              o.total_price, o.status, o.created_at
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order tidak ditemukan.' });
    }
    const order = orderRes.rows[0];

    // CUSTOMER hanya boleh lihat ordernya sendiri
    if (user.role === 'CUSTOMER' && order.user_id !== user.id) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const itemsRes = await pool.query(
      `SELECT oi.id, oi.menu_id, m.name AS menu_name, oi.quantity, oi.price,
              (oi.quantity * oi.price) AS subtotal
       FROM order_items oi
       JOIN menus m ON m.id = oi.menu_id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    res.json({ data: { ...order, items: itemsRes.rows } });
  } catch (err) {
    console.error('[GET /:id] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST / — buat order baru (hanya CUSTOMER) ──────────────────
app.post('/', async (req, res) => {
  const user = getUser(req);
  if (user.role !== 'CUSTOMER') {
    return res.status(403).json({ error: 'Hanya CUSTOMER yang dapat membuat order.' });
  }

  const { restaurant_id, items } = req.body;

  if (!restaurant_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Field restaurant_id dan items (array) wajib diisi.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validasi restoran ada dan OPEN
    const restRes = await client.query(
      'SELECT id, name, status FROM restaurants WHERE id = $1',
      [restaurant_id]
    );
    if (restRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Restoran tidak ditemukan.' });
    }
    if (restRes.rows[0].status !== 'OPEN') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Restoran sedang tutup.' });
    }
    const restaurantName = restRes.rows[0].name;

    // 2. Validasi semua menu
    const menuIds = items.map((i) => i.menu_id);
    const menusRes = await client.query(
      'SELECT id, name, price, stock, restaurant_id FROM menus WHERE id = ANY($1::int[])',
      [menuIds]
    );
    const menuMap = {};
    menusRes.rows.forEach((m) => { menuMap[m.id] = m; });

    let totalPrice = 0;
    const validatedItems = [];

    for (const item of items) {
      if (!item.menu_id || !item.quantity || item.quantity < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Setiap item harus memiliki menu_id dan quantity >= 1.' });
      }
      const menu = menuMap[item.menu_id];
      if (!menu) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Menu ID ${item.menu_id} tidak ditemukan.` });
      }
      // Validasi menu dari restoran yang sama
      if (menu.restaurant_id !== restaurant_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Menu "${menu.name}" bukan dari restoran yang dipilih.` });
      }
      // Validasi stock
      if (menu.stock < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Stock menu "${menu.name}" tidak cukup. Tersedia: ${menu.stock}.` });
      }
      totalPrice += menu.price * item.quantity;
      validatedItems.push({ ...item, price: menu.price, name: menu.name });
    }

    // 3. Insert order
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, restaurant_id, total_price, status)
       VALUES ($1, $2, $3, 'PENDING')
       RETURNING id, user_id, restaurant_id, total_price, status, created_at`,
      [user.id, restaurant_id, totalPrice]
    );
    const order = orderRes.rows[0];

    // 4. Insert order_items + kurangi stock
    for (const item of validatedItems) {
      await client.query(
        'INSERT INTO order_items (order_id, menu_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [order.id, item.menu_id, item.quantity, item.price]
      );
      await client.query(
        'UPDATE menus SET stock = stock - $1 WHERE id = $2',
        [item.quantity, item.menu_id]
      );
    }

    // 5. Buat delivery dengan status WAITING
    await client.query(
      'INSERT INTO deliveries (order_id, courier_id, status, address) VALUES ($1, NULL, $2, NULL)',
      [order.id, 'WAITING']
    );

    // 6. Notifikasi customer
    await insertNotification(
      client, user.id,
      'Order Berhasil Dibuat',
      `Order #${order.id} dari ${restaurantName} berhasil dibuat dengan total Rp ${totalPrice.toLocaleString('id-ID')}. Status: PENDING.`
    );

    await client.query('COMMIT');

    // Publish event
    await publishEvent('ORDER_CREATED', {
      order_id: order.id,
      user_id: user.id,
      restaurant_id: restaurant_id,
      total_price: totalPrice,
      status: 'PENDING',
      message: `Order #${order.id} berhasil dibuat.`
    });

    res.status(201).json({
      message: 'Order berhasil dibuat.',
      data: { ...order, items: validatedItems },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// ── PATCH /:id/status — update status order ────────────────────
app.patch('/:id/status', async (req, res) => {
  const user = getUser(req);
  if (!['ADMIN', 'RESTAURANT_ADMIN'].includes(user.role)) {
    return res.status(403).json({ error: 'Akses ditolak. Hanya ADMIN atau RESTAURANT_ADMIN.' });
  }

  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId)) return res.status(400).json({ error: 'ID tidak valid.' });

  const { status } = req.body;
  if (!status || !VALID_ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status tidak valid. Pilihan: ${VALID_ORDER_STATUSES.join(', ')}.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      'SELECT id, user_id, status FROM orders WHERE id = $1',
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order tidak ditemukan.' });
    }
    const order = orderRes.rows[0];

    await client.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);

    await insertNotification(
      client, order.user_id,
      `Status Order Diperbarui`,
      `Order #${orderId} Anda sekarang berstatus: ${status}.`
    );

    await client.query('COMMIT');

    // Publish event
    await publishEvent('ORDER_STATUS_UPDATED', {
      order_id: orderId,
      user_id: order.user_id,
      status: status,
      message: `Order #${orderId} berubah menjadi status ${status}.`
    });

    res.json({ message: `Status order #${orderId} diperbarui menjadi ${status}.` });
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
