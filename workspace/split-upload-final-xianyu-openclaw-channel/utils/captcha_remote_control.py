"""
刮刮乐远程控制模块
通过 WebSocket 实时传输页面截图到前端，并接收用户操作
"""

import asyncio
import base64
import json
import statistics
import random
import time
from pathlib import Path
from typing import Optional, Dict, Any
from loguru import logger
from playwright.async_api import Page


class CaptchaRemoteController:
    """刮刮乐远程控制器"""
    
    def __init__(self):
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        self.websocket_connections: Dict[str, Any] = {}

    def _clip_from_captcha_info(self, captcha_info: Optional[Dict[str, Any]]) -> Optional[Dict[str, int]]:
        if not captcha_info or 'x' not in captcha_info:
            return None

        return {
            'x': max(0, int(captcha_info['x'] - 10)),
            'y': max(0, int(captcha_info['y'] - 10)),
            'width': max(1, int(captcha_info['width'] + 20)),
            'height': max(1, int(captcha_info['height'] + 20)),
        }

    def _relative_box(self, box: Optional[Dict[str, Any]], clip_rect: Optional[Dict[str, int]]) -> Optional[Dict[str, int]]:
        if not box or not clip_rect:
            return None

        return {
            'x': int(round(box['x'] - clip_rect['x'])),
            'y': int(round(box['y'] - clip_rect['y'])),
            'width': int(round(box['width'])),
            'height': int(round(box['height'])),
        }

    def _iter_contexts(self, page: Page):
        yield page
        for frame in page.frames:
            if frame != page.main_frame:
                yield frame

    @staticmethod
    def _clamp(value: float, minimum: float, maximum: float) -> float:
        return max(minimum, min(maximum, value))

    def _trajectory_history_files(self, session_id: str) -> list[Path]:
        history_dir = Path("trajectory_history")
        if not history_dir.exists():
            return []

        return sorted(
            history_dir.glob(f"{session_id}*_success.json"),
            key=lambda path: path.name,
        )

    def _load_success_assist(self, session_id: str, drag_span: int) -> Optional[Dict[str, Any]]:
        if drag_span <= 0:
            return None

        distances: list[float] = []
        sources: list[str] = []

        for path in self._trajectory_history_files(session_id):
            try:
                rows = json.loads(path.read_text(encoding='utf-8'))
            except Exception as exc:
                logger.debug(f"读取成功轨迹失败 {path}: {exc}")
                continue

            file_distances = [
                float(row.get('distance', 0))
                for row in rows
                if row.get('success') and row.get('distance')
            ]
            if not file_distances:
                continue

            distances.extend(file_distances)
            sources.append(path.name)

        if len(distances) < 3:
            return None

        ratios = [
            distance / drag_span
            for distance in distances
            if drag_span > 0 and 0.45 <= (distance / drag_span) <= 1.08
        ]
        if len(ratios) < 3:
            return None

        recommended_ratio = self._clamp(statistics.median(ratios), 0.0, 1.0)
        mean_ratio = self._clamp(statistics.mean(ratios), 0.0, 1.0)
        low_ratio = self._clamp(min(ratios), 0.0, 1.0)
        high_ratio = self._clamp(max(ratios), 0.0, 1.0)
        recommended_distance = int(round(recommended_ratio * drag_span))

        return {
            'mode': 'history',
            'samples': len(ratios),
            'recommended_ratio': recommended_ratio,
            'mean_ratio': mean_ratio,
            'recommended_distance': recommended_distance,
            'range_ratio': {
                'low': low_ratio,
                'high': high_ratio,
            },
            'drag_span': drag_span,
            'sources': sources,
            'hint': f"历史成功落点约 {int(round(recommended_ratio * 100))}%（{recommended_distance}px）",
        }

    async def _detect_captcha_kind(self, page: Page) -> str:
        try:
            page_content = await page.content()
        except Exception as exc:
            logger.debug(f"检测验证码类型失败: {exc}")
            return 'slider'

        scratch_required = ['scratch-captcha', 'scratch-captcha-btn', 'scratch-captcha-slider']
        has_scratch_feature = any(keyword in page_content for keyword in scratch_required)

        scratch_instructions = ['Release the slider', 'fully appears', 'appears', 'scratch']
        has_scratch_instruction = sum(1 for keyword in scratch_instructions if keyword in page_content) >= 2

        return 'scratch' if has_scratch_feature or has_scratch_instruction else 'slider'

    async def _build_assist_info(
        self,
        session_id: str,
        page: Page,
        interactive: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        drag_bounds = (interactive or {}).get('drag_bounds') or {}
        drag_span = max(0, int(drag_bounds.get('max_x', 0)) - int(drag_bounds.get('min_x', 0)))

        assist: Dict[str, Any] = {
            'captcha_kind': await self._detect_captcha_kind(page),
        }

        history_assist = self._load_success_assist(session_id, drag_span)
        if history_assist:
            assist.update(history_assist)
            assist['enabled'] = True
        else:
            assist['enabled'] = False

        return assist

    async def _find_box(
        self,
        page: Page,
        selectors: list[str],
        min_width: int = 0,
        min_height: int = 0
    ) -> Optional[Dict[str, Any]]:
        for context in self._iter_contexts(page):
            context_name = 'main_frame' if context is page or context == page.main_frame else 'iframe'
            for selector in selectors:
                try:
                    element = await context.query_selector(selector)
                    if not element:
                        continue

                    box = await element.bounding_box()
                    if not box:
                        continue

                    if box['width'] < min_width or box['height'] < min_height:
                        continue

                    return {
                        'selector': selector,
                        'box': {
                            'x': float(box['x']),
                            'y': float(box['y']),
                            'width': float(box['width']),
                            'height': float(box['height']),
                        },
                        'context': context_name,
                    }
                except Exception:
                    continue

        return None

    async def _build_interactive_geometry(
        self,
        page: Page,
        captcha_info: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        clip_rect = self._clip_from_captcha_info(captcha_info)

        slider_match = await self._find_box(
            page,
            [
                '#scratch-captcha-btn',
                '.scratch-captcha-slider .button',
                '#nocaptcha .button',
                '.button#scratch-captcha-btn',
                '#nc_1_n1z',
                '.btn_slide',
                '.nc_iconfont.btn_slide',
            ],
            min_width=18,
            min_height=18,
        )

        track_match = await self._find_box(
            page,
            [
                '.scratch-captcha-slider',
                '#nocaptcha .scratch-captcha-slider',
                '#nc_1_n1t',
                '.nc_scale',
                '.captcha-slider',
                '.slider-captcha',
            ],
            min_width=120,
            min_height=24,
        )

        track_box = track_match['box'] if track_match else None
        slider_box = slider_match['box'] if slider_match else None

        if not track_box and captcha_info:
            estimated_height = min(64.0, max(36.0, float(captcha_info['height']) * 0.22))
            track_box = {
                'x': float(captcha_info['x'] + 16),
                'y': float(captcha_info['y'] + max(16.0, captcha_info['height'] - estimated_height - 18)),
                'width': max(140.0, float(captcha_info['width'] - 32)),
                'height': estimated_height,
            }
            track_match = {'selector': 'captcha_container_fallback', 'context': 'derived'}

        if not slider_box and track_box:
            button_size = min(56.0, max(34.0, track_box['height'] - 6))
            slider_box = {
                'x': track_box['x'] + 6,
                'y': track_box['y'] + max(0.0, (track_box['height'] - button_size) / 2),
                'width': button_size,
                'height': button_size,
            }
            slider_match = {'selector': 'track_fallback', 'context': 'derived'}

        drag_bounds = None
        if slider_box:
            center_y = int(round(slider_box['y'] + slider_box['height'] / 2))
            min_x = int(round(slider_box['x'] + slider_box['width'] / 2))
            if track_box:
                max_x = int(round(track_box['x'] + track_box['width'] - slider_box['width'] / 2))
            elif captcha_info:
                max_x = int(round(captcha_info['x'] + captcha_info['width'] - slider_box['width'] / 2 - 12))
            else:
                max_x = min_x

            max_x = max(min_x, max_x)
            drag_bounds = {
                'min_x': min_x,
                'max_x': max_x,
                'y': center_y,
                'relative_min_x': int(round(min_x - clip_rect['x'])) if clip_rect else None,
                'relative_max_x': int(round(max_x - clip_rect['x'])) if clip_rect else None,
                'relative_y': int(round(center_y - clip_rect['y'])) if clip_rect else None,
            }

        return {
            'clip_rect': clip_rect,
            'slider_box': slider_box,
            'track_box': track_box,
            'relative_slider_box': self._relative_box(slider_box, clip_rect),
            'relative_track_box': self._relative_box(track_box, clip_rect),
            'drag_bounds': drag_bounds,
            'slider_selector': slider_match['selector'] if slider_match else None,
            'track_selector': track_match['selector'] if track_match else None,
            'slider_context': slider_match['context'] if slider_match else None,
            'track_context': track_match['context'] if track_match else None,
        }

    async def _refresh_session_geometry(self, session_id: str, refresh_captcha: bool = False) -> Optional[Dict[str, Any]]:
        session = self.active_sessions.get(session_id)
        if not session:
            return None

        page = session.get('page')
        if not page:
            return None

        captcha_info = session.get('captcha_info')
        if refresh_captcha or not captcha_info:
            captcha_info = await self._get_captcha_info(page)
            session['captcha_info'] = captcha_info

        interactive = await self._build_interactive_geometry(page, captcha_info)
        session['interactive'] = interactive
        session['assist'] = await self._build_assist_info(session_id, page, interactive)
        return interactive

    async def get_session_payload(
        self,
        session_id: str,
        refresh_screenshot: bool = False,
        refresh_geometry: bool = False,
        quality: int = 75,
    ) -> Optional[Dict[str, Any]]:
        if session_id not in self.active_sessions:
            return None

        session = self.active_sessions[session_id]

        if refresh_geometry or 'interactive' not in session:
            await self._refresh_session_geometry(session_id, refresh_captcha=refresh_geometry)

        if refresh_screenshot or not session.get('screenshot'):
            await self.update_screenshot(session_id, quality=quality)

        return {
            'session_id': session_id,
            'screenshot': session.get('screenshot'),
            'captcha_info': session.get('captcha_info'),
            'viewport': session.get('viewport'),
            'completed': session.get('completed', False),
            'interactive': session.get('interactive'),
            'assist': session.get('assist'),
        }

    def _normalize_coords(self, session_id: str, x: int, y: int) -> tuple[int, int]:
        session = self.active_sessions.get(session_id, {})
        captcha_info = session.get('captcha_info') or {}

        # 前端通常传的是验证码截图区域内坐标；这里统一限制在验证码容器附近，避免拖到容器外。
        if captcha_info and 'x' in captcha_info:
            left = int(captcha_info['x'])
            top = int(captcha_info['y'])
            right = int(captcha_info['x'] + captcha_info['width'])
            bottom = int(captcha_info['y'] + captcha_info['height'])
            x = max(left, min(int(x), right))
            y = max(top, min(int(y), bottom))

        return int(x), int(y)
    
    async def create_session(self, session_id: str, page: Page) -> Dict[str, str]:
        """
        创建远程控制会话
        
        Args:
            session_id: 会话ID（通常是用户ID）
            page: Playwright Page 对象
            
        Returns:
            包含会话信息的字典
        """
        # 获取滑块元素位置
        captcha_info = await self._get_captcha_info(page)
        
        # 只截取滑块区域，不截取整个页面（性能优化）
        screenshot_bytes = await self._screenshot_captcha_area(page, captcha_info)
        screenshot_base64 = base64.b64encode(screenshot_bytes).decode('utf-8')
        
        # 获取视口大小
        try:
            viewport = page.viewport_size
            if viewport is None:
                # 如果没有设置viewport，使用默认值或通过JS获取
                viewport = await page.evaluate("() => ({width: window.innerWidth, height: window.innerHeight})")
        except:
            viewport = {'width': 1280, 'height': 720}  # 默认值
        
        # 存储会话
        self.active_sessions[session_id] = {
            'page': page,
            'screenshot': screenshot_base64,
            'captcha_info': captcha_info,
            'completed': False,
            'viewport': viewport,
            'owns_browser': False,
            'captured_items': [],
            'captured_count': 0,
        }

        await self._refresh_session_geometry(session_id)
        
        logger.info(f"✅ 创建远程控制会话: {session_id}")
        
        return {
            'session_id': session_id,
            'screenshot': screenshot_base64,
            'captcha_info': captcha_info,
            'viewport': self.active_sessions[session_id]['viewport'],
            'interactive': self.active_sessions[session_id].get('interactive'),
        }
    
    async def _screenshot_captcha_area(self, page: Page, captcha_info: Dict[str, Any]) -> bytes:
        """截取整个验证码容器区域"""
        try:
            if captcha_info and 'x' in captcha_info:
                # 直接截取整个容器，稍微留一点边距
                x = max(0, captcha_info['x'] - 10)
                y = max(0, captcha_info['y'] - 10)
                width = captcha_info['width'] + 20
                height = captcha_info['height'] + 20
                
                # 截取整个验证码容器
                screenshot_bytes = await page.screenshot(
                    type='jpeg',
                    quality=80,  # 验证码区域用高质量
                    clip={
                        'x': x,
                        'y': y,
                        'width': width,
                        'height': height
                    }
                )
                logger.info(f"✅ 截取验证码容器: {width}x{height} (包含完整验证码)")
                return screenshot_bytes
            else:
                # 如果没有找到滑块，截取整个页面
                logger.warning("未找到滑块位置，截取整个页面")
                return await page.screenshot(type='jpeg', quality=75, full_page=False)
                
        except Exception as e:
            logger.warning(f"截取滑块区域失败，使用全页面: {e}")
            return await page.screenshot(type='jpeg', quality=75, full_page=False)
    
    async def _get_captcha_info(self, page: Page) -> Dict[str, Any]:
        """获取滑块验证码信息（查找整个容器）"""
        try:
            # 优先查找整个验证码容器（不是按钮）
            container_selectors = [
                '#nocaptcha',  # 完整的验证码容器
                '.scratch-captcha-container',
                '[id*="captcha"]',
                '.nc-container'
            ]
            
            # 先在主页面查找
            for selector in container_selectors:
                try:
                    element = await page.query_selector(selector)
                    if element:
                        box = await element.bounding_box()
                        if box and box['width'] > 100 and box['height'] > 100:  # 确保找到的是容器
                            logger.info(f"✅ 在主页面找到验证码容器: {selector}, 大小: {box['width']}x{box['height']}")
                            return {
                                'selector': selector,
                                'x': box['x'],
                                'y': box['y'],
                                'width': box['width'],
                                'height': box['height'],
                                'in_iframe': False
                            }
                except Exception as e:
                    logger.debug(f"检查选择器 {selector} 失败: {e}")
                    continue
            
            # 在 iframe 中查找
            frames = page.frames
            for frame in frames:
                if frame != page.main_frame:
                    for selector in container_selectors:
                        try:
                            element = await frame.query_selector(selector)
                            if element:
                                box = await element.bounding_box()
                                if box and box['width'] > 100 and box['height'] > 100:
                                    logger.info(f"✅ 在iframe找到验证码容器: {selector}, 大小: {box['width']}x{box['height']}")
                                    return {
                                        'selector': selector,
                                        'x': box['x'],
                                        'y': box['y'],
                                        'width': box['width'],
                                        'height': box['height'],
                                        'in_iframe': True
                                        # 注意：不保存 frame 对象，因为不能被 JSON 序列化
                                    }
                        except Exception as e:
                            logger.debug(f"iframe检查选择器 {selector} 失败: {e}")
                            continue
            
            logger.warning("⚠️ 未找到验证码容器")
            return None
            
        except Exception as e:
            logger.error(f"获取滑块信息失败: {e}")
            return None
    
    async def update_screenshot(self, session_id: str, quality: int = 75) -> Optional[str]:
        """更新会话的截图（截取整个验证码容器）"""
        if session_id not in self.active_sessions:
            return None
        
        try:
            page = self.active_sessions[session_id]['page']
            interactive = self.active_sessions[session_id].get('interactive') or {}
            clip_rect = interactive.get('clip_rect')
            captcha_info = self.active_sessions[session_id].get('captcha_info')
            
            # 截取整个验证码容器
            if not clip_rect:
                clip_rect = self._clip_from_captcha_info(captcha_info)
            
            if clip_rect:
                x = clip_rect['x']
                y = clip_rect['y']
                width = clip_rect['width']
                height = clip_rect['height']
                
                screenshot_bytes = await page.screenshot(
                    type='jpeg',
                    quality=quality,
                    clip={'x': x, 'y': y, 'width': width, 'height': height}
                )
            else:
                # 降级方案：截取整个页面
                screenshot_bytes = await page.screenshot(
                    type='jpeg',
                    quality=quality,
                    full_page=False
                )
            
            screenshot_base64 = base64.b64encode(screenshot_bytes).decode('utf-8')
            self.active_sessions[session_id]['screenshot'] = screenshot_base64
            return screenshot_base64
            
        except Exception as e:
            logger.error(f"更新截图失败: {e}")
            return None

    async def _move_drag_segment(
        self,
        page: Page,
        start_x: float,
        end_x: float,
        y: float,
        aggressive: bool = False,
    ) -> None:
        distance = max(0.0, end_x - start_x)
        if distance <= 0:
            return

        if aggressive:
            steps = random.randint(16, 24)
            base_delay = random.uniform(0.004, 0.009)
        else:
            steps = max(1, min(7, int(distance / 22) + 1))
            base_delay = random.uniform(0.003, 0.007)

        for index in range(steps):
            progress = (index + 1) / steps
            eased = progress ** 1.35
            current_x = start_x + distance * eased
            current_y = y + random.uniform(-1.2, 1.2)
            await page.mouse.move(current_x, current_y, steps=1)
            if aggressive or distance >= 28:
                await asyncio.sleep(base_delay * random.uniform(0.85, 1.15))
                if aggressive and 0.38 <= progress <= 0.72 and random.random() < 0.18:
                    await asyncio.sleep(random.uniform(0.02, 0.06))

    async def _perform_drag_submit(
        self,
        session_id: str,
        ratio: float,
        source: str = 'manual',
        snap_to_assist: bool = False,
    ) -> bool:
        session = self.active_sessions.get(session_id)
        if not session:
            logger.warning(f"会话不存在: {session_id}")
            return False

        page = session.get('page')
        if not page:
            return False

        interactive = session.get('interactive') or await self._refresh_session_geometry(session_id)
        drag_bounds = (interactive or {}).get('drag_bounds')
        if not drag_bounds:
            logger.warning(f"会话缺少拖拽边界: {session_id}")
            return False

        assist = session.get('assist') or {}
        requested_ratio = self._clamp(float(ratio), 0.0, 1.0)
        effective_ratio = requested_ratio
        if snap_to_assist and assist.get('enabled') and assist.get('recommended_ratio') is not None:
            effective_ratio = self._clamp(float(assist['recommended_ratio']), 0.0, 1.0)

        min_x = drag_bounds['min_x']
        max_x = drag_bounds['max_x']
        y = drag_bounds['y']
        span = max(0, max_x - min_x)
        target_x = min_x + span * effective_ratio
        start_at = time.monotonic()

        try:
            approach_x = max(0.0, min_x - random.uniform(12.0, 26.0))
            approach_y = y + random.uniform(-5.0, 5.0)
            await page.mouse.move(approach_x, approach_y, steps=random.randint(4, 7))
            await asyncio.sleep(random.uniform(0.05, 0.11))
            await page.mouse.move(min_x, y + random.uniform(-1.4, 1.4), steps=random.randint(3, 6))
            await asyncio.sleep(random.uniform(0.06, 0.12))
            await page.mouse.down()
            await asyncio.sleep(random.uniform(0.05, 0.11))

            await self._move_drag_segment(page, min_x, target_x, y, aggressive=True)

            if target_x > min_x + 18:
                overshoot = min(max_x, target_x + random.uniform(0.8, 2.0))
                await page.mouse.move(overshoot, y + random.uniform(-0.8, 0.8), steps=1)
                await asyncio.sleep(random.uniform(0.01, 0.03))
                settle_x = max(min_x, target_x - random.uniform(0.2, 1.1))
                await page.mouse.move(settle_x, y + random.uniform(-0.7, 0.7), steps=1)
                await asyncio.sleep(random.uniform(0.02, 0.05))
                await page.mouse.move(target_x, y + random.uniform(-0.4, 0.4), steps=1)

            hold_range = (0.18, 0.28) if assist.get('captcha_kind') == 'slider' else (0.22, 0.34)
            await asyncio.sleep(random.uniform(*hold_range))
            await page.mouse.up()

            duration_ms = int((time.monotonic() - start_at) * 1000)
            logger.info(
                "远程辅助提交完成: session={} source={} requested_ratio={:.4f} effective_ratio={:.4f} "
                "target_x={:.1f} span={} duration_ms={}",
                session_id,
                source,
                requested_ratio,
                effective_ratio,
                target_x,
                span,
                duration_ms,
            )
            return True
        except Exception as exc:
            logger.error(f"执行辅助拖拽失败: {exc}")
            return False

    async def assist_submit(self, session_id: str, ratio: Optional[float] = None) -> bool:
        session = self.active_sessions.get(session_id)
        assist = (session or {}).get('assist') or {}
        target_ratio = ratio
        if target_ratio is None:
            target_ratio = assist.get('recommended_ratio', 0.95)

        return await self._perform_drag_submit(
            session_id,
            ratio=target_ratio,
            source='history_assist',
            snap_to_assist=True,
        )

    async def handle_drag_event(self, session_id: str, phase: str, ratio: float) -> bool:
        if session_id not in self.active_sessions:
            logger.warning(f"会话不存在: {session_id}")
            return False

        session = self.active_sessions[session_id]
        page = session.get('page')
        if not page:
            return False

        interactive = session.get('interactive') or await self._refresh_session_geometry(session_id)
        drag_bounds = (interactive or {}).get('drag_bounds')
        if not drag_bounds:
            logger.warning(f"会话缺少拖拽边界: {session_id}")
            return False

        try:
            ratio = max(0.0, min(float(ratio), 1.0))
        except (TypeError, ValueError):
            ratio = 0.0

        min_x = drag_bounds['min_x']
        max_x = drag_bounds['max_x']
        y = drag_bounds['y']
        span = max_x - min_x
        target_x = int(round(min_x + span * ratio))

        drag_state = session.setdefault('drag_state', {})

        try:
            if phase == 'start':
                start_x = min_x
                approach_x = max(0, start_x - random.randint(10, 22))
                approach_y = y + random.uniform(-4.0, 4.0)
                await page.mouse.move(approach_x, approach_y, steps=random.randint(2, 4))
                await asyncio.sleep(random.uniform(0.03, 0.06))
                await page.mouse.move(start_x, y + random.uniform(-1.0, 1.0), steps=random.randint(2, 4))
                await asyncio.sleep(random.uniform(0.04, 0.08))
                await page.mouse.down()
                await asyncio.sleep(random.uniform(0.05, 0.1))
                drag_state['active'] = True
                drag_state['last_x'] = start_x
                drag_state['last_y'] = y
                drag_state['ratio'] = 0.0
                drag_state['move_count'] = 0
                drag_state['started_at'] = time.monotonic()
                drag_state['requested_ratio'] = 0.0
                logger.info(
                    "虚拟滑条开始拖拽: session={} start_x={} y={} span={} assist={}",
                    session_id,
                    start_x,
                    y,
                    span,
                    (session.get('assist') or {}).get('hint'),
                )
                return True

            if not drag_state.get('active'):
                logger.warning(f"拖拽未开始: {session_id}, phase={phase}")
                return False

            last_x = drag_state.get('last_x', min_x)

            if phase in {'move', 'end'}:
                distance = max(0, target_x - last_x)
                await self._move_drag_segment(page, last_x, target_x, y, aggressive=(phase == 'end' and distance >= 28))
                move_y = y + random.uniform(-1.0, 1.0)
                drag_state['last_x'] = target_x
                drag_state['last_y'] = move_y
                drag_state['ratio'] = ratio
                drag_state['requested_ratio'] = ratio
                drag_state['move_count'] = drag_state.get('move_count', 0) + 1

            if phase == 'end':
                if drag_state.get('move_count', 0) > 1 and target_x > min_x + 18:
                    micro_back = max(min_x, target_x - random.uniform(0.8, 2.2))
                    await page.mouse.move(micro_back, y + random.uniform(-0.8, 0.8), steps=1)
                    await asyncio.sleep(random.uniform(0.01, 0.025))
                    await page.mouse.move(target_x, y + random.uniform(-0.5, 0.5), steps=1)

                assist = session.get('assist') or {}
                hold_range = (0.18, 0.28) if assist.get('captcha_kind') == 'slider' else (0.22, 0.34)
                await asyncio.sleep(random.uniform(*hold_range))
                await page.mouse.up()
                duration_ms = int((time.monotonic() - drag_state.get('started_at', time.monotonic())) * 1000)
                logger.info(
                    "虚拟滑条结束拖拽: session={} ratio={:.4f} target_x={} span={} moves={} duration_ms={}",
                    session_id,
                    ratio,
                    target_x,
                    span,
                    drag_state.get('move_count', 0),
                    duration_ms,
                )
                drag_state.clear()
                return True

            if phase == 'move':
                return True

            logger.warning(f"未知拖拽阶段: {phase}")
            return False

        except Exception as e:
            logger.error(f"处理虚拟拖拽失败: {e}")
            return False
    
    async def handle_mouse_event(self, session_id: str, event_type: str, x: int, y: int) -> bool:
        """
        处理鼠标事件
        
        Args:
            session_id: 会话ID
            event_type: 事件类型 (down/move/up)
            x: X坐标
            y: Y坐标
            
        Returns:
            是否成功
        """
        if session_id not in self.active_sessions:
            logger.warning(f"会话不存在: {session_id}")
            return False
        
        try:
            page = self.active_sessions[session_id]['page']
            x, y = self._normalize_coords(session_id, x, y)
            session = self.active_sessions[session_id]
            drag_state = session.setdefault('drag_state', {})
            
            if event_type == 'down':
                await page.mouse.move(x, y)
                await page.mouse.down()
                drag_state['last_x'] = x
                drag_state['last_y'] = y
                logger.debug(f"鼠标按下: ({x}, {y})")
                
            elif event_type == 'move':
                last_x = drag_state.get('last_x', x)
                last_y = drag_state.get('last_y', y)
                distance = max(abs(x - last_x), abs(y - last_y))
                steps = max(1, min(20, distance // 8 if distance else 1))
                await page.mouse.move(x, y, steps=steps)
                drag_state['last_x'] = x
                drag_state['last_y'] = y
                logger.debug(f"鼠标移动: ({x}, {y})")
                
            elif event_type == 'up':
                last_x = drag_state.get('last_x', x)
                last_y = drag_state.get('last_y', y)
                if x != last_x or y != last_y:
                    distance = max(abs(x - last_x), abs(y - last_y))
                    steps = max(1, min(20, distance // 8 if distance else 1))
                    await page.mouse.move(x, y, steps=steps)
                await page.mouse.up()
                drag_state.clear()
                logger.debug(f"鼠标释放: ({x}, {y})")
                
            else:
                logger.warning(f"未知事件类型: {event_type}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"处理鼠标事件失败: {e}")
            return False
    
    async def check_completion(self, session_id: str) -> bool:
        """检查验证是否完成（更严格的判断）"""
        if session_id not in self.active_sessions:
            return False
        
        try:
            session = self.active_sessions[session_id]
            if session.get('completed'):
                return True

            captured_count = int(session.get('captured_count') or len(session.get('captured_items') or []))
            if captured_count > 0:
                session['captured_count'] = captured_count
                session['completed'] = True
                logger.success(f"✅ 验证完成（已同步搜索结果 {captured_count} 条）: {session_id}")
                return True

            page = session['page']
            
            # 多个选择器检查，确保更准确
            captcha_selectors = [
                '#nocaptcha',
                '#scratch-captcha-btn',
                '.scratch-captcha-container',
                '.scratch-captcha-slider'
            ]
            
            found_visible_captcha = False
            
            # 检查主页面
            for selector in captcha_selectors:
                try:
                    element = await page.query_selector(selector)
                    if element:
                        is_visible = await element.is_visible()
                        if is_visible:
                            logger.debug(f"主页面发现可见滑块: {selector}")
                            found_visible_captcha = True
                            break
                except:
                    continue
            
            if found_visible_captcha:
                return False
            
            # 检查所有 iframe
            frames = page.frames
            for frame in frames:
                if frame != page.main_frame:
                    for selector in captcha_selectors:
                        try:
                            element = await frame.query_selector(selector)
                            if element:
                                is_visible = await element.is_visible()
                                if is_visible:
                                    logger.debug(f"iframe中发现可见滑块: {selector}")
                                    found_visible_captcha = True
                                    break
                        except:
                            continue
                    if found_visible_captcha:
                        break
            
            if found_visible_captcha:
                return False
            
            # 额外检查：看页面内容是否还包含滑块相关文字
            try:
                page_content = await page.content()
                captcha_keywords = ['scratch-captcha', 'nocaptcha', 'slider-btn']
                
                # 如果页面中仍然有大量滑块相关内容，可能还未完成
                keyword_count = sum(1 for kw in captcha_keywords if kw in page_content)
                if keyword_count >= 2:
                    logger.debug(f"页面中仍有 {keyword_count} 个滑块关键词")
                    return False
            except:
                pass
            
            # 所有检查都通过，认为验证完成
            logger.success(f"✅ 验证完成（所有滑块元素已消失）: {session_id}")
            session['completed'] = True
            return True
            
        except Exception as e:
            logger.error(f"检查完成状态失败: {e}")
            # 出错时返回 False，不要误判为成功
            return False

    async def check_failure(self, session_id: str) -> bool:
        """检查验证是否明确失败。"""
        if session_id not in self.active_sessions:
            return False

        try:
            page = self.active_sessions[session_id]['page']
        except Exception:
            return False

        failure_keywords = [
            '验证失败',
            '点击框体重试',
            '请重试',
            '验证码错误',
            '滑动验证失败',
        ]
        failure_selectors = [
            'text=验证失败，点击框体重试',
            'text=验证失败',
            'text=点击框体重试',
            'text=请重试',
            "[class*='retry']",
            "[class*='fail']",
            "[class*='error']",
            '.captcha-tips',
            '.nc_wrapper',
            '.nc-wrapper',
        ]

        try:
            page_content = await page.content()
            for keyword in failure_keywords:
                if keyword in page_content:
                    logger.warning(f"检测到验证失败关键词: session={session_id} keyword={keyword}")
                    return True
        except Exception as exc:
            logger.debug(f"检查失败关键词时出错: {exc}")

        for context in self._iter_contexts(page):
            for selector in failure_selectors:
                try:
                    element = await context.query_selector(selector)
                    if not element:
                        continue

                    is_visible = True
                    try:
                        is_visible = await element.is_visible()
                    except Exception:
                        pass

                    if not is_visible:
                        continue

                    text = ''
                    try:
                        text = (await element.text_content()) or ''
                    except Exception:
                        pass

                    logger.warning(
                        "检测到验证失败元素: session={} selector={} text={}",
                        session_id,
                        selector,
                        text.strip(),
                    )
                    return True
                except Exception:
                    continue

        return False
    
    def is_completed(self, session_id: str) -> bool:
        """检查会话是否已完成"""
        if session_id not in self.active_sessions:
            return False
        return self.active_sessions[session_id].get('completed', False)
    
    def session_exists(self, session_id: str) -> bool:
        """检查会话是否存在"""
        return session_id in self.active_sessions
    
    async def close_session(self, session_id: str):
        """关闭会话"""
        if session_id in self.active_sessions:
            session = self.active_sessions[session_id]
            try:
                if session.get('owns_browser'):
                    page = session.get('page')
                    context = session.get('context')
                    browser = session.get('browser')
                    playwright = session.get('playwright')
                    external_browser = session.get('external_browser', False)
                    close_owned_page = session.get('close_owned_page', True)

                    if external_browser:
                        if close_owned_page and page and not page.is_closed():
                            await page.close()
                        if playwright:
                            await playwright.stop()
                    else:
                        if page and not page.is_closed():
                            await page.close()
                        if context:
                            await context.close()
                        if browser:
                            await browser.close()
                        if playwright:
                            await playwright.stop()
            except Exception as e:
                logger.warning(f"关闭会话浏览器资源失败: {e}")

            del self.active_sessions[session_id]
            logger.info(f"🔒 关闭远程控制会话: {session_id}")
    
    async def auto_refresh_screenshot(self, session_id: str, interval: float = 1.0):
        """自动刷新截图（优化版：按需更新）"""
        last_update_time = asyncio.get_event_loop().time()
        
        while session_id in self.active_sessions and not self.is_completed(session_id):
            try:
                current_time = asyncio.get_event_loop().time()
                
                # 使用自适应刷新：空闲时降低频率
                if current_time - last_update_time >= interval:
                    screenshot = await self.update_screenshot(session_id, quality=55)  # 降低质量提升性能
                    
                    if screenshot and session_id in self.websocket_connections:
                        try:
                            ws = self.websocket_connections[session_id]
                            await ws.send_json({
                                'type': 'screenshot_update',
                                'screenshot': screenshot
                            })
                            last_update_time = current_time
                        except:
                            # WebSocket 可能已断开
                            break
                
                # 降低检查频率，减少 CPU 使用
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.error(f"自动刷新截图失败: {e}")
                await asyncio.sleep(1)  # 出错时等待更长时间


# 全局实例
captcha_controller = CaptchaRemoteController()
