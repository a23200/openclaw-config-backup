#!/usr/bin/env python3
"""
闲鱼商品搜索模块
基于 Playwright 实现真实的闲鱼商品搜索功能
"""

import asyncio
import json
import time
import sys
import os
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from datetime import datetime
from typing import Dict, List, Any, Optional
from loguru import logger

# 修复Docker环境中的asyncio事件循环策略问题
if sys.platform.startswith('linux') or os.getenv('DOCKER_ENV'):
    try:
        # 在Linux/Docker环境中设置事件循环策略
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
    except Exception as e:
        logger.warning(f"设置事件循环策略失败: {e}")

# 确保在Docker环境中使用正确的事件循环
if os.getenv('DOCKER_ENV'):
    try:
        # 强制使用SelectorEventLoop（在Docker中更稳定）
        if hasattr(asyncio, 'SelectorEventLoop'):
            loop = asyncio.SelectorEventLoop()
            asyncio.set_event_loop(loop)
    except Exception as e:
        logger.warning(f"设置SelectorEventLoop失败: {e}")

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning("Playwright 未安装，将使用模拟数据")


class XianyuSearcher:
    """闲鱼商品搜索器 - 基于 Playwright"""

    def __init__(self):
        self.browser = None
        self.context = None
        self.page = None
        self.playwright = None
        self.api_responses = []
        self.user_id = "default"  # 默认用户ID
        self.preferred_cookie_id = None
        self.last_captcha_info = None
        self.captcha_mode = "remote_control"
        self.allow_local_browser_handoff = False
        self.launched_browser_label = "Chromium"
        self.current_search_request: Dict[str, Any] = {}
        self.external_browser = False
        self.close_external_page_on_close = True
        self.use_local_browser_for_search = False
        self.local_browser_cdp_url = (
            os.getenv("LOCAL_BROWSER_CDP_URL")
            or os.getenv("EXISTING_BROWSER_CDP_URL")
            or "http://127.0.0.1:9222"
        )

    async def _handle_scratch_captcha_manual(self, page, max_retries=3, wait_for_completion=True):
        """人工处理刮刮乐滑块（远程控制 + 截图备份）
        
        参数:
            wait_for_completion: 是否等待用户完成验证
                - True: 等待用户完成验证（默认，用于直接处理）
                - False: 创建会话后立即返回（用于前端处理）
        """
        import random
        
        logger.warning("=" * 60)
        logger.warning("🎨 检测到刮刮乐验证，需要人工处理！")
        logger.warning("=" * 60)
        
        # 获取会话ID
        session_id = str(getattr(self, 'user_id', None) or getattr(self, 'preferred_cookie_id', None) or 'default')
        
        # 【新方案】启用远程控制 / 本机浏览器接管
        captcha_mode = getattr(self, 'captcha_mode', 'remote_control')
        allow_local_browser_handoff = bool(getattr(self, 'allow_local_browser_handoff', False))
        use_remote_control = getattr(self, 'use_remote_control', True)
        if captcha_mode == 'local_browser':
            if allow_local_browser_handoff:
                use_remote_control = False
            else:
                logger.warning("已拦截本机浏览器接管：当前请求没有人工触发许可，改用网页远程验证模式")
                captcha_mode = 'remote_control'
                use_remote_control = True

        try:
            import os
            local_ip = os.getenv('SERVER_HOST') or os.getenv('PUBLIC_IP') or "127.0.0.1"
            server_port = os.getenv('API_PORT') or os.getenv('SERVER_PORT', '18444')
        except Exception:
            local_ip = "127.0.0.1"
            server_port = "18444"

        if captcha_mode == 'local_browser':
            try:
                from utils.captcha_remote_control import captcha_controller
                local_page = page
                local_context = getattr(self, 'context', None)
                local_browser = getattr(self, 'browser', None)
                local_playwright = getattr(self, 'playwright', None)
                browser_label = getattr(self, 'launched_browser_label', 'Google Chrome')

                if not self.external_browser:
                    if not async_playwright:
                        raise RuntimeError("Playwright 不可用，无法接管本机浏览器")

                    logger.warning("🖥️ 当前搜索使用内置浏览器，仅在验证码阶段接管到你本机浏览器")
                    resolved_cdp_url = await self._resolve_local_browser_cdp_url()
                    local_playwright = await async_playwright().start()
                    local_browser = await local_playwright.chromium.connect_over_cdp(resolved_cdp_url)
                    if not local_browser.contexts:
                        raise RuntimeError("未获取到本机浏览器默认上下文")

                    local_context = local_browser.contexts[0]
                    local_context.set_default_timeout(30000)
                    cookie_urls = [
                        "https://www.goofish.com",
                        "https://www.goofish.com/im",
                        "https://h5api.m.goofish.com",
                        "https://www.taobao.com",
                        "https://login.taobao.com",
                    ]
                    transferable_cookies = self._filter_transferable_cookies(
                        await self.context.cookies(cookie_urls)
                    ) if self.context else []
                    if transferable_cookies:
                        await local_context.add_cookies(transferable_cookies)

                    local_page = await local_context.new_page()
                    target_url = str(getattr(page, 'url', '') or '').strip() or "https://www.goofish.com"
                    await local_page.goto(target_url, wait_until='domcontentloaded', timeout=25000)
                    browser_label = "Google Chrome"

                logger.warning(f"🖥️ 启动本机浏览器接管会话: {session_id}")
                await captcha_controller.create_session(session_id, local_page)

                local_browser_status_url = f"http://{local_ip}:{server_port}/api/captcha/status/{session_id}"
                local_resume_url = f"http://{local_ip}:{server_port}/api/bridge/market-research/resume"

                browser_session = captcha_controller.active_sessions.get(session_id)
                if browser_session is not None:
                    browser_session['owns_browser'] = True
                    browser_session['playwright'] = local_playwright
                    browser_session['browser'] = local_browser
                    browser_session['context'] = local_context
                    browser_session['page'] = local_page
                    browser_session['external_browser'] = True
                    browser_session['close_owned_page'] = True
                    browser_session['handoff_mode'] = 'local_browser'
                    browser_session['resume_request'] = {
                        **(self.current_search_request or {}),
                        'cookie_id': str(getattr(self, 'preferred_cookie_id', None) or session_id),
                    }

                try:
                    await local_page.bring_to_front()
                except Exception:
                    pass

                self.last_captcha_info = {
                    'mode': 'local_browser',
                    'session_id': session_id,
                    'status_url': local_browser_status_url,
                    'resume_url': local_resume_url,
                    'browser_name': browser_label,
                    'browser_hint': f"已在你当前运行的 {browser_label} 新开标签页，请直接手动完成验证",
                }

                if browser_session is not None:
                    browser_session['handoff_info'] = self.last_captcha_info

                logger.warning("=" * 60)
                logger.warning("🖥️ 已切换到本机浏览器人工接管模式")
                logger.warning(f"👉 请直接在 {browser_label} 窗口完成验证码")
                logger.warning(f"📡 状态检查: {local_browser_status_url}")
                logger.warning("=" * 60)

                if not wait_for_completion:
                    if not self.external_browser:
                        await self._dispose_embedded_browser_after_handoff()
                    else:
                        self.page = None
                        self.context = None
                        self.browser = None
                        self.playwright = None
                    logger.warning("⚠️ 已转交本机浏览器处理，立即返回给前端继续等待")
                    return 'need_captcha'

                logger.warning("⏳ 等待用户在本机浏览器完成验证...")
                max_wait_time = 180
                check_interval = 1
                elapsed_time = 0
                while elapsed_time < max_wait_time:
                    await asyncio.sleep(check_interval)
                    elapsed_time += check_interval
                    if captcha_controller.is_completed(session_id):
                        logger.success("✅ 本机浏览器验证成功！")
                        return True
                logger.error(f"❌ 本机浏览器验证超时（{max_wait_time}秒）")
                return False

            except Exception as e:
                logger.error(f"本机浏览器接管失败: {e}")
                logger.warning("⚠️ 回退到远程控制模式")
                use_remote_control = True

        if use_remote_control:
            try:
                from utils.captcha_remote_control import captcha_controller
                
                # 创建远程控制会话
                logger.warning(f"🌐 启动远程控制会话: {session_id}")
                session_info = await captcha_controller.create_session(session_id, page)
                
                # 获取控制页面URL
                control_url = f"http://{local_ip}:{server_port}/api/captcha/control/{session_id}"
                
                logger.warning("=" * 60)
                logger.warning(f"🌐 远程控制已启动！")
                logger.warning(f"📱 请访问以下网址进行验证：")
                logger.warning(f"   {control_url}")
                logger.warning("=" * 60)
                logger.warning(f"💡 或直接访问: http://{local_ip}:{server_port}/api/captcha/control")
                logger.warning(f"   然后输入会话ID: {session_id}")
                logger.warning("=" * 60)

                self.last_captcha_info = {
                    'mode': 'remote_control',
                    'session_id': session_id,
                    'control_url': control_url,
                    'base_control_url': f"http://{local_ip}:{server_port}/api/captcha/control",
                }

                # 如果不等待完成，立即返回特殊值给调用者
                if not wait_for_completion:
                    remote_session = captcha_controller.active_sessions.get(session_id)
                    if remote_session is not None:
                        remote_session['owns_browser'] = True
                        remote_session['playwright'] = getattr(self, 'playwright', None)
                        remote_session['browser'] = getattr(self, 'browser', None)
                        remote_session['context'] = getattr(self, 'context', None)
                        remote_session['page'] = page

                    self.page = None
                    self.context = None
                    self.browser = None
                    self.playwright = None

                    logger.warning("⚠️ 不等待验证完成，立即返回给前端处理")
                    return 'need_captcha'  # 返回特殊值，表示需要前端处理
                
                # 等待用户完成
                logger.warning("⏳ 等待用户通过网页完成验证...")
                
                # 循环检查是否完成
                max_wait_time = 180  # 3分钟
                check_interval = 1  # 每秒检查一次
                elapsed_time = 0
                
                while elapsed_time < max_wait_time:
                    await asyncio.sleep(check_interval)
                    elapsed_time += check_interval
                    
                    # 检查是否完成
                    if captcha_controller.is_completed(session_id):
                        logger.success("✅ 远程验证成功！")
                        await captcha_controller.close_session(session_id)
                        return True
                    
                    # 每10秒提示一次
                    if elapsed_time % 10 == 0:
                        logger.info(f"⏳ 仍在等待...已等待 {elapsed_time} 秒")
                
                logger.error(f"❌ 远程验证超时（{max_wait_time}秒）")
                await captcha_controller.close_session(session_id)
                return False
                
            except Exception as e:
                logger.error(f"远程控制启动失败: {e}")
                logger.warning("⚠️ 降级使用传统方式")
        
        logger.error("❌ 人工验证超时，已达到最大等待时间")
        return False
    
    async def _handle_scratch_captcha_async(self, page, max_retries=15):
        """异步处理刮刮乐类型滑块"""
        import random
        
        # 保存原始page对象（用于鼠标操作）
        original_page = page
        
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(f"🎨 刮刮乐滑块处理尝试 {attempt}/{max_retries}")
                
                # 重置page为原始对象
                page = original_page
                
                # 短暂等待（滑块已经存在，无需长时间等待）
                if attempt == 1:
                    await asyncio.sleep(0.3)
                else:
                    await asyncio.sleep(0.5)
                
                # 1. 快速检查刮刮乐容器（不阻塞，极短超时）
                try:
                    await page.wait_for_selector('#nocaptcha', timeout=500, state='attached')
                    logger.debug("✅ 刮刮乐容器 #nocaptcha 已加载")
                    await asyncio.sleep(0.2)  # 等待容器内部元素加载
                except:
                    # 容器未找到也继续，可能滑块还没出现
                    logger.debug("刮刮乐容器未立即加载，继续查找按钮...")
                
                # 2. 查找滑块按钮（先尝试主页面，再尝试iframe）
                button_selectors = [
                    '#scratch-captcha-btn',
                    '.button#scratch-captcha-btn',
                    'div#scratch-captcha-btn',
                    '.scratch-captcha-slider .button',
                    '#nocaptcha .button',
                    '#nocaptcha .scratch-captcha-slider .button',
                    '.button'
                ]
                
                slider_button = None
                found_in_iframe = False
                search_context = page  # 用于查找元素的上下文
                
                # 先在主页面查找（极速查找）
                for selector in button_selectors:
                    try:
                        # 先尝试等待可见（极短超时）
                        slider_button = await page.wait_for_selector(selector, timeout=800, state='visible')
                        if slider_button:
                            logger.info(f"✅ 在主页面找到刮刮乐滑块按钮（可见）: {selector}")
                            search_context = page
                            break
                    except:
                        # 如果等待可见失败，尝试只等待存在（attached）
                        try:
                            slider_button = await page.wait_for_selector(selector, timeout=300, state='attached')
                            if slider_button:
                                logger.warning(f"⚠️ 在主页面找到刮刮乐滑块按钮（不可见但存在）: {selector}")
                                search_context = page
                                break
                        except:
                            continue
                
                # 如果主页面没找到，尝试在iframe中查找（极速查找）
                if not slider_button:
                    try:
                        frames = page.frames
                        logger.debug(f"检查 {len(frames)} 个frame...")
                        for frame in frames:
                            if frame == page.main_frame:
                                continue
                            for selector in button_selectors:
                                try:
                                    slider_button = await frame.wait_for_selector(selector, timeout=500, state='visible')
                                    if slider_button:
                                        logger.info(f"✅ 在iframe中找到刮刮乐滑块按钮: {selector}")
                                        found_in_iframe = True
                                        search_context = frame  # iframe上下文用于查找
                                        break
                                except:
                                    continue
                            if slider_button:
                                break
                    except Exception as e:
                        logger.debug(f"检查iframe时出错: {e}")
                
                # 最后尝试：使用JavaScript直接查找（在search_context中）
                if not slider_button:
                    try:
                        logger.debug("尝试使用JavaScript直接查找滑块按钮...")
                        js_found = await search_context.evaluate("""
                            () => {
                                const btn = document.getElementById('scratch-captcha-btn') || 
                                           document.querySelector('#scratch-captcha-btn') ||
                                           document.querySelector('.button#scratch-captcha-btn');
                                if (btn) {
                                    return {
                                        found: true,
                                        visible: btn.offsetParent !== null,
                                        display: window.getComputedStyle(btn).display,
                                        visibility: window.getComputedStyle(btn).visibility
                                    };
                                }
                                return { found: false };
                            }
                        """)
                        
                        if js_found and js_found.get('found'):
                            logger.warning(f"⚠️ JavaScript找到按钮但Playwright无法访问: visible={js_found.get('visible')}, display={js_found.get('display')}, visibility={js_found.get('visibility')}")
                            # 尝试通过query_selector获取元素（强制操作）
                            slider_button = await search_context.query_selector('#scratch-captcha-btn')
                            if slider_button:
                                logger.info("✅ query_selector找到按钮")
                    except Exception as e:
                        logger.debug(f"JavaScript查找失败: {e}")
                
                if not slider_button:
                    logger.error("❌ 未找到刮刮乐滑块按钮（所有方法都已尝试）")
                    await asyncio.sleep(random.uniform(0.5, 1))
                    continue
                
                # 2. 获取滑块位置和大小
                button_box = await slider_button.bounding_box()
                if not button_box:
                    # 尝试使用JavaScript强制获取位置
                    try:
                        logger.warning("⚠️ 尝试使用JavaScript获取按钮位置...")
                        js_box = await search_context.evaluate("""
                            () => {
                                const btn = document.getElementById('scratch-captcha-btn');
                                if (btn) {
                                    const rect = btn.getBoundingClientRect();
                                    return {
                                        x: rect.x,
                                        y: rect.y,
                                        width: rect.width,
                                        height: rect.height
                                    };
                                }
                                return null;
                            }
                        """)
                        if js_box:
                            logger.info(f"✅ JavaScript获取到按钮位置: {js_box}")
                            button_box = js_box
                        else:
                            logger.error("❌ JavaScript也无法获取滑块按钮位置")
                            await asyncio.sleep(random.uniform(0.5, 1))
                            continue
                    except Exception as e:
                        logger.error(f"❌ 无法获取滑块按钮位置: {e}")
                        await asyncio.sleep(random.uniform(0.5, 1))
                        continue
                
                # 3. 计算滑动距离（25-35%）
                # 假设轨道宽度约为300px（可以根据实际调整）
                estimated_track_width = 300
                scratch_ratio = random.uniform(0.25, 0.35)
                slide_distance = estimated_track_width * scratch_ratio
                
                logger.warning(f"🎨 刮刮乐模式：计划滑动{scratch_ratio*100:.1f}%距离 ({slide_distance:.2f}px)")
                
                # 4. 执行滑动
                start_x = button_box['x'] + button_box['width'] / 2
                start_y = button_box['y'] + button_box['height'] / 2
                
                # 移动到滑块（优化等待时间）
                await page.mouse.move(start_x, start_y)
                await asyncio.sleep(random.uniform(0.1, 0.2))
                
                # 按下鼠标
                await page.mouse.down()
                await asyncio.sleep(random.uniform(0.05, 0.1))
                
                # 模拟人类化滑动轨迹（加快速度）
                steps = random.randint(10, 15)
                for i in range(steps):
                    progress = (i + 1) / steps
                    current_distance = slide_distance * progress
                    
                    # 添加Y轴抖动
                    y_jitter = random.uniform(-2, 2)
                    
                    await page.mouse.move(
                        start_x + current_distance,
                        start_y + y_jitter
                    )
                    await asyncio.sleep(random.uniform(0.005, 0.015))
                
                # 5. 在目标位置停顿观察（缩短时间）
                pause_duration = random.uniform(0.2, 0.3)
                logger.warning(f"🎨 在目标位置停顿{pause_duration:.2f}秒观察...")
                await asyncio.sleep(pause_duration)
                
                # 6. 释放鼠标
                await page.mouse.up()
                await asyncio.sleep(random.uniform(0.3, 0.5))
                
                # 7. 检查是否成功（检查滑块frame是否消失）
                try:
                    # 等待验证结果
                    await asyncio.sleep(0.8)
                    
                    # 检查主页面的滑块容器
                    captcha_in_main = await page.query_selector('#nocaptcha')
                    main_visible = False
                    if captcha_in_main:
                        try:
                            main_visible = await captcha_in_main.is_visible()
                        except:
                            main_visible = False
                    
                    # 检查iframe中的滑块
                    iframe_visible = False
                    try:
                        frames = page.frames
                        for frame in frames:
                            if frame != page.main_frame:
                                captcha_in_iframe = await frame.query_selector('#nocaptcha')
                                if captcha_in_iframe:
                                    try:
                                        if await captcha_in_iframe.is_visible():
                                            iframe_visible = True
                                            break
                                    except:
                                        pass
                    except:
                        pass
                    
                    # 判断成功：主页面和iframe都没有可见的滑块
                    if not main_visible and not iframe_visible:
                        logger.success(f"✅ 刮刮乐验证成功！滑块已消失（第{attempt}次尝试）")
                        return True
                    else:
                        if main_visible:
                            logger.warning(f"⚠️ 主页面滑块仍可见，继续重试...")
                        if iframe_visible:
                            logger.warning(f"⚠️ iframe滑块仍可见，继续重试...")
                except Exception as e:
                    logger.warning(f"⚠️ 检查验证结果时出错: {e}，继续重试...")
                
            except Exception as e:
                logger.error(f"❌ 刮刮乐处理异常: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                await asyncio.sleep(random.uniform(0.5, 1))
                continue
        
        logger.error(f"❌ 刮刮乐验证失败，已达到最大重试次数 {max_retries}")
        return False
    
    async def handle_slider_verification(self, page, context=None, browser=None, playwright=None, max_retries=5):
        """
        通用的滑块验证处理方法
        
        参数:
            page: Playwright 页面对象（必需）
            context: Playwright 上下文对象（可选，如果不传则使用 self.context）
            browser: Playwright 浏览器对象（可选，如果不传则使用 self.browser）
            playwright: Playwright 实例（可选，如果不传则使用 self.playwright）
            max_retries: 最大重试次数，默认5次
            
        返回:
            bool: True表示成功（包括没有滑块或滑块验证成功），False表示失败
        """
        try:
            # 等待页面加载滑块元素（优化等待时间）
            await asyncio.sleep(1)
            logger.info("🔍 开始检测滑块验证...")
            
            # 使用传入的对象或实例属性
            context = context or self.context
            browser = browser or self.browser
            playwright = playwright or getattr(self, 'playwright', None)
            
            # 【调试】打印页面HTML内容，查找滑块相关关键词
            try:
                page_content = await page.content()
                has_captcha_keyword = any(keyword in page_content.lower() for keyword in [
                    'nocaptcha', 'scratch-captcha', 'captcha', 'slider', '滑块', '验证'
                ])
                if has_captcha_keyword:
                    logger.warning("⚠️ 页面HTML中包含滑块相关关键词")
                    # 保存页面内容用于调试
                    if 'nocaptcha' in page_content or 'scratch-captcha' in page_content:
                        logger.warning("🎯 检测到刮刮乐类型滑块特征词！")
                else:
                    logger.info("✅ 页面HTML中未发现滑块关键词")
            except Exception as e:
                logger.debug(f"检查页面内容时出错: {e}")
            
            # 检测滑块元素（支持多种类型的滑块）
            slider_selectors = [
                # 阿里云盾 nc 系列滑块
                '#nc_1_n1z',
                '.nc-container',
                '.nc_scale',
                '.nc-wrapper',
                '[class*="nc_"]',
                '[id*="nc_"]',
                # 刮刮乐 (scratch-captcha) 类型滑块
                '#nocaptcha',
                '.scratch-captcha-container',
                '.scratch-captcha-slider',
                '#scratch-captcha-btn',
                '[class*="scratch-captcha"]',
                'div[id="nocaptcha"]',
                'div.scratch-captcha-container',
                # 其他常见滑块类型
                '.captcha-slider',
                '.slider-captcha',
                '[class*="captcha"]',
                '[id*="captcha"]'
            ]
            
            has_slider = False
            detected_selector = None
            found_elements = []
            
            for selector in slider_selectors:
                try:
                    element = await page.query_selector(selector)
                    if element:
                        found_elements.append(selector)
                        is_visible = await element.is_visible()
                        logger.debug(f"找到元素 {selector}，可见性: {is_visible}")
                        if is_visible:
                            logger.info(f"✅ 检测到滑块验证元素: {selector}")
                            has_slider = True
                            detected_selector = selector
                            break
                except Exception as e:
                    logger.debug(f"选择器 {selector} 检测出错: {e}")
                    continue
            
            # 输出调试信息
            if found_elements:
                logger.warning(f"🔍 找到以下滑块元素（但可能不可见）: {', '.join(found_elements)}")
                # 如果找到了元素但不可见，强制认为有滑块
                if not has_slider and any('captcha' in sel.lower() or 'slider' in sel.lower() for sel in found_elements):
                    logger.warning("⚠️ 检测到滑块元素但不可见，仍然尝试处理")
                    has_slider = True
                    detected_selector = found_elements[0]
            else:
                logger.debug("未找到任何滑块选择器匹配的元素")
            
            # 【额外检测】检查 iframe 中的滑块
            if not has_slider:
                try:
                    frames = page.frames
                    logger.debug(f"检测到 {len(frames)} 个 frame")
                    for frame in frames:
                        if frame != page.main_frame:
                            try:
                                iframe_content = await frame.content()
                                # 更精确的刮刮乐检测：必须包含明确特征
                                has_scratch_features = 'scratch-captcha' in iframe_content or \
                                                      ('nocaptcha' in iframe_content and 'scratch' in iframe_content)
                                if has_scratch_features:
                                    logger.warning("🎯 在 iframe 中检测到刮刮乐滑块！")
                                    has_slider = True
                                    detected_selector = "iframe-scratch-captcha"
                                    break
                            except:
                                continue
                except Exception as e:
                    logger.debug(f"检查 iframe 时出错: {e}")
            
            # 如果没有检测到滑块，直接返回成功
            if not has_slider:
                logger.info("✅ 未检测到滑块验证，继续执行")
                return True
            
            # 检测到滑块，开始处理
            logger.warning(f"⚠️ 检测到滑块验证（{detected_selector}），开始处理...")
            
            # 检测是否为刮刮乐类型（更精确的判断）
            is_scratch_captcha = False
            
            # 明确的刮刮乐特征
            if 'scratch' in detected_selector.lower():
                is_scratch_captcha = True
            # 如果选择器是 #nocaptcha 但不是 nc 系列的标准滑块，则进一步检查
            elif detected_selector in ['#nocaptcha', 'iframe-scratch-captcha']:
                try:
                    page_html = await page.content()
                    # 检查是否有刮刮乐的明确特征
                    has_scratch_features = 'scratch-captcha' in page_html or \
                                          ('Release the slider' in page_html) or \
                                          ('fully appears' in page_html)
                    is_scratch_captcha = has_scratch_features
                except:
                    is_scratch_captcha = False
            
            if is_scratch_captcha:
                logger.warning("🎨 检测到刮刮乐类型滑块")
                 
                # 人工处理模式 - 立即返回给上层，由调用方决定如何提示用户
                logger.warning("⚠️ 刮刮乐需要人工处理，立即返回验证码状态")
                slider_success = await self._handle_scratch_captcha_manual(page, max_retries=3, wait_for_completion=False)
                if slider_success == 'need_captcha':
                    return 'need_captcha'
            else:
                actual_max_retries = max_retries
                slider_success = None
            
            try:
                # 刮刮乐已经处理过了，直接检查结果
                if is_scratch_captcha:
                    pass  # slider_success 已经在上面设置
                else:
                    # 普通滑块：使用 XianyuSliderStealth（同步API）
                    from utils.xianyu_slider_stealth import XianyuSliderStealth
                    
                    # 创建滑块处理实例
                    slider_handler = XianyuSliderStealth(
                        user_id=getattr(self, 'user_id', 'default'),
                        enable_learning=True,
                        headless=True
                    )
                    
                    # 将现有的浏览器对象传递给滑块处理器（复用现有浏览器）
                    slider_handler.page = page
                    slider_handler.context = context
                    slider_handler.browser = browser
                    slider_handler.playwright = playwright
                    
                    # 调用滑块处理方法
                    logger.info(f"🎯 开始处理滑块验证（最多尝试 {actual_max_retries} 次）...")
                    slider_success = slider_handler.solve_slider(max_retries=actual_max_retries)
                    
                    # 清除引用，防止 XianyuSliderStealth 尝试关闭我们的浏览器
                    slider_handler.page = None
                    slider_handler.context = None
                    slider_handler.browser = None
                    slider_handler.playwright = None
                
                if slider_success:
                    logger.success("✅ 滑块验证成功！")
                    return True
                else:
                    logger.error("❌ 滑块验证失败")
                    return False
                    
            except Exception as e:
                logger.error(f"❌ 滑块验证处理异常: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                
                # 确保清除引用
                try:
                    if 'slider_handler' in locals():
                        slider_handler.page = None
                        slider_handler.context = None
                        slider_handler.browser = None
                        slider_handler.playwright = None
                except:
                    pass
                
                return False
                
        except Exception as e:
            logger.error(f"❌ 滑块检测过程异常: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            return False

    async def safe_get(self, data, *keys, default="暂无"):
        """安全获取嵌套字典值"""
        for key in keys:
            try:
                data = data[key]
            except (KeyError, TypeError, IndexError):
                return default
        return data

    async def get_first_valid_cookie(self):
        """获取第一个有效的cookie"""
        try:
            from db_manager import db_manager

            # 获取所有cookies，返回格式是 {id: value}
            cookies = db_manager.get_all_cookies()

            # 优先使用指定账号
            if self.preferred_cookie_id is not None:
                preferred_id = str(self.preferred_cookie_id)
                preferred_cookie = cookies.get(preferred_id)
                if preferred_cookie and len(preferred_cookie) > 50:
                    logger.info(f"使用指定cookie: {preferred_id}")
                    return {
                        'id': preferred_id,
                        'value': preferred_cookie
                    }

            # 找到第一个有效的cookie（长度大于50的认为是有效的）
            for cookie_id, cookie_value in cookies.items():
                if len(cookie_value) > 50:
                    logger.info(f"找到有效cookie: {cookie_id}")
                    return {
                        'id': cookie_id,
                        'value': cookie_value
                    }

            return None

        except Exception as e:
            logger.error(f"获取cookie失败: {str(e)}")
            return None

    async def set_browser_cookies(self, cookie_value: str):
        """设置浏览器cookies"""
        try:
            if not cookie_value:
                return False

            # 解析cookie字符串
            cookies = []
            for cookie_pair in cookie_value.split(';'):
                cookie_pair = cookie_pair.strip()
                if '=' in cookie_pair:
                    name, value = cookie_pair.split('=', 1)
                    cookies.append({
                        'name': name.strip(),
                        'value': value.strip(),
                        'domain': '.goofish.com',
                        'path': '/'
                    })

            # 设置cookies到浏览器
            await self.context.add_cookies(cookies)
            logger.info(f"成功设置 {len(cookies)} 个cookies到浏览器")
            return True

        except Exception as e:
            logger.error(f"设置浏览器cookies失败: {str(e)}")
            return False

    @staticmethod
    def _filter_transferable_cookies(cookie_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """过滤并标准化可写入浏览器上下文的 Cookie。"""
        normalized_items: List[Dict[str, Any]] = []
        allowed_domains = ("goofish.com", "taobao.com", "tmall.com")

        for cookie in cookie_items or []:
            domain = str(cookie.get('domain') or '').lower()
            if domain and not any(token in domain for token in allowed_domains):
                continue

            payload: Dict[str, Any] = {
                'name': str(cookie.get('name') or '').strip(),
                'value': str(cookie.get('value') or ''),
                'domain': domain or '.goofish.com',
                'path': str(cookie.get('path') or '/'),
            }
            if not payload['name']:
                continue

            for key in ('expires', 'httpOnly', 'secure', 'sameSite'):
                value = cookie.get(key)
                if value not in (None, ''):
                    payload[key] = value

            normalized_items.append(payload)

        return normalized_items

    async def _dispose_embedded_browser_after_handoff(self):
        """验证码接管后释放内置浏览器，避免无意义的残留进程。"""
        page = self.page
        context = self.context
        browser = self.browser
        playwright = self.playwright

        self.page = None
        self.context = None
        self.browser = None
        self.playwright = None
        self.external_browser = False

        try:
            if page and not page.is_closed():
                await page.close()
        except Exception as page_error:
            logger.debug(f"释放内置浏览器页面失败: {page_error}")

        try:
            if context:
                await context.close()
        except Exception as context_error:
            logger.debug(f"释放内置浏览器上下文失败: {context_error}")

        try:
            if browser:
                await browser.close()
        except Exception as browser_error:
            logger.debug(f"释放内置浏览器实例失败: {browser_error}")

        try:
            if playwright:
                await playwright.stop()
        except Exception as playwright_error:
            logger.debug(f"停止内置 Playwright 失败: {playwright_error}")

    async def init_browser(self):
        """初始化浏览器。"""
        if not PLAYWRIGHT_AVAILABLE:
            raise Exception("Playwright 未安装，无法使用真实搜索功能")

        if not self.browser:
            logger.info("启动 Playwright...")
            self.playwright = await async_playwright().start()
            
            # 简化的浏览器启动参数，避免冲突
            browser_args = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--disable-extensions',
                '--disable-default-apps',
                '--no-default-browser-check',
                # 中文语言设置
                '--lang=zh-CN',
                '--accept-lang=zh-CN,zh,en-US,en'
            ]

            # 只在确实是Docker环境时添加额外参数
            if os.getenv('DOCKER_ENV') == 'true':
                browser_args.extend([
                    '--disable-gpu',
                ])

            use_local_browser = bool(getattr(self, 'use_local_browser_for_search', False))
            if getattr(self, 'captcha_mode', 'remote_control') == 'local_browser' and not use_local_browser:
                logger.info("local_browser 模式已改为按需接管：只有真正触发验证码时才会接管本机浏览器")
            if use_local_browser:
                resolved_cdp_url = await self._resolve_local_browser_cdp_url()
                logger.info(f"尝试接管本机正在运行的浏览器: {resolved_cdp_url}")
                try:
                    self.browser = await self.playwright.chromium.connect_over_cdp(resolved_cdp_url)
                    if not self.browser.contexts:
                        raise RuntimeError("未获取到本机浏览器默认上下文")

                    self.context = self.browser.contexts[0]
                    self.context.set_default_timeout(30000)
                    self.page = await self.context.new_page()
                    self.external_browser = True
                    self.close_external_page_on_close = True
                    self.launched_browser_label = "Google Chrome"
                    logger.info("✅ 已连接到本机正在运行的 Google Chrome，并新开标签页")
                except Exception as connect_error:
                    try:
                        if self.playwright:
                            await self.playwright.stop()
                    except Exception:
                        pass
                    self.playwright = None
                    self.browser = None
                    self.context = None
                    self.page = None
                    self.external_browser = False
                    raise Exception(
                        f"无法接管本机运行中的浏览器（{resolved_cdp_url}）：{connect_error}。"
                        f"请确认本机 Chrome 已开启远程调试端口。"
                    )
            else:
                logger.info("启动 Chromium（普通上下文模式）...")
                self.browser = await self.playwright.chromium.launch(
                    headless=True,
                    args=browser_args,
                )
                self.launched_browser_label = "Chromium"
                self.external_browser = False
                logger.info("创建浏览器上下文...")
                self.context = await self.browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    viewport={'width': 1280, 'height': 720},
                    locale='zh-CN',
                )

                self.context.set_default_timeout(30000)

                logger.info("浏览器启动成功")

                logger.info("创建页面...")
                self.page = await self.context.new_page()

            logger.info("浏览器初始化完成")

    async def _resolve_local_browser_cdp_url(self) -> str:
        """解析本机浏览器可用的 CDP 地址，优先转换成 ws://...。"""
        base_url = str(self.local_browser_cdp_url or "").strip()
        if not base_url:
            return "http://127.0.0.1:9222"

        if base_url.startswith(("ws://", "wss://")):
            return base_url

        parsed_base = urlparse(base_url if "://" in base_url else f"http://{base_url}")
        base_host = parsed_base.hostname or "127.0.0.1"
        base_port = parsed_base.port

        active_port_candidates = []
        explicit_profile_dir = os.getenv("LOCAL_BROWSER_USER_DATA_DIR") or os.getenv("CHROME_USER_DATA_DIR")
        if explicit_profile_dir:
            active_port_candidates.append(Path(explicit_profile_dir) / "DevToolsActivePort")

        home_dir = Path.home()
        active_port_candidates.extend([
            home_dir / "Library/Application Support/Google/Chrome/DevToolsActivePort",
            home_dir / "Library/Application Support/Google/Chrome Beta/DevToolsActivePort",
            home_dir / "Library/Application Support/Chromium/DevToolsActivePort",
        ])

        for active_port_file in active_port_candidates:
            try:
                if not active_port_file.exists():
                    continue

                lines = [
                    line.strip()
                    for line in active_port_file.read_text(encoding="utf-8").splitlines()
                    if line.strip()
                ]
                if len(lines) < 2:
                    continue

                discovered_port = int(lines[0])
                discovered_path = lines[1]
                if not discovered_path.startswith("/"):
                    discovered_path = f"/{discovered_path}"

                if base_port and discovered_port != base_port:
                    logger.debug(
                        f"DevToolsActivePort 端口不匹配，忽略 {active_port_file}: {discovered_port} != {base_port}"
                    )
                    continue

                websocket_url = f"ws://{base_host}:{discovered_port}{discovered_path}"
                logger.info(f"已通过 DevToolsActivePort 解析本机浏览器 CDP 地址: {websocket_url}")
                return websocket_url
            except Exception as active_port_error:
                logger.debug(f"读取 DevToolsActivePort 失败 {active_port_file}: {active_port_error}")

        normalized = base_url.rstrip("/")
        candidate_endpoints = [
            f"{normalized}/json/version",
            f"{normalized}/json",
            f"{normalized}/json/list",
        ]

        async def fetch_json(endpoint: str):
            def _load():
                with urllib.request.urlopen(endpoint, timeout=3) as response:
                    return json.loads(response.read().decode("utf-8"))

            return await asyncio.to_thread(_load)

        for endpoint in candidate_endpoints:
            try:
                payload = await fetch_json(endpoint)
                if isinstance(payload, dict):
                    websocket_url = payload.get("webSocketDebuggerUrl")
                    if websocket_url:
                        logger.info(f"已解析本机浏览器 CDP 地址: {websocket_url}")
                        return websocket_url
                elif isinstance(payload, list):
                    for item in payload:
                        websocket_url = (item or {}).get("webSocketDebuggerUrl")
                        if websocket_url:
                            logger.info(f"已从标签页列表解析本机浏览器 CDP 地址: {websocket_url}")
                            return websocket_url
            except Exception as resolve_error:
                logger.debug(f"解析本机浏览器 CDP 地址失败 {endpoint}: {resolve_error}")

        logger.warning(f"未能提前解析 CDP ws 地址，回退使用原始地址: {base_url}")
        return base_url

    async def close_browser(self):
        """关闭浏览器。"""
        try:
            if self.external_browser:
                if self.page and self.close_external_page_on_close:
                    try:
                        if not self.page.is_closed():
                            await self.page.close()
                    except Exception as page_error:
                        logger.warning(f"关闭本机浏览器标签页时出错: {page_error}")
                self.page = None
                self.context = None
                self.browser = None
                if self.playwright:
                    await self.playwright.stop()
                    self.playwright = None
                self.external_browser = False
                logger.debug("已断开本机运行浏览器连接")
                return

            if self.page:
                await self.page.close()
                self.page = None
            if self.context:
                await self.context.close()
                self.context = None
            if self.browser:
                await self.browser.close()
                self.browser = None
            if self.playwright:
                await self.playwright.stop()
                self.playwright = None
            self.external_browser = False
            logger.debug("商品搜索器浏览器已关闭")
        except Exception as e:
            logger.warning(f"关闭商品搜索器浏览器时出错: {e}")

    def _get_active_session_id(self) -> str:
        """获取当前验证码/浏览器接管会话 ID。"""
        return str(getattr(self, 'user_id', None) or getattr(self, 'preferred_cookie_id', None) or 'default')

    @staticmethod
    def _capture_item_key(item: Dict[str, Any]) -> str:
        """生成商品去重 key。"""
        return str(item.get('item_url') or item.get('item_id') or item.get('title') or '').strip()

    @staticmethod
    def _find_first_by_keys(payload: Any, keys: tuple[str, ...], max_depth: int = 7) -> str:
        """在搜索结果原始结构中尽量提取卖家相关字段。"""
        seen_ids: set[int] = set()

        def walk(value: Any, depth: int = 0) -> str:
            if value is None or depth > max_depth:
                return ""
            if isinstance(value, (str, int, float)):
                return ""
            object_id = id(value)
            if object_id in seen_ids:
                return ""
            seen_ids.add(object_id)

            if isinstance(value, dict):
                for key in keys:
                    candidate = value.get(key)
                    if candidate not in (None, ""):
                        return str(candidate).split("@", 1)[0].strip()
                for nested in value.values():
                    found = walk(nested, depth + 1)
                    if found:
                        return found
            elif isinstance(value, list):
                for nested in value:
                    found = walk(nested, depth + 1)
                    if found:
                        return found
            return ""

        return walk(payload)

    @staticmethod
    def _extract_query_value(url: str, keys: tuple[str, ...]) -> str:
        """从商品链接里尝试提取指定 query 参数。"""
        if not url:
            return ""
        parsed = urlparse(url.replace("fleamarket://", "https://www.goofish.com/"))
        query = parse_qs(parsed.query)
        for key in keys:
            values = query.get(key)
            if values:
                return str(values[0]).split("@", 1)[0].strip()
        return ""

    def _append_unique_item(
        self,
        target_list: List[Dict[str, Any]],
        item: Dict[str, Any],
        seen_keys: Optional[set[str]] = None,
    ) -> bool:
        """向列表中追加唯一商品。"""
        key = self._capture_item_key(item)
        if seen_keys is None:
            seen_keys = {
                existing_key
                for existing_key in (self._capture_item_key(existing) for existing in target_list)
                if existing_key
            }

        if key and key in seen_keys:
            return False

        if key:
            seen_keys.add(key)

        target_list.append(item)
        return True

    def _get_session_captured_items(self) -> List[Dict[str, Any]]:
        """读取验证码会话中已捕获的搜索结果。"""
        try:
            from utils.captcha_remote_control import captcha_controller

            session = captcha_controller.active_sessions.get(self._get_active_session_id())
            if not session:
                return []

            captured_items = list(session.get('captured_items') or [])
            if '_captured_item_keys' not in session:
                session['_captured_item_keys'] = {
                    key for key in (self._capture_item_key(item) for item in captured_items) if key
                }
            session['captured_count'] = len(captured_items)
            return captured_items
        except Exception as e:
            logger.debug(f"读取验证码会话结果失败: {e}")
            return []

    async def _sync_item_to_active_session(self, item: Dict[str, Any]) -> None:
        """将实时抓到的商品同步到人工验证会话。"""
        try:
            from utils.captcha_remote_control import captcha_controller

            session = captcha_controller.active_sessions.get(self._get_active_session_id())
            if not session:
                return

            captured_items = session.setdefault('captured_items', [])
            captured_keys = session.setdefault('_captured_item_keys', set())
            if not isinstance(captured_keys, set):
                captured_keys = set(captured_keys)
                session['_captured_item_keys'] = captured_keys

            item_copy = dict(item)
            if self._append_unique_item(captured_items, item_copy, captured_keys):
                session['captured_count'] = len(captured_items)
                session['last_capture_at'] = time.time()
        except Exception as e:
            logger.debug(f"同步验证码会话结果失败: {e}")

    def _build_search_response_handler(
        self,
        target_items: List[Dict[str, Any]],
        target_seen_keys: Optional[set[str]] = None,
    ):
        """构建统一的搜索 API 响应处理器。"""
        if target_seen_keys is None:
            target_seen_keys = {
                key for key in (self._capture_item_key(item) for item in target_items) if key
            }

        async def on_response(response):
            if "h5api.m.goofish.com/h5/mtop.taobao.idlemtopsearch.pc.search" not in response.url:
                return

            try:
                if response.status != 200:
                    logger.warning(f"API响应状态异常: {response.status}")
                    return

                try:
                    result_json = await response.json()
                except Exception as json_error:
                    logger.warning(f"无法解析响应JSON: {str(json_error)}")
                    return

                self.api_responses.append(result_json)
                logger.info(f"捕获到API响应，URL: {response.url}")

                items = result_json.get("data", {}).get("resultList", [])
                logger.info(f"从API获取到 {len(items)} 条原始数据")

                for item in items:
                    try:
                        parsed_item = await self._parse_real_item(item)
                        if parsed_item and self._append_unique_item(target_items, parsed_item, target_seen_keys):
                            await self._sync_item_to_active_session(parsed_item)
                    except Exception as parse_error:
                        logger.warning(f"解析单个商品失败: {str(parse_error)}")
                        continue

            except Exception as e:
                logger.warning(f"响应处理异常: {str(e)}")

        return on_response

    @staticmethod
    def _normalize_price_filter_value(value: Optional[float]) -> str:
        if value is None:
            return ""
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            return ""
        if numeric_value < 0:
            return ""
        if numeric_value.is_integer():
            return str(int(numeric_value))
        return f"{numeric_value:g}"

    async def _collect_visible_input_candidates(self) -> list[dict[str, Any]]:
        if not self.page:
            return []
        try:
            return await self.page.locator("input").evaluate_all(
                """(elements) => elements.map((element, index) => {
                    const style = window.getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    const text = [
                        element.placeholder || "",
                        element.getAttribute("aria-label") || "",
                        element.name || "",
                        element.id || "",
                        element.className || "",
                    ].join(" ").toLowerCase();
                    const visible = !!(
                        rect.width > 0 &&
                        rect.height > 0 &&
                        style.visibility !== "hidden" &&
                        style.display !== "none"
                    );
                    return {
                        index,
                        visible,
                        text,
                        placeholder: element.placeholder || "",
                        value: element.value || "",
                        type: element.type || "",
                        inputMode: element.inputMode || "",
                        x: rect.x || 0,
                        y: rect.y || 0,
                        width: rect.width || 0,
                        height: rect.height || 0,
                    };
                })"""
            )
        except Exception as exc:
            logger.debug(f"收集价格筛选输入框候选失败: {exc}")
            return []

    async def _find_price_filter_inputs(self, keyword: str = "") -> tuple[Optional[int], Optional[int]]:
        candidates = await self._collect_visible_input_candidates()
        if not candidates:
            return None, None

        keyword_text = str(keyword or "").strip().lower()
        search_markers = ("搜索", "search", "keyword", "query", "关键字")
        min_markers = ("最低", "最小", "min", "low", "start")
        max_markers = ("最高", "最大", "max", "high", "end")

        visible_candidates = [
            candidate for candidate in candidates
            if candidate.get("visible")
            and not any(marker in candidate.get("text", "") for marker in search_markers)
            and candidate.get("width", 0) >= 24
            and candidate.get("height", 0) >= 20
        ]
        if keyword_text:
            visible_candidates = [
                candidate for candidate in visible_candidates
                if str(candidate.get("value", "")).strip().lower() != keyword_text
            ]

        def find_by_markers(markers: tuple[str, ...]) -> Optional[int]:
            for candidate in visible_candidates:
                if any(marker in candidate.get("text", "") for marker in markers):
                    return int(candidate["index"])
            return None

        min_index = find_by_markers(min_markers)
        max_index = find_by_markers(max_markers)
        if min_index is not None or max_index is not None:
            return min_index, max_index

        numeric_like_candidates = [
            candidate for candidate in visible_candidates
            if candidate.get("inputMode") in {"numeric", "decimal"}
            or candidate.get("type") in {"number", "tel"}
            or any(marker in candidate.get("text", "") for marker in ("price", "价", "金额", "元"))
        ]
        numeric_like_candidates.sort(key=lambda item: (item.get("y", 0), item.get("x", 0)))
        if len(numeric_like_candidates) >= 2:
            return int(numeric_like_candidates[0]["index"]), int(numeric_like_candidates[1]["index"])
        if len(numeric_like_candidates) == 1:
            return int(numeric_like_candidates[0]["index"]), None

        visible_candidates.sort(key=lambda item: (item.get("y", 0), item.get("x", 0)))
        if len(visible_candidates) >= 2:
            return int(visible_candidates[0]["index"]), int(visible_candidates[1]["index"])
        if len(visible_candidates) == 1:
            return int(visible_candidates[0]["index"]), None
        return None, None

    async def _open_price_filter_panel(self) -> bool:
        if not self.page:
            return False

        trigger_selectors = [
            'button:has-text("价格区间")',
            'button:has-text("价格")',
            '[role="button"]:has-text("价格区间")',
            '[role="button"]:has-text("价格")',
            'span:has-text("价格区间")',
            'span:has-text("价格")',
            'div:has-text("价格区间")',
            'div:has-text("价格")',
        ]

        for selector in trigger_selectors:
            locator = self.page.locator(selector)
            try:
                count = min(await locator.count(), 4)
            except Exception:
                continue

            for index in range(count):
                candidate = locator.nth(index)
                try:
                    if not await candidate.is_visible(timeout=800):
                        continue
                    await candidate.scroll_into_view_if_needed()
                    await asyncio.sleep(0.2)
                    await candidate.click(timeout=2000)
                    await asyncio.sleep(0.4)
                    return True
                except Exception:
                    continue

        return False

    async def _submit_price_filter(self, min_index: Optional[int], max_index: Optional[int]) -> bool:
        if not self.page:
            return False

        submit_selectors = [
            'button:has-text("确定")',
            'button:has-text("确认")',
            'button:has-text("完成")',
            'button:has-text("筛选")',
            '[role="button"]:has-text("确定")',
            '[role="button"]:has-text("确认")',
            '[role="button"]:has-text("完成")',
            '[role="button"]:has-text("筛选")',
        ]

        for selector in submit_selectors:
            locator = self.page.locator(selector)
            try:
                count = min(await locator.count(), 3)
            except Exception:
                continue

            for index in range(count):
                candidate = locator.nth(index)
                try:
                    if not await candidate.is_visible(timeout=800):
                        continue
                    await candidate.scroll_into_view_if_needed()
                    await asyncio.sleep(0.1)
                    await candidate.click(timeout=2000)
                    return True
                except Exception:
                    continue

        for index in (max_index, min_index):
            if index is None:
                continue
            try:
                input_locator = self.page.locator("input").nth(index)
                await input_locator.press("Enter", timeout=1500)
                return True
            except Exception:
                continue

        return False

    async def _apply_search_price_filters(
        self,
        keyword: str,
        target_items: List[Dict[str, Any]],
        target_seen_keys: Optional[set[str]] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
    ) -> bool:
        min_text = self._normalize_price_filter_value(min_price)
        max_text = self._normalize_price_filter_value(max_price)
        if not min_text and not max_text:
            return False
        if not self.page or self.page.is_closed():
            return False

        try:
            await asyncio.sleep(0.8)
            min_index, max_index = await self._find_price_filter_inputs(keyword)
            if min_index is None and max_index is None:
                await self._open_price_filter_panel()
                min_index, max_index = await self._find_price_filter_inputs(keyword)

            if min_index is None and max_index is None:
                logger.warning("未定位到闲鱼价格筛选输入框，将回退为本地价格过滤")
                return False

            if min_text and min_index is None and max_index is not None and not max_text:
                min_index, max_index = max_index, None
            if max_text and max_index is None and min_index is not None and not min_text:
                max_index, min_index = min_index, None

            if min_text and min_index is not None:
                min_input = self.page.locator("input").nth(min_index)
                await min_input.click()
                await min_input.fill(min_text)

            if max_text and max_index is not None:
                max_input = self.page.locator("input").nth(max_index)
                await max_input.click()
                await max_input.fill(max_text)

            logger.info(f"已在闲鱼搜索页填写价格筛选: min={min_text or '-'}, max={max_text or '-'}")
            self.api_responses = []
            target_items.clear()
            if target_seen_keys is not None:
                target_seen_keys.clear()

            submitted = await self._submit_price_filter(min_index, max_index)
            if not submitted:
                logger.warning("价格筛选已填写，但未定位到提交按钮，将尝试等待自动刷新")
                try:
                    await self.page.keyboard.press("Tab")
                except Exception:
                    pass

            await self.page.wait_for_load_state("networkidle", timeout=15000)
            await asyncio.sleep(3)
            return True
        except Exception as exc:
            logger.warning(f"应用闲鱼价格筛选失败，将回退为本地过滤: {exc}")
            return False

    async def resume_search_from_current_page(
        self,
        keyword: str,
        total_pages: int = 1,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """在人工验证完成后的当前搜索页继续采集结果，避免重新触发风险。"""
        if not self.page or self.page.is_closed():
            return {
                'items': [],
                'total': 0,
                'error': '人工验证页已关闭，请重新发起调研',
            }

        self.current_search_request = {
            'keyword': keyword,
            'page': 1,
            'page_size': 20,
            'max_pages': total_pages,
            'min_price': min_price,
            'max_price': max_price,
            'search_mode': 'resume_after_captcha',
        }

        self.api_responses = []
        collected_items = self._get_session_captured_items()
        collected_seen_keys = {
            key for key in (self._capture_item_key(item) for item in collected_items) if key
        }
        response_handler = self._build_search_response_handler(collected_items, collected_seen_keys)
        self.page.on("response", response_handler)

        try:
            try:
                await self.page.bring_to_front()
            except Exception:
                pass

            try:
                await self.page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass

            # 先确认当前页已经脱离验证码态，再等待结果回流。
            slider_result = await self.handle_slider_verification(
                page=self.page,
                context=self.context,
                browser=self.browser,
                playwright=getattr(self, 'playwright', None),
                max_retries=5,
            )

            if slider_result == 'need_captcha':
                logger.warning("恢复抓取时再次进入人工验证码流程")
                return 'need_captcha'

            if not slider_result:
                return {
                    'items': [],
                    'total': 0,
                    'error': '验证码状态异常，请重新完成验证后再试',
                }

            await self._apply_search_price_filters(
                keyword=keyword,
                target_items=collected_items,
                target_seen_keys=collected_seen_keys,
                min_price=min_price,
                max_price=max_price,
            )

            await asyncio.sleep(3)
            logger.info(f"人工验证后的第一页已累计抓取 {len(collected_items)} 条结果")

            if total_pages > 1:
                for page_num in range(2, total_pages + 1):
                    logger.info(f"继续从人工验证页面抓取第 {page_num} 页...")
                    before_click_count = len(collected_items)
                    await asyncio.sleep(2)

                    next_button_found = False
                    next_button_selectors = [
                        '.search-page-tiny-arrow-right--oXVFaRao',
                        '[class*="search-page-tiny-arrow-right"]',
                        'button[aria-label="下一页"]',
                        'button:has-text("下一页")',
                        'a:has-text("下一页")',
                        '.ant-pagination-next',
                        'li.ant-pagination-next a',
                        'a[aria-label="下一页"]'
                    ]

                    for selector in next_button_selectors:
                        try:
                            next_button = self.page.locator(selector).first
                            if not await next_button.is_visible(timeout=3000):
                                continue

                            is_disabled = await next_button.get_attribute("disabled")
                            has_disabled_class = await next_button.evaluate(
                                "el => el.classList.contains('ant-pagination-disabled') || el.classList.contains('disabled')"
                            )
                            if is_disabled or has_disabled_class:
                                continue

                            await next_button.scroll_into_view_if_needed()
                            await asyncio.sleep(1)
                            await next_button.click()
                            next_button_found = True
                            break
                        except Exception:
                            continue

                    if not next_button_found:
                        logger.warning(f"未找到第 {page_num} 页的下一页按钮，提前结束翻页")
                        break

                    try:
                        await self.page.wait_for_load_state("networkidle", timeout=15000)
                    except Exception:
                        pass

                    slider_result = await self.handle_slider_verification(
                        page=self.page,
                        context=self.context,
                        browser=self.browser,
                        playwright=getattr(self, 'playwright', None),
                        max_retries=5,
                    )

                    if slider_result == 'need_captcha':
                        logger.warning(f"抓取第 {page_num} 页时再次触发验证码")
                        return 'need_captcha'

                    if not slider_result:
                        return {
                            'items': collected_items,
                            'total': len(collected_items),
                            'error': f'抓取第 {page_num} 页时验证码状态异常',
                        }

                    await asyncio.sleep(4)
                    new_items = len(collected_items) - before_click_count
                    if new_items > 0:
                        logger.info(f"第 {page_num} 页新增 {new_items} 条结果")
                    else:
                        logger.warning(f"第 {page_num} 页没有抓到新结果，停止继续翻页")
                        break

            collected_items.sort(key=lambda x: x.get('want_count', 0), reverse=True)
            return {
                'items': collected_items,
                'total': len(collected_items),
                'is_real_data': True,
                'source': 'playwright_local_browser_resume',
            }
        finally:
            try:
                if hasattr(self.page, 'remove_listener'):
                    self.page.remove_listener("response", response_handler)
            except Exception:
                pass
    
    async def search_items(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 20,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        搜索闲鱼商品 - 使用 Playwright 获取真实数据

        Args:
            keyword: 搜索关键词
            page: 页码，从1开始
            page_size: 每页数量

        Returns:
            搜索结果字典，包含items列表和总数
        """
        try:
            self.current_search_request = {
                'keyword': keyword,
                'page': page,
                'page_size': page_size,
                'max_pages': max(1, page),
                'min_price': min_price,
                'max_price': max_price,
                'search_mode': 'single',
            }
            if not PLAYWRIGHT_AVAILABLE:
                logger.error("Playwright 不可用，无法获取真实数据")
                return {
                    'items': [],
                    'total': 0,
                    'error': 'Playwright 不可用，无法获取真实数据'
                }

            logger.info(f"使用 Playwright 搜索闲鱼商品: 关键词='{keyword}', 页码={page}, 每页={page_size}")

            await self.init_browser()

            # 清空之前的API响应
            self.api_responses = []
            data_list = []
            data_seen_keys: set[str] = set()
            on_response = self._build_search_response_handler(data_list, data_seen_keys)

            try:
                # 获取并设置cookies进行登录
                logger.info("正在获取有效的cookies账户...")
                cookie_data = await self.get_first_valid_cookie()
                if not cookie_data:
                    raise Exception("未找到有效的cookies账户，请先在Cookie管理中添加有效的闲鱼账户")

                logger.info(f"使用账户: {cookie_data.get('id', 'unknown')}")

                logger.info("正在访问闲鱼首页...")
                await self.page.goto("https://www.goofish.com", timeout=30000)

                # 设置cookies进行登录
                logger.info("正在设置cookies进行登录...")
                cookie_success = await self.set_browser_cookies(cookie_data.get('value', ''))
                if not cookie_success:
                    logger.warning("设置cookies失败，将以未登录状态继续")
                else:
                    logger.info("✅ cookies设置成功，已登录")
                    # 刷新页面以应用cookies
                    await self.page.reload()
                    await asyncio.sleep(2)
               
                    

                await self.page.wait_for_load_state("networkidle", timeout=10000)

                logger.info(f"正在搜索关键词: {keyword}")
                await self.page.fill('input[class*="search-input"]', keyword)

                # 注册响应监听
                self.page.on("response", on_response)

                # 优先使用回车触发真正的搜索请求，避免只命中联想词接口 search.shade
                await self.page.keyboard.press('Enter')
                await asyncio.sleep(1)

                # 如果页面没有进入搜索结果态，再回退到点击搜索按钮
                if not self.api_responses:
                    logger.info("回车后未捕获搜索结果，回退到点击搜索按钮...")
                    await self.page.click('button[type="submit"]')
                                   
                await self.page.wait_for_load_state("networkidle", timeout=15000)

                # 等待第一页API响应（缩短等待时间）
                logger.info("等待第一页API响应...")
                await asyncio.sleep(2)
                
                # 尝试处理弹窗
                try:
                    await self.page.keyboard.press('Escape')
                    await asyncio.sleep(0.5)
                except:
                    pass
                # 【核心】检测并处理滑块验证 → 使用公共方法
                logger.info(f"检测是否有滑块验证...")
                slider_result = await self.handle_slider_verification(
                    page=self.page,
                    context=self.context,
                    browser=self.browser,
                    playwright=getattr(self, 'playwright', None),
                    max_retries=5
                )

                if slider_result == 'need_captcha':
                    logger.warning("⚠️ 需要人工处理刮刮乐验证码")
                    return 'need_captcha'

                if not slider_result:
                    logger.error(f"❌ 滑块验证失败，搜索终止")
                    return None

                await self._apply_search_price_filters(
                    keyword=keyword,
                    target_items=data_list,
                    target_seen_keys=data_seen_keys,
                    min_price=min_price,
                    max_price=max_price,
                )
                # 等待更多数据
                await asyncio.sleep(3)

                first_page_count = len(data_list)
                logger.info(f"第1页完成，获取到 {first_page_count} 条数据")

                # 如果需要获取指定页数据，实现翻页逻辑
                if page > 1:
                    # 清空之前的数据，只保留目标页的数据
                    data_list.clear()
                    await self._navigate_to_page(page)

                # 根据"人想要"数量进行倒序排列
                data_list.sort(key=lambda x: x.get('want_count', 0), reverse=True)

                total_count = len(data_list)
                logger.info(f"搜索完成，总共获取到 {total_count} 条真实数据，已按想要人数排序")

                return {
                    'items': data_list,
                    'total': total_count,
                    'is_real_data': True,
                    'source': 'playwright'
                }

            finally:
                await self.close_browser()

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Playwright 搜索失败: {error_msg}")

            # 检查是否是浏览器安装问题
            if "Executable doesn't exist" in error_msg or "playwright install" in error_msg:
                error_msg = "浏览器未安装。请在Docker容器中运行: playwright install chromium"
            elif "BrowserType.launch" in error_msg:
                error_msg = "浏览器启动失败。请确保Docker容器有足够的权限和资源"

            # 如果 Playwright 失败，返回错误信息
            return {
                'items': [],
                'total': 0,
                'error': f'搜索失败: {error_msg}'
            }

    async def _get_fallback_data(self, keyword: str, page: int, page_size: int) -> Dict[str, Any]:
        """获取备选数据（模拟数据）"""
        logger.info(f"使用备选数据: 关键词='{keyword}', 页码={page}, 每页={page_size}")

        # 模拟搜索延迟
        await asyncio.sleep(0.5)

        # 生成模拟数据
        mock_items = []
        start_index = (page - 1) * page_size

        for i in range(page_size):
            item_index = start_index + i + 1
            mock_items.append({
                'item_id': f'mock_{keyword}_{item_index}',
                'title': f'{keyword}相关商品 #{item_index} [模拟数据]',
                'price': f'{100 + item_index * 10}',
                'seller_name': f'卖家{item_index}',
                'item_url': f'https://www.goofish.com/item?id=mock_{keyword}_{item_index}',
                'publish_time': '2025-07-28',
                'tags': [f'标签{i+1}', f'分类{i+1}'],
                'main_image': f'https://via.placeholder.com/200x200?text={keyword}商品{item_index}',
                'raw_data': {
                    'mock': True,
                    'keyword': keyword,
                    'index': item_index
                }
            })

        # 模拟总数
        total_items = 100 + hash(keyword) % 500

        logger.info(f"备选数据生成完成: 找到{len(mock_items)}个商品，总计{total_items}个")

        return {
            'items': mock_items,
            'total': total_items,
            'is_fallback': True
        }

    async def _parse_real_item(self, item_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """解析真实的闲鱼商品数据"""
        try:
            main_data = await self.safe_get(item_data, "data", "item", "main", "exContent", default={})
            click_params = await self.safe_get(item_data, "data", "item", "main", "clickParam", "args", default={})

            # 解析商品信息
            title = await self.safe_get(main_data, "title", default="未知标题")

            # 价格处理
            price_parts = await self.safe_get(main_data, "price", default=[])
            price = "价格异常"
            if isinstance(price_parts, list):
                price = "".join([str(p.get("text", "")) for p in price_parts if isinstance(p, dict)])
                price = price.replace("当前价", "").strip()

                # 统一价格格式处理
                if price and price != "价格异常":
                    # 先移除所有¥符号，避免重复
                    clean_price = price.replace('¥', '').strip()

                    # 处理万单位的价格
                    if "万" in clean_price:
                        try:
                            numeric_price = clean_price.replace('万', '').strip()
                            price_value = float(numeric_price) * 10000
                            price = f"¥{price_value:.0f}"
                        except:
                            price = f"¥{clean_price}"  # 如果转换失败，保持原样但确保有¥符号
                    else:
                        # 普通价格，确保有¥符号
                        if clean_price and (clean_price[0].isdigit() or clean_price.replace('.', '').isdigit()):
                            price = f"¥{clean_price}"
                        else:
                            price = clean_price if clean_price else "价格异常"

            # 只提取"想要人数"标签
            fish_tags_content = ""
            fish_tags = await self.safe_get(main_data, "fishTags", default={})

            # 遍历所有类型的标签 (r2, r3, r4等)
            for tag_type, tag_data in fish_tags.items():
                if isinstance(tag_data, dict) and "tagList" in tag_data:
                    tag_list = tag_data.get("tagList", [])
                    for tag_item in tag_list:
                        if isinstance(tag_item, dict) and "data" in tag_item:
                            content = tag_item["data"].get("content", "")
                            # 只保留包含"人想要"的标签
                            if content and "人想要" in content:
                                fish_tags_content = content
                                break
                    if fish_tags_content:  # 找到后就退出
                        break

            # 其他字段解析
            area = await self.safe_get(main_data, "area", default="地区未知")
            seller = await self.safe_get(main_data, "userNickName", default="匿名卖家")
            raw_link = await self.safe_get(item_data, "data", "item", "main", "targetUrl", default="")
            image_url = await self.safe_get(main_data, "picUrl", default="")

            # 获取商品ID
            item_id = await self.safe_get(click_params, "item_id", default="未知ID")
            seller_user_id = (
                str(await self.safe_get(main_data, "userId", default="") or "").strip()
                or str(await self.safe_get(main_data, "sellerUserId", default="") or "").strip()
                or str(await self.safe_get(click_params, "seller_id", default="") or "").strip()
                or str(await self.safe_get(click_params, "sellerId", default="") or "").strip()
                or self._extract_query_value(raw_link, ("sellerId", "seller_id", "sellerUserId", "userId", "user_id"))
                or self._find_first_by_keys(
                    item_data,
                    ("sellerUserId", "seller_user_id", "sellerId", "seller_id", "sellerUid", "seller_uid", "userId", "user_id"),
                )
            )

            # 处理发布时间
            publish_time = "未知时间"
            publish_timestamp = click_params.get("publishTime", "")
            if publish_timestamp and publish_timestamp.isdigit():
                try:
                    publish_time = datetime.fromtimestamp(
                        int(publish_timestamp)/1000
                    ).strftime("%Y-%m-%d %H:%M")
                except:
                    pass

            # 提取"人想要"的数字用于排序
            want_count = self._extract_want_count(fish_tags_content)

            return {
                "item_id": item_id,
                "title": title,
                "price": price,
                "seller_name": seller,
                "seller_user_id": seller_user_id,
                "item_url": raw_link.replace("fleamarket://", "https://www.goofish.com/"),
                "main_image": f"https:{image_url}" if image_url and not image_url.startswith("http") else image_url,
                "publish_time": publish_time,
                "tags": [fish_tags_content] if fish_tags_content else [],
                "area": area,
                "want_count": want_count,  # 添加想要人数用于排序
                "raw_data": item_data
            }

        except Exception as e:
            logger.warning(f"解析真实商品数据失败: {str(e)}")
            return None

    def _extract_want_count(self, tags_content: str) -> int:
        """从标签内容中提取"人想要"的数字"""
        try:
            if not tags_content or "人想要" not in tags_content:
                return 0

            # 使用正则表达式提取数字
            import re
            # 匹配类似 "123人想要" 或 "1.2万人想要" 的格式
            pattern = r'(\d+(?:\.\d+)?(?:万)?)\s*人想要'
            match = re.search(pattern, tags_content)

            if match:
                number_str = match.group(1)
                if '万' in number_str:
                    # 处理万单位
                    number = float(number_str.replace('万', '')) * 10000
                    return int(number)
                else:
                    return int(float(number_str))

            return 0
        except Exception as e:
            logger.warning(f"提取想要人数失败: {str(e)}")
            return 0

    async def _navigate_to_page(self, target_page: int):
        """导航到指定页面"""
        try:
            logger.info(f"正在导航到第 {target_page} 页...")

            # 等待页面稳定
            await asyncio.sleep(2)

            # 查找并点击下一页按钮
            next_button_selectors = [
                '.search-page-tiny-arrow-right--oXVFaRao',  # 用户找到的正确选择器
                '[class*="search-page-tiny-arrow-right"]',  # 更通用的版本
                'button[aria-label="下一页"]',
                'button:has-text("下一页")',
                'a:has-text("下一页")',
                '.ant-pagination-next',
                'li.ant-pagination-next a',
                'a[aria-label="下一页"]',
                '[class*="next"]',
                '[class*="pagination-next"]',
                'button[title="下一页"]',
                'a[title="下一页"]'
            ]

            # 从第2页开始点击
            for current_page in range(2, target_page + 1):
                logger.info(f"正在点击到第 {current_page} 页...")

                next_button_found = False
                for selector in next_button_selectors:
                    try:
                        next_button = self.page.locator(selector).first

                        if await next_button.is_visible(timeout=3000):
                            # 检查按钮是否可点击（不是禁用状态）
                            is_disabled = await next_button.get_attribute("disabled")
                            has_disabled_class = await next_button.evaluate("el => el.classList.contains('ant-pagination-disabled') || el.classList.contains('disabled')")

                            if not is_disabled and not has_disabled_class:
                                logger.info(f"找到下一页按钮，正在点击...")

                                # 滚动到按钮位置
                                await next_button.scroll_into_view_if_needed()
                                await asyncio.sleep(1)

                                # 点击下一页
                                await next_button.click()
                                await self.page.wait_for_load_state("networkidle", timeout=15000)

                                # 等待新数据加载
                                await asyncio.sleep(5)

                                logger.info(f"成功导航到第 {current_page} 页")
                                next_button_found = True
                                break

                    except Exception as e:
                        continue

                if not next_button_found:
                    logger.warning(f"无法找到下一页按钮，停止在第 {current_page-1} 页")
                    break

        except Exception as e:
            logger.error(f"导航到第 {target_page} 页失败: {str(e)}")

    async def search_multiple_pages(
        self,
        keyword: str,
        total_pages: int = 1,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        搜索多页闲鱼商品

        Args:
            keyword: 搜索关键词
            total_pages: 总页数

        Returns:
            搜索结果字典，包含所有页面的items列表和总数
        """
        browser_initialized = False
        try:
            self.current_search_request = {
                'keyword': keyword,
                'page': 1,
                'page_size': 20,
                'max_pages': total_pages,
                'min_price': min_price,
                'max_price': max_price,
                'search_mode': 'multi',
            }
            if not PLAYWRIGHT_AVAILABLE:
                logger.error("Playwright 不可用，无法获取真实数据")
                return {
                    'items': [],
                    'total': 0,
                    'error': 'Playwright 不可用，无法获取真实数据'
                }

            logger.info(f"使用 Playwright 搜索多页闲鱼商品: 关键词='{keyword}', 总页数={total_pages}")

            # 确保浏览器初始化
            await self.init_browser()
            browser_initialized = True

            # 验证浏览器状态
            if not self.browser or not self.page:
                raise Exception("浏览器初始化失败")

            logger.info("浏览器初始化成功，开始搜索...")

            # 清空之前的API响应
            self.api_responses = []
            all_data_list = []
            all_data_seen_keys: set[str] = set()
            on_response = self._build_search_response_handler(all_data_list, all_data_seen_keys)

            try:
                # 检查浏览器状态
                if not self.page or self.page.is_closed():
                    raise Exception("页面已关闭或不可用")

                # 获取并设置cookies进行登录
                logger.info("正在获取有效的cookies账户...")
                cookie_data = await self.get_first_valid_cookie()
                if not cookie_data:
                    raise Exception("未找到有效的cookies账户，请先在Cookie管理中添加有效的闲鱼账户")

                logger.info(f"使用账户: {cookie_data.get('id', 'unknown')}")

                logger.info("正在访问闲鱼首页...")
                await self.page.goto("https://www.goofish.com", timeout=30000)

                # 设置cookies进行登录
                logger.info("正在设置cookies进行登录...")
                cookie_success = await self.set_browser_cookies(cookie_data.get('value', ''))
                if not cookie_success:
                    logger.warning("设置cookies失败，将以未登录状态继续")
                else:
                    logger.info("✅ cookies设置成功，已登录")
                    # 刷新页面以应用cookies
                    await self.page.reload()
                    await asyncio.sleep(2)

                # 再次检查页面状态
                if self.page.is_closed():
                    raise Exception("页面在导航后被关闭")

                logger.info("等待页面加载完成...")
                await self.page.wait_for_load_state("networkidle", timeout=15000)

                # 等待页面稳定
                logger.info("等待页面稳定...")
                await asyncio.sleep(3)  # 增加等待时间

                # 再次检查页面状态
                if self.page.is_closed():
                    raise Exception("页面在等待加载后被关闭")

                # 获取页面标题和URL用于调试
                page_title = await self.page.title()
                page_url = self.page.url
                logger.info(f"当前页面标题: {page_title}")
                logger.info(f"当前页面URL: {page_url}")

                logger.info(f"正在搜索关键词: {keyword}")

                # 尝试多种搜索框选择器
                search_selectors = [
                    'input[class*="search-input"]',
                    'input[placeholder*="搜索"]',
                    'input[type="text"]',
                    '.search-input',
                    '#search-input'
                ]

                search_input = None
                for selector in search_selectors:
                    try:
                        logger.info(f"尝试查找搜索框，选择器: {selector}")
                        search_input = await self.page.wait_for_selector(selector, timeout=5000)
                        if search_input:
                            logger.info(f"✅ 找到搜索框，使用选择器: {selector}")
                            break
                    except Exception as e:
                        logger.info(f"❌ 选择器 {selector} 未找到搜索框: {str(e)}")
                        continue

                if not search_input:
                    raise Exception("未找到搜索框元素")

                # 检查页面状态
                if self.page.is_closed():
                    raise Exception("页面在查找搜索框后被关闭")

                await search_input.fill(keyword)
                logger.info(f"✅ 搜索关键词 '{keyword}' 已填入搜索框")

                # 注册响应监听
                self.page.on("response", on_response)

                logger.info("🖱️ 准备提交搜索...")
                await self.page.keyboard.press('Enter')
                await asyncio.sleep(1)
                if not self.api_responses:
                    logger.info("回车后未捕获搜索结果，回退到点击搜索按钮...")
                    await self.page.click('button[type="submit"]')
                logger.info("✅ 搜索已提交")
                    
                await self.page.wait_for_load_state("networkidle", timeout=15000)

                # 等待第一页API响应（优化等待时间）
                logger.info("等待第一页API响应...")
                await asyncio.sleep(3)

                # 尝试处理弹窗
                try:
                    await self.page.keyboard.press('Escape')
                    await asyncio.sleep(0.5)
                except:
                    pass
                # 【核心】检测并处理滑块验证 → 使用公共方法
                logger.info(f"检测是否有滑块验证...")
                slider_result = await self.handle_slider_verification(
                    page=self.page,
                    context=self.context,
                    browser=self.browser,
                    playwright=getattr(self, 'playwright', None),
                    max_retries=5
                )

                if slider_result == 'need_captcha':
                    logger.warning("⚠️ 需要人工处理刮刮乐验证码")
                    return 'need_captcha'

                if not slider_result:
                    logger.error(f"❌ 滑块验证失败，搜索终止")
                    return {
                        'items': [],
                        'total': 0,
                        'error': '滑块验证失败'
                    }

                await self._apply_search_price_filters(
                    keyword=keyword,
                    target_items=all_data_list,
                    target_seen_keys=all_data_seen_keys,
                    min_price=min_price,
                    max_price=max_price,
                )
                # 等待更多数据
                await asyncio.sleep(3)

                first_page_count = len(all_data_list)
                logger.info(f"第1页完成，获取到 {first_page_count} 条数据")

                # 如果需要获取更多页数据
                if total_pages > 1:
                    for page_num in range(2, total_pages + 1):
                        logger.info(f"正在获取第 {page_num} 页数据...")

                        # 等待页面稳定
                        await asyncio.sleep(2)

                        # 查找并点击下一页按钮
                        next_button_found = False
                        next_button_selectors = [
                            '.search-page-tiny-arrow-right--oXVFaRao',
                            '[class*="search-page-tiny-arrow-right"]',
                            'button[aria-label="下一页"]',
                            'button:has-text("下一页")',
                            'a:has-text("下一页")',
                            '.ant-pagination-next',
                            'li.ant-pagination-next a',
                            'a[aria-label="下一页"]'
                        ]

                        for selector in next_button_selectors:
                            try:
                                next_button = self.page.locator(selector).first

                                if await next_button.is_visible(timeout=3000):
                                    # 检查按钮是否可点击
                                    is_disabled = await next_button.get_attribute("disabled")
                                    has_disabled_class = await next_button.evaluate("el => el.classList.contains('ant-pagination-disabled') || el.classList.contains('disabled')")

                                    if not is_disabled and not has_disabled_class:
                                        logger.info(f"找到下一页按钮，正在点击到第 {page_num} 页...")

                                        # 记录点击前的数据量
                                        before_click_count = len(all_data_list)

                                        # 滚动到按钮位置并点击
                                        await next_button.scroll_into_view_if_needed()
                                        await asyncio.sleep(1)
                                        await next_button.click()
                                        await self.page.wait_for_load_state("networkidle", timeout=15000)

                                        # 等待新数据加载
                                        await asyncio.sleep(5)

                                        # 检查是否有新数据
                                        after_click_count = len(all_data_list)
                                        new_items = after_click_count - before_click_count

                                        if new_items > 0:
                                            logger.info(f"第 {page_num} 页成功，新增 {new_items} 条数据")
                                            next_button_found = True
                                            break
                                        else:
                                            logger.warning(f"第 {page_num} 页点击后没有新数据，可能已到最后一页")
                                            next_button_found = False
                                            break

                            except Exception as e:
                                continue

                        if not next_button_found:
                            logger.warning(f"无法获取第 {page_num} 页数据，停止在第 {page_num-1} 页")
                            break

                # 根据"人想要"数量进行倒序排列
                all_data_list.sort(key=lambda x: x.get('want_count', 0), reverse=True)

                total_count = len(all_data_list)
                logger.info(f"多页搜索完成，总共获取到 {total_count} 条真实数据，已按想要人数排序")

                return {
                    'items': all_data_list,
                    'total': total_count,
                    'is_real_data': True,
                    'source': 'playwright'
                }

            finally:
                # 确保浏览器被正确关闭
                if browser_initialized:
                    try:
                        await self.close_browser()
                        logger.info("浏览器已安全关闭")
                    except Exception as close_error:
                        logger.warning(f"关闭浏览器时出错: {str(close_error)}")

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Playwright 多页搜索失败: {error_msg}")

            # 检查是否是浏览器相关问题
            if "Executable doesn't exist" in error_msg or "playwright install" in error_msg:
                error_msg = "浏览器未安装。请在Docker容器中运行: playwright install chromium"
            elif "BrowserType.launch" in error_msg:
                error_msg = "浏览器启动失败。请确保Docker容器有足够的权限和资源"
            elif "Target page, context or browser has been closed" in error_msg:
                error_msg = "浏览器页面被意外关闭。这可能是由于网站反爬虫检测或系统资源限制导致的"
            elif "Page.goto" in error_msg and "closed" in error_msg:
                error_msg = "页面导航失败，浏览器连接已断开"
            elif "Timeout" in error_msg and "exceeded" in error_msg:
                error_msg = "页面加载超时。网络连接可能不稳定或网站响应缓慢"

            # 如果 Playwright 失败，返回错误信息
            return {
                'items': [],
                'total': 0,
                'error': f'多页搜索失败: {error_msg}'
            }

    async def _get_multiple_fallback_data(self, keyword: str, total_pages: int) -> Dict[str, Any]:
        """获取多页备选数据（模拟数据）"""
        logger.info(f"使用多页备选数据: 关键词='{keyword}', 总页数={total_pages}")

        # 模拟搜索延迟
        await asyncio.sleep(1)

        # 生成多页模拟数据
        all_mock_items = []

        for page in range(1, total_pages + 1):
            page_size = 20  # 每页20条
            start_index = (page - 1) * page_size

            for i in range(page_size):
                item_index = start_index + i + 1
                all_mock_items.append({
                    'item_id': f'mock_{keyword}_{item_index}',
                    'title': f'{keyword}相关商品 #{item_index} [模拟数据-第{page}页]',
                    'price': f'{100 + item_index * 10}',
                    'seller_name': f'卖家{item_index}',
                    'item_url': f'https://www.goofish.com/item?id=mock_{keyword}_{item_index}',
                    'publish_time': '2025-07-28',
                    'tags': [f'标签{i+1}', f'分类{i+1}'],
                    'main_image': f'https://via.placeholder.com/200x200?text={keyword}商品{item_index}',
                    'raw_data': {
                        'mock': True,
                        'keyword': keyword,
                        'index': item_index,
                        'page': page
                    }
                })

        total_count = len(all_mock_items)
        logger.info(f"多页备选数据生成完成: 找到{total_count}个商品，共{total_pages}页")

        return {
            'items': all_mock_items,
            'total': total_count,
            'is_fallback': True
        }


# 搜索器工具函数

async def search_xianyu_items(keyword: str, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    """
    搜索闲鱼商品的便捷函数，带重试机制

    Args:
        keyword: 搜索关键词
        page: 页码
        page_size: 每页数量

    Returns:
        搜索结果
    """
    max_retries = 2
    retry_delay = 5  # 秒，增加重试间隔

    for attempt in range(max_retries + 1):
        searcher = None
        try:
            # 每次搜索都创建新的搜索器实例，避免浏览器状态混乱
            searcher = XianyuSearcher()

            logger.info(f"开始单页搜索，尝试次数: {attempt + 1}/{max_retries + 1}")
            result = await searcher.search_items(keyword, page, page_size)

            # 如果成功获取到数据，直接返回
            if result.get('items') or not result.get('error'):
                logger.info(f"单页搜索成功，获取到 {len(result.get('items', []))} 条数据")
                return result

        except Exception as e:
            error_msg = str(e)
            logger.error(f"搜索商品失败 (尝试 {attempt + 1}/{max_retries + 1}): {error_msg}")

            # 如果是最后一次尝试，返回错误
            if attempt == max_retries:
                return {
                    'items': [],
                    'total': 0,
                    'error': f"搜索失败，已重试 {max_retries} 次: {error_msg}"
                }

            # 等待后重试
            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        finally:
            # 确保搜索器被正确关闭
            if searcher:
                try:
                    await searcher.close_browser()
                except Exception as close_error:
                    logger.warning(f"关闭搜索器时出错: {str(close_error)}")

    # 理论上不会到达这里
    return {
        'items': [],
        'total': 0,
        'error': "未知错误"
    }


def _normalize_search_wrapper_result(result: Any, fallback_error: str) -> Dict[str, Any]:
    """统一包装搜索函数的返回值，避免丢失底层错误信息。"""
    if isinstance(result, dict):
        return result
    if isinstance(result, str) and result.strip():
        return {
            'items': [],
            'total': 0,
            'error': result.strip(),
        }
    return {
        'items': [],
        'total': 0,
        'error': fallback_error,
    }


async def search_xianyu_items_with_cookie(
    cookie_id: str,
    keyword: str,
    page: int = 1,
    page_size: int = 20,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    captcha_mode: str = "remote_control",
    allow_local_browser_handoff: bool = False,
) -> Dict[str, Any]:
    """使用指定 cookie 搜索闲鱼商品。"""
    max_retries = 2
    retry_delay = 5
    last_error_result: Optional[Dict[str, Any]] = None

    for attempt in range(max_retries + 1):
        searcher = None
        try:
            searcher = XianyuSearcher()
            searcher.preferred_cookie_id = str(cookie_id)
            searcher.user_id = str(cookie_id)
            searcher.captcha_mode = captcha_mode
            searcher.allow_local_browser_handoff = bool(allow_local_browser_handoff)

            logger.info(f"开始单页搜索（指定cookie={cookie_id}），尝试次数: {attempt + 1}/{max_retries + 1}")
            result = await searcher.search_items(
                keyword,
                page,
                page_size,
                min_price=min_price,
                max_price=max_price,
            )

            if result == 'need_captcha':
                captcha_info = searcher.last_captcha_info or {}
                return {
                    'items': [],
                    'total': 0,
                    'error': '需要人工完成刮刮乐验证码',
                    'captcha_required': True,
                    'captcha_info': captcha_info,
                }

            normalized_result = _normalize_search_wrapper_result(result, "搜索结果为空")
            if normalized_result.get('items') or not normalized_result.get('error'):
                logger.info(f"单页搜索成功，获取到 {len(normalized_result.get('items', []))} 条数据")
                return normalized_result

            last_error_result = normalized_result
            logger.error(f"单页搜索失败 (尝试 {attempt + 1}/{max_retries + 1}): {normalized_result.get('error')}")

            if attempt == max_retries:
                return normalized_result

            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        except Exception as e:
            error_msg = str(e)
            logger.error(f"搜索商品失败 (尝试 {attempt + 1}/{max_retries + 1}): {error_msg}")

            if attempt == max_retries:
                return {
                    'items': [],
                    'total': 0,
                    'error': f"搜索失败，已重试 {max_retries} 次: {error_msg}"
                }

            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        finally:
            if searcher:
                try:
                    await searcher.close_browser()
                except Exception as close_error:
                    logger.warning(f"关闭搜索器时出错: {str(close_error)}")

    return last_error_result or {
        'items': [],
        'total': 0,
        'error': "未知错误"
    }


async def search_multiple_pages_xianyu_with_cookie(
    cookie_id: str,
    keyword: str,
    total_pages: int = 1,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> Dict[str, Any]:
    """使用指定 cookie 搜索多页闲鱼商品。"""
    max_retries = 0
    retry_delay = 5
    last_error_result: Optional[Dict[str, Any]] = None

    for attempt in range(max_retries + 1):
        searcher = None
        try:
            searcher = XianyuSearcher()
            searcher.preferred_cookie_id = str(cookie_id)
            searcher.user_id = str(cookie_id)
            searcher.captcha_mode = "remote_control"

            logger.info(f"开始多页搜索（指定cookie={cookie_id}），尝试次数: {attempt + 1}/{max_retries + 1}")
            result = await searcher.search_multiple_pages(
                keyword,
                total_pages,
                min_price=min_price,
                max_price=max_price,
            )

            if result == 'need_captcha':
                captcha_info = searcher.last_captcha_info or {}
                return {
                    'items': [],
                    'total': 0,
                    'error': '需要人工完成刮刮乐验证码',
                    'captcha_required': True,
                    'captcha_info': captcha_info,
                }

            normalized_result = _normalize_search_wrapper_result(result, "多页搜索结果为空")
            if normalized_result.get('items') or not normalized_result.get('error'):
                logger.info(f"多页搜索成功，获取到 {len(normalized_result.get('items', []))} 条数据")
                return normalized_result

            last_error_result = normalized_result
            logger.error(f"多页搜索失败 (尝试 {attempt + 1}/{max_retries + 1}): {normalized_result.get('error')}")

            if attempt == max_retries:
                return normalized_result

            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        except Exception as e:
            error_msg = str(e)
            logger.error(f"多页搜索商品失败 (尝试 {attempt + 1}/{max_retries + 1}): {error_msg}")

            if attempt == max_retries:
                return {
                    'items': [],
                    'total': 0,
                    'error': f"搜索失败，已重试 {max_retries} 次: {error_msg}"
                }

            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        finally:
            if searcher:
                try:
                    await searcher.close_browser()
                except Exception as close_error:
                    logger.warning(f"关闭搜索器时出错: {str(close_error)}")

    return last_error_result or {
        'items': [],
        'total': 0,
        'error': "未知错误"
    }


async def search_multiple_pages_xianyu_with_cookie_mode(
    cookie_id: str,
    keyword: str,
    total_pages: int = 1,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    captcha_mode: str = "remote_control",
    allow_local_browser_handoff: bool = False,
) -> Dict[str, Any]:
    """使用指定 cookie 搜索多页闲鱼商品，可指定验证码处理模式。"""
    max_retries = 0
    retry_delay = 5
    last_error_result: Optional[Dict[str, Any]] = None

    for attempt in range(max_retries + 1):
        searcher = None
        try:
            searcher = XianyuSearcher()
            searcher.preferred_cookie_id = str(cookie_id)
            searcher.user_id = str(cookie_id)
            searcher.captcha_mode = captcha_mode
            searcher.allow_local_browser_handoff = bool(allow_local_browser_handoff)

            logger.info(f"开始多页搜索（指定cookie={cookie_id}），尝试次数: {attempt + 1}/{max_retries + 1}")
            result = await searcher.search_multiple_pages(
                keyword,
                total_pages,
                min_price=min_price,
                max_price=max_price,
            )

            if result == 'need_captcha':
                captcha_info = searcher.last_captcha_info or {}
                return {
                    'items': [],
                    'total': 0,
                    'error': '需要人工完成刮刮乐验证码',
                    'captcha_required': True,
                    'captcha_info': captcha_info,
                }

            normalized_result = _normalize_search_wrapper_result(result, "多页搜索结果为空")
            if normalized_result.get('items') or not normalized_result.get('error'):
                logger.info(f"多页搜索成功，获取到 {len(normalized_result.get('items', []))} 条数据")
                return normalized_result

            last_error_result = normalized_result
            logger.error(f"多页搜索失败 (尝试 {attempt + 1}/{max_retries + 1}): {normalized_result.get('error')}")

            if attempt == max_retries:
                return normalized_result

            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        except Exception as e:
            error_msg = str(e)
            logger.error(f"多页搜索商品失败 (尝试 {attempt + 1}/{max_retries + 1}): {error_msg}")

            if attempt == max_retries:
                return {
                    'items': [],
                    'total': 0,
                    'error': f"搜索失败，已重试 {max_retries} 次: {error_msg}"
                }

            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        finally:
            if searcher:
                try:
                    await searcher.close_browser()
                except Exception as close_error:
                    logger.warning(f"关闭搜索器时出错: {str(close_error)}")

    return last_error_result or {
        'items': [],
        'total': 0,
        'error': "未知错误"
    }


async def resume_market_research_session(
    session_id: str,
    cookie_id: str,
    keyword: str,
    max_pages: int = 1,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> Dict[str, Any]:
    """使用已通过人工验证的本机浏览器会话继续抓取市场调研数据。"""
    from utils.captcha_remote_control import captcha_controller

    session = captcha_controller.active_sessions.get(session_id)
    if not session:
        return {
            'items': [],
            'total': 0,
            'error': '验证码会话不存在，请重新发起调研',
        }

    handoff_info = session.get('handoff_info') or {'session_id': session_id, 'mode': 'local_browser'}

    completed = await captcha_controller.check_completion(session_id)
    if not completed:
        return {
            'items': [],
            'total': 0,
            'error': '请先在本机浏览器完成验证码验证',
            'captcha_required': True,
            'captcha_info': handoff_info,
        }

    page = session.get('page')
    context = session.get('context')
    browser = session.get('browser')
    playwright = session.get('playwright')

    searcher = XianyuSearcher()
    searcher.user_id = str(cookie_id)
    searcher.preferred_cookie_id = str(cookie_id)
    searcher.captcha_mode = 'local_browser'
    searcher.page = page
    searcher.context = context
    searcher.browser = browser
    searcher.playwright = playwright
    searcher.external_browser = bool(session.get('external_browser'))
    searcher.close_external_page_on_close = bool(session.get('close_owned_page', True))
    searcher.launched_browser_label = str((handoff_info or {}).get('browser_name') or searcher.launched_browser_label)

    try:
        result = await searcher.resume_search_from_current_page(
            keyword,
            max_pages,
            min_price=min_price,
            max_price=max_price,
        )

        if result == 'need_captcha':
            captcha_info = searcher.last_captcha_info or handoff_info
            return {
                'items': [],
                'total': 0,
                'error': '仍需人工完成验证码',
                'captcha_required': True,
                'captcha_info': captcha_info,
            }

        await captcha_controller.close_session(session_id)
        return result
    except Exception as e:
        logger.error(f"恢复市场调研会话失败: {e}")
        return {
            'items': [],
            'total': 0,
            'error': f'恢复抓取失败: {e}',
        }


async def search_multiple_pages_xianyu(keyword: str, total_pages: int = 1) -> Dict[str, Any]:
    """
    搜索多页闲鱼商品的便捷函数，带重试机制

    Args:
        keyword: 搜索关键词
        total_pages: 总页数

    Returns:
        搜索结果
    """
    max_retries = 0
    retry_delay = 5  # 秒，增加重试间隔
    last_error_result: Optional[Dict[str, Any]] = None

    for attempt in range(max_retries + 1):
        searcher = None
        try:
            # 每次搜索都创建新的搜索器实例，避免浏览器状态混乱
            searcher = XianyuSearcher()

            logger.info(f"开始多页搜索，尝试次数: {attempt + 1}/{max_retries + 1}")
            result = await searcher.search_multiple_pages(keyword, total_pages)

            # 如果成功获取到数据，直接返回
            normalized_result = _normalize_search_wrapper_result(result, "多页搜索结果为空")
            if normalized_result.get('items') or not normalized_result.get('error'):
                logger.info(f"多页搜索成功，获取到 {len(normalized_result.get('items', []))} 条数据")
                return normalized_result

            last_error_result = normalized_result
            logger.error(f"多页搜索失败 (尝试 {attempt + 1}/{max_retries + 1}): {normalized_result.get('error')}")

            if attempt == max_retries:
                return normalized_result

            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        except Exception as e:
            error_msg = str(e)
            logger.error(f"多页搜索商品失败 (尝试 {attempt + 1}/{max_retries + 1}): {error_msg}")

            # 如果是最后一次尝试，返回错误
            if attempt == max_retries:
                return {
                    'items': [],
                    'total': 0,
                    'error': f"搜索失败，已重试 {max_retries} 次: {error_msg}"
                }

            # 等待后重试
            logger.info(f"等待 {retry_delay} 秒后重试...")
            await asyncio.sleep(retry_delay)

        finally:
            # 确保搜索器被正确关闭
            if searcher:
                try:
                    await searcher.close_browser()
                except Exception as close_error:
                    logger.warning(f"关闭搜索器时出错: {str(close_error)}")

    # 理论上不会到达这里
    return last_error_result or {
        'items': [],
        'total': 0,
        'error': "未知错误"
    }
