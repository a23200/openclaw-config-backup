"""
AI回复引擎模块
集成XianyuAutoAgent的AI回复功能到现有项目中

【P0/P1 最小化修改版】
- 修复 P1-1 (高成本): detect_intent 改为本地关键词
- 修复 P0-2 (部署陷阱): 移除客户端缓存，实现无状态
- 修复 P1-3 (健壮性): 增强 Gemini 消息格式化
- 遵照指示，未修复 P0-1 (议价竞争条件)
"""

import os
import json
import re
import time
import sqlite3
from datetime import datetime, timedelta
import requests  # 确保已导入
import threading
from typing import List, Dict, Optional
from loguru import logger
from openai import OpenAI
from db_manager import db_manager


class AIReplyEngine:
    """AI回复引擎"""
    
    def __init__(self):
        # 修复 P0-2: 移除有状态的缓存，以支持多进程部署
        # self.clients = {}  # 已移除
        # self.agents = {}   # 已移除
        # self.client_last_used = {}  # 已移除
        self._init_default_prompts()
        # 用于控制同一chat_id消息的串行处理
        self._chat_locks = {}
        self._chat_locks_lock = threading.Lock()
        self._remote_ai_failure_until = {}

    def _normalize_conversation_content(self, content: str) -> str:
        """规范化聊天内容，避免语音转写包装词干扰 AI 理解。"""
        text = str(content or '').strip()
        if not text:
            return ''
        return re.sub(r'^\[语音转文字\]\s*', '', text).strip()

    def _parse_conversation_timestamp(self, value: str) -> Optional[datetime]:
        text = str(value or '').strip()
        if not text:
            return None
        for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f'):
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue
        return None
    
    def _init_default_prompts(self):
        """初始化默认提示词"""
        self.default_prompts = {
            'classify': '''你是一个意图分类专家...（此提示词已不再被 detect_intent 使用）''',
            
            'price': '''你是一位长期在鱼鱼成交的真人卖家，擅长自然聊价，不要像客服机器人。
语言要求：口语化、自然、有温度，像微信聊天。
长度要求：优先1-2句，总字数控制在18-50字。
议价策略：
1. 根据议价次数递减优惠：第1次小幅优惠，第2次中等优惠，第3次最大优惠
2. 接近最大议价轮数时要坚持底线，强调商品价值
3. 优惠不能超过设定的最大百分比和金额
4. 语气要友好但坚定，突出商品优势
5. 如果答应给客户降价，必须让客户先下单不付款，并在同一句回复中告诉客户已经改好价格，提示其直接付款（例如："行，就按这个价，您先拍下别付款，我已经改好价了，您刷新直接付吧"）。
6. 如果不能再降，不要直接说“不议价”，改成“这个价已经压得比较低了”“基本到底了”这类更自然的说法。
注意：结合商品信息、对话历史和议价设置，先回答客户最关心的问题，再自然补一句引导。''',
            
            'tech': '''你是一位懂产品的真人卖家，回复要像真实聊天，不要像说明书。
语言要求：自然、清楚、口语化，优先1-2句，总字数18-50字。
回答重点：产品功能、使用方法、注意事项。
注意：基于商品信息回答，避免过度承诺。''',
            
            'default': '''你是一位真实的鱼鱼卖家，回复要自然、随和、像真人，不要像模板客服。
语言要求：口语化，优先1-2句，总字数18-50字。
回答重点：商品介绍、物流、售后等常见问题。
注意：先正面回答，再补一句自然衔接的话，不要生硬。'''
        }

    def _build_natural_system_prompt(self, base_prompt: str, intent: str, our_role: str = 'seller') -> str:
        """在原始提示词上追加统一的真人化表达约束。"""
        our_role = str(our_role or 'seller').strip() or 'seller'
        if our_role == 'buyer':
            style_rules = '''补充风格要求：
- 像真人买家聊天，像微信私聊，不像客服模板
- 以确认、追问、试探为主，少讲结论，多让对方继续提供信息
- 不要替卖家回答商品情况，不要主动说“还在”“成色全新”“可以直接拍”
- 不要说“我这边发货”“我给你改价”“售后我来跟进”这类卖家口吻
- 可以适度使用“哈、呀、呢、哦”等口语词，但不要每句都带
- 不要列清单，不要机械复述商品标题、价格、用户原话
- 尽量少用“您”，更像正常鱼鱼聊天里的“你”
- 不要暴露自己在做市场调研，也不要说自己也是卖家
- 优先围绕成色、配件、功能、价格空间、交易方式继续问
- 语气自然、真诚、像真实买家，不要像审问
'''
            intent_hints = {
                'price': '价格类问题：以买家口吻继续试探价格空间，不要替对方守价。',
                'tech': '技术类问题：以买家口吻确认细节、成色、功能状态，不要像卖家介绍商品。',
                'default': '普通咨询：以买家口吻顺着聊，核心是继续确认商品信息。'
            }
        else:
            style_rules = '''补充风格要求：
- 像真人卖家聊天，像微信对话，不像客服模板
- 优先先接住对方问题，再回答关键信息
- 可以适度使用“哈、呀、呢、哦”等口语词，但不要每句都带
- 不要列清单，不要机械复述商品标题、价格、用户原话
- 不要出现“本店”“亲”“系统检测到”“平台规定”等客服腔
- 尽量少用“您”，更像正常鱼鱼聊天里的“你”
- 不要说“建议您”“功能和服务都挺到位”“欢迎购买”这类营销腔
- 不要一直催拍，除非对方已经明确要买或问怎么下单
- 避免太硬的表达，如“不议价”“不能便宜”；需要坚持底线时，用更委婉自然的话
- 语气真诚、松弛、像真实成交中的卖家
'''
            intent_hints = {
                'price': '价格类问题：先回答是否还有、成色或核心卖点，再自然说明价格空间。',
                'tech': '技术类问题：像真人解释给对方听，别像参数表。',
                'default': '普通咨询：像正常聊天，别太满，给对方继续问的空间。'
            }
        hint = intent_hints.get(intent, intent_hints['default'])
        return f"{base_prompt}\n\n{style_rules}\n{hint}"

    def _get_buyer_mode_prompt(self, intent: str) -> str:
        prompts = {
            'price': '''你现在不是卖家，而是一个自然真实的买家，在和卖家聊价格。
语言要求：像真人私聊，口语化、自然、有来有回，优先1-2句，总字数18-50字。
沟通目标：
1. 询问价格空间、是否包邮、能否少一点，但不要显得咄咄逼人
2. 不要替卖家守价，不要说“我给你改价”“我这边发货”
3. 如果对方报价偏高，可以自然试探“还能少点吗”“最低多少方便出”
4. 不要暴露自己在做市场调研，不要说自己也是卖家
5. 如果对方反问你什么时候拍，可先说想确认细节、预算或收货方式''',
            'tech': '''你现在是买家，在向卖家确认商品细节。
语言要求：自然、口语化，优先1-2句，总字数18-50字。
沟通目标：重点确认成色、功能、电池、拆修、配件、保修、发货方式等，不要像审问，也不要像客服。''',
            'default': '''你现在是买家，在和卖家沟通商品是否还在、成色、配件、发货、价格空间等。
语言要求：自然、像真人聊天，优先1-2句，总字数18-50字。
沟通目标：以真实买家口吻继续追问关键信息，不要自称卖家，不要承诺发货或售后。''',
        }
        return prompts.get(intent, prompts['default'])

    def _build_role_scene_prompt(self, conversation_profile: Optional[dict]) -> str:
        profile = conversation_profile or {}
        our_role = str(profile.get('our_role') or 'seller').strip() or 'seller'
        counterpart_role = str(profile.get('counterpart_role') or ('seller' if our_role == 'buyer' else 'buyer')).strip()
        source = str(profile.get('source') or 'auto').strip()
        counterpart_name = str(profile.get('counterpart_name') or '').strip()
        item_title = str(profile.get('item_title') or '').strip()
        item_price = str(profile.get('item_price') or '').strip()

        counterpart_desc = counterpart_role
        if counterpart_name:
            counterpart_desc = f"{counterpart_role}（{counterpart_name}）"

        if our_role == 'buyer':
            return (
                f"当前对话场景：你代表当前账号，以买家身份在和{counterpart_desc}沟通。"
                f"来源：{source}。"
                "务必站在买家视角回复，不要把自己说成卖家，不要承诺发货、售后、改价。"
                "你的目标是自然确认商品是否靠谱、价格是否还有空间、交易方式是否合适。"
                f"{f' 当前关注商品：{item_title}。' if item_title else ''}"
                f"{f' 参考标价：{item_price}。' if item_price else ''}"
            )

        return (
            f"当前对话场景：你代表当前账号，以卖家身份在和{counterpart_desc}沟通。"
            "务必站在卖家视角回复，围绕商品介绍、成色、价格、发货、售后自然交流。"
        )

    def _polish_reply_text(self, reply: str) -> str:
        """轻量润色回复，尽量避免明显机器人腔。"""
        text = str(reply or '').strip().strip('"').strip("'")
        if not text:
            return text

        replacements = [
            ('不议价', '这价基本到底了'),
            ('不能再便宜了', '再便宜就真没什么空间了'),
            ('价格已经是最优惠的了', '这个价已经压得比较低了'),
            ('这个已经是实价了，喜欢可直接拍', '这个价已经比较实在了，喜欢的话可以直接拍'),
            ('可直接拍', '喜欢的话可以直接拍'),
            ('商品还在', '还在的哈'),
            ('建议您直接下单试试', '合适的话可以拍，我这边看到就安排'),
            ('直接下单试试', '合适的话可以拍，我这边看到就安排'),
            ('功能和服务都挺到位的', '该弄的都会给你弄好'),
            ('欢迎购买', '合适的话再拍就行'),
            ('在的，商品还在，想了解哪方面？', '在的哈，还在呢，你想看哪方面？'),
            ('在的，想了解商品哪方面？', '在的哈，你想先了解哪方面？'),
            ('您可以直接说需求', '你把需求发我，我看看怎么弄'),
            ('拍下后尽快发出，物流一般三天左右', '拍下我这边尽快发，正常三天左右能到'),
            ('有问题随时找我，我会协助处理', '有问题你随时找我，我这边会跟进处理'),
            ('实物如图，细节可再拍给您看', '实物就是这样的，你要的话我也可以再拍细节给你看'),
        ]
        for old, new in replacements:
            text = text.replace(old, new)

        if text.startswith('在的，'):
            text = text.replace('在的，', '在的哈，', 1)

        text = text.replace('在的哈，还在的哈', '在的哈，还在呢')
        text = re.sub(r'建议您([^。！？~～]*)', r'\1', text)
        text = text.replace('您', '你')
        text = re.sub(r'[\r\n]+', '', text)
        text = re.sub(r'[ \t]{2,}', ' ', text)
        text = re.sub(r'([。！？~～])\1+', r'\1', text)
        text = re.sub(r'([，,]){2,}', '，', text)
        return text.strip()

    def _generate_buyer_safe_followup(self, intent: str, item_info: Optional[dict] = None) -> str:
        """买家模式下的安全追问，避免模型滑回卖家口吻。"""
        title = str((item_info or {}).get('title') or '').strip()
        if intent == 'price':
            return "我这边还想再比一下，价格这边还有多少空间呀？"
        if intent == 'tech':
            if any(token in title for token in ('手机', 'iPhone', '苹果', '安卓', '平板', '电脑')):
                return "我这边主要想再确认下成色、功能和配件这些，方便说下吗？"
            return "我这边想再确认下具体细节和使用情况，方便说下吗？"
        if any(token in title for token in ('手机', 'iPhone', '苹果', '安卓', '平板', '电脑', '机箱')):
            return "嗯嗯，我这边主要想再确认下成色、配件这些，方便说下吗？"
        return "嗯嗯，我这边还想再确认下具体情况，方便说下吗？"

    def _ensure_role_consistent_reply(
        self,
        reply: str,
        intent: str,
        conversation_profile: Optional[dict] = None,
        item_info: Optional[dict] = None,
    ) -> str:
        """对买家模式回复做末端兜底，避免生成卖家口吻。"""
        profile = conversation_profile or {}
        our_role = str(profile.get('our_role') or 'seller').strip() or 'seller'
        normalized_reply = self._polish_reply_text(reply)
        if our_role != 'buyer':
            return normalized_reply

        lowered = normalized_reply.lower()
        seller_like_patterns = [
            '还在', '成色全新', '可以直接拍', '直接拍', '拍下', '我这边发', '尽快发',
            '包邮', '改价', '售后', '欢迎购买', '有问题你随时找我', '我给你', '支持代部署',
            '当天发货', '明天发货', '成色不错', '实物如图', '鱼鱼这边', '给你介绍',
            '今天下单', '来一波', '包装也挺讲究', '合适的话可以拍'
        ]
        if any(pattern in normalized_reply for pattern in seller_like_patterns) or any(
            pattern in lowered for pattern in ['can ship', 'in stock']
        ):
            guarded_reply = self._generate_buyer_safe_followup(intent, item_info)
            logger.warning(
                f"检测到买家模式回复疑似串成卖家口吻，已改写为安全追问: "
                f"{normalized_reply} -> {guarded_reply}"
            )
            return guarded_reply

        return normalized_reply
    
    def _create_openai_client(self, cookie_id: str) -> Optional[OpenAI]:
        """
        (原 get_client) 创建指定账号的OpenAI客户端
        修复 P0-2: 移除了缓存逻辑，以支持多进程无状态部署
        """
        settings = db_manager.get_ai_reply_settings(cookie_id)
        if not settings['ai_enabled'] or not settings['api_key']:
            return None
        
        try:
            logger.info(f"创建新的OpenAI客户端实例 {cookie_id}: base_url={settings['base_url']}, api_key={'***' + settings['api_key'][-4:] if settings['api_key'] else 'None'}")
            client = OpenAI(
                api_key=settings['api_key'],
                base_url=settings['base_url']
            )
            logger.info(f"为账号 {cookie_id} 创建OpenAI客户端成功，实际base_url: {client.base_url}")
            return client
        except Exception as e:
            logger.error(f"创建OpenAI客户端失败 {cookie_id}: {e}")
            return None

    def _is_dashscope_api(self, settings: dict) -> bool:
        """判断是否为DashScope API - 只有选择自定义模型时才使用"""
        model_name = settings.get('model_name', '')
        base_url = settings.get('base_url', '')

        is_custom_model = model_name.lower() in ['custom', '自定义', 'dashscope', 'qwen-custom']
        is_dashscope_url = 'dashscope.aliyuncs.com' in base_url

        logger.info(f"API类型判断: model_name={model_name}, is_custom_model={is_custom_model}, is_dashscope_url={is_dashscope_url}")

        return is_custom_model and is_dashscope_url

    def _is_gemini_api(self, settings: dict) -> bool:
        """判断是否为Gemini API (通过模型名称)"""
        model_name = settings.get('model_name', '').lower()
        return 'gemini' in model_name

    def _call_dashscope_api(self, settings: dict, messages: list, max_tokens: int = 100, temperature: float = 0.7) -> str:
        """调用DashScope API"""
        base_url = settings['base_url']
        if '/apps/' in base_url:
            app_id = base_url.split('/apps/')[-1].split('/')[0]
        else:
            raise ValueError("DashScope API URL中未找到app_id")

        url = f"https://dashscope.aliyuncs.com/api/v1/apps/{app_id}/completion"

        system_content = ""
        user_content = ""
        for msg in messages:
            if msg['role'] == 'system':
                system_content = msg['content']
            elif msg['role'] == 'user':
                user_content = msg['content'] # 假设 user prompt 已在 generate_reply 中构建好

        if system_content and user_content:
            prompt = f"{system_content}\n\n用户问题：{user_content}\n\n请直接回答用户的问题："
        elif user_content:
            prompt = user_content
        else:
            prompt = "\n".join([f"{msg['role']}: {msg['content']}" for msg in messages])

        data = {
            "input": {"prompt": prompt},
            "parameters": {"max_tokens": max_tokens, "temperature": temperature},
            "debug": {}
        }
        headers = {
            "Authorization": f"Bearer {settings['api_key']}",
            "Content-Type": "application/json"
        }

        logger.info(f"DashScope API请求: {url}")
        logger.info(f"发送的prompt: {prompt[:100]}...") # 避免 prompt 过长
        logger.debug(f"请求数据: {json.dumps(data, ensure_ascii=False)}")

        response = requests.post(url, headers=headers, json=data, timeout=30)

        if response.status_code != 200:
            logger.error(f"DashScope API请求失败: {response.status_code} - {response.text}")
            raise Exception(f"DashScope API请求失败: {response.status_code} - {response.text}")

        result = response.json()
        logger.debug(f"DashScope API响应: {json.dumps(result, ensure_ascii=False)}")

        if 'output' in result and 'text' in result['output']:
            return result['output']['text'].strip()
        else:
            raise Exception(f"DashScope API响应格式错误: {result}")

    def _call_gemini_api(self, settings: dict, messages: list, max_tokens: int = 100, temperature: float = 0.7) -> str:
        """
        调用Google Gemini REST API (v1beta)
        """
        api_key = settings['api_key']
        model_name = settings['model_name'] 
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

        headers = {"Content-Type": "application/json"}

        # --- 转换消息格式 (修复 P1-3: 增强健壮性) ---
        system_instruction = ""
        user_content_parts = []

        # 遍历消息，找到 system 和所有的 user parts
        for msg in messages:
            if msg['role'] == 'system':
                system_instruction = msg['content']
            elif msg['role'] == 'user':
                # 我们只关心 user content
                user_content_parts.append(msg['content'])
        
        # 将所有 user parts 合并为最后的 user_content
        # 在我们的使用场景中 (generate_reply)，只会有一个 user part，但这样更安全
        user_content = "\n".join(user_content_parts)

        if not user_content:
            logger.warning(f"Gemini API 调用: 未在消息中找到 'user' 角色内容。Messages: {messages}")
            raise ValueError("未在消息中找到用户内容 (user content)")
        # --- 消息格式转换结束 ---

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_content}]
                }
            ],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }
        
        if system_instruction:
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        logger.info(f"Calling Gemini REST API: {url.split('?')[0]}")
        logger.debug(f"Gemini Payload: {json.dumps(payload, ensure_ascii=False)}")
        
        response = requests.post(url, headers=headers, json=payload, timeout=30)

        if response.status_code != 200:
            logger.error(f"Gemini API 请求失败: {response.status_code} - {response.text}")
            raise Exception(f"Gemini API 请求失败: {response.status_code} - {response.text}")
            
        result = response.json()
        logger.debug(f"Gemini API 响应: {json.dumps(result, ensure_ascii=False)}")

        try:
            reply_text = result['candidates'][0]['content']['parts'][0]['text']
            return reply_text.strip()
        except (KeyError, IndexError, TypeError) as e:
            logger.error(f"Gemini API 响应格式错误: {result} - {e}")
            raise Exception(f"Gemini API 响应格式错误: {result}")

    def _call_openai_api(self, client: OpenAI, settings: dict, messages: list, max_tokens: int = 100, temperature: float = 0.7) -> str:
        """调用OpenAI兼容API"""
        try:
            logger.info(f"调用OpenAI API: model={settings['model_name']}, base_url={settings.get('base_url', 'default')}")
            response = client.chat.completions.create(
                model=settings['model_name'],
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"OpenAI API调用失败: {e}")
            # 如果有详细的错误信息，打印出来
            if hasattr(e, 'response'):
                logger.error(f"响应状态码: {getattr(e.response, 'status_code', 'unknown')}")
                logger.error(f"响应内容: {getattr(e.response, 'text', 'unknown')}")
            raise

    def is_ai_enabled(self, cookie_id: str) -> bool:
        """检查指定账号是否启用AI回复"""
        settings = db_manager.get_ai_reply_settings(cookie_id)
        return settings['ai_enabled']

    def _format_money(self, value: float) -> str:
        """格式化价格，避免出现多余小数。"""
        try:
            number = float(value)
            return str(int(number)) if number.is_integer() else f"{number:.2f}".rstrip('0').rstrip('.')
        except Exception:
            return str(value)

    def _short_reply(self, reply: str, max_length: int = 42) -> str:
        """压缩本地兜底回复，保持客服话术简短。"""
        reply = re.sub(r'\s+', '', str(reply or '').strip())
        if len(reply) <= max_length:
            return reply
        return reply[:max_length].rstrip('，。,.') + '…'

    def _match_item_knowledge(self, message: str, knowledge: str) -> Optional[str]:
        """从商品知识库里做轻量匹配，用作外部AI不可用时的本地回答。"""
        if not knowledge:
            return None

        message_text = str(message or '').strip().lower()
        if not message_text:
            return None

        qa_pairs = re.findall(
            r'Q[:：]\s*(.*?)\s*A[:：]\s*(.*?)(?=\n\s*Q[:：]|\Z)',
            knowledge,
            flags=re.IGNORECASE | re.DOTALL,
        )
        for question, answer in qa_pairs:
            answer = answer.strip()
            if not answer:
                continue
            question_text = question.strip().lower()
            terms = [
                term for term in re.split(r'[\s,，。？?！!；;、/]+', question_text)
                if term
            ]
            if question_text and (question_text in message_text or any(term in message_text for term in terms)):
                return self._short_reply(answer)

        compact_knowledge = re.sub(r'\s+', ' ', knowledge).strip()
        if compact_knowledge and len(compact_knowledge) <= 40:
            return self._short_reply(compact_knowledge)
        return None

    def _get_item_text_for_fallback(self, item_info: dict, knowledge: str = '') -> str:
        """汇总商品标题、描述、知识库文本，供本地兜底做关键词判断。"""
        item_info = item_info or {}
        parts = [
            str(item_info.get('title') or ''),
            str(item_info.get('desc') or ''),
            str(knowledge or ''),
        ]
        return ' '.join(parts).lower()

    def _extract_value_from_item_text(self, item_text: str, keys: List[str]) -> Optional[str]:
        """从知识库/描述中提取类似“成色：基本全新”的短答案。"""
        if not item_text:
            return None
        patterns = []
        for key in keys:
            patterns.extend([
                rf'{re.escape(key)}\s*[:：]\s*([^\n；;。,.，]{{1,30}})',
                rf'{re.escape(key)}\s*[是为]\s*([^\n；;。,.，]{{1,30}})',
            ])
        for pattern in patterns:
            m = re.search(pattern, item_text, flags=re.IGNORECASE)
            if m:
                value = m.group(1).strip()
                if value:
                    return value
        return None

    def _contains_any(self, text: str, keywords: List[str]) -> bool:
        return any(keyword in text for keyword in keywords)

    def _generate_price_fallback(self, item_info: dict, settings: dict, bargain_count: int) -> str:
        """生成本地议价兜底回复，严格遵守已配置的优惠上限。"""
        try:
            price = float(item_info.get('price') or 0)
        except Exception:
            price = 0.0

        try:
            max_discount_percent = float(settings.get('max_discount_percent') or 0)
            max_discount_amount = float(settings.get('max_discount_amount') or 0)
            max_bargain_rounds = max(int(settings.get('max_bargain_rounds') or 3), 1)
        except Exception:
            max_discount_percent = 0
            max_discount_amount = 0
            max_bargain_rounds = 3

        if bargain_count >= max_bargain_rounds:
            return "这个价已经比较实在了，喜欢的话可以直接拍"

        discount_candidates = []
        if max_discount_amount > 0:
            discount_candidates.append(max_discount_amount)
        if price > 0 and max_discount_percent > 0:
            discount_candidates.append(price * max_discount_percent / 100)

        max_discount = min(discount_candidates) if discount_candidates else 0
        if max_discount <= 0:
            return "这个价已经压得比较低了，喜欢的话可以直接拍"

        current_round = min(bargain_count + 1, max_bargain_rounds)
        if current_round >= max_bargain_rounds:
            offer = max_discount
        else:
            offer = max_discount * min(0.35 + (current_round - 1) * 0.25, 0.8)

        if price >= 10:
            offer = max(1, round(offer))
        else:
            offer = round(offer, 1)

        if offer <= 0:
            return "价格这边已经尽量让了，您也可以说下心理价"
        return f"这边能少{self._format_money(offer)}元，您先拍下别付款，我给您改价"

    def _generate_local_fallback_reply(
        self,
        message: str,
        item_info: dict,
        intent: str,
        settings: dict,
        bargain_count: int,
        cookie_id: str,
        item_id: str,
        conversation_profile: Optional[dict] = None,
    ) -> str:
        """外部AI不可用时的本地智能兜底回复。"""
        message_text = str(message or '').strip().lower()
        item_info = item_info or {}
        title = str(item_info.get('title') or '').strip()
        desc = str(item_info.get('desc') or '').strip()
        profile = conversation_profile or {}
        our_role = str(profile.get('our_role') or 'seller').strip() or 'seller'

        ai_knowledge = db_manager.get_item_ai_knowledge(cookie_id, item_id) or ''
        knowledge_answer = self._match_item_knowledge(
            message,
            ai_knowledge,
        )
        if knowledge_answer:
            return knowledge_answer

        item_text = self._get_item_text_for_fallback(item_info, ai_knowledge)
        seller_positive = self._contains_any(item_text, ['全新', '基本全新', '99新', '九九新', '95新', '九五新', '无拆修', '无维修', '功能正常'])
        seller_defect = self._contains_any(item_text, ['瑕疵', '磕碰', '划痕', '维修', '拆修', '坏', '故障'])
        condition_value = self._extract_value_from_item_text(item_text, ['成色', '新旧', '品相', '状态'])
        accessory_value = self._extract_value_from_item_text(item_text, ['配件', '附件', '包含', '带'])

        if our_role == 'buyer':
            if intent == 'price':
                return "我这边还想看看，价格还有多少空间呀？"
            if any(keyword in message_text for keyword in ['发货', '多久到', '几天到', '包邮', '邮费']):
                return "明白哈，我这边主要想再确认下成色和配件这些，方便说下吗？"
            if any(keyword in message_text for keyword in ['要吗', '要不要', '下单', '拍下', '拍吗']):
                return "我这边还在看，主要想再确认下具体成色和配件哈。"
            if any(keyword in message_text for keyword in ['成色', '功能', '配件', '电池', '拆修', '瑕疵']):
                return "嗯嗯，这块我比较关心，方便你具体说下吗？"
            return self._generate_buyer_safe_followup(intent, item_info)

        if intent == 'price':
            return self._generate_price_fallback(item_info, settings, bargain_count)

        if self._contains_any(message_text, ['在不', '在吗', '在嘛', '老板在', '还在', '有货']):
            if '部署' in title or '代部署' in title:
                return "在的哈，支持代部署，您可以直接说需求"
            return "在的哈，还在的"

        if self._contains_any(message_text, ['包邮', '邮费', '运费']):
            if '包邮' in item_text:
                return "包邮的哈，拍下后我这边尽快发"
            return "邮费这块按页面为准哈，拍下后我这边尽快发"

        if self._contains_any(message_text, ['发货', '多久到', '几天到', '快递', '什么时候发']):
            if '包邮' in item_text:
                return "包邮的哈，拍下后我这边尽快发"
            return "拍下后我这边尽快发，正常三天左右能到"

        if self._contains_any(message_text, ['怎么用', '教程', '使用', '安装', '部署', '能教', '设置']):
            if '部署' in title or '代部署' in title:
                return "支持远程协助，拍下后我这边带您部署"
            return "拍下后会发教程，有问题您随时问我"

        if self._contains_any(message_text, ['售后', '保修', '质保']):
            return "售后这块可以放心，收到有问题及时跟我说"

        if self._contains_any(message_text, ['坏了', '故障', '功能正常', '能用', '好用吗', '有问题吗']):
            if seller_positive:
                return "功能正常的哈，这个可以放心"
            return "功能这边是正常使用的，具体以实物描述和图片为准哈"

        if self._contains_any(message_text, ['全新吗', '基本全新', '成色', '几新', '新不新', '瑕疵', '划痕', '磕碰']):
            if condition_value:
                return self._short_reply(f"成色是{condition_value}哈，实物状态可以看图")
            if seller_positive and not seller_defect:
                return "成色挺新的哈，实物状态可以看图"
            if seller_defect:
                return "成色按图里为准哈，有细节问题我可以再给你确认"
            return "成色还可以的，实物状态可以看图哈"

        if self._contains_any(message_text, ['内存卡', 'sd卡', 'tf卡', '卡吗', '带卡', '配件', '附件', '电源', '充电器', '包装']):
            if accessory_value:
                return self._short_reply(f"配件是{accessory_value}哈")
            if self._contains_any(item_text, ['内存卡', 'sd卡', 'tf卡']):
                return "带不带卡按描述里的为准哈，我这边也可以再帮你确认下"
            return "配件按图和描述里的来哈，没有写的一般是不含"

        if '部署' in title or '代部署' in title:
            return "在的哈，支持代部署，您可以直接说需求"

        return "在的哈，您想先了解哪方面？"

    def _save_local_fallback_reply(
        self,
        reason: str,
        message: str,
        item_info: dict,
        chat_id: str,
        cookie_id: str,
        user_id: str,
        item_id: str,
        intent: str,
        settings: dict,
        bargain_count: int,
        save_reply: bool = True,
        conversation_profile: Optional[dict] = None,
    ) -> str:
        """保存并返回本地兜底回复。"""
        reply = self._generate_local_fallback_reply(
            message=message,
            item_info=item_info,
            intent=intent,
            settings=settings,
            bargain_count=bargain_count,
            cookie_id=cookie_id,
            item_id=item_id,
            conversation_profile=conversation_profile,
        )
        reply = self._ensure_role_consistent_reply(reply, intent, conversation_profile, item_info)
        if save_reply:
            self.save_conversation(chat_id, cookie_id, user_id, item_id, "assistant", reply, intent)
        logger.warning(f"【{cookie_id}】外部AI不可用，已使用本地智能兜底回复（{reason}）: {reply}")
        return reply
    
    def detect_intent(self, message: str, cookie_id: str) -> str:
        """
        检测用户消息意图 (基于关键词的本地检测)
        修复 P1-1: 移除了AI调用，以降低成本和延迟。
        """
        try:
            # 检查AI是否启用，如果未启用，不应执行任何AI相关逻辑
            # 注意：此检查在 generate_reply 的开头已经做过，但保留此处作为第二道防线
            settings = db_manager.get_ai_reply_settings(cookie_id)
            if not settings['ai_enabled']:
                return 'default'

            msg_lower = message.lower()

            # 价格相关关键词
            price_keywords = [
                '便宜', '优惠', '刀', '降价', '包邮', '价格', '多少钱', '能少', '还能', '最低', '底价',
                '实诚价', '到100', '能到', '包个邮', '给个价', '什么价' # <-- 增加这些“口语化”的词
            ]
            
            # 同样，你也可以通过正则表达式来匹配纯数字，比如 "100" "80"
            # 但那可能有点复杂，先加关键词是最小改动
            if any(kw in msg_lower for kw in price_keywords):
                logger.debug(f"本地意图检测: price ({message})")
                return 'price'

            # 技术相关关键词
            tech_keywords = ['怎么用', '参数', '坏了', '故障', '设置', '说明书', '功能', '用法', '教程', '驱动']
            if any(kw in msg_lower for kw in tech_keywords):
                logger.debug(f"本地意图检测: tech ({message})")
                return 'tech'
            
            logger.debug(f"本地意图检测: default ({message})")
            return 'default'
        
        except Exception as e:
            logger.error(f"本地意图检测失败 {cookie_id}: {e}")
            return 'default'
    
    def _get_chat_lock(self, chat_id: str) -> threading.Lock:
        """获取指定chat_id的锁，如果不存在则创建"""
        with self._chat_locks_lock:
            if chat_id not in self._chat_locks:
                self._chat_locks[chat_id] = threading.Lock()
            return self._chat_locks[chat_id]
    
    def generate_reply(self, message: str, item_info: dict, chat_id: str,
                      cookie_id: str, user_id: str, item_id: str,
                      skip_wait: bool = False,
                      message_created_at: str = None,
                      skip_user_message_save: bool = False,
                      skip_assistant_message_save: bool = False,
                      conversation_profile: Optional[dict] = None) -> Optional[str]:
        """生成AI回复"""
        if not self.is_ai_enabled(cookie_id):
            return None
        
        try:
            # 先检测意图（用于后续保存）
            intent = self.detect_intent(message, cookie_id)
            logger.info(f"检测到意图: {intent} (账号: {cookie_id})")
            
            # 在锁外先保存用户消息到数据库，让所有消息都能立即保存
            if skip_user_message_save:
                if message_created_at:
                    logger.info(
                        f"【{cookie_id}】复用外部已记录的用户消息时间，跳过重复保存: "
                        f"{message[:20]}... (时间:{message_created_at})"
                    )
                else:
                    logger.warning(f"【{cookie_id}】未提供外部消息时间，回退为内部保存用户消息")
                    message_created_at = self.save_conversation(
                        chat_id,
                        cookie_id,
                        user_id,
                        item_id,
                        "user",
                        message,
                        intent,
                    )
            else:
                message_created_at = self.save_conversation(
                    chat_id,
                    cookie_id,
                    user_id,
                    item_id,
                    "user",
                    message,
                    intent,
                    created_at=message_created_at,
                )
            
            # 如果调用方已经实现了去抖（debounce），可以通过 skip_wait=True 跳过内部等待
            if not skip_wait:
                logger.info(f"【{cookie_id}】消息已保存，等待10秒收集后续消息: {message[:20]}... (时间:{message_created_at})")
                # 固定等待10秒，等待可能的后续消息（在锁外延迟，避免阻塞其他消息保存）
                time.sleep(10)
            else:
                logger.info(f"【{cookie_id}】消息已保存（外部防抖已启用，跳过内部等待）: {message[:20]}... (时间:{message_created_at})")
            
            # 获取该chat_id的锁，确保同一对话的消息串行处理
            chat_lock = self._get_chat_lock(chat_id)
            
            # 使用锁确保同一chat_id的消息串行处理
            with chat_lock:
                # 获取最近时间窗口内的所有用户消息
                # 如果 skip_wait=True（外部防抖），查询窗口为6秒（1秒防抖 + 5秒缓冲）
                # 如果 skip_wait=False（内部等待），查询窗口为25秒（10秒等待 + 10秒消息间隔 + 5秒缓冲）
                query_seconds = 6 if skip_wait else 25
                recent_messages = self._get_recent_user_messages(chat_id, cookie_id, seconds=query_seconds)
                logger.info(f"【{cookie_id}】最近{query_seconds}秒内的消息: {[msg['content'][:20] for msg in recent_messages]}")
                
                if recent_messages and len(recent_messages) > 0:
                    # 只处理最后一条消息（时间戳最新的）
                    latest_message = recent_messages[-1]
                    if message_created_at != latest_message['created_at']:
                        logger.info(f"【{cookie_id}】检测到有更新的消息，跳过当前消息: {message[:20]}... (时间:{message_created_at})，最新消息: {latest_message['content'][:20]}... (时间:{latest_message['created_at']})")
                        return None
                    else:
                        logger.info(f"【{cookie_id}】当前消息是最新消息，开始处理: {message[:20]}... (时间:{message_created_at})")
                
                # 1. 获取AI回复设置
                settings = db_manager.get_ai_reply_settings(cookie_id)

                # 3. 获取对话历史
                context = self.get_conversation_context(chat_id, cookie_id)

                # 4. 获取议价次数
                bargain_count = self.get_bargain_count(chat_id, cookie_id)

                # 5. 检查议价轮数限制 (P0-1 竞争条件风险点 - 遵照指示未修改)
                if intent == "price":
                    max_bargain_rounds = settings.get('max_bargain_rounds', 3)
                    if bargain_count >= max_bargain_rounds:
                        logger.info(f"议价次数已达上限 ({bargain_count}/{max_bargain_rounds})，拒绝继续议价")
                        refuse_reply = self._polish_reply_text("这个价已经压得比较低了，再少就真没空间了")
                        if not skip_assistant_message_save:
                            self.save_conversation(chat_id, cookie_id, user_id, item_id, "assistant", refuse_reply, intent)
                        return refuse_reply

                if not settings.get('api_key'):
                    return self._save_local_fallback_reply(
                        "未配置API Key",
                        message, item_info, chat_id, cookie_id, user_id, item_id,
                        intent, settings, bargain_count,
                        conversation_profile=conversation_profile,
                        save_reply=not skip_assistant_message_save,
                    )

                remote_failure_until = self._remote_ai_failure_until.get(cookie_id, 0)
                if time.time() < remote_failure_until:
                    remaining = int(remote_failure_until - time.time())
                    return self._save_local_fallback_reply(
                        f"远程鉴权失败冷却中，剩余{remaining}秒",
                        message, item_info, chat_id, cookie_id, user_id, item_id,
                        intent, settings, bargain_count,
                        conversation_profile=conversation_profile,
                        save_reply=not skip_assistant_message_save,
                    )

                # 6. 构建提示词
                custom_prompts = json.loads(settings['custom_prompts']) if settings['custom_prompts'] else {}
                profile = conversation_profile or db_manager.get_conversation_profile(
                    cookie_id,
                    chat_id=chat_id,
                    counterpart_user_id=user_id,
                    item_id=item_id,
                ) or {}
                our_role = str(profile.get('our_role') or 'seller').strip() or 'seller'
                base_prompt = self._get_buyer_mode_prompt(intent) if our_role == 'buyer' else custom_prompts.get(intent, self.default_prompts[intent])
                system_prompt = self._build_natural_system_prompt(base_prompt, intent, our_role)
                system_prompt = f"{system_prompt}\n\n{self._build_role_scene_prompt(profile)}"

                if our_role == 'buyer':
                    filtered_context = []
                    skip_markers = (
                        '[请不要脱离闲鱼沟通及交易]',
                        '想要卖家更快回复？平台帮你催促，点击“叮一下”',
                    )
                    seller_like_patterns = (
                        '还在', '成色全新', '可以直接拍', '直接拍', '拍下',
                        '我这边发', '尽快发', '包邮', '改价', '售后', '欢迎购买',
                        '鱼鱼这边', '给你介绍', '今天下单', '来一波', '包装也挺讲究',
                        '合适的话可以拍',
                    )
                    for msg in context:
                        role = str(msg.get('role') or '').strip()
                        content = self._normalize_conversation_content(msg.get('content') or '')
                        if not content:
                            continue
                        if role == 'user' and any(marker in content for marker in skip_markers):
                            continue
                        if role == 'assistant' and any(pattern in content for pattern in seller_like_patterns):
                            logger.info(f"【{cookie_id}】买家模式已过滤历史卖家口吻上下文: {content[:40]}")
                            continue
                        filtered_context.append(msg)
                    context = filtered_context

                
                # 7. 构建商品信息
                item_desc = f"商品标题: {item_info.get('title', '未知')}\n"
                item_desc += f"商品价格: {item_info.get('price', '未知')}元\n"
                item_desc += f"商品描述: {item_info.get('desc', '无')}\n"
                if profile:
                    if profile.get('counterpart_name'):
                        item_desc += f"对方身份: {profile.get('counterpart_role', '对方')}（{profile.get('counterpart_name')}）\n"
                    if profile.get('source'):
                        item_desc += f"会话来源: {profile.get('source')}\n"
                
                # 获取商品专属知识库
                ai_knowledge = db_manager.get_item_ai_knowledge(cookie_id, item_id)
                if ai_knowledge:
                    item_desc += f"\n【商品专属知识库/话术/底线规则】:\n{ai_knowledge}\n(注：回复客户时请优先遵守以上专属知识库中的规定和预设话术)"


                # 8. 构建对话历史
                context_str = "\n".join([f"{msg['role']}: {msg['content']}" for msg in context[-10:]])  # 最近10条

                # 9. 构建用户消息
                max_bargain_rounds = settings.get('max_bargain_rounds', 3)
                max_discount_percent = settings.get('max_discount_percent', 10)
                max_discount_amount = settings.get('max_discount_amount', 100)

                user_prompt = f"""商品信息：
{item_desc}

对话历史：
{context_str}

议价设置：
- 当前议价次数：{bargain_count}
- 最大议价轮数：{max_bargain_rounds}
- 最大优惠百分比：{max_discount_percent}%
- 最大优惠金额：{max_discount_amount}元

用户消息：{message}

请根据以上信息生成回复："""

                # 10. 调用AI生成回复
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ]

                reply = None # 初始化 reply 变量

                # -- [核心调试代码块] --
                # 统一使用 requests 手动调用，以获得最详细的日志
                logger.info(f"统一使用手动方式调用OpenAI兼容API...")
                
                api_key = settings['api_key']
                base_url = settings['base_url']
                model_name = settings['model_name']
                
                # 兼容 qwen 的 v1 路径
                if 'aliyuncs.com' in base_url and not base_url.endswith(('/v1', '/v1/')):
                    base_url = base_url.rstrip('/') + '/v1'
                
                url = f"{base_url.rstrip('/')}/chat/completions"
                
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                
                payload = {
                    "model": model_name,
                    "messages": messages,
                    "max_tokens": 100,
                    "temperature": 0.85
                }
                
                # 为了调试，显式打印所有请求参数
                safe_headers = headers.copy()
                if 'Authorization' in safe_headers:
                    safe_headers['Authorization'] = f"Bearer ...{safe_headers['Authorization'][-8:]}"
                
                logger.info(f"【AI请求详情】-->")
                logger.info(f"  URL: {url}")
                logger.info(f"  Headers: {safe_headers}")
                logger.info(f"  Payload: {json.dumps(payload, ensure_ascii=False)}")
                logger.info(f"<-- 【AI请求详情】")
                
                try:
                    logger.debug(f"【AI引擎】准备发送请求到: {url}")
                    logger.debug(f"【AI引擎】请求头: {json.dumps(safe_headers, indent=2)}")
                    logger.debug(f"【AI引擎】请求体 (Payload): {json.dumps(payload, ensure_ascii=False, indent=2)}")
                    # 外部模型不可达时不能长时间阻塞闲鱼自动回复；失败后会走本地智能兜底。
                    response = requests.post(url, headers=headers, json=payload, timeout=12)
                    
                    logger.debug(f"【AI引擎】收到响应 - 状态码: {response.status_code}")
                    logger.debug(f"【AI引擎】收到响应 - 原始文本 (Raw Text): '{response.text}'")
                    logger.debug(f"【AI引擎】收到响应 - 响应头: {json.dumps(dict(response.headers), indent=2)}")

                    response.raise_for_status()  # 如果状态码不是2xx，将抛出HTTPError
                    
                    # 检查响应内容是否为空
                    if not response.text or not response.text.strip():
                        logger.error("【AI引擎】API返回了成功状态码，但响应体为空。")
                        raise ValueError("API returned an empty response body.")

                    result = response.json()
                    logger.debug(f"API成功返回JSON: {json.dumps(result, ensure_ascii=False)}")
                    reply = self._ensure_role_consistent_reply(
                        result['choices'][0]['message']['content'].strip(),
                        intent,
                        profile,
                        item_info,
                    )

                except requests.exceptions.HTTPError as http_err:
                    logger.error(f"【AI引擎】HTTP错误: {http_err}")
                    logger.error(f"【AI引擎】响应内容: {response.text}")
                    if response.status_code in (401, 403):
                        self._remote_ai_failure_until[cookie_id] = time.time() + 1800
                        logger.warning(f"【{cookie_id}】外部AI鉴权失败，30分钟内自动使用本地智能兜底")
                    raise
                except requests.exceptions.RequestException as req_err:
                    logger.error(f"【AI引擎】请求失败: {req_err}")
                    self._remote_ai_failure_until[cookie_id] = time.time() + 300
                    logger.warning(f"【{cookie_id}】外部AI网络异常，5分钟内自动使用本地智能兜底，避免每条消息长时间等待")
                    raise
                except ValueError as val_err: # 捕获我们自己抛出的空响应体错误
                    logger.error(f"【AI引擎】值错误: {val_err}")
                    raise
                except (json.JSONDecodeError, KeyError, IndexError):
                    logger.error(f"API返回的不是有效的JSON或格式不正确。")
                    logger.error(f"原始响应内容: {response.text}")
                    raise Exception("API响应内容非JSON或格式错误")
                except Exception as e:
                    logger.error(f"【AI引擎】解析响应时发生未知错误: {e}")
                    logger.error(f"【AI引擎】原始响应内容: {response.text if 'response' in locals() else 'N/A'}")
                    raise
                # -- [核心调试代码块结束] --

                # 11. 保存AI回复到对话记录
                if not skip_assistant_message_save:
                    self.save_conversation(chat_id, cookie_id, user_id, item_id, "assistant", reply, intent)

                # 12. 更新议价次数 (此方法已在 get_bargain_count 中通过 SQL COUNT(*) 隐式实现)
                if intent == "price":
                    # self.increment_bargain_count(chat_id, cookie_id) # 此行原先就没有，保持不变
                    pass
                
                logger.info(f"AI回复生成成功 (账号: {cookie_id}): {reply}")
                return reply
                
        except Exception as e:
            logger.error(f"AI回复生成失败 {cookie_id}: {e}")
            if hasattr(e, 'response') and hasattr(e.response, 'url'):
                logger.error(f"请求URL: {e.response.url}")
            if hasattr(e, 'request') and hasattr(e.request, 'url'):
                logger.error(f"请求URL: {e.request.url}")
            try:
                fallback_settings = locals().get('settings') or db_manager.get_ai_reply_settings(cookie_id)
                fallback_intent = locals().get('intent') or 'default'
                fallback_bargain_count = locals().get('bargain_count')
                if fallback_bargain_count is None:
                    fallback_bargain_count = self.get_bargain_count(chat_id, cookie_id)
                return self._save_local_fallback_reply(
                    "远程调用失败",
                    message, item_info, chat_id, cookie_id, user_id, item_id,
                    fallback_intent, fallback_settings, fallback_bargain_count,
                    conversation_profile=conversation_profile,
                    save_reply=not skip_assistant_message_save,
                )
            except Exception as fallback_error:
                logger.error(f"本地智能兜底回复失败 {cookie_id}: {fallback_error}")
            return None

    async def generate_reply_async(self, message: str, item_info: dict, chat_id: str,
                                   cookie_id: str, user_id: str, item_id: str,
                                   skip_wait: bool = False,
                                   message_created_at: str = None,
                                   skip_user_message_save: bool = False,
                                   skip_assistant_message_save: bool = False,
                                   conversation_profile: Optional[dict] = None) -> Optional[str]:
        """
        异步包装器：在独立线程池中执行同步的 `generate_reply`，并返回结果。
        这样可以在异步代码中直接 await，而不阻塞事件循环。
        """
        try:
            import asyncio as _asyncio
            return await _asyncio.to_thread(
                self.generate_reply,
                message=message,
                item_info=item_info,
                chat_id=chat_id,
                cookie_id=cookie_id,
                user_id=user_id,
                item_id=item_id,
                skip_wait=skip_wait,
                message_created_at=message_created_at,
                skip_user_message_save=skip_user_message_save,
                skip_assistant_message_save=skip_assistant_message_save,
                conversation_profile=conversation_profile,
            )
        except Exception as e:
            logger.error(f"异步生成回复失败: {e}")
            return None
    
    def get_conversation_context(self, chat_id: str, cookie_id: str, limit: int = 20) -> List[Dict]:
        """获取对话上下文"""
        try:
            with db_manager.lock:
                cursor = db_manager.conn.cursor()
                cursor.execute('''
                SELECT role, content FROM ai_conversations 
                WHERE chat_id = ? AND cookie_id = ? 
                ORDER BY created_at DESC LIMIT ?
                ''', (chat_id, cookie_id, limit))
                
                results = cursor.fetchall()
                context = [
                    {"role": row[0], "content": self._normalize_conversation_content(row[1])}
                    for row in reversed(results)
                ]
                return context
        except Exception as e:
            logger.error(f"获取对话上下文失败: {e}")
            return []
    
    def save_conversation(self, chat_id: str, cookie_id: str, user_id: str,
                         item_id: str, role: str, content: str, intent: str = None,
                         created_at: str = None) -> Optional[str]:
        """保存对话记录，返回创建时间"""
        try:
            return db_manager.save_conversation(
                cookie_id=cookie_id,
                chat_id=chat_id,
                user_id=user_id,
                item_id=item_id,
                role=role,
                content=content,
                intent=intent,
                created_at=created_at,
            )
        except Exception as e:
            logger.error(f"保存对话记录失败: {e}")
            return None
    def get_bargain_count(self, chat_id: str, cookie_id: str) -> int:
        """获取议价次数"""
        try:
            with db_manager.lock:
                cursor = db_manager.conn.cursor()
                cursor.execute('''
                SELECT COUNT(*) FROM ai_conversations 
                WHERE chat_id = ? AND cookie_id = ? AND intent = 'price' AND role = 'user'
                ''', (chat_id, cookie_id))
                
                result = cursor.fetchone()
                return result[0] if result else 0
        except Exception as e:
            logger.error(f"获取议价次数失败: {e}")
            return 0
    
    def _get_recent_user_messages(self, chat_id: str, cookie_id: str, seconds: int = 2) -> List[Dict]:
        """获取最近seconds秒内的所有用户消息（包含内容和时间戳）"""
        try:
            with db_manager.lock:
                cursor = db_manager.conn.cursor()
                now = datetime.now()
                lower_bound = (now - timedelta(seconds=seconds)).strftime('%Y-%m-%d %H:%M:%S')
                upper_bound = now.strftime('%Y-%m-%d %H:%M:%S')

                cursor.execute('''
                SELECT content, created_at
                FROM ai_conversations 
                WHERE chat_id = ? AND cookie_id = ? AND role = 'user' 
                ORDER BY created_at DESC LIMIT 10
                ''', (chat_id, cookie_id))
                
                all_messages = cursor.fetchall()
                debug_messages = []
                for content, created_at in all_messages:
                    created_at_dt = self._parse_conversation_timestamp(created_at)
                    diff_seconds = (now - created_at_dt).total_seconds() if created_at_dt else float('nan')
                    diff_label = f'{diff_seconds:.2f}秒前' if created_at_dt else '时间解析失败'
                    debug_messages.append((content[:10], created_at, diff_label))
                logger.info(f"【调试】chat_id={chat_id} 最近10条user消息: {debug_messages}")

                cursor.execute('''
                SELECT content, created_at FROM ai_conversations 
                WHERE chat_id = ? AND cookie_id = ? AND role = 'user' 
                  AND created_at >= ? AND created_at <= ?
                ORDER BY created_at ASC
                ''', (chat_id, cookie_id, lower_bound, upper_bound))
                
                results = cursor.fetchall()
                return [{"content": row[0], "created_at": row[1]} for row in results]
        except Exception as e:
            logger.error(f"获取最近用户消息列表失败: {e}")
            return []
    
    def increment_bargain_count(self, chat_id: str, cookie_id: str):
        """(此方法已废弃，通过 get_bargain_count 的 SQL 查询实现)"""
        pass
    
    #
    # --- 修复 P0-2: 移除所有有状态的缓存管理方法 ---
    #
    
    # def clear_client_cache(self, cookie_id: str = None):
    #     """(已移除) 清理客户端缓存"""
    #     pass
    
    # def cleanup_unused_clients(self, max_idle_hours: int = 24):
    #     """(已移除) 清理长时间未使用的客户端"""
    #     pass


# 全局AI回复引擎实例
ai_reply_engine = AIReplyEngine()
