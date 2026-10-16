# 生图工作台商业化开发规格

## 产品边界

生图工作台作为独立业务模块提供独立入口、项目空间和权限规则，复用平台账号、AI 模型凭证、数据库、Redis、Socket.IO 与阿里云 OSS。首发形态为响应式 Web，覆盖桌面端与手机浏览器。不得依赖浏览器本地数据库保存业务项目、素材、任务或生成历史。

## 功能范围

### 快速创作

- 文本提示词编辑、润色、图像理解、多图参考、比例与尺寸等生成参数。
- 多轮生成会话、并发批次、单项重试、失败解释、历史检索、下载和项目归档。
- 页面离开、浏览器关闭或网络断开均不得导致后台任务丢失。

### 商品工作台

- 项目管理、素材分区上传、商品信息与品牌风格整理。
- 五维创作方向（卖点、痛点、主攻方向、目标人群、使用场景）。
- 素材逐张档案、人工修订、用途分布和素材版本。
- 分镜策划、商品/型号分配、竞品版式参考与选择理由。
- 分页文案、图像指令、批量任务、结果复核、排版和项目导出。
- 从第 28 轮更新包迁移已有项目字段，并保留导入/导出兼容性。

## 质量属性与验收约束

- **持久化**：项目、步骤数据、素材元数据、任务状态、事件和生成记录都由 MySQL 作为权威数据源；Redis 作为队列与短期任务协调层。浏览器只持有当前视图状态和短期上传凭证。
- **队列可靠性**：采用 BullMQ + Redis；数据库事务内写业务任务及 Outbox，由 dispatcher 投递到 Redis。投递使用稳定任务 ID；Worker 幂等处理；配置有限重试、指数退避、永久失败归档与人工重试。
- **状态通知**：浏览器不轮询任务。API 使用 Socket.IO 推送；任务事件先持久化再发布，重连时按事件游标补发。队列事件只是实时通知手段，数据库事件为恢复依据。
- **图片持久化**：输入图、参考图、AI 生成图、排版图统一转存至私有 OSS；数据库只保存 object key。禁止 public-read 和持久化签名 URL。读取时校验项目权限并签发短期 URL。
- **密钥**：API Key 仅存在现有加密配置表和服务端内存；客户端从不拿到 Key。生成记录仅存配置 ID、模型标识及经过筛选的错误信息。
- **权限**：项目 owner、组织成员与平台管理员按明确策略读写；每个项目、素材、任务、生成图和导出请求都执行对象级授权。
- **可运营性**：结构化日志带 request/job/project ID；记录操作审计、任务耗时、上游状态码分类、重试次数、OSS 失败与队列延迟；健康检查分别报告 MySQL、Redis、OSS 与 Worker 状态。
- **安全**：接口限流、幂等键、请求体上限、图片 MIME/解码校验、上游 URL SSRF 防护、签名过期、速率与并发配额、错误响应脱敏。
- **移动端**：窄屏单列步骤、触屏安全目标、固定底部主要动作、上传/压缩进度、断网恢复、长图预览和后台任务通知。

## 架构

```text
Next.js 响应式工作台
  ├─ REST：项目、素材登记、任务命令、历史快照
  └─ Socket.IO：有序推送任务进度和结果
             │
Express API ─┼─ MySQL：项目/资产/任务/结果/事件/Outbox
             ├─ Redis + BullMQ：图片分析、文案、分镜、图像生成队列
             └─ OSS：私有输入素材、输出图和导出包

独立 image-studio-worker 进程
  ├─ 消费 BullMQ 任务并调用现有 AI 配置所指向的服务
  ├─ 后台等待上游任务，处理超时、取消、重试与限流
  ├─ 将所有结果转存私有 OSS
  └─ 持久化事件/结果；API 的 QueueEvents 中继器负责 Socket.IO 推送
```

