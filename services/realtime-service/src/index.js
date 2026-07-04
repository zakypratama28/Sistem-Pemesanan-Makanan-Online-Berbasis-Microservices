'use strict';
require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const redis = require('redis');

const app = express();
const port = process.env.PORT || 3000;
const serviceName = process.env.SERVICE_NAME || 'realtime-service';

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ service: serviceName, status: 'OK', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server instance
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log(`[ws] Client connected from ${req.socket.remoteAddress}`);
  
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to realtime food order updates.' }));

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
  });
});

// Setup Redis Subscriber
const subscriber = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

subscriber.on('error', (err) => console.error('[redis] Redis Subscriber Error', err));
subscriber.on('connect', () => console.log('[redis] Subscriber connected to Redis'));

async function start() {
  await subscriber.connect();
  
  await subscriber.subscribe('food-order-events', (message) => {
    console.log(`[redis] Received event: ${message}`);
    
    // Broadcast to all connected WebSocket clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  server.listen(port, () => {
    console.log(`[${serviceName}] Listening on port ${port} (HTTP & WS)`);
  });
}

start().catch(console.error);
