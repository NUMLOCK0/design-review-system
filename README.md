# 电商设计稿审核管理系统 (Design Review System)

全新一代工业级架构设计，专注于电商团队的视觉设计质检、多轮会审、大图在线批注打标与移动端审批。

---

## 一、系统架构组成

```
d:/design-review-system/
├── apps/
│   ├── web/         # [PC 端 SSR] Next.js 15/16 + React 19 + Tailwind CSS + shadcn/ui (Teal 品牌视觉)
│   ├── server/      # [独立 API 后端] Node.js + TypeScript + Express + JWT 权限流转
│   └── uni-app/     # [微信小程序端] Vue 3 + Vite + TypeScript (移动端大图预览与快速审批)
├── packages/
│   └── shared/      # [公共共享包] 领域模型、DTO、枚举、状态机与 TypeScript 类型契约
└── database/
    └── init.sql     # 数据库完整建表脚本 (PostgreSQL / Supabase / MySQL)
```

---

## 二、快速启动指南

### 1. 安装依赖
在项目根目录执行（已配置好国内淘宝 npmmirror 镜像与脚本放行）：
```bash
pnpm install
```

### 2. 配置数据库与环境变量
在 `apps/server/.env` 中配置你的数据库连接串：
```env
PORT=8080
MYSQL_URL=mysql://用户名:密码@数据库主机:3306/数据库名
```
数据库端口需允许从本机连接；后端启动时会初始化所需数据表。

首次部署需要创建全部应用表和 12 个指定的测试账号时，执行 `BOOTSTRAP_PASSWORD=<初始密码> pnpm setup:database`。脚本会读取 `apps/server/.env`，只新增缺失账号，并核对已有账号的角色、状态和密码；发现冲突会退出，不会覆盖账号。数据库连接失败时不会写入任何账号。连接不稳定时可按顺序单独重试 `--phase=base`、`persistence`、`applications`、`evaluations`、`forms`、`chat`、`collaboration`、`accounts`，每个阶段均可重复执行。

### 3. 一键启动各端服务
本机开发推荐在项目根目录运行 `pnpm dev:up`：后台启动 API、Web、uni-app H5 预览和微信小程序监听构建，关闭终端后仍可继续访问。运行 `pnpm dev:status` 检查状态，`pnpm dev:restart` 清理 Web 开发缓存并重启，`pnpm dev:down` 停止。日志位于 `.cache/dev-stack/`；Web 为 `http://localhost:3000`，H5 预览为 `http://localhost:5173`，微信开发者工具导入 `apps/uni-app/dist/dev/mp-weixin`。代码修改由各开发服务自动监听；生产构建使用独立的 `.next` 目录，不会覆盖开发服务的 `.next-dev` 缓存。

也可以分别在终端运行以下命令：
* **启动后端 API 接口服务 (8080 端口)**：
  ```bash
  pnpm dev:server:retry
  ```
  此命令读取 `apps/server/.env`，默认重试 MySQL 5 次（每次连接超时 30 秒），连接并查询成功后才启动后端。只检查连接可运行 `pnpm check:db`；可通过 `--attempts=3 --timeout-ms=30000 --delay-ms=1000` 调整次数与间隔。重试耗尽会退出，不会自动使用内存存储。`pnpm dev:server` 仍可直接启动后端。数据库表已由 `setup:database` 完整创建时，可运行 `NODE_ENV=development DB_SCHEMA_PREPARED=1 pnpm dev:server`，直接加载数据库数据；升级应用表结构后需重新执行初始化脚本。聊天及需求协作表会在启动时单独检查。
* **启动 PC 端 SSR 前端工作台 (3000 端口)**：
  ```bash
  pnpm dev:web
  # 浏览器访问: http://localhost:3000
  ```
* **启动微信小程序端 (开发模式)**：
  ```bash
  pnpm dev:mp
  # 将 apps/uni-app/dist/dev/mp-weixin 目录导入微信开发者工具
  ```

---

## 三、核心功能清单

1. **审核任务中心 (`/review-tasks`)**：支持各电商平台主图/商详实时进度、审批状态汇总。
2. **专业级审核工作台 (`/review-workspace`)**：
   * 高清图像缩放平移
   * 画布矩形/图钉/圈点打标批注
   * 预设合规检查项
   * 一键通过与驳回工单下发
3. **设计稿提审中心 (`/review-submit`)**：支持 1:1 主图、3:4 长图及详情页分段批量上传。
4. **审核规则配置 (`/review-rules`)**：时效考核规则、严重等级与多级审核人配置。
5. **UniApp 微信小程序**：移动端消息待办卡片、移动端快速审批与驳回说明。
6. **订单聊天**：品牌方与接单设计师实时沟通，消息先落库再确认，断线后自动补拉。详见 [订单聊天说明](docs/order-chat.md)，运行 `pnpm check:chat` 可做临时订单集成检查。

7. **对话式需求协作与品牌方小程序**：发布模板 → 填写/修订 → 双方确认 → 正式需求版本 → 设计师承接 → 设计稿审核。详见 [接入与启动说明](docs/brand-miniapp-collaboration.md)，运行 `pnpm check:collaboration` 验证核心接口。后续可拖拽画布已预留版本、节点、连线与输入绑定契约。
