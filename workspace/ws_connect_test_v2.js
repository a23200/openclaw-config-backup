
const WebSocket = require('ws');

const url = 'wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg3ODk4NywiYWdlbnRJZCI6MTYzNjcyNywiZW5kcG9pbnRJZCI6ImFnZW50XzE2MzY3MjciLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc0NjI5MjE4LCJleHAiOjE4MDYxODY4MTh9.9K4ErUBO5TW1K8-PFNxwGA0zq5d9_KISWtInFkQ-aZ3dEQD8j3Tm3jgi_CsahguEATwuMt4RB8gChNONZHaE2w';

const ws = new WebSocket(url);
let requestCounter = 1;

function sendRpcRequest(method, params = {}) {
  const requestId = requestCounter++;
  const request = {
    jsonrpc: "2.0",
    id: requestId,
    method: method,
    params: params
  };
  console.log(`Sending request #${requestId} (${method})...`);
  ws.send(JSON.stringify(request));
  return requestId;
}


ws.on('open', function open() {
  console.log('WebSocket connection opened.');
  // The server seems to want to initialize first. Let's wait for its message.
});

ws.on('message', function incoming(data) {
  console.log('Received message:');
  const message = JSON.parse(data);
  console.log(JSON.stringify(message, null, 2));

  // If server sends an initialize request, we respond and then ask for the list.
  if (message.method === 'initialize') {
    console.log('Server sent initialize request. Responding and then listing tools.');
    
    // Respond to initialize (the protocol might not require a response, but it's good practice)
    const response = {
        jsonrpc: "2.0",
        id: message.id,
        result: {
            capabilities: {} // Announce our capabilities
        }
    };
    ws.send(JSON.stringify(response));

    // Now, request the tool list
    sendRpcRequest('mcp.list');
  }

  // If this is the result of our list request, we can close.
  if (message.result && message.result.tools) {
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

// Timeout to prevent hanging forever if the server doesn't talk back
setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
        console.log('Timeout reached. Closing connection.');
        ws.close();
    }
}, 10000);