所有可重试作业都必须幂等。外部图像生成通常无法保证 exactly-once，因此每个生成槽位设唯一业务键；重试前先查询/恢复已有上游任务，避免无意重复扣费。API 成功响应表示“已持久化并接受”，不是“生成完成”。

## 数据模型（MySQL）

- `image_studio_projects`：owner、组织、名称、平台、状态、工作流 JSON、版本号、时间戳。
- `image_studio_assets`：项目、资产用途、来源、私有 OSS key、文件名/MIME/大小/尺寸/校验和、素材档案 JSON、人工覆盖字段、创建者。
- `image_studio_jobs`：项目、发起人、任务类别、状态、优先级、幂等键、AI 配置 ID、进度、尝试数、错误类别、开始/结束时间。
- `image_studio_generations`：job、分镜/槽位、最终提示词、参考资产 ID、模型/参数、状态、OSS key、上游 task ID、用量与费用估算。
- `image_studio_job_events`：单调递增事件序号、状态/进度 payload、产生时间，用于可靠重连和审计。
- `image_studio_outbox`：事务内待投递队列事件、投递次数、下次重试时间、最后错误和确认时间。
- `image_studio_model_profiles`：管理员维护的文本/图像能力映射，引用现有 AI 配置 ID，包含协议、模型覆盖、并发/超时/尺寸限制；不复制 API Key。
- `image_studio_audit_logs`：项目导入导出、删除、密钥配置引用变更、重试等敏感操作。

核心索引包括 owner/project 列表、项目资产、job 状态/创建时间、generation 的 job/slot 唯一键、events 的 project/job/sequence、outbox 待发送时间。按保留策略清理 Redis 完成/失败 job，但 MySQL 业务记录与 OSS 生命周期由产品保留策略单独管理。

## Redis 与队列

- 使用生产 Redis，配置 `REDIS_URL` 或 TLS/认证参数；不允许生产环境自动落回进程内队列。
- 队列按能力拆分：`image-studio-analysis`、`image-studio-text`、`image-studio-generation`、`image-studio-export`，并有可配置全局/用户并发与上游速率限制。
- Worker 独立部署，可按队列横向扩容；关闭时优雅 drain。BullMQ stalled job 恢复开启，设置合理 lock duration、renew 与 attempts/backoff。
- 使用 `QueueEvents` 监听跨 Worker 进度，再从 MySQL 读取安全事件发送到用户房间。禁止向事件流发送图片 Base64、Key 或完整上游响应。
- Redis 断连、队列不可用、MySQL 与 Redis 暂时不一致时由 Outbox 重试修复，不丢任务；对重复投递去重。
- 部署提供 Redis 持久化/备份、内存淘汰策略 `noeviction`、连接池/超时建议和监控指标。

## 图片上传与转存

1. API 校验项目权限、MIME、扩展名、上限和配额，生成随机私有 key 与短时 PUT 凭证。
2. 浏览器直传 OSS；完成接口用 HEAD 校验对象存在、大小与 Content-Type，并可记录 checksum。
3. 输入图进入素材表；所有 AI 视觉请求由 Worker 从私有 OSS 读取，不能依赖浏览器可访问 URL。
4. Worker 对上游图像响应做尺寸/字节上限验证。Base64 直接写 OSS；上游 URL 只允许 HTTPS 和经过验证的上游域名，限制重定向、超时及下载大小。
5. OSS 写入成功后再标记 generation 成功；DB 写入失败时通过幂等重试或补偿任务修复，孤儿对象交给清理器。

## API 与实时事件

- `POST /api/image-studio/projects`、`GET/PUT/DELETE /projects/:id`：项目与版本控制。
- `POST /projects/:id/assets/presign`、`POST /assets/:id/complete`、`PATCH/DELETE /assets/:id`：素材生命周期。
- `POST /projects/:id/jobs`：接收任务类型、目标槽位、配置引用、参数和幂等键；事务写 job + outbox 后返回 `202 Accepted` 与 job ID。
- `GET /projects/:id/jobs`、`GET /jobs/:id`、`POST /jobs/:id/retry`、`POST /jobs/:id/cancel`：历史及命令接口，不用于周期轮询。
- `GET /projects/:id/events?after=`：首次打开或 Socket 断线恢复时按游标补事件。
- Socket 认证 ticket 使用独立用途；客户端订阅前由服务端验证项目权限。
- 事件：`image-studio:job.accepted/progress/generation.completed/generation.failed/completed/failed/cancelled`，包含 event ID、project/job ID、状态和安全摘要。

