/**
 * routes/auth.js — Route handler untuk register, login, verify
 */

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { loginAttemptsTotal, registerAttemptsTotal } = require('../metrics');

const router = express.Router();

// Role yang diizinkan saat registrasi
const ALLOWED_ROLES = ['ADMIN', 'CUSTOMER', 'RESTAURANT_ADMIN', 'COURIER'];

// ─────────────────────────────────────────────────
// Helper: buat JWT
// ─────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
}

// ─────────────────────────────────────────────────
// POST /register
// ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // --- Validasi field wajib ---
    if (!name || !email || !password || !role) {
      registerAttemptsTotal.inc({ status: 'failure' });
      return res.status(400).json({
        error: 'Semua field wajib diisi: name, email, password, role.',
      });
    }

    // --- Validasi format email sederhana ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      registerAttemptsTotal.inc({ status: 'failure' });
      return res.status(400).json({ error: 'Format email tidak valid.' });
    }

    // --- Validasi panjang password ---
    if (password.length < 6) {
      registerAttemptsTotal.inc({ status: 'failure' });
      return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }

    // --- Validasi role ---
    if (!ALLOWED_ROLES.includes(role.toUpperCase())) {
      registerAttemptsTotal.inc({ status: 'failure' });
      return res.status(400).json({
        error: `Role tidak valid. Role yang diizinkan: ${ALLOWED_ROLES.join(', ')}.`,
      });
    }

    // --- Cek duplikasi email ---
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      registerAttemptsTotal.inc({ status: 'failure' });
      return res.status(409).json({ error: 'Email sudah terdaftar.' });
    }

    // --- Hash password ---
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // --- Simpan ke database ---
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.toLowerCase(), passwordHash, role.toUpperCase()]
    );

    const user = result.rows[0];
    registerAttemptsTotal.inc({ status: 'success' });

    return res.status(201).json({
      message: 'Registrasi berhasil.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    registerAttemptsTotal.inc({ status: 'failure' });
    console.error('[register] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────
// POST /login
// ─────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // --- Validasi input ---
    if (!email || !password) {
      loginAttemptsTotal.inc({ status: 'failure' });
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }

    // --- Cari user berdasarkan email ---
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      loginAttemptsTotal.inc({ status: 'failure' });
      // Pesan generik agar tidak bocorkan informasi user
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const user = result.rows[0];

    // --- Bandingkan password dengan bcrypt ---
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      loginAttemptsTotal.inc({ status: 'failure' });
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    // --- Buat JWT token ---
    const token = signToken(user);
    loginAttemptsTotal.inc({ status: 'success' });

    return res.status(200).json({
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    loginAttemptsTotal.inc({ status: 'failure' });
    console.error('[login] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────
// GET /verify
// Untuk Traefik ForwardAuth (diimplementasikan tahap berikutnya).
// Sekarang hanya memvalidasi token dan mengembalikan header user.
// ─────────────────────────────────────────────────
router.get('/verify', (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token tidak ditemukan.' });
    }

    const token = authHeader.slice(7); // hapus "Bearer "

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      const msg =
        jwtErr.name === 'TokenExpiredError'
          ? 'Token sudah kadaluarsa.'
          : 'Token tidak valid.';
      return res.status(401).json({ error: msg });
    }

    // Set header untuk Traefik ForwardAuth (tahap berikutnya)
    res.set('X-User-Id', String(payload.user_id));
    res.set('X-User-Email', payload.email);
    res.set('X-User-Role', payload.role);

    return res.status(200).json({
      valid: true,
      user: {
        id: payload.user_id,
        email: payload.email,
        role: payload.role,
      },
    });
  } catch (err) {
    console.error('[verify] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
