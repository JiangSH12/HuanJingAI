# 妙境 AI 创作平台

一站式 AI 多模态创作平台，提供文生图、图生图、文生视频、图生视频四大核心能力。

## 功能特性

- **文生图** - AI 驱动的图片生成
- **图生图** - 基于参考图的图片创作
- **文生视频** - 文字描述生成视频
- **图生视频** - 图片转视频动画
- **提示词优化** - AI 辅助优化创作描述
- **画廊系统** - 作品展示与分享
- **积分系统** - 创作配额管理

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 9+

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

打开 [http://localhost:5000](http://localhost:5000) 查看应用。

### 构建生产版本

```bash
pnpm build
```

### 启动生产服务器

```bash
pnpm start
```

## 技术栈

- **框架**: Next.js 16 (App Router)
- **核心**: React 19
- **语言**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **样式**: Tailwind CSS 4
- **数据库**: Supabase (PostgreSQL + Auth + Storage)
- **AI SDK**: coze-coding-dev-sdk
- **对象存储**: S3 兼容对象存储

## 项目结构

```
src/
├── app/                          # 页面路由
│   ├── page.tsx                  # 首页
│   ├── create/page.tsx           # 创作中心
│   ├── gallery/page.tsx          # 作品画廊
│   ├── profile/page.tsx          # 个人中心
│   ├── admin/page.tsx           # 管理后台
│   ├── auth/login/page.tsx       # 登录
│   ├── auth/register/page.tsx    # 注册
│   └── api/                      # API 路由
├── components/                    # 组件
│   ├── navbar.tsx                # 导航栏
│   ├── create/                   # 创作组件
│   └── ui/                       # shadcn/ui 组件库
├── lib/                          # 工具库
│   ├── utils.ts                  # 工具函数
│   ├── model-config.ts           # 模型配置
│   └── custom-api-fetch.ts      # 自定义 API 请求
└── storage/                      # 存储层
    └── database/                 # 数据库
```

## 环境变量

创建 `.env.local` 文件，参考 `.env.example`：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `COZE_SUPABASE_URL` | 推荐 | Supabase 项目 URL |
| `COZE_SUPABASE_ANON_KEY` | 推荐 | Supabase anon key |
| `COZE_SUPABASE_SERVICE_ROLE_KEY` | 推荐 | Supabase service role key |
| `ADMIN_INVITE_CODE` | 可选 | 管理员注册邀请码 |
| `ADMIN_DEFAULT_PASSWORD` | 可选 | 默认管理员密码 |

不配置 Supabase 时，平台以 Demo 模式运行。

## 开发规范

- 使用 pnpm 管理依赖
- 颜色必须使用 Tailwind 语义化变量 (`bg-primary`, `text-muted-foreground` 等)
- 禁止硬编码颜色值
- 禁止隐式 `any`
- AI SDK 仅在服务端使用

## 部署

详见 [DEPLOY.md](./DEPLOY.md)

## License

MIT
