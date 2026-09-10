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

echo "[1/3] 安装依赖"
cd "$PROJECT_ROOT"
NODE_ENV=development pnpm install --frozen-lockfile

echo "[2/3] 清理旧构建"
rm -rf "$PROJECT_ROOT/apps/web/.next" "$PROJECT_ROOT/apps/server/dist"

echo "[3/3] 构建前后端"
NODE_ENV=production pnpm --filter @design-review/server build
NODE_ENV=production pnpm --filter @design-review/web build
[[ -f "$PROJECT_ROOT/apps/server/dist/server.js" ]] || fail "后端构建产物不存在"
[[ -f "$PROJECT_ROOT/apps/web/.next/BUILD_ID" ]] || fail "前端构建产物不存在"

if grep -RqsE 'localhost:8080|127\.0\.0\.1:8080' "$PROJECT_ROOT/apps/web/.next/static"; then
  fail "前端构建产物仍包含本地 API 地址"
fi

echo "构建完成，未操作 PM2。请手动重启 server 和 next。"
