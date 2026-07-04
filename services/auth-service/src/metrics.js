/**
 * metrics.js — Prometheus metrics untuk auth-service
 * Menggunakan prom-client dengan default metrics + custom HTTP counters.
 */

'use strict';

const client = require('prom-client');

// Aktifkan default metrics (CPU, memory, event loop, dll)
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'auth_service_' });

// Counter: total HTTP request
const httpRequestsTotal = new client.Counter({
  name: 'auth_service_http_requests_total',
  help: 'Total HTTP requests received by auth-service',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Histogram: durasi HTTP request
const httpRequestDurationMs = new client.Histogram({
  name: 'auth_service_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [register],
});

// Counter: login attempts
const loginAttemptsTotal = new client.Counter({
  name: 'auth_service_login_attempts_total',
  help: 'Total login attempts',
  labelNames: ['status'],  // success | failure
  registers: [register],
});

// Counter: register attempts
const registerAttemptsTotal = new client.Counter({
  name: 'auth_service_register_attempts_total',
  help: 'Total register attempts',
  labelNames: ['status'],  // success | failure
  registers: [register],
});

// Middleware untuk mencatat setiap request
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route ? req.route.path : req.path;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationMs.observe(labels, duration);
  });
  next();
}

module.exports = {
  register,
  metricsMiddleware,
  loginAttemptsTotal,
  registerAttemptsTotal,
};
