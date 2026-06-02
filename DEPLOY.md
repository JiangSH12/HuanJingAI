# 幻境 AI 创作平台 — 部署文档

## 0. 数据安全保障

重新部署**不会丢失任何用户数据**，原因如下：

| 数据类型 | 存储位置 | 是否受部署影响 |
|---------|---------|-------------|
| 用户账号 (auth.users) | Supabase 云端 | ❌ 不受影响 |
| 用户资料 (profiles) | Supabase 云端 | ❌ 不受影响 |
| 创作作品 (works) | Supabase 云端 | ❌ 不受影响 |
| 积分记录 (credit_transactions) | Supabase 云端 | ❌ 不受影响 |
| 订单 (orders) | Supabase 云端 | ❌ 不受影响 |
| 公告 (announcements) | Supabase 云端 | ❌ 不受影响 |
| 网站配置 (site_config) | Supabase 云端 | ❌ 不受影响 |
| AI 生成媒体文件 | S3 对象存储 | ❌ 不受影响 |
| 创作历史 (localStorage) | 用户浏览器本地 | ❌ 不受影响 |

`init-database.sql` 使用 `CREATE TABLE IF NOT EXISTS` 和 `ON CONFLICT DO NOTHING`，不会删除或覆盖已有数据。

## 1. 项目概述

妙境（MiaoJing）是一站式 AI 多模态创作平台，提供文生图、图生图、文生视频、图生视频四大核心能力，配套用户管理、积分系统、管理后台等完整功能。

**技术栈**: Next.js 16 + React 19 + TypeScript 5 + shadcn/ui + Tailwind CSS 4 + Supabase

---

## 2. 资源需求

### 最低配置

| 资源 | 要求 | 说明 |
|------|------|------|
| CPU | 2 核 | 构建时需要较多 CPU |
| 内存 | 4 GB | Next.js 构建峰值约 2-3 GB |
| 磁盘 | 20 GB | 包含 Node.js 运行时 + 构建产物 |
| 网络 | 公网访问 | 需访问 Supabase 和 AI API |

### 推荐配置

| 资源 | 要求 | 说明 |
|------|------|------|
| CPU | 4 核 | 并发生成请求时更流畅 |
| 内存 | 8 GB | 多用户同时访问时留有余量 |
| 磁盘 | 40 GB SSD | 更快的构建和启动速度 |
| 带宽 | 10 Mbps+ | 生成图片/视频下载 |

---

## 3. 支持的操作系统

| 操作系统 | 版本 | 状态 |
|----------|------|------|
| Ubuntu | 20.04+ | 推荐 |
| Debian | 11+ | 支持 |
| CentOS / RHEL | 8+ | 支持 |
| macOS | 12+ | 开发环境 |
| Windows | WSL2 | 开发环境 |

> 生产环境推荐 Ubuntu 22.04 LTS

---

## 4. 环境依赖

### 必需软件

