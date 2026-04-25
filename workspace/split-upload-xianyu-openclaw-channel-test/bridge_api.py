"""
Bridge API — FastAPI Router

提供 HTTP/SSE 接口，供 OpenClaw Channel_Plugin 与闲鱼 XianyuLive 实例通信。
"""

import asyncio
import json
import os
import threading
import time
import uuid
from string import Template
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from bridge_message_queue import bridge_queue

# ---------------------------------------------------------------------------
# XianyuLive 实例注册表
# ---------------------------------------------------------------------------
# XianyuLive 实例在 _run_xianyu 中创建，CookieManager 不保存引用。
# 通过 register_xianyu_instance / unregister_xianyu_instance 在实例生命周期中注册。

xianyu_instances: dict = {}  # account_id -> XianyuLive instance


def register_xianyu_instance(account_id: str, instance):
    """注册 XianyuLive 实例（在 XianyuLive.main 启动时调用）"""
    xianyu_instances[account_id] = instance
    logger.info(f"[Bridge] XianyuLive 实例已注册: {account_id}")


def unregister_xianyu_instance(account_id: str):
    """注销 XianyuLive 实例（在 XianyuLive.main 退出时调用）"""
    xianyu_instances.pop(account_id, None)
    logger.info(f"[Bridge] XianyuLive 实例已注销: {account_id}")


# ---------------------------------------------------------------------------
# Pydantic 请求模型
# ---------------------------------------------------------------------------

class SendMessageRequest(BaseModel):
    conversationId: str
    toUserId: str
    text: str
    accountId: Optional[str] = "default"


class SendMediaRequest(BaseModel):
    conversationId: str
    toUserId: str
    imageUrl: str
    accountId: Optional[str] = "default"


class ConfirmDeliveryRequest(BaseModel):
    orderId: str
    accountId: Optional[str] = "default"


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

bridge_router = APIRouter(prefix="/api/bridge", tags=["bridge"])


# ---------------------------------------------------------------------------
# SSE 消息推送  GET /api/bridge/messages
# ---------------------------------------------------------------------------

@bridge_router.get("/messages")
async def stream_messages(
    request: Request,
    account_id: str = "default",
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
):
    """SSE 端点：持续推送指定账号的入站消息"""

    queue = bridge_queue.subscribe(account_id)

    async def event_generator():
        try:
            # 如果有 Last-Event-ID，先补发断线期间的消息
            if last_event_id:
                missed = bridge_queue.get_missed_messages(account_id, last_event_id)
                for msg in missed:
                    eid = msg.get("event_id", "")
                    data = json.dumps(msg, ensure_ascii=False)
                    yield f"id: {eid}\nevent: message\ndata: {data}\n\n"

            # 持续监听队列
            while True:
                # 检查客户端是否断开
                if await request.is_disconnected():
                    break

                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30.0)
                    eid = msg.get("event_id", "")
                    data = json.dumps(msg, ensure_ascii=False)
                    yield f"id: {eid}\nevent: message\ndata: {data}\n\n"
                except asyncio.TimeoutError:
                    # 30 秒无消息，发送心跳保持连接
                    yield ": keepalive\n\n"
        finally:
            bridge_queue.unsubscribe(account_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# 辅助：获取 XianyuLive 实例
# ---------------------------------------------------------------------------

def _get_instance(account_id: str):
    """获取 XianyuLive 实例，不存在或 ws 断开时抛出对应 HTTP 异常"""
    # 如果是 default，返回第一个可用实例
    if account_id == "default":
        if not xianyu_instances:
            raise HTTPException(status_code=404, detail="No XianyuLive instances registered")
        # 返回第一个可用实例
        account_id = list(xianyu_instances.keys())[0]
        logger.info(f"[Bridge] default 账号映射到: {account_id}")

    instance = xianyu_instances.get(account_id)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found or not running")
    if instance.ws is None:
        raise HTTPException(status_code=503, detail=f"Account '{account_id}' WebSocket disconnected")
    return instance


# ---------------------------------------------------------------------------
# 发送文本消息  POST /api/bridge/send
# ---------------------------------------------------------------------------

@bridge_router.post("/send")
async def send_message(body: SendMessageRequest):
    """通过 XianyuLive WebSocket 发送文本消息"""
    logger.info(f"[Bridge] 收到发送请求: accountId={body.accountId}, cid={body.conversationId}, to={body.toUserId}, text={body.text[:30] if len(body.text) > 30 else body.text}")
    try:
        instance = _get_instance(body.accountId)
        logger.info(f"[Bridge] 找到实例，ws={instance.ws is not None}, 准备发送...")
        await instance.send_msg(instance.ws, body.conversationId, body.toUserId, body.text)
        logger.info(f"[Bridge] 消息发送完成")
        return {"ok": True}
    except HTTPException as e:
        logger.error(f"[Bridge] HTTP异常: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"[Bridge] 发送文本消息失败: {e}")
        import traceback
        logger.error(f"[Bridge] 堆栈: {traceback.format_exc()}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# 发送图片消息  POST /api/bridge/send-media
# ---------------------------------------------------------------------------

@bridge_router.post("/send-media")
async def send_media(body: SendMediaRequest):
    """通过 XianyuLive WebSocket 发送图片消息"""
    try:
        instance = _get_instance(body.accountId)
        await instance.send_image_msg(instance.ws, body.conversationId, body.toUserId, body.imageUrl)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] 发送图片消息失败: {e}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# 获取账号列表  GET /api/bridge/accounts
# ---------------------------------------------------------------------------

@bridge_router.get("/accounts")
async def get_accounts():
    """返回所有已注册的闲鱼账号信息"""
    import cookie_manager

    accounts = []
    mgr = cookie_manager.manager
    if mgr is not None:
        for cid in mgr.list_cookies():
            instance = xianyu_instances.get(cid)
            accounts.append({
                "accountId": cid,
                "name": cid,
                "enabled": mgr.get_cookie_status(cid),
                "connected": instance is not None and instance.ws is not None,
            })
    return accounts


# ---------------------------------------------------------------------------
# 获取状态  GET /api/bridge/status
# ---------------------------------------------------------------------------

@bridge_router.get("/status")
async def get_status():
    """返回桥接服务的整体运行状态"""
    import cookie_manager

    mgr = cookie_manager.manager
    accounts = []
    if mgr is not None:
        for cid in mgr.list_cookies():
            instance = xianyu_instances.get(cid)
            accounts.append({
                "accountId": cid,
                "name": cid,
                "enabled": mgr.get_cookie_status(cid),
                "connected": instance is not None and instance.ws is not None,
            })

    active_connections = sum(1 for a in accounts if a["connected"])

    return {
        "running": True,
        "activeConnections": active_connections,
        "messageQueueSize": bridge_queue.get_total_buffer_size(),
        "accounts": accounts,
    }


# ---------------------------------------------------------------------------
# 确认发货  POST /api/bridge/confirm-delivery
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# 确认发货  POST /api/bridge/confirm-delivery
# ---------------------------------------------------------------------------

@bridge_router.post("/confirm-delivery")
async def confirm_delivery(body: ConfirmDeliveryRequest):
    """调用 XianyuLive 的发货确认功能"""
    try:
        instance = _get_instance(body.accountId)
        result = await instance.auto_confirm(body.orderId)
        if isinstance(result, dict) and "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return {"ok": True, "result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] 确认发货失败: {e}")
        return {"ok": False, "error": str(e)}


# ----------------------------------------------------------------------------
# 刷新Cookie  POST /api/bridge/refresh-cookie
# ----------------------------------------------------------------------------

class RefreshCookieRequest(BaseModel):
    accountId: Optional[str] = "default"


@bridge_router.post("/refresh-cookie")
async def refresh_cookie(body: RefreshCookieRequest):
    """手动触发Cookie刷新，从数据库重新加载最新Cookie"""
    try:
        instance = xianyu_instances.get(body.accountId)
        if instance is None:
            raise HTTPException(status_code=404, detail=f"Account '{body.accountId}' not found")
        
        # 从数据库获取最新Cookie
        from cookie_manager import manager as cookie_manager
        account_info = cookie_manager.get_cookie(body.accountId)
        if not account_info:
            raise HTTPException(status_code=404, detail=f"Cookie not found for account '{body.accountId}'")
        
        db_cookie_value = (
            account_info.get('cookie_value')
            or account_info.get('cookies_str')
            or account_info.get('value')
            or ''
        )
        if db_cookie_value and db_cookie_value != instance.cookies_str:
            instance.cookies_str = db_cookie_value
            from utils.trans_cookies import trans_cookies
            instance.cookies = trans_cookies(instance.cookies_str)
            # 更新 myid
            if 'unb' in instance.cookies:
                instance.myid = instance.cookies['unb']
            logger.info(f"[Bridge] 账号 {body.accountId} Cookie已刷新, new myid: {instance.myid}")
            return {"ok": True, "message": f"Cookie refreshed for account {body.accountId}", "new_myid": instance.myid}
        else:
            return {"ok": True, "message": "Cookie unchanged, no refresh needed", "myid": instance.myid}
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] 刷新Cookie失败: {e}")
        return {"ok": False, "error": str(e)}
