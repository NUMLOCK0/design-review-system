# 订单聊天与消息可靠性

网页协作入口位于 `/chat`，订单聊天位于 `/chat/orders/:orderId`（移动网页为 `/mobile/orders/:id/chat`）。已分配设计师的订单支持文本沟通、需求核对卡、文字版 A/B 提案卡与方案选择。品牌方和设计师共用订单时间线，但显示各自的操作入口和主题。站内通知 `/api/messages` 继续独立运行。

## 保存与恢复

1. 浏览器先把待发消息及 UUID 写入 IndexedDB，写入成功后才发起发送。
2. Socket.IO `chat:send` 或 HTTP 备用接口调用同一个数据库事务。事务锁住订单会话序号，写入 `chat_messages` 后才提交。
3. 服务端提交成功后才确认，并向订单当前双方广播 `chat:message`。同一发送人使用同一 UUID 重试时，数据库唯一约束返回原消息，不再生成第二条。
4. 客户端收到确认或历史补拉中看到自己的消息后，才从 IndexedDB 删除待发记录。连接失败时保留待发记录，定时、重新联网、页面恢复和重连时重试。
5. 消息历史按订单内递增 `seq` 从 MySQL 分页补拉。Socket.IO 广播只负责及时提醒，断线、进程重启或多实例间遗漏广播不会成为历史缺口。

这提供正常网络中断、浏览器刷新和确认丢失情况下的**至少一次尝试、数据库内单次写入**。无法对浏览器存储被用户清除、设备损坏、数据库永久丢失等情况承诺绝对零损失；生产环境应配置 MySQL 持续备份及恢复演练。

## 接口与部署

- `POST /api/chat/socket-ticket`：使用现有登录令牌换取 60 秒 Socket.IO 连接凭证。
- `GET /api/chat/orders/:orderId/messages?afterSeq=N`：按序号补拉，最多 100 条一页。
- `GET /api/chat/conversations`：返回当前用户参与的已分配订单会话和最新消息摘要。
- `GET /api/chat/orders/:orderId`：返回当前订单需求、参与方和摘要，供协作页与移动详情使用。
- `POST /api/chat/orders/:orderId/messages`：HTTP 备用发送，必须复用相同 `clientMessageId`。
- Socket.IO 路径 `/socket.io`，事件 `chat:send` 与 `chat:message`。
- 只有订单创建者与实际接单设计师可访问；数据库不可用时发送失败，不会回退到进程内存。
- 协作卡片使用带版本前缀的消息内容，沿用同一消息去重与离线补拉机制。服务端校验卡片字段和操作方：设计师提交需求核对与 A/B 提案，订单创建者选择方案；每份提案只可选择一次。卡片目前是聊天记录，不改变订单审核、付款或交付状态。
- A/B 提案目前支持文字方案说明；图片上传、批注、正式需求版本快照与订单状态联动尚未接入。
- 本地网页默认直连同主机 `:8080`；线上须让反向代理转发 `/socket.io` 的 WebSocket Upgrade 请求到后端，或在构建网页时设置 `NEXT_PUBLIC_SOCKET_URL=https://<API域名>`。`WEB_ORIGIN` 需包含网页来源。
- 多个 API 实例部署时，跨实例实时广播需要 Socket.IO Redis adapter；在配置 adapter 前，各客户端仍会通过历史补拉获取消息，但实时提示可能延迟至下一次同步。
- 小程序接入时可复用同一 HTTP 历史与发送接口，并使用适配微信运行时的 Socket.IO 客户端；小程序离线通知另需订阅消息机制。

运行 `pnpm check:chat` 可针对当前数据库和运行中的 API 做临时订单集成检查，测试后清理临时消息与订单。
