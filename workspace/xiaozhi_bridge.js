
const WebSocket = require('ws');
const { program } = require('commander');

// --- MCP Server Logic ---
const { exec } = require('child_process');

// A simple, in-memory MCP server that exposes one tool: 'chat'
function createMcpServer(agentSession) {
  const tools = {
    'chat': {
      description: "Send a message to Laodi and get a response.",
      args: {
        message: { type: "string", description: "The user's message." }
      },
      // This is where we hook into the OpenClaw agent
      handler: async (args) => {
        console.log(`[MCP Server] Received chat message: "${args.message}"`);
        
        return new Promise((resolve, reject) => {
          const command = `openclaw agent --session-id "${agentSession}" --message "${args.message.replace(/"/g, '\\"')}"`;
          console.log(`[Agent] Executing: ${command}`);
          exec(command, (error, stdout, stderr) => {
            if (error) {
              console.error(`[Agent] Error calling agent: ${error.message}`);
              reject(error);
              return;
            }
            if (stderr) {
              console.error(`[Agent] Stderr from agent: ${stderr}`);
            }
            console.log(`[Agent] Raw response from agent: ${stdout}`);
            // Assuming the last line of stdout is the agent's reply
            const lines = stdout.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const response = { reply: lastLine };
            console.log(`[MCP Server] Sending response:`, response);
            resolve(response);
          });
        });
      }
    }
  };

  function handleRequest(request) {
    const { method, params, id } = request;
    console.log(`[MCP Server] Handling request: ${method}`);

    switch (method) {
      case 'tools/list':
        return { id, result: { tools: Object.fromEntries(Object.entries(tools).map(([k, v]) => [k, {description: v.description, inputSchema: v.args}])) }};
      
      case 'tools/call':
        const tool = tools[params.name];
        if (tool) {
          return tool.handler(params.input).then(result => ({ id, result }));
        } else {
          return Promise.resolve({ id, error: { message: `Tool not found: ${params.name}` } });
        }
      
      case 'notifications/initialized':
        // This is a notification, doesn't require a response.
        console.log('[MCP Server] Received initialized notification. Ignoring.');
        return null;

      default:
        return Promise.resolve({ id, error: { message: `Method not found: ${method}` } });
    }
  }
  return { handleRequest };
}


// --- WebSocket Bridge Logic ---
function startBridge(wsUrl, mcpHandler) {
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => console.log(`[Bridge] WebSocket connection opened to: ${wsUrl}`));
  ws.on('close', () => console.log('[Bridge] WebSocket connection closed.'));
  ws.on('error', (err) => console.error('[Bridge] WebSocket error:', err));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      console.log('[Bridge] Received message from xiaozhi:', message);

      if (message.method === 'initialize') {
        const response = {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: { name: "laodi-bridge", version: "1.0.0" }
          }
        };
        console.log('[Bridge] Responding to initialize handshake:', response);
        ws.send(JSON.stringify(response));
        
        const initNotification = {
          jsonrpc: "2.0",
          method: "notifications/initialized"
        };
        console.log('[Bridge] Sending Initialized Notification.');
        ws.send(JSON.stringify(initNotification));
        return; // Handshake complete, don't process further.
      }

      if (message.method) { // It's a request
        const response = await mcpHandler(message);
        if (response) {
          console.log('[Bridge] Sending response to xiaozhi:', response);
          ws.send(JSON.stringify(response));
        }
      }
    } catch (e) {
      console.error('[Bridge] Error processing message:', e);
    }
  });
}

const { WebSocketServer } = require('ws');

// --- Local WebSocket Server for Client ---
function startLocalServer(mcpHandler) {
  const wss = new WebSocketServer({ port: 8080 });
  console.log('[Local Server] Listening on ws://localhost:8080/mcp');

  wss.on('connection', (ws) => {
    console.log('[Local Server] Client connected.');
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        console.log('[Local Server] Received from client:', message);
        const response = await mcpHandler(message);
        if (response) {
          console.log('[Local Server] Sending to client:', response);
          ws.send(JSON.stringify(response));
        }
      } catch (e) {
        console.error('[Local Server] Error processing client message:', e);
      }
    });
    ws.on('close', () => console.log('[Local Server] Client disconnected.'));
  });
}

// --- Main ---
program
  .option('-u, --url <url>', 'WebSocket URL for xiaozhi AI')
  .option('-s, --session <session>', 'The OpenClaw agent session key to send messages to')
  .option('--local-only', 'Run only the local server without connecting to xiaozhi AI')
  .parse(process.argv);

const options = program.opts();
const xiaozhiUrl = options.url || process.env.XIAOZHI_MCP_URL;
const agentSession = options.session || 'agent:main:main'; // Default to the main session

if (!xiaozhiUrl && !options.localOnly) {
  console.error('Error: Please provide the xiaozhi MCP WebSocket URL using --url or by setting XIAOZHI_MCP_URL');
  process.exit(1);
}

const mcpServer = createMcpServer(agentSession);
startLocalServer(mcpServer.handleRequest);

if (!options.localOnly) {
  startBridge(xiaozhiUrl, mcpServer.handleRequest);
}
