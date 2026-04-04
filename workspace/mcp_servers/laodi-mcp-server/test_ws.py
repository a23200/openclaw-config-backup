import asyncio
import websockets
import json

async def test():
    uri = "wss://api.xiaozhi.me/mcp/?token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjg3ODk4NywiYWdlbnRJZCI6MTY2MTI2MiwiZW5kcG9pbnRJZCI6ImFnZW50XzE2NjEyNjIiLCJwdXJwb3NlIjoibWNwLWVuZHBvaW50IiwiaWF0IjoxNzc1MTYyNDY1LCJleHAiOjE4MDY3MjAwNjV9.IQraDtF6rbccS89TAC7AKb1NfvVrp5ziG9BpNgdgzyMNNpS_LS4Wio8J9hH31hmUsm0xhK6iuDHOJd0gR-uepQ"
    async with websockets.connect(uri) as ws:
        print("Connected!")
        
        # Send initialize
        init_req = {
            "id": 0,
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1.0"}
            }
        }
        await ws.send(json.dumps(init_req))
        print("Sent initialize")
        res = await ws.recv()
        print("Recv:", res)
        
        # Send tools/list
        tools_req = {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "tools/list",
            "params": {}
        }
        await ws.send(json.dumps(tools_req))
        print("Sent tools/list")
        res = await ws.recv()
        
        tools = json.loads(res)
        print("Available tools:")
        if "result" in tools and "tools" in tools["result"]:
            for t in tools["result"]["tools"]:
                print(f" - {t['name']}: {t.get('description', '')}")
        else:
            print(res)

asyncio.run(test())
