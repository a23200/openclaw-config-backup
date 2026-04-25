"""
闲鱼商品搜索爬虫模块

基于 Playwright 实现的闲鱼商品搜索爬虫功能
参考: superboyyy/xianyu_spider

功能:
- 商品搜索爬取
- 多页搜索支持
- 数据去重（基于链接哈希）
- 数据库持久化
- 反检测策略
"""

import asyncio
import hashlib
import random
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime
from loguru import logger
from patchright.async_api import async_playwright, Page, Browser, BrowserContext, Response, TimeoutError as PlaywrightTimeoutError, Error as PlaywrightError
from tenacity import retry, stop_after_attempt, wait_exponential
from db_manager import db_manager


def get_md5(text: str) -> str:
    """返回给定文本的MD5哈希值"""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def get_link_unique_key(link: str) -> str:
    """
    截取链接中前1个"&"之前的内容作为唯一标识依据。
    如果链接中的"&"少于1个，则返回整个链接。
    """
    parts = link.split('&', 1)
    if len(parts) >= 2:
        return '&'.join(parts[:1])
    else:
        return link


async def safe_get(data, *keys, default="暂无"):
    """安全获取嵌套字典值"""
    for key in keys:
        try:
            data = data[key]
        except (KeyError, TypeError, IndexError):
            return default
    return data


async def human_like_delay(min_sec: float = 1.0, max_sec: float = 3.0):
    """随机延迟，模拟人类行为"""
    delay = random.uniform(min_sec, max_sec)
    await asyncio.sleep(delay)


async def human_like_mouse_move(page: Page):
    """随机鼠标移动，模拟人类行为"""
    try:
        x = random.randint(100, 800)
        y = random.randint(100, 600)
        await page.mouse.move(x, y)
        await asyncio.sleep(random.uniform(0.1, 0.3))
    except Exception:
        pass


async def human_like_scroll(page: Page):
    """随机滚动页面，模拟人类浏览"""
    try:
        scroll_amount = random.randint(100, 500)
        await page.evaluate(f"window.scrollBy(0, {scroll_amount})")
        await asyncio.sleep(random.uniform(0.5, 1.5))
    except Exception:
        pass


async def human_like_type(page: Page, selector: str, text: str):
    """慢速输入文本，模拟人类打字"""
    try:
        element = await page.query_selector(selector)
        if element:
            await element.click()
            await asyncio.sleep(random.uniform(0.3, 0.8))
            
            for char in text:
                await page.keyboard.type(char)
                await asyncio.sleep(random.uniform(0.1, 0.3))
            
            await asyncio.sleep(random.uniform(0.5, 1.0))
    except Exception:
        await page.fill(selector, text)


