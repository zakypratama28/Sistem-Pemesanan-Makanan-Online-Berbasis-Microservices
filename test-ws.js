const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1/ws');

ws.on('open', function open() {
  console.log('Connected to WebSocket!');
  // Notify the test script that we are ready
  console.log('WS_READY');
});

ws.on('message', function incoming(data) {
  console.log('Received:', data.toString());
});

ws.on('error', function error(err) {
  console.error('WS Error:', err);
});
