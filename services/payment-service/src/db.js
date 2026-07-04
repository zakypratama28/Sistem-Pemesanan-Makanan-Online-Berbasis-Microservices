'use strict';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, max: 10 });
pool.on('error', (err) => console.error('[db] idle client error:', err.message));
module.exports = pool;