## 实施阶段

1. **基线与契约**：冻结工作区现有改动；整理更新包业务规则、AI 协议、配置兼容策略、OSS 路径、权限与保留策略；产出数据字典/API/OpenAPI 和迁移回滚方案。
2. **运行时基础**：Redis 配置、BullMQ 队列模块、独立 Worker 入口、优雅关闭、健康检查、队列指标与部署配置。
3. **持久化核心**：MySQL 表与迁移、项目权限、事务 Outbox/dispatcher、幂等 job 状态机、事件日志和审计。
4. **AI 与 OSS 管线**：AI 配置 profile、文本/视觉/图像 provider adapters、上游等待、限流与费用记录、OSS 图片转存及补偿清理。
5. **实时通知**：Socket ticket、项目房间授权、QueueEvents 中继、事件游标补发与跨 Worker 实时状态。
6. **工作台迁移**：桌面与移动端独立 UI，按商品资料、素材、创作方向、分镜、提示词、生成、排版和导出逐功能迁移；旧项目导入转换。
7. **商业化验收**：权限矩阵、并发压力、故障注入、重复投递/重启恢复、Redis/MySQL/OSS 故障演练、移动端浏览器矩阵、备份恢复、日志脱敏和上线回滚演练。

## 上线门槛

- MySQL/Redis/OSS 缺一时工作台明确不可用，不悄悄使用内存、本地磁盘或浏览器存储兜底。
- API 只在 MySQL 与 Outbox 事务提交后确认任务；Redis 投递可恢复。
- Worker 重启后任务可继续；用户重复提交不生成重复 job；失败任务能解释、重试和追踪。
- 前端无周期轮询；Socket 重连可补齐事件，页面刷新可从数据库还原。
- 所有输出图在私有 OSS，DB 只有 key；用户越权读取项目、素材或任务均被拒绝。
- API Key、签名 URL、图片内容和完整上游报文不进入业务日志或 Socket payload。
- 桌面和手机完成端到端主流程，并有可重复的部署、迁移、备份与回滚手册。

## 当前仓库运行方式

1. 配置 `apps/server/.env`：`MYSQL_URL`、`REDIS_URL`、完整 OSS 凭证、`AI_CONFIG_ENCRYPTION_KEY`，以及生产 `JWT_SECRET`。将 Web 域名加入 `OSS_CORS_ORIGINS`。
2. 启动 API：`pnpm dev:server`；启动 Next Web：`pnpm dev:web`；另开进程启动 Worker：`pnpm dev:image-studio-worker`。生产用 `pnpm build:server` 后分别运行 API 与 `pnpm start:image-studio-worker`。
3. Worker 可运行多个副本；通过 `IMAGE_STUDIO_GENERATION_CONCURRENCY` 与模型档案的上游限制控制并发。生产 Redis 使用持久化/高可用部署、TLS/ACL、`maxmemory-policy noeviction`，并监控队列积压、失败数与最老任务等待时间。
4. API 启动时创建工作台表；健康检查 `GET /api/image-studio/health` 对 MySQL、Redis 和 OSS 进行依赖检查。生产环境禁止在 Redis 或 OSS 不可用时提交生成任务。

当前代码范围是商业化后端/项目基础和第一条快速生图链路；完整迁移更新包中的五维创作方向、商品/素材 AI 分析、分镜策划、竞品参考语义、排版与项目包导入导出仍需按上方“实施阶段”继续交付，不得把当前快速生图入口当作完整功能验收。