class XianyuProductSpider:
    """闲鱼商品搜索爬虫"""
    
    # 闲鱼首页 URL
    HOME_URL = "https://www.goofish.com"
    
    def __init__(self, cookie_id: str, cookies_str: str, headless: bool = True, proxy: Optional[Dict] = None):
        """初始化爬虫
        
        Args:
            cookie_id: 账号ID
            cookies_str: Cookie 字符串
            headless: 是否无头模式
            proxy: 代理配置，格式：{"server": "http://proxy.com:8080", "username": "user", "password": "pass"}
        """
        self.cookie_id = str(cookie_id) if cookie_id is not None else ""
        self.cookies_str = str(cookies_str) if cookies_str is not None else ""
        self.headless = headless
        self.proxy = proxy
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None
        
        # 爬取的数据列表
        self.data_list: List[Dict[str, Any]] = []
    
    async def init_browser(self):
        """初始化浏览器（使用持久化上下文）"""
        try:
            logger.info(f"【{self.cookie_id}】初始化 Patchright 浏览器（持久化模式）...")
            
            self.playwright = await async_playwright().start()
            
            # 使用持久化上下文
            import os
            user_data_dir = f"./browser_data/{self.cookie_id}"
            os.makedirs(user_data_dir, exist_ok=True)
            
            # 构建启动参数
            launch_options = {
                'user_data_dir': user_data_dir,
                'channel': 'chrome',
                'headless': self.headless,
                'no_viewport': True,
                'locale': 'zh-CN',
                'timezone_id': 'Asia/Shanghai',
                'args': [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--log-level=3',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ]
            }
            
            if self.proxy:
                launch_options['proxy'] = self.proxy
                logger.info(f"【{self.cookie_id}】使用代理: {self.proxy.get('server')}")
            
            self.context = await self.playwright.chromium.launch_persistent_context(**launch_options)
            self.context.set_default_timeout(30000)
            
            if self.context.pages:
                self.page = self.context.pages[0]
            else:
                self.page = await self.context.new_page()
            
            logger.info(f"【{self.cookie_id}】浏览器初始化成功（持久化模式）")
            
        except Exception as e:
            logger.error(f"【{self.cookie_id}】浏览器初始化失败: {e}")
            raise
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    async def _goto_with_retry(self, url: str):
        """带重试的页面跳转"""
        try:
            await self.page.goto(url, timeout=30000, wait_until='networkidle')
        except Exception as e:
            logger.warning(f"【{self.cookie_id}】页面跳转失败，准备重试: {e}")
            raise
    
    async def login_with_cookie(self):
        """使用 Cookie 登录"""
        try:
            logger.info(f"【{self.cookie_id}】开始 Cookie 登录...")
            
            # 先访问咸鱼首页（带重试）
            await self._goto_with_retry(self.HOME_URL)
            await asyncio.sleep(1)
            
            # 解析并注入 Cookie
            cookies = self._parse_cookies(self.cookies_str)
            logger.info(f"【{self.cookie_id}】Cookie 解析完成，共 {len(cookies)} 个")
            
            await self.context.add_cookies(cookies)
            
            # 刷新页面验证登录状态
            await self.page.reload(wait_until='networkidle')
            await asyncio.sleep(1)
            
            logger.info(f"【{self.cookie_id}】Cookie 登录成功")
            return True
                
        except Exception as e:
            logger.error(f"【{self.cookie_id}】Cookie 登录失败: {e}")
            return False
    
    def _parse_cookies(self, cookies_str: str) -> List[Dict[str, Any]]:
        """解析 Cookie 字符串
        
        Args:
            cookies_str: Cookie 字符串（格式：key1=value1; key2=value2）
            
        Returns:
            Playwright 格式的 Cookie 列表
        """
        if not isinstance(cookies_str, str):
            cookies_str = str(cookies_str)
        
        cookies = []
        for item in cookies_str.split(';'):
            item = item.strip()
            if '=' in item:
                key, value = item.split('=', 1)
                # 同时添加 goofish.com 和 taobao.com 域名的 Cookie
                for domain in ['.goofish.com', '.taobao.com']:
                    cookies.append({
                        'name': key.strip(),
                        'value': value.strip(),
                        'domain': domain,
                        'path': '/'
                    })
        return cookies
    
    async def _handle_response(self, response: Response):
        """处理API响应，解析数据"""
        if "h5api.m.goofish.com/h5/mtop.taobao.idlemtopsearch.pc.search" in response.url:
            try:
                result_json = await response.json()
                items = result_json.get("data", {}).get("resultList", [])
                
                for item in items:
                    main_data = await safe_get(item, "data", "item", "main", "exContent", default={})
                    click_params = await safe_get(item, "data", "item", "main", "clickParam", "args", default={})
                    
                    # 解析商品信息
                    title = await safe_get(main_data, "title", default="未知标题")
                    
                    # 价格处理
                    price_parts = await safe_get(main_data, "price", default=[])
                    price = "价格异常"
                    if isinstance(price_parts, list):
                        price = "".join([str(p.get("text", "")) for p in price_parts if isinstance(p, dict)])
                        price = price.replace("当前价", "").strip()
                        if "万" in price:
                            price = f"¥{float(price.replace('¥', '').replace('万', '')) * 10000:.0f}"
                    
                    # 其他字段解析
                    area = await safe_get(main_data, "area", default="地区未知")
                    seller = await safe_get(main_data, "userNickName", default="匿名卖家")
                    raw_link = await safe_get(item, "data", "item", "main", "targetUrl", default="")
                    image_url = await safe_get(main_data, "picUrl", default="")

                    self.data_list.append({
                        "商品标题": title,
                        "当前售价": price,
                        "发货地区": area,
                        "卖家昵称": seller,
                        "商品链接": raw_link.replace("fleamarket://", "https://www.goofish.com/"),
                        "商品图片链接": f"https:{image_url}" if image_url and not image_url.startswith("http") else image_url,
                        "发布时间": datetime.fromtimestamp(
                            int(click_params.get("publishTime", 0))/1000
                        ).strftime("%Y-%m-%d %H:%M") if click_params.get("publishTime", "").isdigit() else "未知时间"
                    })
                    
            except Exception as e:
                logger.error(f"【{self.cookie_id}】响应处理异常: {e}")
    
    async def _check_and_handle_captcha(self) -> bool:
        """检测并处理验证码"""
        try:
            if "punish" in self.page.url or "/captcha" in self.page.url:
                logger.warning(f"【{self.cookie_id}】⚠️ 检测到验证码页面！")
                return True
            
            captcha_selectors = [
                "div[class*='captcha']",
                "div[class*='punish']",
                "iframe[src*='captcha']"
            ]
            
            for selector in captcha_selectors:
                element = await self.page.query_selector(selector)
                if element:
                    logger.warning(f"【{self.cookie_id}】⚠️ 检测到验证码元素: {selector}")
                    return True
            
            return False
        except Exception as e:
            logger.error(f"【{self.cookie_id}】验证码检测失败: {e}")
            return False
    
    async def search_products(self, keyword: str, max_pages: int = 1) -> Tuple[int, int, List[int]]:
        """搜索商品（增强版：人类行为模拟 + 验证码处理）
        
        Args:
            keyword: 搜索关键词
            max_pages: 最大爬取页数
            
        Returns:
            (总结果数, 新增记录数, 新增记录ID列表)
        """
        try:
            logger.info(f"【{self.cookie_id}】开始搜索商品: {keyword}, 最大页数: {max_pages}")
            
            self.data_list = []
            
            logger.info(f"【{self.cookie_id}】访问闲鱼首页...")
            await self._goto_with_retry(self.HOME_URL)
            await human_like_delay(2, 4)
            await human_like_mouse_move(self.page)
            await human_like_scroll(self.page)
            await human_like_delay(1, 2)
            
            if await self._check_and_handle_captcha():
                logger.info(f"【{self.cookie_id}】检测到验证码")
            
            self.page.on("response", self._handle_response)
            
            logger.info(f"【{self.cookie_id}】输入搜索关键词: {keyword}")
            await human_like_type(self.page, 'input[class*="search-input"]', keyword)
            await human_like_delay(0.5, 1.5)
            await self.page.click('button[type="submit"]')
            await human_like_delay(3, 5)
            
            if await self._check_and_handle_captcha():
                logger.info(f"【{self.cookie_id}】检测到验证码")
            
            try:
                close_btn = await self.page.query_selector("div[class*='closeIconBg']")
                if close_btn:
                    await close_btn.click()
                    logger.info(f"【{self.cookie_id}】已关闭广告弹窗")
                    await human_like_delay(0.5, 1)
            except:
                pass
            
            await human_like_scroll(self.page)
            await human_like_delay(2, 3)
            
            current_page = 1
            while current_page <= max_pages:
                logger.info(f"【{self.cookie_id}】正在处理第 {current_page} 页")
                
                if await self._check_and_handle_captcha():
                    logger.info(f"【{self.cookie_id}】检测到验证码")
                
                delay = random.uniform(10, 20)
                logger.debug(f"【{self.cookie_id}】等待 {delay:.2f} 秒后继续...")
                await asyncio.sleep(delay)
                
                await human_like_scroll(self.page)
                await human_like_mouse_move(self.page)
                await human_like_delay(1, 2)
                
                if current_page < max_pages:
                    next_btn = await self.page.query_selector("[class*='search-pagination-arrow-right']:not([disabled])")
                    if not next_btn:
                        logger.info(f"【{self.cookie_id}】没有更多页面，停止爬取")
                        break
                    await next_btn.click()
                    current_page += 1
                    await human_like_delay(3, 5)
                else:
                    break
            
            new_count, new_ids = await self._save_to_db()
            
            logger.info(f"【{self.cookie_id}】搜索完成: 总结果 {len(self.data_list)}, 新增 {new_count}")
            
            return (len(self.data_list), new_count, new_ids)
            
        except PlaywrightTimeoutError as e:
            logger.error(f"【{self.cookie_id}】请求超时: {e}")
            import traceback
            logger.error(f"【{self.cookie_id}】错误堆栈:\n{traceback.format_exc()}")
            raise
        except PlaywrightError as e:
            logger.error(f"【{self.cookie_id}】Playwright 错误: {e}")
            import traceback
            logger.error(f"【{self.cookie_id}】错误堆栈:\n{traceback.format_exc()}")
            raise
        except Exception as e:
            logger.error(f"【{self.cookie_id}】未知错误: {e}")
            import traceback
            logger.error(f"【{self.cookie_id}】错误堆栈:\n{traceback.format_exc()}")
            raise
    
    def _validate_product_data(self, item: Dict) -> bool:
        """验证商品数据完整性"""
        required_fields = ["商品标题", "当前售价", "商品链接"]
        for field in required_fields:
            if not item.get(field) or item[field] == "暂无":
                logger.warning(f"【{self.cookie_id}】商品数据不完整，缺少字段: {field}")
                return False
        
        # 验证价格格式
        price = item["当前售价"]
        if price == "价格异常" or not price.startswith("¥"):
            logger.warning(f"【{self.cookie_id}】价格格式异常: {price}")
            return False
        
        return True
    
    async def _save_to_db(self) -> Tuple[int, List[int]]:
        """
        逐条保存数据到数据库，若相同链接（按截取规则判断）的记录已存在则跳过，
        同时统计当前关键词下新增的记录数量，并返回新增记录的 id 列表
        
        Returns:
            (新增记录数, 新增记录ID列表)
        """
        new_records = 0
        new_ids = []
        
        for item in self.data_list:
            try:
                # 数据验证
                if not self._validate_product_data(item):
                    logger.debug(f"【{self.cookie_id}】跳过无效商品: {item.get('商品标题', '未知')}")
                    continue
                
                link = item["商品链接"]
                # 先截取链接内容
                unique_part = get_link_unique_key(link)
                # 计算唯一标识的 MD5 哈希值
                link_hash = get_md5(unique_part)
                
                # 检查是否已存在
                existing = db_manager.get_spider_product_by_hash(link_hash)
                if existing:
                    logger.debug(f"【{self.cookie_id}】商品已存在，跳过: {item['商品标题']}")
                    continue
                
                # 解析发布时间
                publish_time = None
                if item["发布时间"] != "未知时间":
                    try:
                        publish_time = datetime.strptime(item["发布时间"], "%Y-%m-%d %H:%M")
                    except:
                        pass
                
                # 保存新记录
                product_id = db_manager.save_spider_product(
                    title=item["商品标题"],
                    price=item["当前售价"],
                    area=item["发货地区"],
                    seller=item["卖家昵称"],
                    link=link,
                    link_hash=link_hash,
                    image_url=item["商品图片链接"],
                    publish_time=publish_time
                )
                
                if product_id:
                    new_records += 1
                    new_ids.append(product_id)
                    logger.debug(f"【{self.cookie_id}】新增商品: {item['商品标题']}")
                    
            except Exception as e:
                logger.error(f"【{self.cookie_id}】保存数据出错: {e}")
        
        return (new_records, new_ids)
    
    async def close(self):
        """关闭浏览器（持久化上下文版本）"""
        try:
            if self.context:
                await self.context.close()
                logger.info(f"【{self.cookie_id}】浏览器上下文已关闭（数据已保存）")
            if self.playwright:
                await self.playwright.stop()
            logger.info(f"【{self.cookie_id}】浏览器已关闭")
        except Exception as e:
            logger.error(f"【{self.cookie_id}】关闭浏览器失败: {e}")


# 便捷函数
async def search_xianyu_products(
    cookie_id: str,
    cookies_str: str,
    keyword: str,
    max_pages: int = 1,
    headless: bool = True,
    proxy: Optional[Dict] = None
) -> Tuple[int, int, List[int]]:
    """搜索闲鱼商品的便捷函数
    
    Args:
        cookie_id: 账号ID
        cookies_str: Cookie 字符串
        keyword: 搜索关键词
        max_pages: 最大页数
        headless: 是否无头模式
        proxy: 代理配置，格式：{"server": "http://proxy.com:8080", "username": "user", "password": "pass"}
        
    Returns:
        (总结果数, 新增记录数, 新增记录ID列表)
    """
    spider = XianyuProductSpider(cookie_id, cookies_str, headless, proxy)
    try:
        await spider.init_browser()
        await spider.login_with_cookie()
        return await spider.search_products(keyword, max_pages)
    finally:
        await spider.close()
