#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="${1:-/www/wwwroot/design-review-system}"

fail() {
  echo "部署失败：$*" >&2
  exit 1
}

for command in node pnpm; do
  command -v "$command" >/dev/null 2>&1 || fail "未找到 $command"
done

PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd)" || fail "项目目录不存在"
[[ -f "$PROJECT_ROOT/pnpm-workspace.yaml" ]] || fail "当前目录不是项目根目录：$PROJECT_ROOT"

cd "$PROJECT_ROOT"
[[ -f "$PROJECT_ROOT/apps/server/dist/server.js" ]] || fail "后端构建产物不存在"
[[ -f "$PROJECT_ROOT/apps/web/.next/BUILD_ID" ]] || fail "前端构建产物不存在"

echo "[1/2] 安装运行时依赖（不执行构建）"
NODE_ENV=production pnpm install --prod --frozen-lockfile

echo "[2/2] 校验上传的前后端构建产物"
[[ -f "$PROJECT_ROOT/apps/server/dist/server.js" ]] || fail "后端构建产物不存在"
[[ -f "$PROJECT_ROOT/apps/web/.next/BUILD_ID" ]] || fail "前端构建产物不存在"

echo "部署文件就绪，未操作 PM2。请手动重启 server 和 next。"
