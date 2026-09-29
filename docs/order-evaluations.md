# 订单合作评价

## 产品规则

- 作品审核通过、尾款支付成功且已验收后开放 14 天；评价不影响结算、提现或下载。
- 品牌方与设计师双向评价，每个订单每个方向一次；提交后不可修改。
- 同组织管理员可以代表品牌方提交，但共享同一评价名额；信誉归属订单发布账号。
- 双方提交或评价期结束后公开；公开前不向对方返回星级、文字或标签，也不计入主页统计。
- 星级必填（1～5 整数），标签最多 3 个、文字最多 500 字，均可留空；不预选五星，不生成默认好评。
- 公开后被评价账号可以回复一次（1～500 字）。低分不会自动隐藏。
- 同手机号自交易的评价可在交易双方订单内查看，但不进入公开评价列表与信誉统计。
- 取消或退款订单关闭评价；评价期内的纠纷暂停提交和公开，处理后保留剩余时间。
- 已公开后的纠纷由客服依据结果处理评价，不因举报自动下架。
- 举报原因与说明提交后由客服保留、隐藏或恢复；操作理由、通知及审计一起提交。

## 页面与设计依据

主体沿用现有白色卡片、细边框、角色主题和 Modal；星级使用金色，按钮和选中标签用角色主题色。
表单采用未预选的单项总评分，PC 弹窗、移动端二级页及固定提交栏，提交前展示确认摘要。
双向延迟公开参考 Upwork 和 Airbnb 的评价规则：

- https://support.upwork.com/hc/en-us/articles/211062188-How-to-leave-an-end-of-contract-review-for-your-freelancer
- https://www.airbnb.com/help/article/995

| 入口 | PC | 移动端 |
| --- | --- | --- |
| 我的评价 | `/evaluations`（用户菜单） | `/mobile/evaluations`（我的） |
| 订单评价 | 订单列表、订单详情、任务详情的弹窗；`/evaluations/orders/:id` | `/mobile/evaluations/orders/:id` |
| 用户合作评价 | `/evaluations/users/:id`；设计师主页、申请卡片、接单详情 | `/mobile/evaluations/users/:id`；设计师主页、申请卡片、接单详情 |
| 客服管理 | `/service/evaluations` | `/mobile/service/evaluations` |
| 管理员管理 | `/admin/evaluations` | `/mobile/service/evaluations` |

我的评价支持 `?tab=pending|received|sent`。分页为每页 10 条。
公开展示脱敏姓名、类别、日期、评分、标签、文字与回复；不返回订单金额、需求或文件。
现有质量分、准时率与真实合作评分保持独立；首期不调整接单资格和推荐排序。

## 接口

统一前缀 `/api/order-evaluations`，全部需要登录。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/orders/:orderId` | 交易双方查看当前评价资格和可见内容；客服/管理员可查看 |
| POST | `/orders/:orderId` | 提交 `{score, tags, comment}`；目标用户由服务端确定 |
| GET | `/mine?tab=pending|received|sent` | 我的评价，支持 page/pageSize |
| GET | `/users/:userId` | 已公开且有效的评价、均分和数量 |
| POST | `/:id/reply` | 被评价账号回复 `{reply}` |
| POST | `/:id/reports` | 举报 `{reason, description}` |
| GET | `/management/list?visibility=all|visible|hidden` | 客服/管理员查询全部评价 |
| GET | `/management/reports?status=open|resolved` | 客服/管理员查询举报 |
| POST | `/management/:id` | 客服/管理员处理 `{action: keep|hide|restore, reason}` |

## 数据库和运行

新增 `order_evaluation_config`、`order_evaluation_sessions`、`order_evaluations`、`order_evaluation_reports`。
激活时间保存在数据库中，重复迁移或重启不会重新开启历史订单的评价期。
每个订单的两个方向使用数据库唯一约束，写操作先锁定订单；评级内容、公开状态、站内消息均在事务内提交。
评价提交失败时不退回内存存储。

```powershell
pnpm migrate:order-evaluations
```

后端启动也会执行幂等建表。默认只开放激活时间之后完成付款/验收的订单，历史已验收订单不补评、不补造评分。
验收/支付和纠纷动作立即同步；后端每分钟补处理到期、暂停恢复和未同步订单，重启后补扫。
提醒及公开通知用确定的消息 ID 去重，已读状态不会因重试被覆盖；实时广播沿用 SSE。
若事务提交后进程中断，消息仍已保存在数据库，客户端重新连接/加载即可读取。
当前实时广播仍有现有单进程限制；多实例部署时需共享 SSE 事件通道。

## 本次验证范围

已执行数据库迁移、前后端 TypeScript 静态检查；未执行真实支付、双方评价或客服操作的端到端测试。
