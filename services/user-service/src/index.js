'use strict';

const express = require('express');
const pool = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'user-service';

app.use(express.json());

// ── Middleware: Get User dari Header ────────────────────────────────
function getUserFromHeader(req, res, next) {
  const userId = req.headers['x-user-id'];
  const userEmail = req.headers['x-user-email'];
  const userRole = req.headers['x-user-role'];

  if (!userId || !userEmail || !userRole) {
    return res.status(401).json({ message: 'Unauthorized', data: null });
  }

  req.user = { id: userId, email: userEmail, role: userRole };
  next();
}

// ── Middleware: Validasi Role ADMIN ─────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Forbidden: Requires ADMIN role', data: null });
  }
  next();
}

// ── Health check (public, tidak diproteksi) ────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ service: serviceName, status: 'OK' });
});

// ── Endpoint: Profil User Saat Ini (me) ────────────────────────────
app.get('/me', getUserFromHeader, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found', data: null });
    }

    res.status(200).json({ message: 'Success retrieving profile', data: rows[0] });
  } catch (error) {
    console.error(`[${serviceName}] Error GET /me:`, error);
    res.status(500).json({ message: 'Internal Server Error', data: null });
  }
});

app.patch('/me', getUserFromHeader, async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ message: 'Name is required and must be a valid string', data: null });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role, created_at',
      [name.trim(), req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found', data: null });
    }

    res.status(200).json({ message: 'Profile updated successfully', data: rows[0] });
  } catch (error) {
    console.error(`[${serviceName}] Error PATCH /me:`, error);
    res.status(500).json({ message: 'Internal Server Error', data: null });
  }
});

// ── Endpoint: Daftar Seluruh User (ADMIN) ───────────────────────────
app.get('/', getUserFromHeader, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY id ASC'
    );
    res.status(200).json({ message: 'Success retrieving users', data: rows });
  } catch (error) {
    console.error(`[${serviceName}] Error GET /:`, error);
    res.status(500).json({ message: 'Internal Server Error', data: null });
  }
});

// ── Endpoint: Detail User Berdasarkan ID (ADMIN) ────────────────────
app.get('/:id', getUserFromHeader, requireAdmin, async (req, res) => {
  const userId = req.params.id;

  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found', data: null });
    }

    res.status(200).json({ message: 'Success retrieving user details', data: rows[0] });
  } catch (error) {
    console.error(`[${serviceName}] Error GET /:id:`, error);
    res.status(500).json({ message: 'Internal Server Error', data: null });
  }
});

// ── Endpoint: Mengubah Role User (ADMIN) ────────────────────────────
app.patch('/:id/role', getUserFromHeader, requireAdmin, async (req, res) => {
  const userId = req.params.id;
  const { role } = req.body;

  const validRoles = ['ADMIN', 'CUSTOMER', 'RESTAURANT_ADMIN', 'COURIER'];

  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(', ')}`, data: null });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, created_at',
      [role, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found', data: null });
    }

    res.status(200).json({ message: 'User role updated successfully', data: rows[0] });
  } catch (error) {
    console.error(`[${serviceName}] Error PATCH /:id/role:`, error);
    res.status(500).json({ message: 'Internal Server Error', data: null });
  }
});

// ── Start Server ───────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`[${serviceName}] Listening on port ${port}`);
});
