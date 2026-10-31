"""Run the non-GPT PSD project demos and emit progress for the web workspace."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from PIL import Image


def emit(message: str) -> None:
    print("PSD_PROJECT_PROGRESS " + json.dumps({"message": message}, ensure_ascii=False), file=sys.stderr, flush=True)


def run(command: list[str], cwd: Path, step: str) -> str:
    emit(step)
    completed = subprocess.run(command, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode != 0:
        detail = completed.stderr.strip().splitlines() or completed.stdout.strip().splitlines()
        raise RuntimeError(detail[-1] if detail else f"子进程退出状态码 {completed.returncode}")
    return completed.stdout.strip()


def font_path() -> str:
    for candidate in (Path(r"C:\Windows\Fonts\msyh.ttc"), Path(r"C:\Windows\Fonts\simhei.ttf")):
        if candidate.is_file():
            return str(candidate)
    return "heiti"


def parse_color(value: str) -> tuple[int, int, int]:
    raw = value.lstrip("#")
    return tuple(int(raw[index:index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def run_design(args: argparse.Namespace, source: Path, project_dir: Path, project_root: Path) -> dict[str, Any]:
    rebuild = project_root / "scripts" / "rebuild_poster_layers.py"
    writer = project_root / "scripts" / "write_layered_psd.js"
    node_package = project_root / "node_modules" / "ag-psd"
    if not rebuild.is_file() or not writer.is_file():
        raise RuntimeError(f"design-to-psd 脚本缺失：{project_root}")
    if not node_package.exists():
        raise RuntimeError("design-to-psd 的 Node 依赖未安装，请在项目目录运行 npm install。")

    work_dir = project_dir / "design-to-psd"
    manifest_path = work_dir / "layer_manifest.json"
    psd_path = project_dir / "output.psd"
    preview_path = project_dir / "output.preview.png"
    command = [sys.executable, str(rebuild), str(source), str(work_dir)]

    with Image.open(source) as image:
        width, height = image.size
    if args.title:
        center_x = round(width * args.title_x / 100)
        center_y = round(height * args.title_y / 100)
        rgb = ",".join(str(value) for value in parse_color(args.title_color))
        spec = f"headline|{args.title}|{center_x},{center_y}|{args.title_size}|{font_path()}|{rgb}|0|0"
        command.extend(["--text-layer", spec])
    if args.extract_subject == "true":
        box = [
            round(width * args.x0 / 100),
            round(height * args.y0 / 100),
            round(width * args.x1 / 100),
            round(height * args.y1 / 100),
        ]
        if box[2] <= box[0] or box[3] <= box[1]:
            raise RuntimeError("主体框太小，无法生成有效图层。")
        command.extend(["--crop-layer", f"main_subject|{','.join(map(str, box))}|{args.mask}"])

    run(command, project_root, "design-to-psd 正在重建背景和可配置图层。")
    node = shutil.which("node")
    if not node:
        raise RuntimeError("找不到 Node.js，无法运行 design-to-psd 的 PSD 写入器。")
    run([node, str(writer), str(manifest_path), str(psd_path)], project_root, "正在使用 ag-psd 写入分层 PSD。")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    shutil.copyfile(work_dir / "preview.png", preview_path)
    layers = [
        {"name": str(layer.get("name") or "未命名图层"), "visible": bool(layer.get("visible", True))}
        for layer in manifest.get("layers", [])
    ]
    return {"width": width, "height": height, "layers": layers, "layer_count": len(layers)}


def run_bggg(args: argparse.Namespace, source: Path, project_dir: Path, project_root: Path) -> dict[str, Any]:
    script = project_root / "scripts" / "image2psd.py"
    if not script.is_file():
        raise RuntimeError(f"bggg-creator-image2psd 脚本缺失：{script}")
    output = project_dir / "output.psd"
    preview = project_dir / "output.preview.png"
    layers_dir = project_dir / "layers"
    command = [
        sys.executable, str(script), "split-colors", str(source),
        "--output", str(output), "--preview", str(preview),
        "--save-layers", str(layers_dir), "--num-colors", str(args.colors),
        "--method", "auto", "--order", "small-on-top",
    ]
    if args.ignore_color:
        command.extend(["--ignore-color", args.ignore_color])
    raw = run(command, project_root, f"bggg 正在将图片聚类为 {args.colors} 个颜色图层。")
    result = json.loads(raw)
    return {
        "width": result.get("width"),
        "height": result.get("height"),
        "layers": [
            {"name": str(layer.get("name") or "颜色图层"), "visible": True}
            for layer in result.get("layers", [])
        ],
        "layer_count": result.get("layer_count", len(result.get("layers", []))),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", required=True, choices=["design-to-psd", "bggg-creator-image2psd"])
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--project-dir", required=True, type=Path)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--colors", type=int, default=8)
    parser.add_argument("--ignore-color", default="")
    parser.add_argument("--title", default="")
    parser.add_argument("--title-x", type=int, default=50)
    parser.add_argument("--title-y", type=int, default=18)
    parser.add_argument("--title-size", type=int, default=64)
    parser.add_argument("--title-color", default="#ffffff")
    parser.add_argument("--extract-subject", default="false")
    parser.add_argument("--x0", type=int, default=22)
    parser.add_argument("--y0", type=int, default=24)
    parser.add_argument("--x1", type=int, default=78)
    parser.add_argument("--y1", type=int, default=78)
    parser.add_argument("--mask", choices=["foreground", "ellipse", "soft-rect", "rect"], default="foreground")
    args = parser.parse_args()
    source = args.source.resolve()
    project_dir = args.project_dir.resolve()
    project_root = args.project_root.resolve()
    try:
        emit("已读取上传图片，正在检查尺寸和项目脚本。")
        with Image.open(source) as image:
            image.verify()
        if args.mode == "design-to-psd":
            result = run_design(args, source, project_dir, project_root)
        else:
            result = run_bggg(args, source, project_dir, project_root)
        output = project_dir / "output.psd"
        preview = project_dir / "output.preview.png"
        if not output.is_file() or output.stat().st_size < 32:
            raise RuntimeError("项目没有生成有效的 PSD 文件。")
        with output.open("rb") as handle:
            if handle.read(4) != b"8BPS":
                raise RuntimeError("输出文件不是有效的 Photoshop PSD 格式。")
        if not preview.is_file():
            raise RuntimeError("项目没有生成预览图。")
        emit(f"PSD 验证完成：{result.get('layer_count', 0)} 个图层，{result.get('width')} × {result.get('height')}。")
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
