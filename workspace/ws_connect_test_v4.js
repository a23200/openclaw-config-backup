
const WebSocket = require('ws');

const url = 'wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg3ODk4NywiYWdlbnRJZCI6MTYzNjcyNywiZW5kcG9pbnRJZCI6ImFnZW50XzE2MzY3MjciLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc0NjI5MjE4LCJleHAiOjE4MDYxODY4MTh9.9K4ErUBO5TW1K8-PFNxwGA0zq5d9_KISWtInFkQ-aZ3dEQD8j3Tm3jgi_CsahguEATwuMt4RB8gChNONZHaE2w';

const ws = new WebSocket(url);

ws.on('open', () => console.log('WebSocket connection opened.'));

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('\n--- Received Message ---');
  console.log(JSON.stringify(message, null, 2));

  if (message.method === 'initialize') {
    // 1. Respond to initialize
    const initResponse = {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        serverInfo: { name: "openclaw-test-client", version: "1.0.0" }
      }
    };
    console.log('\n--- Sending Initialize Response ---');
    console.log(JSON.stringify(initResponse, null, 2));
    ws.send(JSON.stringify(initResponse));

    // 2. Send initialized notification
    const initNotification = {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    };
    console.log('\n--- Sending Initialized Notification ---');
    console.log(JSON.stringify(initNotification, null, 2));
    ws.send(JSON.stringify(initNotification));

    // 3. Request tool list
    const toolsRequest = {
      jsonrpc: "2.0",
      id: 100,
      method: "tools/list",
      params: {}
    };
    console.log('\n--- Sending tools/list Request ---');
    console.log(JSON.stringify(toolsRequest, null, 2));
    ws.send(JSON.stringify(toolsRequest));
  } else if (message.id === 100) {
      console.log('\nGot tools list! Closing connection.');
      setTimeout(() => ws.close(), 1000);
  }
});

ws.on('error', (err) => console.error('WebSocket error:', err));
ws.on('close', () => console.log('WebSocket connection closed.'));

setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
        console.log('Timeout reached (15s). Closing connection.');
        ws.close();
    }
}, 15000);
