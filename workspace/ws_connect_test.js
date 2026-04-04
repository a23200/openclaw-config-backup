
const WebSocket = require('ws');

const url = 'wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg3ODk4NywiYWdlbnRJZCI6MTYzNjcyNywiZW5kcG9pbnRJZCI6ImFnZW50XzE2MzY3MjciLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc0NjI5MjE4LCJleHAiOjE4MDYxODY4MTh9.9K4ErUBO5TW1K8-PFNxwGA0zq5d9_KISWtInFkQ-aZ3dEQD8j3Tm3jgi_CsahguEATwuMt4RB8gChNONZHaE2w';

const ws = new WebSocket(url);

ws.on('open', function open() {
  console.log('WebSocket connection opened. Sending list request...');
  const listRequest = {
    "version": "1.0",
    "id": "req-1",
    "method": "mcp.list"
  };
  ws.send(JSON.stringify(listRequest));
});

ws.on('message', function incoming(data) {
  console.log('Received message:');
  try {
    const message = JSON.parse(data);
    console.log(JSON.stringify(message, null, 2));
  } catch (e) {
    console.log(data.toString());
  }
  ws.close();
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('WebSocket connection closed.');
});

