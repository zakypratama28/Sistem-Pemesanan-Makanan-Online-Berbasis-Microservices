/**
 * db.js — PostgreSQL connection pool untuk auth-service
 * Menggunakan DATABASE_URL dari environment variable.
 */

'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Timeout & pool settings yang aman untuk microservice
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err.message);
});

module.exports = pool;
