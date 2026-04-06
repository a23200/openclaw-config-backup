"""
刮刮乐远程控制 API 路由
提供 WebSocket 和 HTTP 接口用于远程操作滑块验证
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List
import asyncio
import os
from loguru import logger

from db_manager import db_manager

from utils.captcha_remote_control import captcha_controller


# 创建路由器
router = APIRouter(prefix="/api/captcha", tags=["captcha"])


class MouseEvent(BaseModel):
    """鼠标事件模型"""
    session_id: str
    event_type: str  # down, move, up
    x: int
    y: int


class SessionCheckRequest(BaseModel):
    """会话检查请求"""
    session_id: str


class SearchCaptchaStartRequest(BaseModel):
    """启动搜索验证码会话请求"""
    cookie_id: str
    keyword: str


async def _start_search_captcha_session(session_id: str, cookie_id: str, keyword: str):
    from playwright.async_api import async_playwright

    cookie_value = db_manager.get_all_cookies().get(str(cookie_id))
    if not cookie_value:
        raise RuntimeError(f"Cookie不存在: {cookie_id}")

    playwright = await async_playwright().start()
    cdp_url = os.getenv('LOCAL_BROWSER_CDP_URL') or os.getenv('BROWSER_CDP_URL')
    using_cdp_browser = False

    if cdp_url:
        logger.info(f"连接本地浏览器 CDP 启动验证码会话: {cdp_url}")
        browser = await playwright.chromium.connect_over_cdp(cdp_url)
        using_cdp_browser = True
        if browser.contexts:
            context = browser.contexts[0]
        else:
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
                viewport={'width': 1280, 'height': 720},
                locale='zh-CN',
            )
        if context.pages:
            page = context.pages[0]
        else:
            page = await context.new_page()
    else:
        browser = await playwright.chromium.launch(
            headless=False,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--lang=zh-CN',
                '--accept-lang=zh-CN,zh,en-US,en',
            ],
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 720},
            locale='zh-CN',
        )
        page = await context.new_page()

    cookies = []
    for cookie_pair in cookie_value.split(';'):
        cookie_pair = cookie_pair.strip()
        if '=' not in cookie_pair:
            continue
        name, value = cookie_pair.split('=', 1)
        cookies.append({
            'name': name.strip(),
            'value': value.strip(),
            'domain': '.goofish.com',
            'path': '/',
        })

    await page.goto('https://www.goofish.com', timeout=30000)
    await context.add_cookies(cookies)
    await page.reload()
    await page.wait_for_load_state('networkidle', timeout=15000)
    await page.fill('input[class*="search-input"]', keyword)
    await page.keyboard.press('Enter')
    await page.wait_for_load_state('networkidle', timeout=20000)
    await asyncio.sleep(5)

    session_info = await captcha_controller.create_session(session_id, page)
    captcha_controller.active_sessions[session_id]['playwright'] = playwright
    captcha_controller.active_sessions[session_id]['browser'] = browser
    captcha_controller.active_sessions[session_id]['context'] = context
    captcha_controller.active_sessions[session_id]['using_cdp_browser'] = using_cdp_browser
    logger.info(f"✅ 主服务内验证码搜索会话已启动: {session_id}")
    return session_info


# =============================================================================
# WebSocket 端点 - 实时通信
# =============================================================================

@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket 连接用于实时传输截图和接收鼠标事件
    """
    await websocket.accept()
    logger.info(f"🔌 WebSocket 连接建立: {session_id}")
    
    # 注册 WebSocket 连接
    captcha_controller.websocket_connections[session_id] = websocket
    
    try:
        # 发送初始会话信息
        if session_id in captcha_controller.active_sessions:
            session_data = captcha_controller.active_sessions[session_id]
            await websocket.send_json({
                'type': 'session_info',
                'screenshot': session_data['screenshot'],
                'captcha_info': session_data['captcha_info'],
                'viewport': session_data['viewport']
            })
            
            # 不启动自动刷新，改为只在操作时更新（极速优化）
            # refresh_task = asyncio.create_task(
            #     captcha_controller.auto_refresh_screenshot(session_id, interval=1.5)
            # )
        else:
            await websocket.send_json({
                'type': 'error',
                'message': '会话不存在'
            })
            await websocket.close()
            return
        
        # 持续接收客户端消息
        while True:
            data = await websocket.receive_json()
            msg_type = data.get('type')
            
            if msg_type == 'mouse_event':
                # 处理鼠标事件
                event_type = data.get('event_type')
                x = data.get('x')
                y = data.get('y')
                
                success = await captcha_controller.handle_mouse_event(
                    session_id, event_type, x, y
                )
                
                if success:
                    # 只在鼠标释放后才检查完成状态
                    if event_type == 'up':
                        # 等待页面更新（给验证码一些反应时间）
                        await asyncio.sleep(1.0)
                        
                        # 多次确认滑块确实消失
                        completed = await captcha_controller.check_completion(session_id)
                        
                        if completed:
                            # 再次确认（避免误判）
                            await asyncio.sleep(0.5)
                            completed = await captcha_controller.check_completion(session_id)
                        
                        if completed:
                            await websocket.send_json({
                                'type': 'completed',
                                'message': '验证成功！'
                            })
                            logger.success(f"✅ 验证完成: {session_id}")
                            break
                        else:
                            # 更新截图显示验证结果
                            screenshot = await captcha_controller.update_screenshot(session_id)
                            if screenshot:
                                await websocket.send_json({
                                    'type': 'screenshot_update',
                                    'screenshot': screenshot
                                })
                    else:
                        # 按下或移动时，实时更新截图（截取整个验证码容器）
                        if event_type in ['down', 'move']:
                            # 截取整个验证码容器，降低质量换取速度
                            screenshot = await captcha_controller.update_screenshot(session_id, quality=30)
                            if screenshot:
                                await websocket.send_json({
                                    'type': 'screenshot_update',
                                    'screenshot': screenshot
                                })
            
            elif msg_type == 'check_completion':
                # 手动检查完成状态
                completed = await captcha_controller.check_completion(session_id)
                await websocket.send_json({
                    'type': 'completion_status',
                    'completed': completed
                })
                
                if completed:
                    break
            
            elif msg_type == 'ping':
                # 心跳
                await websocket.send_json({'type': 'pong'})
    
    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket 连接断开: {session_id}")
    
    except Exception as e:
        logger.error(f"❌ WebSocket 错误: {e}")
        import traceback
        logger.error(traceback.format_exc())
    
    finally:
        # 清理
        if session_id in captcha_controller.websocket_connections:
            del captcha_controller.websocket_connections[session_id]
        
        logger.info(f"🔒 WebSocket 会话结束: {session_id}")