| 软件 | 最低版本 | 安装方式 |
|------|----------|----------|
| Node.js | 20.x+ | [nvm](https://github.com/nvm-sh/nvm) 或 [NodeSource](https://github.com/nodesource/distributions) |
| pnpm | 9.x+ | `npm install -g pnpm` |
| Git | 2.x+ | 系统包管理器 |

### Node.js 安装（推荐 nvm）

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### pnpm 安装

```bash
npm install -g pnpm
```

### 外部服务

| 服务 | 用途 | 是否必需 |
|------|------|----------|
| Supabase | 数据库 + 认证 + 存储 | 推荐（不配置则运行 Demo 模式） |
| AI API (OpenAI 兼容) | 图片/视频生成 | 用户自行配置或管理员配置系统 API |

> **Demo 模式说明**: 不配置 Supabase 时，系统自动降级为 Demo 模式。登录/注册返回模拟数据，管理后台写入操作返回 503。前端功能完整可用，用户可通过"自定义 API"配置自己的 AI 模型密钥。

---

## 5. Coze SDK 配置（内置模型）

### 5.1 获取 Coze API 凭证

1. 访问 [Coze 开发者平台](https://www.coze.com/)
2. 登录后进入个人设置或开发者设置
3. 获取 API 密钥（Workload Identity API Key）
4. 记录以下信息：
   - **API Key** → 对应 `COZE_API_KEY`
   - API 地址：`https://api.coze.com`（`COZE_API_BASE_URL`）
   - 模型地址：`https://model.coze.com`（`COZE_MODEL_BASE_URL`）

### 5.2 配置环境变量

```bash
COZE_API_KEY=your_api_key_here
COZE_API_BASE_URL=https://api.coze.com
COZE_MODEL_BASE_URL=https://model.coze.com
```

### 5.3 使用方式

| 模式 | 说明 | 是否消耗积分 |
|------|------|-------------|
| **内置模型（默认）** | 使用 coze-coding-dev-sdk + 豆包模型 | ✅ 消耗平台积分 |
| 自定义 API | 用户配置自己的 API 密钥 | ❌ 不消耗积分 |
| 系统模型 | 管理员配置的系统默认 API | ✅ 按管理员配置消耗 |

---

## 6. Supabase 配置

### 6.1 创建 Supabase 项目

1. 访问 [https://supabase.com](https://supabase.com) 注册并登录
2. 点击「New Project」，选择组织、填写项目名称和数据库密码
3. 选择离用户最近的区域，点击「Create new project」
4. 等待项目初始化完成（约 2 分钟）

### 6.2 获取 API 密钥

1. 进入项目 Dashboard → Settings → API
2. 记录以下信息：
   - **Project URL** → 对应 `SUPABASE_URL`
   - **anon public** key → 对应 `SUPABASE_ANON_KEY`
   - **service_role** key → 对应 `SUPABASE_SERVICE_ROLE_KEY`（⚠️ 保密！）

### 6.3 初始化数据库

1. 进入项目 Dashboard → SQL Editor
2. 点击「New query」
3. 复制 `scripts/init-database.sql` 的全部内容并粘贴
4. 点击「Run」执行
5. 确认输出 `Database initialization completed successfully!`

该脚本会创建：
- 8 张数据表（profiles, works, credit_transactions, orders, user_api_keys, work_likes, site_config, announcements）
- 所有索引
- RLS（行级安全）策略
- 自动更新 `updated_at` 的触发器
- 新用户注册自动创建 profile 的触发器
- 默认网站配置

### 5.4 创建 Storage 桶

1. 进入项目 Dashboard → Storage
2. 点击「New bucket」
3. 创建名为 `site-assets` 的桶，勾选「Public bucket」→ 保存
4. （可选）创建名为 `works` 的私有桶，用于存储用户作品

### 5.5 配置认证

1. 进入项目 Dashboard → Authentication → Providers
2. 确认 Email 已启用
3. （可选）配置 SMTP 邮件发送（Settings → Authentication → SMTP Settings）
4. （可选）配置社交登录（Google、GitHub 等）

---

## 6. 部署步骤

### 方式一：直接部署（推荐）

#### 步骤 1: 获取源码

```bash
git clone <your-repo-url> /opt/miaojing
cd /opt/miaojing
```

#### 步骤 2: 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填写 Supabase 配置：

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

#### 步骤 3: 安装依赖

```bash
pnpm install
```

#### 步骤 4: 构建生产版本

```bash
pnpm build
```

构建产物位于 `.next/` 目录，通常需要 2-5 分钟。

#### 步骤 5: 启动服务

```bash
# 前台启动（调试用）
pnpm start

# 后台启动（生产推荐）
nohup pnpm start > /var/log/miaojing/app.log 2>&1 &
```

默认监听端口 **5000**，可通过环境变量 `DEPLOY_RUN_PORT` 修改。

#### 步骤 6: 验证服务

```bash
curl -I http://localhost:5000
# 期望返回 HTTP/1.1 200 OK
```

### 方式二：Docker 部署

#### 步骤 1: 创建 Dockerfile

项目根目录下创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine AS base

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 5000
ENV PORT=5000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

> 注意：如需 standalone 模式，需在 `next.config.ts` 中添加 `output: 'standalone'`。

#### 步骤 2: 构建镜像

```bash
docker build -t miaojing:latest .
```

#### 步骤 3: 运行容器

```bash
docker run -d \
  --name miaojing \
  -p 5000:5000 \
  -e SUPABASE_URL=https://xxxxx.supabase.co \
  -e SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs... \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs... \
  --restart unless-stopped \
  miaojing:latest
```

### 方式三：Nginx 反向代理 + PM2 守护进程

#### 步骤 1-4: 同「方式一」

#### 步骤 5: 安装 PM2

```bash
npm install -g pm2
```

#### 步骤 6: 创建 PM2 配置

在项目根目录创建 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'miaojing',
    script: 'pnpm',
    args: 'start',
    cwd: '/opt/miaojing',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    error_file: '/var/log/miaojing/error.log',
    out_file: '/var/log/miaojing/out.log',
  }],
};
```

#### 步骤 7: 启动 PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # 设置开机自启
```

#### 步骤 8: 配置 Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 301 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置 — AI 生成可能耗时较长
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

#### 步骤 9: 配置 SSL 证书（推荐 Certbot）

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

---

## 7. 数据保存目录

| 数据类型 | 保存位置 | 说明 |
|----------|----------|------|
| 应用源码 | `/opt/miaojing` | Git 仓库 |
| 构建产物 | `/opt/miaojing/.next/` | Next.js 编译输出 |
| 环境变量 | `/opt/miaojing/.env.local` | ⚠️ 敏感信息，不要提交到 Git |
| 运行日志 | `/var/log/miaojing/` | PM2/Nohup 输出 |
| 用户数据 | Supabase (云端) | profiles, works, orders 等 |
| 用户上传 | Supabase Storage (云端) | Logo, Favicon, 作品 |
| 生成文件 | S3 兼容对象存储 | AI 生成的图片/视频 |
| 浏览器缓存 | 用户浏览器 localStorage | 创作历史、积分记录、自定义 API 密钥 |

