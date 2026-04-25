import base64
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

MODULE_PATH = SCRIPTS_DIR / "build_comic_manga_ppt.py"
SPEC = importlib.util.spec_from_file_location("build_comic_manga_ppt", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def build_completed_process(payload: dict[str, object]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.CompletedProcess(
        args=["curl"],
        returncode=0,
        stdout=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        stderr=b"",
    )


def build_failed_process(stderr_text: str, returncode: int = 52) -> subprocess.CompletedProcess[bytes]:
    return subprocess.CompletedProcess(
        args=["curl"],
        returncode=returncode,
        stdout=b"",
        stderr=stderr_text.encode("utf-8"),
    )


class ComicGeminiRetryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.temp_dir.name)
        self.reference_path = self.tmp_path / "reference.png"
        self.reference_path.write_bytes(b"fake-reference")
        self.output_path = self.tmp_path / "result.png"
        self.page = MODULE.SlidePage(
            page=1,
            title="封面",
            bullets=["第一条", "第二条"],
            context_title="战略背景",
            context_points=["行业变化", "增长机会"],
            scene_prompt="未来城市与商业叙事",
            filename="P1-cover.png",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_generate_gemini_image_retries_on_unavailable_then_succeeds(self) -> None:
        image_bytes = b"generated-image"
        retry_response = build_completed_process(
            {
                "error": {
                    "code": 503,
                    "status": "UNAVAILABLE",
                    "message": "This model is currently experiencing high demand. Please try again later.",
                }
            }
        )
        success_response = build_completed_process(
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "inlineData": {
                                        "data": base64.b64encode(image_bytes).decode("utf-8"),
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        )
        sleep_calls: list[float] = []

        with (
            mock.patch.object(MODULE, "STYLE_REFERENCE", self.reference_path),
            mock.patch.object(MODULE, "LAYOUT_REFERENCE", None),
            mock.patch.object(MODULE, "get_api_key", return_value="test-key"),
            mock.patch.dict(
                MODULE.os.environ,
                {
                    "GEMINI_IMAGE_MAX_ATTEMPTS": "4",
                    "GEMINI_IMAGE_RETRY_BASE_DELAY_SECONDS": "2",
                    "GEMINI_IMAGE_RETRY_MAX_DELAY_SECONDS": "10",
                    "GEMINI_IMAGE_RETRY_JITTER_SECONDS": "0",
                },
                clear=False,
            ),
            mock.patch.object(MODULE.subprocess, "run", side_effect=[retry_response, success_response]) as run_mock,
            mock.patch.object(MODULE.time, "sleep", side_effect=lambda seconds: sleep_calls.append(seconds)),
            mock.patch.object(MODULE.random, "uniform", return_value=0),
            mock.patch.object(MODULE, "emit_log") as emit_log_mock,
        ):
            mode = MODULE.generate_gemini_image(self.page, self.output_path, style_reference=self.reference_path)

        self.assertEqual(mode, "gemini-api")
        self.assertEqual(self.output_path.read_bytes(), image_bytes)
        self.assertEqual(run_mock.call_count, 2)
        self.assertEqual(sleep_calls, [2.0])
        self.assertEqual(emit_log_mock.call_count, 2)
        self.assertIn("Gemini 生图重试", emit_log_mock.call_args_list[0].args)
        self.assertIn("Gemini 生图重试请求已发起", emit_log_mock.call_args_list[1].args)
        self.assertIn("--http1.1", run_mock.call_args_list[0].args[0])

    def test_generate_gemini_image_does_not_retry_invalid_argument(self) -> None:
        invalid_response = build_completed_process(
            {
                "error": {
                    "code": 400,
                    "status": "INVALID_ARGUMENT",
                    "message": "Prompt contains an unsupported field.",
                }
            }
        )
        sleep_calls: list[float] = []

        with (
            mock.patch.object(MODULE, "STYLE_REFERENCE", self.reference_path),
            mock.patch.object(MODULE, "LAYOUT_REFERENCE", None),
            mock.patch.object(MODULE, "get_api_key", return_value="test-key"),
            mock.patch.dict(MODULE.os.environ, {"GEMINI_IMAGE_MAX_ATTEMPTS": "4"}, clear=False),
            mock.patch.object(MODULE.subprocess, "run", return_value=invalid_response) as run_mock,
            mock.patch.object(MODULE.time, "sleep", side_effect=lambda seconds: sleep_calls.append(seconds)),
        ):
            with self.assertRaisesRegex(RuntimeError, "INVALID_ARGUMENT"):
                MODULE.generate_gemini_image(self.page, self.output_path, style_reference=self.reference_path)

        self.assertEqual(run_mock.call_count, 1)
        self.assertEqual(sleep_calls, [])
        self.assertIn("--http1.1", run_mock.call_args.args[0])

    def test_generate_openai_image_retries_on_chinese_upstream_overload_then_succeeds(self) -> None:
        image_bytes = b"generated-openai-image"
        retry_response = build_completed_process(
            {
                "error": {
                    "message": "当前分组上游负载已饱和，请稍后再试",
                    "code": "upstream_busy",
                }
            }
        )
        success_response = build_completed_process(
            {
                "data": [
                    {
                        "b64_json": base64.b64encode(image_bytes).decode("utf-8"),
                    }
                ]
            }
        )
        sleep_calls: list[float] = []

        with (
            mock.patch.object(MODULE, "STYLE_REFERENCE", self.reference_path),
            mock.patch.object(MODULE, "LAYOUT_REFERENCE", None),
            mock.patch.object(MODULE, "get_openai_compatible_api_key", return_value="test-key"),
            mock.patch.object(MODULE, "curl_resolve_args_for_url", return_value=[]),
            mock.patch.dict(
                MODULE.os.environ,
                {
                    "COMIC_OPENAI_IMAGE_MAX_ATTEMPTS": "4",
                    "COMIC_OPENAI_IMAGE_RETRY_BASE_DELAY_SECONDS": "2",
                    "COMIC_OPENAI_IMAGE_RETRY_MAX_DELAY_SECONDS": "10",
                    "COMIC_OPENAI_IMAGE_RETRY_JITTER_SECONDS": "0",
                },
                clear=False,
            ),
            mock.patch.object(MODULE.subprocess, "run", side_effect=[retry_response, success_response]) as run_mock,
            mock.patch.object(MODULE.time, "sleep", side_effect=lambda seconds: sleep_calls.append(seconds)),
            mock.patch.object(MODULE.random, "uniform", return_value=0),
            mock.patch.object(MODULE, "emit_log") as emit_log_mock,
        ):
            mode = MODULE.generate_openai_compatible_image(self.page, self.output_path, style_reference=self.reference_path)

        self.assertEqual(mode, "openai-compatible-api")
        self.assertEqual(self.output_path.read_bytes(), image_bytes)
        self.assertEqual(run_mock.call_count, 2)
        self.assertEqual(sleep_calls, [2.0])
        self.assertEqual(emit_log_mock.call_count, 2)
        self.assertIn("GPT 生图重试", emit_log_mock.call_args_list[0].args)
        self.assertIn("GPT 生图重试请求已发起", emit_log_mock.call_args_list[1].args)
        self.assertIn("--http1.1", run_mock.call_args_list[0].args[0])

    def test_generate_openai_image_retries_on_empty_reply_then_succeeds(self) -> None:
        image_bytes = b"generated-openai-image"
        retry_response = build_failed_process("curl: (52) Empty reply from server")
        success_response = build_completed_process(
            {
                "data": [
                    {
                        "b64_json": base64.b64encode(image_bytes).decode("utf-8"),
                    }
                ]
            }
        )
        sleep_calls: list[float] = []

        with (
            mock.patch.object(MODULE, "STYLE_REFERENCE", self.reference_path),
            mock.patch.object(MODULE, "LAYOUT_REFERENCE", None),
            mock.patch.object(MODULE, "get_openai_compatible_api_key", return_value="test-key"),
            mock.patch.object(MODULE, "curl_resolve_args_for_url", return_value=[]),
            mock.patch.dict(
                MODULE.os.environ,
                {
                    "COMIC_OPENAI_IMAGE_MAX_ATTEMPTS": "4",
                    "COMIC_OPENAI_IMAGE_RETRY_BASE_DELAY_SECONDS": "2",
                    "COMIC_OPENAI_IMAGE_RETRY_MAX_DELAY_SECONDS": "10",
                    "COMIC_OPENAI_IMAGE_RETRY_JITTER_SECONDS": "0",
                },
                clear=False,
            ),
            mock.patch.object(MODULE.subprocess, "run", side_effect=[retry_response, success_response]) as run_mock,
            mock.patch.object(MODULE.time, "sleep", side_effect=lambda seconds: sleep_calls.append(seconds)),
            mock.patch.object(MODULE.random, "uniform", return_value=0),
            mock.patch.object(MODULE, "emit_log") as emit_log_mock,
        ):
            mode = MODULE.generate_openai_compatible_image(self.page, self.output_path, style_reference=self.reference_path)

        self.assertEqual(mode, "openai-compatible-api")
        self.assertEqual(self.output_path.read_bytes(), image_bytes)
        self.assertEqual(run_mock.call_count, 2)
        self.assertEqual(sleep_calls, [2.0])
        self.assertEqual(emit_log_mock.call_count, 2)

    def test_prompt_only_build_prompt_does_not_require_references(self) -> None:
        prompt = MODULE.build_prompt(
            self.page,
            native_text=True,
            image_provider="gpt",
            has_style_reference=False,
            has_layout_reference=False,
            has_page_reference=False,
        )

        self.assertEqual(MODULE.reference_paths(), [])
        self.assertIn("Rely entirely on the prompt", prompt)
        self.assertNotIn("The first reference image defines", prompt)
        self.assertNotIn("strict composition blueprint", prompt)

    def test_openai_prompt_only_uses_generations_endpoint(self) -> None:
        image_bytes = b"prompt-only-openai-image"
        success_response = build_completed_process(
            {
                "data": [
                    {
                        "b64_json": base64.b64encode(image_bytes).decode("utf-8"),
                    }
                ]
            }
        )

        with (
            mock.patch.object(MODULE, "get_openai_compatible_api_key", return_value="test-key"),
            mock.patch.object(MODULE, "curl_resolve_args_for_url", return_value=[]),
            mock.patch.dict(MODULE.os.environ, {"COMIC_OPENAI_IMAGE_MAX_ATTEMPTS": "1"}, clear=False),
            mock.patch.object(MODULE.subprocess, "run", return_value=success_response) as run_mock,
        ):
            mode = MODULE.generate_openai_compatible_image(
                self.page,
                self.output_path,
                native_text=True,
                style_reference=None,
                layout_reference=None,
                page_reference=None,
            )

        command = run_mock.call_args.args[0]
        self.assertEqual(mode, "openai-compatible-api")
        self.assertEqual(self.output_path.read_bytes(), image_bytes)
        self.assertTrue(any(str(part).endswith("/images/generations") for part in command))
        self.assertIn("Content-Type: application/json", command)
        command_text = " ".join(str(part) for part in command)
        self.assertIn('"response_format": "url"', command_text)
        self.assertNotIn("-F", command)

    def test_openai_prompt_only_downloads_url_response(self) -> None:
        image_bytes = b"downloaded-image"
        success_response = build_completed_process(
            {
                "data": [
                    {
                        "url": "https://example.test/generated.png",
                    }
                ]
            }
        )
        download_response = subprocess.CompletedProcess(
            args=["curl"],
            returncode=0,
            stdout=b"",
            stderr=b"",
        )

        def fake_run(command: list[str], *args: object, **kwargs: object) -> subprocess.CompletedProcess[bytes]:
            if "-o" in command:
                output_path = Path(command[command.index("-o") + 1])
                output_path.write_bytes(image_bytes)
                return download_response
            return success_response

        with (
            mock.patch.object(MODULE, "get_openai_compatible_api_key", return_value="test-key"),
            mock.patch.object(MODULE, "curl_resolve_args_for_url", side_effect=lambda url: [] if "example.test" not in str(url) else []),
            mock.patch.dict(MODULE.os.environ, {"COMIC_OPENAI_IMAGE_MAX_ATTEMPTS": "1"}, clear=False),
            mock.patch.object(MODULE.subprocess, "run", side_effect=fake_run) as run_mock,
        ):
            mode = MODULE.generate_openai_compatible_image(
                self.page,
                self.output_path,
                native_text=True,
                style_reference=None,
                layout_reference=None,
                page_reference=None,
            )

        self.assertEqual(mode, "openai-compatible-api")
        self.assertEqual(self.output_path.read_bytes(), image_bytes)
        self.assertEqual(run_mock.call_count, 2)
        self.assertTrue(any(str(part).endswith("/images/generations") for part in run_mock.call_args_list[0].args[0]))
        self.assertIn("https://example.test/generated.png", run_mock.call_args_list[1].args[0])

    def test_openai_invalid_b64_json_retries_then_succeeds(self) -> None:
        image_bytes = b"generated-after-invalid-b64"
        invalid_response = build_completed_process(
            {
                "data": [
                    {
                        "b64_json": "iVBOR",
                    }
                ]
            }
        )
        success_response = build_completed_process(
            {
                "data": [
                    {
                        "b64_json": base64.b64encode(image_bytes).decode("utf-8"),
                    }
                ]
            }
        )
        sleep_calls: list[float] = []

        with (
            mock.patch.object(MODULE, "get_openai_compatible_api_key", return_value="test-key"),
            mock.patch.object(MODULE, "curl_resolve_args_for_url", return_value=[]),
            mock.patch.dict(
                MODULE.os.environ,
                {
                    "COMIC_OPENAI_IMAGE_MAX_ATTEMPTS": "2",
                    "COMIC_OPENAI_IMAGE_RETRY_BASE_DELAY_SECONDS": "2",
                    "COMIC_OPENAI_IMAGE_RETRY_MAX_DELAY_SECONDS": "10",
                    "COMIC_OPENAI_IMAGE_RETRY_JITTER_SECONDS": "0",
                    "COMIC_OPENAI_IMAGE_GENERATION_RESPONSE_FORMAT": "b64_json",
                },
                clear=False,
            ),
            mock.patch.object(MODULE.subprocess, "run", side_effect=[invalid_response, success_response]) as run_mock,
            mock.patch.object(MODULE.time, "sleep", side_effect=lambda seconds: sleep_calls.append(seconds)),
            mock.patch.object(MODULE.random, "uniform", return_value=0),
            mock.patch.object(MODULE, "emit_log") as emit_log_mock,
        ):
            mode = MODULE.generate_openai_compatible_image(
                self.page,
                self.output_path,
                native_text=True,
                style_reference=None,
                layout_reference=None,
                page_reference=None,
            )

        self.assertEqual(mode, "openai-compatible-api")
        self.assertEqual(self.output_path.read_bytes(), image_bytes)
        self.assertEqual(run_mock.call_count, 2)
        self.assertEqual(sleep_calls, [2.0])
        self.assertEqual(emit_log_mock.call_count, 2)

    def test_openai_prompt_only_can_add_resolve_override(self) -> None:
        image_bytes = b"prompt-only-openai-image"
        success_response = build_completed_process(
            {
                "data": [
                    {
                        "b64_json": base64.b64encode(image_bytes).decode("utf-8"),
                    }
                ]
            }
        )

        with (
            mock.patch.object(MODULE, "get_openai_compatible_api_key", return_value="test-key"),
            mock.patch.object(MODULE, "curl_resolve_args_for_url", return_value=["--resolve", "api.xbai.top:443:104.194.92.61"]),
            mock.patch.dict(
                MODULE.os.environ,
                {
                    "COMIC_OPENAI_IMAGE_MAX_ATTEMPTS": "1",
                    "COMIC_OPENAI_IMAGE_GENERATION_RESPONSE_FORMAT": "b64_json",
                },
                clear=False,
            ),
            mock.patch.object(MODULE.subprocess, "run", return_value=success_response) as run_mock,
        ):
            MODULE.generate_openai_compatible_image(
                self.page,
                self.output_path,
                native_text=True,
                style_reference=None,
                layout_reference=None,
                page_reference=None,
            )

        command = run_mock.call_args.args[0]
        self.assertIn("--resolve", command)
        self.assertIn("api.xbai.top:443:104.194.92.61", command)


if __name__ == "__main__":
    unittest.main()