# =============================================================================
# HTTP 端点 - REST API
# =============================================================================

@router.get("/sessions")
async def get_active_sessions():
    """获取所有活跃的验证会话"""
    sessions = []
    for session_id, data in captcha_controller.active_sessions.items():
        sessions.append({
            'session_id': session_id,
            'completed': data.get('completed', False),
            'has_websocket': session_id in captcha_controller.websocket_connections
        })
    
    return {
        'count': len(sessions),
        'sessions': sessions
    }


@router.post("/start-search-session")
async def start_search_session(body: SearchCaptchaStartRequest):
    """在主服务内启动一个用于人工验证的搜索验证码会话。"""
    session_id = str(body.cookie_id)
    try:
        if session_id in captcha_controller.active_sessions:
            await captcha_controller.close_session(session_id)

        await _start_search_captcha_session(
            session_id=session_id,
            cookie_id=body.cookie_id,
            keyword=body.keyword,
        )

        return {
            'ok': True,
            'captcha_required': True,
            'session_id': session_id,
            'control_url': f'http://127.0.0.1:8080/api/captcha/control/{session_id}',
        }
    except Exception as e:
        logger.error(f"启动搜索验证码会话失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            'ok': False,
            'error': str(e),
        }


@router.get("/session/{session_id}")
async def get_session_info(session_id: str):
    """获取指定会话的信息"""
    if session_id not in captcha_controller.active_sessions:
        raise HTTPException(status_code=404, detail="会话不存在")
    
    session_data = captcha_controller.active_sessions[session_id]
    
    return {
        'session_id': session_id,
        'screenshot': session_data['screenshot'],
        'captcha_info': session_data['captcha_info'],
        'viewport': session_data['viewport'],
        'completed': session_data.get('completed', False)
    }


