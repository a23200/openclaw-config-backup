"""OpenAI LLM 提供商实现"""
import logging
import os
from typing import Any, AsyncIterator, Optional

import httpx
import openai
from openai import AsyncOpenAI

from domain.ai.services.llm_service import GenerationConfig, GenerationResult
from domain.ai.value_objects.prompt import Prompt
from domain.ai.value_objects.token_usage import TokenUsage
from infrastructure.ai.config.settings import Settings
from .base import BaseProvider
from .model_resolution import require_resolved_model_id

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gpt-4o"
DEFAULT_TIMEOUT_SECONDS = 45.0
DEFAULT_USER_AGENT = "python-httpx/0.27.2"


class ResponsesUnsupportedError(RuntimeError):
    pass


class _ResponsesShim:
    async def create(self, **_: Any) -> Any:
        raise ResponsesUnsupportedError("Responses API is unavailable in the installed openai SDK")


class OpenAIProvider(BaseProvider):
    """OpenAI LLM 提供商实现

    通过 `use_legacy_chat_completions` 显式选择协议：
    - `False`（默认）：优先走 Responses API，失败时自动降级到 Chat Completions
    - `True`：直接走 Chat Completions API
    """

    _fallback_to_chat_cache: set[str] = set()

    def __init__(self, settings: Settings):
        super().__init__(settings)

        if not settings.api_key:
            raise ValueError("API key is required for OpenAIProvider")

        self._use_legacy = settings.use_legacy_chat_completions
        self._profile_id: Optional[str] = getattr(settings, "profile_id", None)
        self._timeout_seconds = float(
            os.getenv(
                "OPENAI_TIMEOUT_SECONDS",
                str(getattr(settings, "timeout_seconds", DEFAULT_TIMEOUT_SECONDS) or DEFAULT_TIMEOUT_SECONDS),
            )
        )

        headers = dict(settings.extra_headers or {})
        headers.setdefault("User-Agent", os.getenv("OPENAI_USER_AGENT", DEFAULT_USER_AGENT))

        client_kwargs = {
            "api_key": settings.api_key,
            "timeout": self._timeout_seconds,
            "max_retries": max(0, int(os.getenv("OPENAI_MAX_RETRIES", "1"))),
            "default_headers": headers or None,
            "default_query": settings.extra_query or None,
        }
        if settings.base_url:
            client_kwargs["base_url"] = settings.base_url.rstrip("/")

        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(self._timeout_seconds),
            trust_env=False,
        )
        client_kwargs["http_client"] = self._http_client
        self.async_client = AsyncOpenAI(**client_kwargs)
        if not hasattr(self.async_client, "responses"):
            setattr(self.async_client, "responses", _ResponsesShim())

    def _persist_legacy_flag(self, use_legacy: bool) -> None:
        """将 use_legacy_chat_completions 标志持久化到数据库（仅当有 profile_id 时）。"""
        if not self._profile_id:
            return
        try:
            from application.ai.llm_control_service import LLMControlService

            control_service = LLMControlService()
            control_service.update_profile_legacy_flag(self._profile_id, use_legacy)
        except Exception as e:
            logger.warning("Failed to persist legacy flag to database: %s", e)

    def _resolve_model(self, config: GenerationConfig) -> str:
        default_model = self.settings.default_model or os.getenv("OPENAI_MODEL") or ""
        return require_resolved_model_id(
            config.model,
            default_model,
            provider_label="OpenAI 兼容",
        )

    @staticmethod
    def _temperature_supported(model: str) -> bool:
        return not model.startswith("gpt-5")

    async def generate(
        self,
        prompt: Prompt,
        config: GenerationConfig,
    ) -> GenerationResult:
        try:
            base_url = self.settings.base_url or "https://api.openai.com/v1"
            use_responses = not self._use_legacy and base_url not in self.__class__._fallback_to_chat_cache

            if use_responses:
                try:
                    return await self._generate_via_responses(prompt, config)
                except (openai.NotFoundError, openai.BadRequestError, ResponsesUnsupportedError) as e:
                    logger.info(
                        "Responses API unsupported for %s, falling back to chat completions: %s",
                        base_url,
                        str(e),
                    )
                    self.__class__._fallback_to_chat_cache.add(base_url)
                    self._persist_legacy_flag(True)
                except Exception as e:
                    if (
                        "404" in str(e)
                        or "Not Found" in str(e)
                        or "400" in str(e)
                        or "Account invalid" in str(e)
                        or "INVALID_ARGUMENT" in str(e)
                        or "Responses API returned empty content" in str(e)
                    ):
                        logger.info(
                            "Gateway returned error for Responses API (%s), falling back: %s",
                            base_url,
                            str(e),
                        )
                        self.__class__._fallback_to_chat_cache.add(base_url)
                        self._persist_legacy_flag(True)
                    else:
                        raise

            return await self._generate_via_chat(prompt, config)
        except RuntimeError:
            raise
        except (openai.APIError, openai.APIConnectionError, openai.RateLimitError, openai.APITimeoutError) as e:
            raise RuntimeError(f"Failed to generate text: {str(e)}") from e
        except ValueError:
            raise
        except (AttributeError, TypeError) as e:
            raise RuntimeError(f"Failed to generate text: {str(e)}") from e

    async def _generate_via_chat(self, prompt: Prompt, config: GenerationConfig) -> GenerationResult:
        """Chat Completions API 非流式生成。"""
        messages = self._build_messages(prompt)
        request_kwargs = self._build_chat_request_kwargs(messages, config)

        response = await self.async_client.chat.completions.create(**request_kwargs)
        content = self._extract_text_from_response(response)

        if not content:
            logger.warning(
                "OpenAI-compatible response returned empty non-stream content; "
                "falling back to streaming aggregation"
            )
            content, token_usage = await self._generate_via_stream(request_kwargs)
            return GenerationResult(content=content, token_usage=token_usage)

        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0
        return GenerationResult(
            content=content,
            token_usage=TokenUsage(input_tokens=input_tokens, output_tokens=output_tokens),
        )

    async def stream_generate(
        self,
        prompt: Prompt,
        config: GenerationConfig,
    ) -> AsyncIterator[str]:
        try:
            base_url = self.settings.base_url or "https://api.openai.com/v1"
            use_responses = not self._use_legacy and base_url not in self.__class__._fallback_to_chat_cache

            if use_responses:
                try:
                    request_kwargs = self._build_responses_request_kwargs(prompt, config, stream=True)
                    stream = await self.async_client.responses.create(**request_kwargs)
                    yielded_any = False
                    async for chunk in stream:
                        content = self._extract_text_from_responses_chunk(chunk)
                        if content:
                            yielded_any = True
                            yield content
                    if yielded_any:
                        return
                    self.__class__._fallback_to_chat_cache.add(base_url)
                    self._persist_legacy_flag(True)
                    logger.warning("Stream: Responses API returned empty content for %s, falling back.", base_url)
                except (openai.NotFoundError, openai.BadRequestError, ResponsesUnsupportedError):
                    self.__class__._fallback_to_chat_cache.add(base_url)
                    self._persist_legacy_flag(True)
                    logger.info("Stream: Responses API unsupported for %s, falling back.", base_url)
                except Exception as e:
                    if (
                        "404" in str(e)
                        or "Not Found" in str(e)
                        or "400" in str(e)
                        or "Account invalid" in str(e)
                        or "INVALID_ARGUMENT" in str(e)
                        or "Responses API returned empty content" in str(e)
                    ):
                        self.__class__._fallback_to_chat_cache.add(base_url)
                        self._persist_legacy_flag(True)
                        logger.info(
                            "Stream: Gateway returned error for Responses API (%s), falling back.",
                            base_url,
                        )
                    else:
                        logger.error("[Responses Stream] Failed: %s", e)
                        raise

            messages = self._build_messages(prompt)
            request_kwargs = self._build_chat_request_kwargs(messages, config, stream=True)
            stream = await self.async_client.chat.completions.create(**request_kwargs)
            async for chunk in stream:
                content = self._extract_text_from_stream_chunk(chunk)
                if content:
                    yield content
        except (openai.APIError, openai.APIConnectionError, openai.RateLimitError, openai.APITimeoutError) as e:
            logger.error("[Stream] API error: %s", e)
            raise RuntimeError(f"Failed to stream text: {str(e)}") from e
        except (AttributeError, TypeError, ValueError) as e:
            logger.error("[Stream] Response parsing error: %s", e)
            raise RuntimeError(f"Failed to stream text: {str(e)}") from e

    @staticmethod
    def _build_messages(prompt: Prompt) -> list[dict[str, str]]:
        return [
            {"role": "system", "content": prompt.system},
            {"role": "user", "content": prompt.user},
        ]

    def _build_chat_request_kwargs(
        self,
        messages: list[dict[str, str]],
        config: GenerationConfig,
        *,
        stream: bool = False,
    ) -> dict[str, Any]:
        model = self._resolve_model(config)
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": config.max_tokens,
            "extra_headers": self.settings.extra_headers or None,
            "extra_query": self.settings.extra_query or None,
            "extra_body": self.settings.extra_body or None,
            "timeout": self._timeout_seconds,
        }
        if self._temperature_supported(model):
            kwargs["temperature"] = config.temperature
        if stream:
            kwargs["stream"] = True
        return kwargs

    def _build_responses_request_kwargs(
        self,
        prompt: Prompt,
        config: GenerationConfig,
        *,
        stream: bool = False,
    ) -> dict[str, Any]:
        model = self._resolve_model(config)
        kwargs: dict[str, Any] = {
            "model": model,
            "instructions": prompt.system,
            "input": [{"role": "user", "content": prompt.user}],
            "max_output_tokens": config.max_tokens,
        }
        if self._temperature_supported(model):
            kwargs["temperature"] = config.temperature
        if self.settings.extra_body:
            kwargs.update(self.settings.extra_body)
        if stream:
            kwargs["stream"] = True
        return kwargs

    async def _generate_via_responses(self, prompt: Prompt, config: GenerationConfig) -> GenerationResult:
        """Responses API 非流式生成。"""
        request_kwargs = self._build_responses_request_kwargs(prompt, config)
        response = await self.async_client.responses.create(**request_kwargs)

        output = getattr(response, "output", None)
        content_parts: list[str] = []
        if output:
            for item in output:
                if getattr(item, "type", "") == "message":
                    for part in getattr(item, "content", []):
                        if getattr(part, "type", "") == "text":
                            piece = str(getattr(part, "text", "")).strip()
                            if piece:
                                content_parts.append(piece)
        content = "\n".join(content_parts).strip()
        if not content:
            raise RuntimeError("Responses API returned empty content")

        input_tokens = response.usage.prompt_tokens if response.usage else 0
        output_tokens = response.usage.completion_tokens if response.usage else 0

        return GenerationResult(
            content=content,
            token_usage=TokenUsage(input_tokens=input_tokens, output_tokens=output_tokens),
        )

    @staticmethod
    def _extract_text_from_responses_chunk(chunk: Any) -> str:
        """原生 Responses stream 解析封装。"""
        try:
            event_type = getattr(chunk, "type", "")
            if event_type == "response.content_part.added":
                part = getattr(chunk, "part", None)
                if part and getattr(part, "type", "") == "text":
                    return getattr(part, "text", "")
            elif event_type == "message.delta":
                delta = getattr(chunk, "delta", None)
                if delta:
                    content = getattr(delta, "content", None)
                    if isinstance(content, str):
                        return content
        except Exception:
            pass
        return ""

    @staticmethod
    def _normalize_chat_completion_content(content: Any) -> str:
        """兼容 message.content 为 str 或多段 content part 列表（OpenAI 新协议与多数聚合网关）。"""
        if content is None:
            return ""
        if isinstance(content, str):
            return content.strip()

        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    item_type = (item.get("type") or "").lower()
                    if item_type in ("reasoning", "thinking", "refusal"):
                        continue
                    text_val = item.get("text")
                    if isinstance(text_val, str) and text_val.strip():
                        parts.append(text_val)
                else:
                    text_attr = getattr(item, "text", None)
                    if isinstance(text_attr, str) and text_attr.strip():
                        parts.append(text_attr)
            return "\n".join(parts).strip()

        return str(content).strip()

    @staticmethod
    def _extract_text_from_response(response: Any) -> str:
        if not getattr(response, "choices", None):
            return ""

        message = getattr(response.choices[0], "message", None)
        content = getattr(message, "content", None)
        return OpenAIProvider._normalize_chat_completion_content(content)

    @staticmethod
    def _extract_text_from_stream_chunk(chunk: Any) -> str:
        if not getattr(chunk, "choices", None):
            return ""

        delta = getattr(chunk.choices[0], "delta", None)
        content = getattr(delta, "content", None)
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return OpenAIProvider._normalize_chat_completion_content(content)
        return ""

    async def _generate_via_stream(self, request_kwargs: dict[str, Any]) -> tuple[str, TokenUsage]:
        stream = await self.async_client.chat.completions.create(
            **{**request_kwargs, "stream": True}
        )

        parts: list[str] = []
        input_tokens = 0
        output_tokens = 0

        async for chunk in stream:
            content = self._extract_text_from_stream_chunk(chunk)
            if content:
                parts.append(content)

            usage = getattr(chunk, "usage", None)
            if usage is not None:
                input_tokens = getattr(usage, "prompt_tokens", 0) or 0
                output_tokens = getattr(usage, "completion_tokens", 0) or 0

        content = "".join(parts).strip()
        if not content:
            raise RuntimeError("API returned empty content")

        return content, TokenUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