async def confirm_delivery(body: ConfirmDeliveryRequest):
    """调用 XianyuLive 的发货确认功能"""
    try:
        instance = _get_instance(body.accountId)
        result = await instance.auto_confirm(body.orderId)
        if isinstance(result, dict) and "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return {"ok": True, "result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] 确认发货失败: {e}")
        return {"ok": False, "error": str(e)}
# ---------------------------------------------------------------------------
# AI Product API - 商品管理
# ---------------------------------------------------------------------------

class CreateProductRequest(BaseModel):
    accountId: Optional[str] = "default"
    title: str
    price: float
    description: Optional[str] = ""
    images: Optional[list] = []
    stock: Optional[int] = 1
    categoryId: Optional[str] = None


@bridge_router.post("/products")
async def create_product(body: CreateProductRequest):
    """创建闲鱼商品"""
    try:
        # TODO: 调用 XianyuLive 的商品创建功能
        logger.info(f"[Bridge] 创建商品: accountId={body.accountId}, title={body.title}, price={body.price}")
        return {"ok": True, "productId": "pending", "status": "created", "message": "Product creation endpoint ready"}
    except Exception as e:
        logger.error(f"[Bridge] 创建商品失败: {e}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# 商品发布 API - 使用 product_publisher.py
# ---------------------------------------------------------------------------

class PublishSingleProductRequest(BaseModel):
    cookie_id: str
    title: Optional[str] = None
    description: str
    price: float
    images: list[str]
    category: Optional[str] = None
    location: Optional[str] = None
    original_price: Optional[float] = None
    stock: Optional[int] = 1


class PublishBatchProductsRequest(BaseModel):
    cookie_id: str
    products: list[dict]


@bridge_router.post("/publish/single")
async def publish_single_product(body: PublishSingleProductRequest):
    """
    发布单个商品到闲鱼
    
    Args:
        body: 商品发布请求
            - cookie_id: 账号 Cookie ID（必填）
            - title: 商品标题（可选，默认"AI 生成标题"）
            - description: 商品描述（必填）
            - price: 商品价格（必填，单位：元）
            - images: 图片路径列表（必填，支持本地路径）
            - category: 商品分类（可选，如：数码产品/手机/苹果）
            - location: 发货地（可选，如：北京市/朝阳区）
            - original_price: 原价（可选）
            - stock: 库存数量（可选，默认1）
    
    Returns:
        {
            "ok": True/False,
            "product_id": "商品ID",
            "product_url": "商品链接",
            "error": "错误信息"（如果失败）
        }
    
    Example:
        ```json
        {
            "cookie_id": "user123",
            "title": "iPhone 15 Pro Max",
            "description": "全新未拆封，国行正品",
            "price": 8999,
            "images": ["/path/to/image1.jpg", "/path/to/image2.jpg"],
            "category": "数码产品/手机/苹果",
            "location": "北京市/朝阳区",
            "original_price": 9999,
            "stock": 1
        }
        ```
    
    注意事项:
        - Cookie 必须有效且包含 unb 和 _m_h5_tk 字段
        - 图片必须是本地文件路径（不支持 URL）
        - 价格单位为元（人民币）
        - 图片数量建议 3-9 张
        - 如果图片上传失败率超过 30%，发布将被终止
    """
    try:
        from product_publisher import XianyuProductPublisher, ProductInfo
        import cookie_manager
        
        logger.info(f"[Bridge] 发布单个商品: cookie_id={body.cookie_id}, title={body.title}, price={body.price}")
        
        # 获取 Cookie - 使用 db_manager 直接获取
        import db_manager
        account_info = db_manager.db_manager.get_cookie_by_id(body.cookie_id)
        if not account_info:
            return {"ok": False, "error": f"Cookie not found for account '{body.cookie_id}'"}
        
        cookies_str = account_info.get('value', '')
        if not cookies_str:
            return {"ok": False, "error": f"Cookie value is empty for account '{body.cookie_id}'"}
        
        # 【修复】验证 Cookie 有效性
        # 1. 验证 Cookie 格式
        if ';' not in cookies_str or '=' not in cookies_str:
            return {"ok": False, "error": f"Invalid cookie format for account '{body.cookie_id}'"}
        
        # 2. 验证 Cookie 是否包含必要的字段
        try:
            cookie_dict = {}
            for item in cookies_str.split(';'):
                item = item.strip()
                if '=' in item:
                    key, value = item.split('=', 1)
                    cookie_dict[key.strip()] = value.strip()
            
            required_keys = ['unb', '_m_h5_tk']
            missing_keys = [key for key in required_keys if key not in cookie_dict]
            if missing_keys:
                return {"ok": False, "error": f"Cookie missing required keys: {', '.join(missing_keys)}"}
            
            logger.info(f"[Bridge] Cookie 验证通过: cookie_id={body.cookie_id}")
        except Exception as e:
            logger.error(f"[Bridge] Cookie 验证失败: {e}")
            return {"ok": False, "error": f"Cookie validation failed: {str(e)}"}
        
        # 【修复】检查是否已发布过相同商品（根据标题+价格+描述的哈希值）
        import hashlib
        product_content = f"{body.title or 'AI 生成标题'}{body.price}{body.description}"
        product_hash = hashlib.md5(product_content.encode('utf-8')).hexdigest()
        
        import db_manager
        existing_product = db_manager.db_manager.get_product_by_hash(
            cookie_id=body.cookie_id,
            product_hash=product_hash
        )
        
        if existing_product:
            logger.warning(f"[Bridge] 商品已存在: {existing_product['product_id']}")
            return {
                "ok": False,
                "error": "商品已发布过（标题、价格、描述完全相同）",
                "existing_product_id": existing_product['product_id'],
                "existing_product_url": existing_product['product_url'],
                "published_at": existing_product['published_at']
            }
        
        # 创建商品信息
        product = ProductInfo(
            title=body.title or "AI 生成标题",
            description=body.description,
            price=body.price,
            images=body.images,
            category=body.category,
            location=body.location,
            original_price=body.original_price,
            stock=body.stock
        )
        
        # 初始化发布器
        publisher = XianyuProductPublisher(
            cookie_id=body.cookie_id,
            cookies_str=cookies_str,
            headless=True
        )
        
        # 初始化浏览器
        await publisher.init_browser()
        
        # 登录
        login_success = await publisher.login_with_cookie()
        if not login_success:
            await publisher.close()
            return {"ok": False, "error": "Cookie login failed"}
        
        # 发布商品
        success, product_id, product_url = await publisher.publish_product(product)
        
        # 关闭浏览器
        await publisher.close()
        
        if success:
            # 【修复】保存商品信息到数据库（包含哈希值）
            try:
                import db_manager
                # 获取用户ID（默认为1，实际应该从认证系统获取）
                user_id = 1  # TODO: 从认证系统获取真实用户ID
                db_manager.db_manager.save_published_product_with_hash(
                    user_id=user_id,
                    cookie_id=body.cookie_id,
                    product_id=product_id,
                    product_url=product_url,
                    title=product.title or "AI 生成标题",
                    price=product.price,
                    product_hash=product_hash
                )
                logger.info(f"[Bridge] 商品信息已保存到数据库: product_id={product_id}, hash={product_hash[:8]}...")
            except Exception as e:
                logger.error(f"[Bridge] 保存商品信息失败: {e}")
                # 不影响发布结果，继续返回成功
            
            return {
                "ok": True,
                "product_id": product_id,
                "product_url": product_url
            }
        else:
            return {"ok": False, "error": "Product publish failed"}
            
    except Exception as e:
        logger.error(f"[Bridge] 发布单个商品失败: {e}")
        import traceback
        logger.error(f"[Bridge] 堆栈: {traceback.format_exc()}")
        return {"ok": False, "error": str(e)}


@bridge_router.post("/publish/batch-stream")
async def publish_batch_products_stream(body: PublishBatchProductsRequest):
    """
    批量发布商品到闲鱼（流式响应，支持实时进度）
    
    使用 Server-Sent Events (SSE) 推送发布进度，客户端可以实时了解每个商品的发布状态。
    
    Args:
        body: 批量发布请求（同 /publish/batch）
    
    Returns:
        SSE 流，每个事件包含：
        - event: 事件类型（init/start/progress/complete/done/error）
        - data: JSON 格式的事件数据
    
    事件类型:
        - init: 初始化（返回总数）
        - start: 开始发布某个商品
        - progress: 发布进度更新
        - complete: 某个商品发布完成
        - done: 所有商品发布完成
        - error: 发生错误
    
    Example:
        客户端使用 EventSource 连接：
        ```javascript
        const eventSource = new EventSource('/api/publish/batch-stream');
        eventSource.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            console.log(data.event, data.data);
        });
        ```
    """
    from fastapi.responses import StreamingResponse
    import json
    
    async def event_generator():
        try:
            from product_publisher import XianyuProductPublisher, ProductInfo
            import db_manager
            
            # 获取 Cookie - 使用 db_manager 直接获取
            account_info = db_manager.db_manager.get_cookie_by_id(body.cookie_id)
            if not account_info:
                yield f"data: {json.dumps({'event': 'error', 'data': {'error': f'Cookie not found for account {body.cookie_id}'}})}\n\n"
                return
            
            cookies_str = account_info.get('value', '')
            if not cookies_str:
                yield f"data: {json.dumps({'event': 'error', 'data': {'error': 'Cookie value is empty'}})}\n\n"
                return
            
            # 初始化
            yield f"data: {json.dumps({'event': 'init', 'data': {'total': len(body.products)}})}\n\n"
            
            # 初始化发布器
            publisher = XianyuProductPublisher(
                cookie_id=body.cookie_id,
                cookies_str=cookies_str,
                headless=True
            )
            
            # 设置进度回调
            def progress_callback(event: str, data: dict):
                # 注意：这是同步回调，不能直接 yield
                pass
            
            publisher.set_progress_callback(progress_callback)
            
            # 初始化浏览器
            await publisher.init_browser()
            
            # 登录
            login_success = await publisher.login_with_cookie()
            if not login_success:
                await publisher.close()
                yield f"data: {json.dumps({'event': 'error', 'data': {'error': 'Cookie login failed'}})}\n\n"
                return
            
            # 批量发布
            results = []
            success_count = 0
            failed_count = 0
            
            for i, product_data in enumerate(body.products):
                try:
                    # 发送开始事件
                    yield f"data: {json.dumps({'event': 'start', 'data': {'index': i, 'title': product_data.get('title', f'商品 {i+1}')}})}\n\n"
                    
                    product = ProductInfo(
                        title=product_data.get('title', f"AI 生成标题 {i+1}"),
                        description=product_data.get('description', ''),
                        price=product_data.get('price', 0),
                        images=product_data.get('images', []),
                        category=product_data.get('category'),
                        location=product_data.get('location'),
                        original_price=product_data.get('original_price'),
                        stock=product_data.get('stock', 1)
                    )
                    
                    success, product_id, product_url = await publisher.publish_product(product)
                    
                    if success:
                        results.append({
                            "success": True,
                            "product_id": product_id,
                            "product_url": product_url
                        })
                        success_count += 1
                        
                        # 发送完成事件
                        yield f"data: {json.dumps({'event': 'complete', 'data': {'index': i, 'success': True, 'product_id': product_id, 'product_url': product_url}})}\n\n"
                    else:
                        results.append({
                            "success": False,
                            "error": "Publish failed"
                        })
                        failed_count += 1
                        
                        # 发送完成事件
                        yield f"data: {json.dumps({'event': 'complete', 'data': {'index': i, 'success': False, 'error': 'Publish failed'}})}\n\n"
                        
                except Exception as e:
                    logger.error(f"[Bridge] 发布第 {i+1} 个商品失败: {e}")
                    results.append({
                        "success": False,
                        "error": str(e)
                    })
                    failed_count += 1
                    
                    # 发送完成事件
                    yield f"data: {json.dumps({'event': 'complete', 'data': {'index': i, 'success': False, 'error': str(e)}})}\n\n"
            
            # 关闭浏览器
            await publisher.close()
            
            # 发送完成事件
            yield f"data: {json.dumps({'event': 'done', 'data': {'total': len(body.products), 'success_count': success_count, 'failed_count': failed_count, 'results': results}})}\n\n"
            
        except Exception as e:
            logger.error(f"[Bridge] 批量发布流式响应失败: {e}")
            yield f"data: {json.dumps({'event': 'error', 'data': {'error': str(e)}})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@bridge_router.post("/publish/batch")
async def publish_batch_products(body: PublishBatchProductsRequest):
    """
    批量发布商品到闲鱼
    
    Args:
        body: 批量发布请求
            - cookie_id: 账号 Cookie ID（必填）
            - products: 商品列表（必填），每个商品包含：
                - title: 商品标题（可选）
                - description: 商品描述（必填）
                - price: 商品价格（必填）
                - images: 图片路径列表（必填）
                - category: 商品分类（可选）
                - location: 发货地（可选）
                - original_price: 原价（可选）
                - stock: 库存数量（可选）
    
    Returns:
        {
            "ok": True/False,
            "results": [发布结果列表],
            "total": 总数,
            "success_count": 成功数,
            "failed_count": 失败数,
            "error": "错误信息"（如果失败）
        }
    
    Example:
        ```json
        {
            "cookie_id": "user123",
            "products": [
                {
                    "title": "iPhone 15 Pro Max",
                    "description": "全新未拆封",
                    "price": 8999,
                    "images": ["/path/to/image1.jpg"]
                },
                {
                    "title": "MacBook Pro",
                    "description": "M3 芯片",
                    "price": 15999,
                    "images": ["/path/to/image2.jpg"]
                }
            ]
        }
        ```
    
    注意事项:
        - 批量发布会依次发布每个商品
        - 单个商品失败不会影响其他商品
        - 建议每批不超过 10 个商品
        - 发布过程可能需要较长时间，请耐心等待
    """
    try:
        from product_publisher import XianyuProductPublisher, ProductInfo
        import cookie_manager
        
        logger.info(f"[Bridge] 批量发布商品: cookie_id={body.cookie_id}, count={len(body.products)}")
        
        # 获取 Cookie - 使用 db_manager 直接获取
        import db_manager
        account_info = db_manager.db_manager.get_cookie_by_id(body.cookie_id)
        if not account_info:
            return {"ok": False, "error": f"Cookie not found for account '{body.cookie_id}'"}
        
        cookies_str = account_info.get('value', '')
        if not cookies_str:
            return {"ok": False, "error": f"Cookie value is empty for account '{body.cookie_id}'"}
        
        # 初始化发布器
        publisher = XianyuProductPublisher(
            cookie_id=body.cookie_id,
            cookies_str=cookies_str,
            headless=True
        )
        
        # 初始化浏览器
        await publisher.init_browser()
        
        # 登录
        login_success = await publisher.login_with_cookie()
        if not login_success:
            await publisher.close()
            return {"ok": False, "error": "Cookie login failed"}
        
        # 批量发布
        results = []
        success_count = 0
        failed_count = 0
        
        for i, product_data in enumerate(body.products):
            try:
                product = ProductInfo(
                    title=product_data.get('title', f"AI 生成标题 {i+1}"),
                    description=product_data.get('description', ''),
                    price=product_data.get('price', 0),
                    images=product_data.get('images', []),
                    category=product_data.get('category'),
                    location=product_data.get('location'),
                    original_price=product_data.get('original_price'),
                    stock=product_data.get('stock', 1)
                )
                
                success, product_id, product_url = await publisher.publish_product(product)
                
                if success:
                    # 保存商品信息到数据库
                    try:
                        import db_manager
                        user_id = 1  # TODO: 从认证系统获取真实用户ID
                        db_manager.db_manager.save_published_product_info(
                            user_id=user_id,
                            cookie_id=body.cookie_id,
                            product_id=product_id,
                            product_url=product_url,
                            title=product.title,
                            price=product.price
                        )
                    except Exception as e:
                        logger.error(f"[Bridge] 保存商品信息失败: {e}")
                    
                    results.append({
                        "success": True,
                        "product_id": product_id,
                        "product_url": product_url
                    })
                    success_count += 1
                else:
                    results.append({
                        "success": False,
                        "error": "Publish failed"
                    })
                    failed_count += 1
                    
            except Exception as e:
                logger.error(f"[Bridge] 发布第 {i+1} 个商品失败: {e}")
                results.append({
                    "success": False,
                    "error": str(e)
                })
                failed_count += 1
        
        # 关闭浏览器
        await publisher.close()
        
        return {
            "ok": True,
            "results": results,
            "total": len(body.products),
            "success_count": success_count,
            "failed_count": failed_count
        }
        
    except Exception as e:
        logger.error(f"[Bridge] 批量发布商品失败: {e}")
        import traceback
        logger.error(f"[Bridge] 堆栈: {traceback.format_exc()}")
        return {"ok": False, "error": str(e)}


@bridge_router.get("/products")
async def list_products(accountId: str = "default", page: int = 1, limit: int = 20):
    """列出闲鱼商品"""
    try:
        # TODO: 从数据库获取商品列表
        logger.info(f"[Bridge] 列出商品: accountId={accountId}, page={page}, limit={limit}")
        return {"ok": True, "products": [], "total": 0, "message": "Product listing endpoint ready"}
    except Exception as e:
        logger.error(f"[Bridge] 列出商品失败: {e}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# AI Product API - 发货规则
# ---------------------------------------------------------------------------

class CreateDeliveryRuleRequest(BaseModel):
    accountId: Optional[str] = "default"
    keyword: str
    cardId: int
    enabled: Optional[bool] = True


@bridge_router.post("/delivery-rules")
async def create_delivery_rule(body: CreateDeliveryRuleRequest):
    """创建自动发货规则"""
    try:
        import db_manager
        rule_id = db_manager.add_delivery_rule(body.accountId, body.keyword, body.cardId, body.enabled)
        logger.info(f"[Bridge] 创建发货规则: accountId={body.accountId}, keyword={body.keyword}, cardId={body.cardId}")
        return {"ok": True, "ruleId": rule_id}
    except Exception as e:
        logger.error(f"[Bridge] 创建发货规则失败: {e}")
        return {"ok": False, "error": str(e)}


@bridge_router.get("/delivery-rules")
async def list_delivery_rules(accountId: str = "default"):
    """列出自动发货规则"""
    try:
        import db_manager
        rules = db_manager.get_delivery_rules(accountId)
        return {"ok": True, "rules": rules}
    except Exception as e:
        logger.error(f"[Bridge] 列出发货规则失败: {e}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# AI Product API - 发货卡片
# ---------------------------------------------------------------------------

class CreateCardRequest(BaseModel):
    accountId: Optional[str] = "default"
    name: str
    type: str  # text, image, api
    content: str
    delaySeconds: Optional[int] = 0


@bridge_router.post("/cards")
async def create_card(body: CreateCardRequest):
    """创建发货内容卡片"""
    try:
        import db_manager
        card_id = db_manager.add_card(body.accountId, body.name, body.type, body.content, body.delaySeconds)
        logger.info(f"[Bridge] 创建发货卡片: accountId={body.accountId}, name={body.name}, type={body.type}")
        return {"ok": True, "cardId": card_id}
    except Exception as e:
        logger.error(f"[Bridge] 创建发货卡片失败: {e}")
        return {"ok": False, "error": str(e)}


@bridge_router.get("/cards")
async def list_cards(accountId: str = "default"):
    """列出发货卡片"""
    try:
        import db_manager
        cards = db_manager.get_cards(accountId)
        return {"ok": True, "cards": cards}
    except Exception as e:
        logger.error(f"[Bridge] 列出发货卡片失败: {e}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Spider API - 商品搜索爬虫
# ---------------------------------------------------------------------------

class SearchProductsRequest(BaseModel):
    """商品搜索请求"""
    cookie_id: str
    keyword: str
    max_pages: Optional[int] = 1


class SearchProductsMultiRequest(BaseModel):
    """多页商品搜索请求"""
    cookie_id: str
    keyword: str
    max_pages: int = 5


class MarketResearchRequest(BaseModel):
    """市场调研请求"""
    cookie_id: str
    keyword: str
    max_pages: int = 3
    include_terms: list[str] = Field(default_factory=list)
    exclude_terms: list[str] = Field(default_factory=list)
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    sort: str = "price_asc"
    captcha_mode: str = "remote_control"
    allow_local_browser_handoff: bool = False


class MarketResearchResumeRequest(BaseModel):
    """市场调研恢复请求"""
    session_id: str
    cookie_id: str
    keyword: str
    max_pages: int = 3
    include_terms: list[str] = Field(default_factory=list)
    exclude_terms: list[str] = Field(default_factory=list)
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    sort: str = "price_asc"


class MarketSellerContactItem(BaseModel):
    item_id: str
    title: str = ""
    seller_name: str = ""
    seller_user_id: str = ""
    price_text: str = ""
    price_display: str = ""
    condition: str = ""
    storage: str = ""
    battery_health: Optional[int] = None
    area: str = ""
    quality_score: int = 0
    quality_level: str = ""
    item_url: str = ""


class MarketSellerContactRequest(BaseModel):
    cookie_id: str
    items: list[MarketSellerContactItem]
    message_template: str = "你好，看到你这台${item_title}还在，请问真实成色和电池情况方便再发我确认下吗？"
    min_quality_score: int = 60
    max_count: int = 3
    delay_seconds: float = 2.0
    dry_run: bool = False
    async_mode: bool = False


def _render_market_contact_message(template_text: str, item: MarketSellerContactItem) -> str:
    template = Template(template_text or "")
    battery_text = f"{item.battery_health}%" if item.battery_health is not None else "未写明"
    return template.safe_substitute(
        seller_name=item.seller_name or "老板",
        item_title=item.title or item.item_id,
        price=item.price_display or item.price_text or "未标价",
        condition=item.condition or "未写明",
        storage=item.storage or "未写明",
        battery_health=battery_text,
        quality_score=item.quality_score,
        quality_level=item.quality_level or "",
        area=item.area or "",
        item_id=item.item_id,
    ).strip()


def _build_market_contact_candidates(body: MarketSellerContactRequest) -> tuple[list[MarketSellerContactItem], list[dict[str, Any]]]:
    selected_items: list[MarketSellerContactItem] = []
    seen_keys: set[str] = set()

    for item in body.items:
        seller_user_id = str(item.seller_user_id or "").strip()
        item_id = str(item.item_id or "").strip()
        dedupe_key = f"{seller_user_id}:{item_id}"
        if not seller_user_id or not item_id or dedupe_key in seen_keys:
            continue
        if int(item.quality_score or 0) < max(0, min(100, int(body.min_quality_score or 0))):
            continue
        seen_keys.add(dedupe_key)
        selected_items.append(item)

    selected_items = selected_items[: max(1, min(int(body.max_count or 1), 10))]

    planned_results: list[dict[str, Any]] = []
    for item in selected_items:
        message_text = _render_market_contact_message(body.message_template, item)
        planned_results.append({
            "item_id": item.item_id,
            "title": item.title,
            "seller_name": item.seller_name,
            "seller_user_id": item.seller_user_id,
            "quality_score": item.quality_score,
            "message": message_text,
            "status": "queued",
            "chat_id": "",
            "scene_type": "market_research",
            "our_role": "buyer",
            "counterpart_role": "seller",
        })

    return selected_items, planned_results


def _persist_market_contact_context(
    cookie_id: str,
    item: MarketSellerContactItem,
    message_text: str,
    chat_id: str = "",
    resolved_user_id: str = "",
) -> None:
    try:
        from db_manager import db_manager

        item_price = str(item.price_display or item.price_text or "").strip()
        counterpart_user_id = str(resolved_user_id or item.seller_user_id or "").strip()
        db_manager.upsert_conversation_profile(
            cookie_id=str(cookie_id or "").strip(),
            chat_id=str(chat_id or "").strip(),
            counterpart_user_id=counterpart_user_id,
            counterpart_name=str(item.seller_name or "").strip(),
            item_id=str(item.item_id or "").strip(),
            item_title=str(item.title or "").strip(),
            item_price=item_price,
            scene_type="market_research",
            our_role="buyer",
            counterpart_role="seller",
            source="market_research",
            status="active",
        )
        if chat_id:
            db_manager.save_conversation(
                cookie_id=str(cookie_id or "").strip(),
                chat_id=str(chat_id or "").strip(),
                user_id=counterpart_user_id,
                user_name=str(item.seller_name or "").strip(),
                item_id=str(item.item_id or "").strip(),
                role="assistant",
                content=str(message_text or "").strip(),
            )
    except Exception as exc:
        logger.warning(f"[Bridge] 持久化调研沟通上下文失败: cookie={cookie_id}, seller={item.seller_user_id}, item={item.item_id}, error={exc}")


class MarketContactJobStore:
    def __init__(self):
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def create(self, cookie_id: str, planned_results: list[dict[str, Any]], dry_run: bool) -> dict[str, Any]:
        job_id = uuid.uuid4().hex
        now = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        job = {
            "job_id": job_id,
            "ok": True,
            "cookie_id": cookie_id,
            "dry_run": dry_run,
            "status": "queued",
            "count": len(planned_results),
            "total_count": len(planned_results),
            "processed_count": 0,
            "success_count": 0,
            "failed_count": 0,
            "current_index": 0,
            "current_seller_name": "",
            "current_title": "",
            "started_at": now,
            "finished_at": "",
            "results": [dict(item) for item in planned_results],
            "error": "",
        }
        with self._lock:
            self._jobs[job_id] = job
        return dict(job)

    def get(self, job_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def update(self, job_id: str, **fields: Any) -> Optional[dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            job.update(fields)
            return dict(job)

    def update_result(self, job_id: str, index: int, **fields: Any) -> Optional[dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            results = job.get("results") or []
            if 0 <= index < len(results):
                results[index].update(fields)
            return dict(job)


market_contact_job_store = MarketContactJobStore()


def _is_transient_market_contact_error(error: Exception | str) -> bool:
    message = str(error or "").strip()
    if not message:
        return False

    transient_markers = (
        "闲鱼走神了",
        "稍后再试",
        "系统繁忙",
        "RGV587",
        "EXCEPTION",
        "当前聊天连接未就绪",
    )
    return any(marker in message for marker in transient_markers)


async def _send_market_contact_message(instance, item: MarketSellerContactItem, message_text: str) -> tuple[str, str]:
    max_attempts = 2
    last_error: Exception | None = None
    resolved_user_id = str(
        await instance.resolve_chat_peer_user_id(item.item_id, item.seller_user_id) or item.seller_user_id or ""
    ).strip()
    if not resolved_user_id:
        raise RuntimeError("未能解析到卖家的真实聊天ID")

    if resolved_user_id != str(item.seller_user_id or "").strip():
        logger.info(
            f"[Bridge] 已解析真实聊天ID: item={item.item_id}, "
            f"search_seller_id={item.seller_user_id}, peer_user_id={resolved_user_id}"
        )

    for attempt in range(1, max_attempts + 1):
        try:
            chat_id = await instance.send_msg_once(resolved_user_id, item.item_id, message_text) or ""
            return str(chat_id or "").strip(), resolved_user_id
        except Exception as exc:
            last_error = exc
            if attempt >= max_attempts or not _is_transient_market_contact_error(exc):
                raise

            wait_seconds = 1.2 * attempt
            logger.warning(
                f"[Bridge] 自动沟通卖家遇到瞬时异常，准备重试: "
                f"seller={item.seller_user_id}, peer={resolved_user_id}, item={item.item_id}, attempt={attempt}, "
                f"wait={wait_seconds:.1f}s, error={exc}"
            )
            await asyncio.sleep(wait_seconds)

    if last_error is not None:
        raise last_error
    return "", resolved_user_id


async def _run_market_contact_job(
    job_id: str,
    cookie_id: str,
    selected_items: list[MarketSellerContactItem],
    planned_results: list[dict[str, Any]],
    delay_seconds: float,
) -> None:
    finished_at = ""
    try:
        instance = _get_instance(cookie_id)
        market_contact_job_store.update(job_id, status="running")

        for index, item in enumerate(selected_items):
            message_text = planned_results[index]["message"]
            market_contact_job_store.update(
                job_id,
                current_index=index + 1,
                current_seller_name=item.seller_name,
                current_title=item.title,
            )
            market_contact_job_store.update_result(job_id, index, status="sending")

            try:
                chat_id, resolved_user_id = await _send_market_contact_message(instance, item, message_text)
                _persist_market_contact_context(
                    cookie_id,
                    item,
                    message_text,
                    chat_id=chat_id,
                    resolved_user_id=resolved_user_id,
                )
                market_contact_job_store.update_result(
                    job_id,
                    index,
                    ok=True,
                    status="sent",
                    chat_id=str(chat_id or "").strip(),
                    contact_user_id=str(resolved_user_id or "").strip(),
                )
            except Exception as exc:
                logger.error(f"[Bridge] 自动沟通卖家失败: seller={item.seller_user_id}, item={item.item_id}, error={exc}")
                market_contact_job_store.update_result(
                    job_id,
                    index,
                    ok=False,
                    status="failed",
                    error=str(exc),
                )

            current_job = market_contact_job_store.get(job_id) or {}
            results = current_job.get("results") or []
            success_count = sum(1 for row in results if row.get("ok") is True)
            failed_count = sum(1 for row in results if row.get("status") == "failed")
            processed_count = sum(1 for row in results if row.get("status") in {"sent", "failed"})
            market_contact_job_store.update(
                job_id,
                processed_count=processed_count,
                success_count=success_count,
                failed_count=failed_count,
            )

            if index < len(selected_items) - 1:
                await asyncio.sleep(delay_seconds)

        finished_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        final_job = market_contact_job_store.get(job_id) or {}
        success_count = int(final_job.get("success_count") or 0)
        failed_count = int(final_job.get("failed_count") or 0)
        market_contact_job_store.update(
            job_id,
            ok=success_count > 0 or failed_count == 0,
            status="completed",
            finished_at=finished_at,
            current_seller_name="",
            current_title="",
        )
    except Exception as exc:
        finished_at = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        logger.error(f"[Bridge] 自动沟通任务异常结束: job={job_id}, error={exc}")
        market_contact_job_store.update(
            job_id,
            ok=False,
            status="failed",
            error=str(exc),
            finished_at=finished_at,
            current_seller_name="",
            current_title="",
        )


def _get_link_unique_key(link: str) -> str:
    parts = link.split('&', 1)
    if len(parts) >= 2:
        return '&'.join(parts[:1])
    return link


def _save_bridge_search_items(items: list[dict]) -> tuple[int, list[int]]:
    import hashlib
    from datetime import datetime
    from db_manager import db_manager

    new_records = 0
    new_ids: list[int] = []

    for item in items:
        title = str(item.get("title") or "").strip()
        price = str(item.get("price") or "").strip()
        link = str(item.get("item_url") or "").strip()
        if not title or not price or not link:
            continue

        unique_part = _get_link_unique_key(link)
        link_hash = hashlib.md5(unique_part.encode("utf-8")).hexdigest()
        if db_manager.get_spider_product_by_hash(link_hash):
            continue

        publish_time = None
        publish_time_text = str(item.get("publish_time") or "").strip()
        if publish_time_text and publish_time_text != "未知时间":
            try:
                publish_time = datetime.strptime(publish_time_text, "%Y-%m-%d %H:%M")
            except Exception:
                publish_time = None

        product_id = db_manager.save_spider_product(
            title=title,
            price=price,
            area=str(item.get("area") or "地区未知"),
            seller=str(item.get("seller_name") or "匿名卖家"),
            link=link,
            link_hash=link_hash,
            image_url=str(item.get("main_image") or ""),
            publish_time=publish_time,
        )
        if product_id:
            new_records += 1
            new_ids.append(product_id)

    return new_records, new_ids


@bridge_router.post("/spider/search")
async def search_products(body: SearchProductsRequest):
    """搜索闲鱼商品（单页）
    
    Args:
        body: 搜索请求参数
            - cookie_id: 账号Cookie ID
            - keyword: 搜索关键词
            - max_pages: 最大页数（默认1）
    
    Returns:
        {
            "ok": True/False,
            "keyword": "搜索关键词",
            "total_results": 总结果数,
            "new_records": 新增记录数,
            "new_record_ids": [新增记录ID列表],
            "error": "错误信息"（如果失败）
        }
    """
    try:
        from cookie_manager import manager as cookie_manager
        from utils.item_search import search_xianyu_items_with_cookie
        
        # 获取Cookie
        cookie_value = cookie_manager.cookies.get(body.cookie_id)
        if not cookie_value:
            logger.error(f"[Bridge] Cookie不存在: {body.cookie_id}")
            return {"ok": False, "error": f"Cookie不存在: {body.cookie_id}"}
        
        logger.info(f"[Bridge] 开始搜索商品: cookie_id={body.cookie_id}, keyword={body.keyword}, max_pages={body.max_pages}")

        result = await search_xianyu_items_with_cookie(
            cookie_id=body.cookie_id,
            keyword=body.keyword,
            page=1,
            page_size=20,
        )
        if result.get("captcha_required"):
            logger.warning(f"[Bridge] 搜索触发验证码: keyword={body.keyword}, captcha_info={result.get('captcha_info')}")
            return {
                "ok": True,
                "keyword": body.keyword,
                "total_results": 0,
                "new_records": 0,
                "new_record_ids": [],
                "captcha_required": True,
                "error": result.get("error") or "需要人工完成刮刮乐验证码",
                "captcha_info": result.get("captcha_info", {}),
            }
        if result.get("error"):
            logger.error(f"[Bridge] 搜索商品失败: {result['error']}")
            return {"ok": False, "error": result["error"]}

        items = result.get("items", [])
        total_results = int(result.get("total", len(items) or 0))
        new_records, new_ids = _save_bridge_search_items(items)
        
        logger.info(f"[Bridge] 搜索完成: keyword={body.keyword}, total={total_results}, new={new_records}")
        
        return {
            "ok": True,
            "keyword": body.keyword,
            "total_results": total_results,
            "new_records": new_records,
            "new_record_ids": new_ids
        }
        
    except Exception as e:
        logger.error(f"[Bridge] 搜索商品失败: {e}")
        import traceback
        logger.error(f"[Bridge] 错误堆栈:\n{traceback.format_exc()}")
        return {"ok": False, "error": str(e)}


@bridge_router.post("/spider/search-multi")
async def search_products_multi(body: SearchProductsMultiRequest):
    """搜索闲鱼商品（多页）
    
    Args:
        body: 搜索请求参数
            - cookie_id: 账号Cookie ID
            - keyword: 搜索关键词
            - max_pages: 最大页数
    
    Returns:
        {
            "ok": True/False,
            "keyword": "搜索关键词",
            "total_results": 总结果数,
            "new_records": 新增记录数,
            "new_record_ids": [新增记录ID列表],
            "error": "错误信息"（如果失败）
        }
    """
    try:
        from cookie_manager import manager as cookie_manager
        from utils.item_search import search_multiple_pages_xianyu_with_cookie
        
        # 获取Cookie
        cookie_value = cookie_manager.cookies.get(body.cookie_id)
        if not cookie_value:
            logger.error(f"[Bridge] Cookie不存在: {body.cookie_id}")
            return {"ok": False, "error": f"Cookie不存在: {body.cookie_id}"}
        
        logger.info(f"[Bridge] 开始多页搜索商品: cookie_id={body.cookie_id}, keyword={body.keyword}, max_pages={body.max_pages}")

        result = await search_multiple_pages_xianyu_with_cookie(
            cookie_id=body.cookie_id,
            keyword=body.keyword,
            total_pages=body.max_pages,
        )
        if result.get("captcha_required"):
            logger.warning(f"[Bridge] 多页搜索触发验证码: keyword={body.keyword}, captcha_info={result.get('captcha_info')}")
            return {
                "ok": True,
                "keyword": body.keyword,
                "total_results": 0,
                "new_records": 0,
                "new_record_ids": [],
                "captcha_required": True,
                "error": result.get("error") or "需要人工完成刮刮乐验证码",
                "captcha_info": result.get("captcha_info", {}),
            }
        if result.get("error"):
            logger.error(f"[Bridge] 多页搜索商品失败: {result['error']}")
            return {"ok": False, "error": result["error"]}

        items = result.get("items", [])
        total_results = int(result.get("total", len(items) or 0))
        new_records, new_ids = _save_bridge_search_items(items)
        
        logger.info(f"[Bridge] 多页搜索完成: keyword={body.keyword}, total={total_results}, new={new_records}")
        
        return {
            "ok": True,
            "keyword": body.keyword,
            "total_results": total_results,
            "new_records": new_records,
            "new_record_ids": new_ids
        }
        
    except Exception as e:
        logger.error(f"[Bridge] 多页搜索商品失败: {e}")
        import traceback
        logger.error(f"[Bridge] 错误堆栈:\n{traceback.format_exc()}")
        return {"ok": False, "error": str(e)}


@bridge_router.post("/market-research")
async def market_research(body: MarketResearchRequest):
    """闲鱼市场调研分析接口"""
    try:
        from db_manager import db_manager
        from market_research import build_market_analysis, serialize_market_item
        from utils.item_search import (
            search_multiple_pages_xianyu_with_cookie_mode,
            search_multiple_pages_xianyu_with_cookie,
            search_xianyu_items_with_cookie,
        )

        sort_value = body.sort if body.sort in {"price_asc", "price_desc", "want_desc", "latest", "quality_desc"} else "price_asc"

        cookie_info = db_manager.get_cookie_by_id(body.cookie_id)
        cookie_value = str((cookie_info or {}).get("cookies_str") or "").strip()
        if len(cookie_value) < 50:
            logger.error(f"[Bridge] 市场调研失败，Cookie不存在或无效: {body.cookie_id}")
            return {"ok": False, "error": f"Cookie不存在或无效: {body.cookie_id}"}

        logger.info(
            f"[Bridge] 开始市场调研: cookie_id={body.cookie_id}, keyword={body.keyword}, "
            f"max_pages={body.max_pages}, include={body.include_terms}, exclude={body.exclude_terms}"
        )

        captcha_mode = (body.captcha_mode or "remote_control").strip()
        allow_local_browser_handoff = bool(body.allow_local_browser_handoff)
        if captcha_mode == "local_browser" and not allow_local_browser_handoff:
            logger.info("[Bridge] 市场调研未携带人工触发许可，已禁止本机浏览器接管")
            captcha_mode = "remote_control"

        if body.max_pages > 1:
            result = await search_multiple_pages_xianyu_with_cookie_mode(
                cookie_id=body.cookie_id,
                keyword=body.keyword,
                total_pages=body.max_pages,
                captcha_mode=captcha_mode,
                allow_local_browser_handoff=allow_local_browser_handoff,
            )
        else:
            result = await search_xianyu_items_with_cookie(
                cookie_id=body.cookie_id,
                keyword=body.keyword,
                page=1,
                page_size=20,
                captcha_mode=captcha_mode,
                allow_local_browser_handoff=allow_local_browser_handoff,
            )

        if result.get("captcha_required"):
            logger.warning(f"[Bridge] 市场调研触发验证码: keyword={body.keyword}, captcha_info={result.get('captcha_info')}")
            return {
                "ok": True,
                "keyword": body.keyword,
                "cookie_id": body.cookie_id,
                "items": [],
                "summary": {},
                "raw_count": 0,
                "deduped_count": 0,
                "filtered_count": 0,
                "captcha_required": True,
                "error": result.get("error") or "需要人工完成刮刮乐验证码",
                "captcha_info": result.get("captcha_info", {}),
            }

        if result.get("error"):
            logger.error(f"[Bridge] 市场调研搜索失败: {result['error']}")
            return {"ok": False, "error": result["error"]}

        analysis = build_market_analysis(
            result.get("items", []),
            include_terms=body.include_terms,
            exclude_terms=body.exclude_terms,
            min_price=body.min_price,
            max_price=body.max_price,
            sort_by=sort_value,
        )

        items = [serialize_market_item(item) for item in analysis["items"]]
        logger.info(
            f"[Bridge] 市场调研完成: keyword={body.keyword}, raw={analysis['raw_count']}, "
            f"deduped={analysis['deduped_count']}, filtered={analysis['filtered_count']}"
        )

        return {
            "ok": True,
            "keyword": body.keyword,
            "cookie_id": body.cookie_id,
            "items": items,
            "summary": analysis["summary"],
            "raw_count": analysis["raw_count"],
            "deduped_count": analysis["deduped_count"],
            "filtered_count": analysis["filtered_count"],
            "source": result.get("source"),
            "is_real_data": result.get("is_real_data", False),
            "sort": sort_value,
        }

    except Exception as e:
        logger.error(f"[Bridge] 市场调研失败: {e}")
        import traceback
        logger.error(f"[Bridge] 错误堆栈:\n{traceback.format_exc()}")
        return {"ok": False, "error": str(e)}


@bridge_router.post("/market-research/resume")
async def resume_market_research(body: MarketResearchResumeRequest):
    """验证码通过后，恢复市场调研抓取。"""
    try:
        from market_research import build_market_analysis, serialize_market_item
        from utils.item_search import resume_market_research_session

        sort_value = body.sort if body.sort in {"price_asc", "price_desc", "want_desc", "latest", "quality_desc"} else "price_asc"

        result = await resume_market_research_session(
            session_id=body.session_id,
            cookie_id=body.cookie_id,
            keyword=body.keyword,
            max_pages=body.max_pages,
        )

        if result.get("captcha_required"):
            return {
                "ok": True,
                "keyword": body.keyword,
                "cookie_id": body.cookie_id,
                "items": [],
                "summary": {},
                "raw_count": 0,
                "deduped_count": 0,
                "filtered_count": 0,
                "captcha_required": True,
                "error": result.get("error") or "请先在本机浏览器完成验证码",
                "captcha_info": result.get("captcha_info", {}),
            }

        if result.get("error"):
            return {"ok": False, "error": result["error"]}

        analysis = build_market_analysis(
            result.get("items", []),
            include_terms=body.include_terms,
            exclude_terms=body.exclude_terms,
            min_price=body.min_price,
            max_price=body.max_price,
            sort_by=sort_value,
        )

        items = [serialize_market_item(item) for item in analysis["items"]]
        return {
            "ok": True,
            "keyword": body.keyword,
            "cookie_id": body.cookie_id,
            "items": items,
            "summary": analysis["summary"],
            "raw_count": analysis["raw_count"],
            "deduped_count": analysis["deduped_count"],
            "filtered_count": analysis["filtered_count"],
            "source": result.get("source"),
            "is_real_data": result.get("is_real_data", False),
            "sort": sort_value,
        }
    except Exception as e:
        logger.error(f"[Bridge] 恢复市场调研失败: {e}")
        import traceback
        logger.error(f"[Bridge] 错误堆栈:\n{traceback.format_exc()}")
        return {"ok": False, "error": str(e)}


@bridge_router.post("/market-research/contact-sellers")
async def contact_quality_sellers(body: MarketSellerContactRequest):
    """对市场调研筛出的优质卖家发起自动沟通。"""
    try:
        selected_items, planned_results = _build_market_contact_candidates(body)
        if not selected_items:
            return {
                "ok": False,
                "error": "没有可联系的优质卖家，请先检查卖家ID、商品ID和评分阈值",
                "results": [],
            }

        if not body.dry_run:
            _get_instance(body.cookie_id)

        if body.dry_run:
            return {
                "ok": True,
                "dry_run": True,
                "count": len(planned_results),
                "total_count": len(planned_results),
                "processed_count": len(planned_results),
                "status": "completed",
                "results": planned_results,
            }

        if body.async_mode:
            job = market_contact_job_store.create(body.cookie_id, planned_results, dry_run=False)
            delay_seconds = max(0.5, min(float(body.delay_seconds or 2.0), 10.0))
            asyncio.create_task(
                _run_market_contact_job(
                    job_id=job["job_id"],
                    cookie_id=body.cookie_id,
                    selected_items=selected_items,
                    planned_results=planned_results,
                    delay_seconds=delay_seconds,
                )
            )
            return job

        instance = _get_instance(body.cookie_id)
        results = []
        delay_seconds = max(0.5, min(float(body.delay_seconds or 2.0), 10.0))
        for index, item in enumerate(selected_items):
            message_text = planned_results[index]["message"]
            try:
                chat_id, resolved_user_id = await _send_market_contact_message(instance, item, message_text)
                _persist_market_contact_context(
                    body.cookie_id,
                    item,
                    message_text,
                    chat_id=chat_id,
                    resolved_user_id=resolved_user_id,
                )
                results.append({
                    **planned_results[index],
                    "ok": True,
                    "status": "sent",
                    "chat_id": str(chat_id or "").strip(),
                    "contact_user_id": str(resolved_user_id or "").strip(),
                })
                if index < len(selected_items) - 1:
                    await asyncio.sleep(delay_seconds)
            except Exception as exc:
                logger.error(f"[Bridge] 自动沟通卖家失败: seller={item.seller_user_id}, item={item.item_id}, error={exc}")
                results.append({
                    **planned_results[index],
                    "ok": False,
                    "status": "failed",
                    "error": str(exc),
                })

        success_count = sum(1 for item in results if item.get("ok"))
        return {
            "ok": success_count > 0,
            "dry_run": False,
            "count": len(results),
            "total_count": len(results),
            "processed_count": len(results),
            "success_count": success_count,
            "failed_count": len(results) - success_count,
            "status": "completed",
            "results": results,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Bridge] 自动沟通优质卖家失败: {e}")
        import traceback
        logger.error(f"[Bridge] 错误堆栈:\n{traceback.format_exc()}")
        return {"ok": False, "error": str(e), "results": []}


@bridge_router.get("/market-research/contact-sellers/{job_id}")
async def get_market_contact_job(job_id: str):
    job = market_contact_job_store.get(str(job_id or "").strip())
    if not job:
        raise HTTPException(status_code=404, detail=f"未找到自动沟通任务: {job_id}")
    return job


@bridge_router.get("/spider/products")
async def get_spider_products(page: int = 1, limit: int = 20):
    """获取爬虫商品列表
    
    Args:
        page: 页码（从1开始）
        limit: 每页数量
    
    Returns:
        {
            "ok": True/False,
            "products": [商品列表],
            "total": 总数,
            "page": 当前页,
            "limit": 每页数量,
            "error": "错误信息"（如果失败）
        }
    """
    try:
        from db_manager import db_manager
        
        offset = (page - 1) * limit
        products = db_manager.get_spider_products(limit=limit, offset=offset)
        total = db_manager.count_spider_products()
        
        logger.info(f"[Bridge] 获取爬虫商品列表: page={page}, limit={limit}, total={total}")
        
        return {
            "ok": True,
            "products": products,
            "total": total,
            "page": page,
            "limit": limit
        }
        
    except Exception as e:
        logger.error(f"[Bridge] 获取爬虫商品列表失败: {e}")
        return {"ok": False, "error": str(e)}