@router.get("/screenshot/{session_id}")
async def get_screenshot(session_id: str):
    """获取最新截图"""
    screenshot = await captcha_controller.update_screenshot(session_id)
    
    if not screenshot:
        raise HTTPException(status_code=404, detail="无法获取截图")
    
    return {'screenshot': screenshot}


@router.post("/mouse_event")
async def handle_mouse_event(event: MouseEvent):
    """处理鼠标事件（HTTP方式，不推荐，建议使用WebSocket）"""
    success = await captcha_controller.handle_mouse_event(
        event.session_id,
        event.event_type,
        event.x,
        event.y
    )
    
    if not success:
        raise HTTPException(status_code=400, detail="处理失败")
    
    # 检查是否完成
    completed = await captcha_controller.check_completion(event.session_id)
    
    return {
        'success': True,
        'completed': completed
    }


@router.post("/check_completion")
async def check_completion(request: SessionCheckRequest):
    """检查验证是否完成"""
    completed = await captcha_controller.check_completion(request.session_id)
    
    return {
        'session_id': request.session_id,
        'completed': completed
    }


@router.delete("/session/{session_id}")
async def close_session(session_id: str):
    """关闭会话"""
    await captcha_controller.close_session(session_id)
    return {'success': True}


# =============================================================================
# 前端页面
# =============================================================================

@router.get("/status/{session_id}")
async def get_captcha_status(session_id: str):
    """
    获取验证状态
    用于前端轮询检查验证是否完成
    """
    try:
        is_completed = captcha_controller.is_completed(session_id)
        session_exists = captcha_controller.session_exists(session_id)
        
        return {
            "success": True,
            "completed": is_completed,
            "session_exists": session_exists,
            "session_id": session_id
        }
    except Exception as e:
        logger.error(f"获取验证状态失败: {e}")
        return {
            "success": False,
            "completed": False,
            "session_exists": False,
            "session_id": session_id,
            "error": str(e)
        }


@router.get("/control", response_class=HTMLResponse)
async def captcha_control_page():
    """返回滑块控制页面"""
    html_file = "captcha_control.html"
    
    if os.path.exists(html_file):
        return FileResponse(html_file, media_type="text/html")
    else:
        # 返回简单的提示页面
        return HTMLResponse(content="""
        <!DOCTYPE html>
        <html>
        <head>
            <title>验证码控制面板</title>
        </head>
        <body>
            <h1>验证码控制面板</h1>
            <p>前端页面文件 captcha_control.html 不存在</p>
            <p>请查看文档了解如何创建前端页面</p>
        </body>
        </html>
        """)


@router.get("/control/{session_id}", response_class=HTMLResponse)
async def captcha_control_page_with_session(session_id: str):
    """返回带会话ID的滑块控制页面"""
    html_file = "captcha_control.html"
    
    if os.path.exists(html_file):
        with open(html_file, 'r', encoding='utf-8') as f:
            html_content = f.read()
            # 注入会话ID
            html_content = html_content.replace(
                '</body>',
                f'<script>window.INITIAL_SESSION_ID = "{session_id}";</script></body>'
            )
            return HTMLResponse(content=html_content)
    else:
        raise HTTPException(status_code=404, detail="前端页面不存在")
