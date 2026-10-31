"""Instrument the cloned image-to-PSD runner with line-oriented progress events."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Callable


def emit(message: str, step: str = "process") -> None:
    print(
        "IMAGE2PSD_PROGRESS "
        + json.dumps({"step": step, "message": message}, ensure_ascii=False),
        file=sys.stderr,
        flush=True,
    )


skill_root_value = os.environ.get("GPT_IMAGE2_PSD_SKILL_DIR", "").strip()
if not skill_root_value:
    raise SystemExit("Missing GPT_IMAGE2_PSD_SKILL_DIR")

skill_root = Path(skill_root_value).expanduser().resolve()
scripts_dir = skill_root / "scripts"
if not (scripts_dir / "run_image2_psd.py").is_file():
    raise SystemExit(f"Image-to-PSD scripts not found under: {skill_root}")
sys.path.insert(0, str(scripts_dir))

import run_image2_psd as pipeline  # noqa: E402

if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def instrument(name: str, before: Callable[..., str] | str, after: Callable[..., str] | None = None) -> None:
    original = getattr(pipeline, name)

    def wrapped(*args: Any, **kwargs: Any) -> Any:
        message = before(*args, **kwargs) if callable(before) else before
        emit(message)
        result = original(*args, **kwargs)
        if after:
            emit(after(result, *args, **kwargs), "complete")
        return result

    setattr(pipeline, name, wrapped)


original_responses_analysis = pipeline.call_responses_analysis


def chat_completions_analysis(api_key: str, model: str, image_path: Path) -> dict[str, Any]:
    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": pipeline.ANALYSIS_PROMPT},
                    {"type": "image_url", "image_url": {"url": pipeline.read_b64_image(image_path)}},
                ],
            }
        ],
    }
    response = pipeline.requests.post(
        f"{pipeline.OPENAI_BASE_URL}/chat/completions",
        headers=pipeline.headers_json(api_key),
        json=body,
        timeout=180,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Chat Completions fallback failed: {response.status_code} {response.text}")
    payload = response.json()
    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    if isinstance(content, list):
        content = "\n".join(str(item.get("text", "")) for item in content if isinstance(item, dict))
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Chat Completions fallback returned no analysis text.")
    return pipeline.parse_json_text(content)


def analysis_with_fallback(api_key: str, model: str, image_path: Path) -> dict[str, Any]:
    emit(f"调用视觉模型 {model} 分析图片和图层顺序。")
    try:
        result = original_responses_analysis(api_key, model, image_path)
    except Exception as exc:
        if "Responses API failed: 404" not in str(exc):
            raise
        emit("中转站未提供 /responses，正在尝试兼容的 /chat/completions 图像输入接口。", "fallback")
        result = chat_completions_analysis(api_key, model, image_path)
    emit(f"视觉分析完成，识别到 {len(result.get('layers', []))} 个候选图层。", "complete")
    return result


pipeline.call_responses_analysis = analysis_with_fallback


def image_edit_message(_key: str, model: str, _image: Path, prompt: str, _output: Path, **_kwargs: Any) -> str:
    match = re.search(r"Extract only the semantic element named\s+([^\.\n]+)", prompt, re.IGNORECASE)
    element = match.group(1).strip() if match else "当前元素"
    return f"调用图像模型 {model} 提取透明图层：{element}。"


instrument("call_image_edit", image_edit_message)
instrument("mock_layer_from_bbox", "离线模拟提取一个候选元素图层。")
instrument(
    "local_simple_layer_from_bbox",
    lambda _image, _output, _bbox, layer_type: f"本地按识别框提取简单元素（{layer_type}）。",
)
instrument("create_background", "创建 PSD 底部背景图层。")

real_subprocess_run = pipeline.subprocess.run


def run_with_writer_progress(command: Any, *args: Any, **kwargs: Any) -> Any:
    is_writer = isinstance(command, (list, tuple)) and any(Path(str(item)).name == "image2psd.py" for item in command)
    if not is_writer:
        return real_subprocess_run(command, *args, **kwargs)
    emit("正在整理图层清单并写入 PSD 文件。")
    writer_kwargs = dict(kwargs)
    writer_kwargs.setdefault("capture_output", True)
    writer_kwargs.setdefault("text", True)
    completed = real_subprocess_run(command, *args, **writer_kwargs)
    emit("PSD 文件和合成预览已写入。", "complete")
    return completed


pipeline.subprocess.run = run_with_writer_progress

emit("图片已就绪，准备开始分层。", "start")
raise SystemExit(pipeline.main())