> **重要**: 本项目不在服务器本地存储用户数据。所有持久化数据存储在 Supabase（云端数据库）和 S3 兼容对象存储中。

---

## 8. 管理员设置

### 8.1 创建管理员

1. 先通过网站正常注册账户
2. 在 Supabase SQL Editor 中执行：

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-admin@example.com';
```

3. 重新登录即可访问 `/admin` 管理后台

### 8.2 管理后台功能

| Tab | 功能 |
|-----|------|
| API 管理 | 添加/编辑系统 AI 模型 API（图片/视频/文本类型），配置积分消耗 |
| 用户管理 | 查看/编辑用户资料、角色、积分、配额、状态 |
| 定价与积分 | 编辑会员套餐价格、积分购买包 |
| 支付设置 | 启用/禁用支付方式（支付宝/微信/Stripe） |
| 公告管理 | 创建/编辑/删除公告（支持 Markdown，所有访客可见） |
| 网站设置 | 自定义网站名称、Logo、Favicon |

---

## 9. 功能验证清单

部署完成后，按以下清单验证功能：

### 基础功能
- [ ] 首页正常加载
- [ ] 登录/注册功能
- [ ] 创作中心页面加载
- [ ] 画廊页面加载
- [ ] 个人中心页面加载

### AI 创作功能
- [ ] 文生图（需配置 AI API）
- [ ] 图生图（需配置 AI API）
- [ ] 文生视频（需配置 AI API）
- [ ] 图生视频（需配置 AI API）
- [ ] 提示词优化（需配置文本类型 AI API）
- [ ] 创作历史记录

### 管理后台
- [ ] 管理员登录后可访问 /admin
- [ ] API 管理：增删改系统模型
- [ ] 用户管理：查看/编辑用户
- [ ] 公告管理：创建/编辑公告
- [ ] 网站设置：修改名称/Logo/Favicon

### 数据持久化
- [ ] 用户注册后数据写入 Supabase
- [ ] 公告从 Supabase 正确读取
- [ ] 网站配置保存到 Supabase
- [ ] 生成的图片/视频正确上传到对象存储

---

## 10. 常见问题排查

### Q: 构建失败 "JavaScript heap out of memory"

```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm build
```

### Q: 服务启动后无法访问

1. 检查端口是否被占用：`ss -tuln | grep 5000`
2. 检查防火墙：`sudo ufw status`
3. 检查日志：`tail -50 /var/log/miaojing/error.log`

### Q: 登录返回 Demo 模式

说明 Supabase 环境变量未正确配置。检查：
1. `.env.local` 文件是否存在
2. `SUPABASE_URL` 等变量是否填写正确
3. 重启服务使环境变量生效

### Q: AI 生成报网络错误

1. 检查自定义 API 地址是否可达（从服务器端）
2. 检查 API Key 是否有效
3. 检查服务器是否需要代理才能访问 AI API
4. 查看后端日志中的详细错误信息

### Q: 图片/视频生成成功但无法显示

1. 检查 S3 存储是否正确配置
2. 检查 presigned URL 是否过期（默认 30 天有效）
3. 检查浏览器控制台是否有 CORS 错误

### Q: 公告不显示

1. 检查 Supabase `announcements` 表是否有数据
2. 检查公告 `is_active` 是否为 true
3. 检查 `expires_at` 是否已过期

---

## 11. 更新部署

```bash
cd /opt/miaojing
git pull origin main
pnpm install
pnpm build

# PM2 方式
pm2 restart miaojing

# Nohup 方式
kill $(lsof -t -i:5000) 2>/dev/null
nohup pnpm start > /var/log/miaojing/app.log 2>&1 &
```

---

## 12. 备份与恢复

### 数据库备份

Supabase 自动提供每日备份（Pro 计划）。如需手动备份：

1. Supabase Dashboard → Database → Backups
2. 或使用 pg_dump：

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" > backup.sql
```

### 环境变量备份

将 `.env.local` 安全保存到密码管理器或加密存储中。

---

## 13. 安全建议

1. **不要提交 .env.local 到 Git** — 已在 .gitignore 中排除
2. **定期更新依赖** — `pnpm update` 后重新构建
3. **Supabase Service Role Key 保密** — 仅在服务端使用，不要暴露到前端
4. **配置 HTTPS** — 生产环境必须使用 HTTPS
5. **限制管理后台访问** — 仅管理员角色可访问 /admin
6. **定期检查 RLS 策略** — 确保用户只能访问自己的数据
