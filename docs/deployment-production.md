# 生产部署手册（Linux 单机起步）

本方案使用一个 HTTPS 域名承载 PC/H5 页面、小程序 API 和实时连接。Nginx 对外开放 80/443；Next.js Web 在本机 3000、Express API 在本机 8080、生图 Worker 为独立进程。MySQL、Redis 和私有 OSS 可使用托管服务。生产环境先保持 **一个 API 实例**；当前聊天和业务广播存在进程内状态，多 API 实例需要先接入共享实时事件通道。

以下示例域名为 `app.example.com`，目录为 `/opt/design-review-system`，运行用户为 `designreview`。上线前替换为自己的值。项目当前有未提交的本地修改，发布时须固定完整的源码版本，不能只拉取远端旧提交。

## 1. 基础设施与备份

- 准备 Linux 主机、Node.js 22 LTS、与锁文件兼容的 pnpm（当前开发环境为 11.25.0）、Nginx、有效的 HTTPS 证书、MySQL 8、启用持久化的 Redis，以及私有阿里云 OSS Bucket。Node 和 pnpm 应由系统级安装，让 systemd 运行用户能找到 `node`。
- 将域名解析至主机。只向公网开放 80/443；通过防火墙限制 3000、8080、MySQL 和 Redis 的访问。MySQL/Redis 使用独立凭据，Redis 生产环境使用 ACL/TLS、持久化并避免淘汰队列数据。
- 首次或每次更新数据库结构前做 MySQL 快照；定期备份 MySQL、Redis 和 OSS。确认恢复流程可用。若有仍保存在服务器上的历史本地上传，另行备份 `apps/server/private-uploads` 与 `apps/server/uploads`。
- 准备源码并由专用用户持有：

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin designreview
sudo mkdir -p /opt/design-review-system
sudo chown -R designreview:designreview /opt/design-review-system
# 将固定版本的完整源码放到 /opt/design-review-system；不要上传 node_modules 或本机 .env
cd /opt/design-review-system
pnpm install --frozen-lockfile
```

执行安装、构建和数据库命令的账号须能写入该目录。不要用开发用的 `pnpm dev:up` 启动生产服务。

## 2. 配置服务端与 Web

以 [服务端示例](../apps/server/.env.example) 为基础，在 `apps/server/.env` 填写真实值，文件权限设为 `chmod 600`，至少包含：

```dotenv
NODE_ENV=production
PORT=8080
MYSQL_URL=mysql://USER:PASSWORD@MYSQL_HOST:3306/DB_NAME
REDIS_URL=rediss://USER:PASSWORD@REDIS_HOST:6379/0
JWT_SECRET=REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
AI_CONFIG_ENCRYPTION_KEY=REPLACE_WITH_SEPARATE_STABLE_RANDOM_SECRET
WEB_ORIGIN=https://app.example.com
PUBLIC_API_ORIGIN=https://app.example.com
OSS_REGION=oss-cn-guangzhou
OSS_BUCKET=YOUR_PRIVATE_BUCKET
OSS_ACCESS_KEY_ID=YOUR_SERVER_SIDE_KEY_ID
OSS_ACCESS_KEY_SECRET=YOUR_SERVER_SIDE_KEY_SECRET
OSS_CORS_ORIGINS=https://app.example.com
WECHAT_MINI_APP_ID=YOUR_APP_ID
WECHAT_MINI_APP_SECRET=YOUR_APP_SECRET
```

Web SSR 校验登录 Cookie 时只从 `apps/server/.env` 读取 `JWT_SECRET`，不再配置 Web 侧的重复密钥。确保该文件在 Web 构建与运行时都存在，并允许运行 Web 的账号读取。不要在 `VITE_*` 或 `NEXT_PUBLIC_*` 中存放密钥。Web 和 API 使用同一个域名时，**不要设置** `API_PROXY_TARGET` 和 `NEXT_PUBLIC_SOCKET_URL`：Nginx 直接分流 `/api/`、`/socket.io/`、`/chat/live` 和 `/uploads/`。浏览器 OSS 直传需要允许 Web 域名的 PUT/GET/HEAD；服务启动时会尝试补齐 Bucket CORS。Bucket 保持私有读、关闭公共列举。AI 模型凭据在后台配置，`AI_CONFIG_ENCRYPTION_KEY` 一经使用应稳定保存。支付、SMTP、短信等可选服务按实际启用项配置。

## 3. 建表、管理员与构建

**先完成数据库快照**，然后在项目根目录执行：

```bash
pnpm setup:database:schema
pnpm build:server
pnpm build:web
test -f apps/server/dist/server.js
test -f apps/server/dist/image-studio-worker-main.js
test -f apps/web/.next/BUILD_ID
sudo chown -R designreview:designreview /opt/design-review-system
sudo chmod 600 apps/server/.env
```

`setup:database:schema` 只建立或补齐业务表，不创建演示账号。全新数据库可用以下命令创建一个指定管理员；已有管理员时跳过。密码从交互终端输入，避免写入 `.env` 或命令历史：

```bash
read -r -s -p '初始管理员密码（至少 16 位）: ' BOOTSTRAP_ADMIN_PASSWORD; echo
export BOOTSTRAP_ADMIN_EMAIL='admin@your-domain.example'
export BOOTSTRAP_ADMIN_NAME='系统管理员'
export BOOTSTRAP_ADMIN_PASSWORD
pnpm setup:admin
unset BOOTSTRAP_ADMIN_PASSWORD
```

既有的 `pnpm setup:database` 会创建 12 个测试账号，**生产部署不要使用这个命令**。

## 4. 守护进程与 HTTPS 入口

先确认示例中的用户、路径、Node 可执行文件、域名和证书路径，再安装 [API](../deploy/systemd/design-review-api.service)、[Web](../deploy/systemd/design-review-web.service)、[Worker](../deploy/systemd/design-review-worker.service) 三个 systemd 单元。证书可以用现有证书系统申请；启用 Nginx 配置前确保证书文件已存在。

```bash
sudo cp deploy/systemd/design-review-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now design-review-api design-review-web design-review-worker
sudo systemctl status design-review-api design-review-web design-review-worker
```

以 [Nginx 示例](../deploy/nginx/design-review.conf.example) 配置站点，替换域名和证书路径。该配置代理 100 MB 文件上传，并将 Socket.IO `/socket.io/` 和小程序 WebSocket `/chat/live` 转发至 API。

```bash
sudo cp deploy/nginx/design-review.conf.example /etc/nginx/conf.d/design-review.conf
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://app.example.com/api/health
journalctl -u design-review-api -u design-review-worker -u design-review-web -n 100 --no-pager
```

`/api/health` 仅证明 API 进程可响应；数据库、Redis、OSS 和 Worker 还需用客服账号访问 `/api/image-studio/health` 并确认返回 200，以及实际检查登录、上传和聊天实时连接。

## 5. 微信小程序发布

在 `apps/uni-app/.env.production.local` 写入公网地址：

```dotenv
VITE_API_BASE_URL=https://app.example.com/api
```

然后执行 `pnpm build:mp`，检查 `apps/uni-app/dist/build/mp-weixin/lib/api.js` 中是公网 HTTPS 地址，再将 `apps/uni-app/dist/build/mp-weixin` 导入微信开发者工具上传。**不要把开发机的 `.env.local` 局域网地址带进发布包**；生产专用 `.env.production.local` 的优先级高于通用 `.env.local`，也不要在构建进程中另设同名 `VITE_API_BASE_URL` 覆盖它。

微信公众平台按实际访问域名配置 request、uploadFile、downloadFile、socket 合法域名；如果小程序直接访问 OSS 签名 URL，还需配置相应的 OSS 域名。正式包使用 HTTPS/WSS，不能依赖开发工具的“忽略合法域名”设置。

## 6. 更新、回滚与监控

每次发布记录源码提交号/包校验值，先备份数据库和当前可运行版本。更新时停止新写入、部署完整源码、`pnpm install --frozen-lockfile`、`pnpm setup:database:schema`、`pnpm build:server`、`pnpm build:web`，再按 Worker → API → Web 的顺序重启，检查健康接口与关键业务流程。Worker 收到 SIGTERM 时会尝试优雅排空；systemd 已提供 45 秒停止窗口。小程序需要重新编译、上传和发布，Web 部署不会自动更新小程序。

代码回滚使用上一份完整源码及其构建产物，然后重启三个服务；数据库结构和数据只通过事先准备的备份/专门迁移回退，不能把代码回滚等同于数据库回滚。日常监控至少覆盖进程重启、API 错误率、MySQL 连接、Redis 可用性和队列积压、Worker 心跳、OSS 上传失败，以及证书到期。

### 客服登录成功后又跳回登录页

客服工作台入口是 `/service/dashboard`；`/admin` 是系统管理员专用页面。客服登录接口由 API 签发 `auth_token` Cookie，Web 服务端还会独立验证该 Cookie。Web 与 API 统一只从 `apps/server/.env` 读取 `JWT_SECRET`，至少 32 位。修改后重启 API 和 Web：

```bash
sudo systemctl restart design-review-api design-review-web
sudo systemctl status design-review-api design-review-web
journalctl -u design-review-api -u design-review-web -n 100 --no-pager
```

在浏览器开发者工具的 Network 中检查 `POST /api/auth/login` 是否成功，并确认响应包含 `Set-Cookie: auth_token=...`；随后确认浏览器在当前 HTTPS 域名下保存了 `auth_token`。若登录请求成功但打开工作台后仍回到登录页，确认 `apps/server/.env` 存在且 Web 运行账号可读取，并确认 `/api/` 代理保留了响应中的 `Set-Cookie`。Web 启动时会从该文件加载 JWT 密钥；文件缺失或密钥少于 32 位会直接报配置错误，不能通过修改角色权限解决。
