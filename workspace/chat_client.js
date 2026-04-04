
const WebSocket = require('ws');
const readline = require('readline');

const ws = new WebSocket('ws://localhost:8080/mcp');
let requestId = 1;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'You: '
});

ws.on('open', () => {
  console.log('Connected to local xiaozhi bridge. You can start chatting.');
  rl.prompt();
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.result && message.result.reply) {
    console.log(`Laodi: ${message.result.reply}`);
  } else {
    console.log('Received:', message);
  }
  rl.prompt();
});

ws.on('close', () => {
  console.log('Connection to bridge closed.');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('Connection error:', err.message);
  console.log('Please make sure the xiaozhi_bridge.js script is running in another terminal.');
  process.exit(1);
});

rl.on('line', (line) => {
  if (line.trim()) {
    const request = {
      jsonrpc: "2.0",
      id: requestId++,
      method: "tools/call",
      params: {
        name: "chat",
        input: {
          message: line.trim()
        }
      }
    };
    ws.send(JSON.stringify(request));
  } else {
    rl.prompt();
  }
});
