
const WebSocket = require('ws');

const url = 'wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg3ODk4NywiYWdlbnRJZCI6MTYzNjcyNywiZW5kcG9pbnRJZCI6ImFnZW50XzE2MzY3MjciLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc0NjI5MjE4LCJleHAiOjE4MDYxODY4MTh9.9K4ErUBO5TW1K8-PFNxwGA0zq5d9_KISWtInFkQ-aZ3dEQD8j3Tm3jgi_CsahguEATwuMt4RB8gChNONZHaE2w';

const ws = new WebSocket(url);

ws.on('open', function open() {
  console.log('WebSocket connection opened.');
});

ws.on('message', function incoming(data) {
  const message = JSON.parse(data);
  console.log('Received message:');
  console.log(JSON.stringify(message, null, 2));

  // If server sends an initialize request, we send our list request.
  if (message.method === 'initialize') {
    console.log('Server sent initialize message. Now sending list request...');
    
    // Send list request using the older protocol version
    const listRequest = {
        "version": "1.0",
        "id": "req-list-tools",
        "method": "mcp.list"
    };
    ws.send(JSON.stringify(listRequest));
    console.log('Sent list request:', JSON.stringify(listRequest));
  }

  // If this is the response to our list request, we can close.
  if (message.id === 'req-list-tools') {
     console.log('Successfully received tool list. Closing connection.');
     ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('WebSocket connection closed.');
});

// Timeout to prevent hanging
setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
        console.log('Timeout reached (10s). Closing connection.');
        ws.close();
    }
}, 10000);
