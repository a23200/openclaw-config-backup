import asyncio
from typing import Any, Dict, Optional

import httpx
from loguru import logger


class YesCaptchaClient:
    """Minimal YesCaptcha API client."""

    def __init__(self, client_key: str, base_url: str = "https://api.yescaptcha.com"):
        self.client_key = client_key
        self.base_url = base_url.rstrip("/")

    async def get_balance(self) -> Dict[str, Any]:
        return await self._post("/getBalance", {"clientKey": self.client_key})

    async def create_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        return await self._post("/createTask", {"clientKey": self.client_key, "task": task})

    async def get_task_result(self, task_id: str) -> Dict[str, Any]:
        return await self._post("/getTaskResult", {"clientKey": self.client_key, "taskId": task_id})

    async def solve_funcaptcha_classification(self, image_base64: str, question: str) -> Dict[str, Any]:
        task = {
            "type": "FunCaptchaClassification",
            "image": self._ensure_data_url(image_base64),
            "question": question,
        }
        return await self.create_task(task)

    async def solve_image_to_text(self, image_base64: str) -> Dict[str, Any]:
        task = {
            "type": "ImageToTextTaskMuggle",
            "body": self._strip_data_url(image_base64),
        }
        return await self.create_task(task)

    async def wait_for_result(self, task_id: str, timeout: int = 120, interval: int = 3) -> Dict[str, Any]:
        elapsed = 0
        while elapsed < timeout:
            result = await self.get_task_result(task_id)
            if result.get("errorId"):
                return result
            if result.get("status") == "ready":
                return result
            await asyncio.sleep(interval)
            elapsed += interval

        return {
            "errorId": 1,
            "errorCode": "TASK_TIMEOUT",
            "errorDescription": f"YesCaptcha task timed out after {timeout}s",
        }

    async def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            logger.info(f"YesCaptcha API {path} 响应: {data}")
            return data

    def _ensure_data_url(self, image_base64: str) -> str:
        if image_base64.startswith("data:image"):
            return image_base64
        return f"data:image/jpeg;base64,{image_base64}"

    def _strip_data_url(self, image_base64: str) -> str:
        if "," in image_base64 and image_base64.startswith("data:image"):
            return image_base64.split(",", 1)[1]
        return image_base64
