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
DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/design_review_db
```
并在你的数据库中执行 `database/init.sql` 建表脚本。

### 3. 一键启动各端服务
* **启动后端 API 接口服务 (8080 端口)**：
  ```bash
  pnpm dev:server
  ```
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
