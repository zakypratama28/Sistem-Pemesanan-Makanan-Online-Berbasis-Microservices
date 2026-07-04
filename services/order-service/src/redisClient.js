'use strict';
const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

client.on('error', (err) => console.error('[redis] Redis Client Error', err));
client.on('connect', () => console.log('[redis] Connected to Redis'));

// Auto-connect
client.connect().catch(console.error);

async function publishEvent(type, payload) {
  try {
    const message = JSON.stringify({ type, ...payload, timestamp: new Date().toISOString() });
    await client.publish('food-order-events', message);
    console.log(`[redis] Published event: ${type}`);
  } catch (err) {
    console.error(`[redis] Failed to publish event: ${type}`, err.message);
  }
}

module.exports = { client, publishEvent };
