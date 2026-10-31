# 设计 Agent 的持续对话与项目记忆

设计工作台的聊天入口使用后端会话接口。浏览器发送原始文本、附件 ID 和选中的画布节点，不再拼接最近几条历史并按字符截断，也不在前端生成固定回复。

## 存储与兼容

- `image_studio_agent_sessions`：项目隔离的当前记忆、滚动摘要、会话版本、处理租约。
- `image_studio_agent_messages`：完整消息、附件、画布引用和每个用户消息对应的回复任务。
- `image_studio_agent_runs`：每次处理的输入、状态、错误和制作请求。
- `image_studio_agent_plan_revisions`：实际变更后的完整方案快照。
- `image_studio_agent_memory_events`：字段更新前后的值、确认状态和来源消息。

这些表通过现有 `ensureImageStudioSchema` 启动流程创建。首次打开旧项目时导入原有 `workflow.workbench.messages` 和当前方案，不删除旧字段。当前方案仍保存在 `workflow.designAgent`，兼容现有制作、审稿和 Brand Kit。

## 每轮处理

1. 验证项目、附件和画布对象的所有权。
2. 通过 `clientMessageId` 去重，保存用户原文并领取项目级处理租约。
3. 加载最新方案、项目事实、摘要、近期消息及相关旧消息；引用图片从 OSS 读取。
4. 沿用 Mastra Agent 和管理员配置的模型，返回实际回复、局部修改及事实来源。
5. 服务端检查方向、Skills、任务依赖与作品引用。
6. 同一事务提交回复、记忆、方案版本及任务更新状态。模型或校验失败不改变已确认档案。

普通解释只保存回复，不创建方案版本。兼容模型将明确的只读问题直接回答为纯文本时，可以安全接收该回答，但不会从纯文本推断任何档案修改。

## 记忆规则

- 明确用户决定与模型建议分别记录为 `confirmed` / `suggested`。
- 确认事实必须引用真实用户消息；旧来源不能覆盖更新的用户决定。
- 标量字段替换当前值；设计约束、已知事实等列表默认追加，通过明确的删除项撤销旧要求。
- 模型仅通过记忆字段表达的标准简报修改也会合并进当前方案，防止丢失旧约束。
- 推荐预填答案不等于已确认答案。用户实际选择、编辑或确认方案后才记入确认事实。
- 已回答的问题按稳定 ID 和已确认的问题标签去重。
- 图像专属修改使用 `slot.{slotKey}`，只加入对应图片的制作提示。
- 复用作品使用项目真实资产 ID；历史图片和新版图片并存。

上下文按保守 token 估算进行预算分配，默认 `DESIGN_AGENT_CONTEXT_TOKENS=24000`。当前方案、项目记忆和摘要优先保留，再选取近期消息及相关旧消息。完整原文保留在数据库；固定资料本身超过预算时返回明确错误，不静默删除关键约束。

## 制作衔接

任务使用稳定 ID。方案有实际修改时，未受影响的任务状态迁移到新版本；受影响的任务及依赖步骤标为 `stale`（界面显示“待更新”），旧作品保留。

制作请求绑定方案版本、需求快照和记忆版本。旧任务完成时更新自己的版本，不能覆盖新版待更新状态。用户可在制作期间继续对话；若需求版本改变，一键制作会在当前任务完成后停止安排旧计划的后续步骤。

对话返回的制作动作由工作台接入现有任务流程。明确的制作命令可自动执行；修改建议显示可点击的制作按钮。按对话 run ID 构造幂等键，重试或重复点击不会重复创建同一制作任务。指定 slotKey 时仅生成对应图片，并把原图作为局部修改参考。

## API

| 方法与路径（项目路径下） | 用途 |
| --- | --- |
| `GET design-agent/conversation?beforeSeq=` | 最近 60 条或更早消息、项目记忆、会话版本 |
| `POST design-agent/messages` | 发送原始消息；包含 `clientMessageId`、`text`、`mode` |
| `GET design-agent/runs/:runId` | 刷新或断线后恢复回复状态 |
| `POST design-agent/messages/:messageId/retry` | 复用原用户消息重试，使用当前模型设置 |
| `GET design-agent/revisions` | 查看历史方案 |

单项目同一时间处理一轮消息，租约为 180 秒。进程中断后租约过期会将该轮标为失败，用户可以重试。旧的失败消息已有后续对话时，要求作为新消息发送，避免旧意图覆盖新决定。

## 验证

```powershell
pnpm --filter @design-review/server exec tsx --test src/services/image-studio-agent-memory.test.ts
pnpm --filter @design-review/server exec tsc --noEmit
pnpm --filter @design-review/web exec tsc --noEmit

# 使用配置的数据库和独立测试项目，模型回复使用模拟数据。
$env:IMAGE_STUDIO_RUN_DB_TESTS='1'
pnpm --filter @design-review/server exec tsx --test src/services/image-studio-agent-chat.integration.test.ts
```

集成测试覆盖 30 轮持续对话、历史分页、重复请求、失败重试、并发串行化、方案历史和项目隔离，最后删除本次创建的测试记录。
