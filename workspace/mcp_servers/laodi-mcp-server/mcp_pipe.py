#!/usr/bin/env python3
"""
MCP WebSocket Bridge - 稳定版
连接小智AI与OpenClaw MCP Server
"""
import asyncio
import websockets
import json
import subprocess
import sys
import os
import signal
import logging

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(message)s'
)
logger = logging.getLogger(__name__)

running = True

def signal_handler(sig, frame):
    global running
    running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


async def main():
    global running
    
    endpoint = os.environ.get('MCP_ENDPOINT')
    if not endpoint:
        print("请设置 MCP_ENDPOINT 环境变量")
        sys.exit(1)
    
    server_script = sys.argv[1] if len(sys.argv) > 1 else 'server.py'
    retry_delay = 5
    
    while running:
        proc = None
        try:
            logger.info(f"正在启动 MCP Server...")
            proc = subprocess.Popen(
                [sys.executable, server_script],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            await asyncio.sleep(0.5)
            
            logger.info(f"正在连接小智AI WebSocket...")
            async with websockets.connect(
                endpoint,
                ping_interval=20,
                ping_timeout=10,
                close_timeout=5
            ) as ws:
                logger.info("✓ 已连接到小智AI!")
                
                async def ws_to_server():
                    try:
                        async for msg in ws:
                            logger.debug(f"WS -> Server: {msg[:80]}...")
                            proc.stdin.write(msg + '\n')
                            proc.stdin.flush()
                    except Exception as e:
                        logger.error(f"WS->Server error: {e}")
                
                async def server_to_ws():
                    try:
                        while running:
                            line = await asyncio.get_event_loop().run_in_executor(
                                None, proc.stdout.readline
                            )
                            if line:
                                line = line.strip()
                                if line:
                                    logger.debug(f"Server -> WS: {line[:80]}...")
                                    try:
                                        json.loads(line)
                                        await ws.send(line)
                                    except json.JSONDecodeError:
                                        logger.warning(f"Invalid JSON: {line[:50]}")
                            else:
                                await asyncio.sleep(0.001)
                    except Exception as e:
                        logger.error(f"Server->WS error: {e}")
                
                async def log_stderr():
                    try:
                        while running:
                            line = await asyncio.get_event_loop().run_in_executor(
                                None, proc.stderr.readline
                            )
                            if line:
                                logger.info(f"[Server] {line.strip()}")
                            else:
                                await asyncio.sleep(0.001)
                    except Exception as e:
                        logger.error(f"Stderr error: {e}")
                
                tasks = [
                    asyncio.create_task(ws_to_server()),
                    asyncio.create_task(server_to_ws()),
                    asyncio.create_task(log_stderr())
                ]
                
                done, pending = await asyncio.wait(
                    tasks,
                    return_when=asyncio.FIRST_COMPLETED
                )
                
                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                
        except websockets.exceptions.ConnectionClosed as e:
            logger.warning(f"WebSocket closed: {e}")
        except Exception as e:
            logger.error(f"Error: {e}")
        finally:
            if proc:
                logger.info("Terminating MCP Server...")
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except:
                    proc.kill()
                    proc.wait()
            
            if running:
                logger.info(f"{retry_delay}秒后重连...")
                await asyncio.sleep(retry_delay)
    
    logger.info("服务已停止")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Interrupted")
