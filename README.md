# 幻境 AI 创作平台

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)

**一站式 AI 多模态创作平台，提供文生图、图生图、文生视频、图生视频四大核心能力。**

</div>

## 功能特性

### 核心创作能力

| 模式 | 说明 | 支持模型 |
|------|------|---------|
| **文生图** | 输入文字描述，AI 生成精美图片 | SeeDream v5.0 / SDXL / DALL-E 3 等 |
| **图生图** | 上传参考图，AI 生成风格化作品 | SeeDream / Stable Diffusion 等 |
| **文生视频** | 输入文字描述，AI 生成动态视频 | SeeDance Pro / 可灵 / Kling 等 |
| **图生视频** | 上传图片，AI 生成视频动画 | SeeDance Pro 等 |

### 平台功能

- **用户系统**：注册登录、积分体系、会员等级、每日配额
- **创作中心**：参数调节、提示词优化、历史记录
- **作品画廊**：公开分享、点赞互动、社交发现
- **管理后台**：用户管理、订单管理、API 配置、定价设置、公告管理
- **主题定制**：网站名称、Logo、Favicon 自定义
- **访问统计**：访客追踪、数据分析

## 技术栈

| 分类 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 16 | App Router 服务端渲染 |
| 核心 | React 19 | 现代化 UI 开发 |
| 语言 | TypeScript 5 | 类型安全 |
| UI 组件 | shadcn/ui | 基于 Radix UI 的组件库 |
| 样式 | Tailwind CSS 4 | 原子化 CSS |
| 数据库 | Supabase | PostgreSQL + Auth + Storage |
| AI SDK | coze-coding-dev-sdk | 内置模型支持 |
| 对象存储 | S3 兼容存储 | 媒体文件持久化 |

## 快速开始

### 环境要求

- Node.js 18+
- pnpm 9+

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

复制环境变量模板并配置：

```bash
cp .env.example .env.local
```

编辑 `.env.local` 填写实际值：

```env
# Supabase 数据库（必需）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Coze AI SDK（使用内置模型时必需）
COZE_API_KEY=your-coze-api-key
COZE_API_BASE_URL=https://api.coze.com
COZE_MODEL_BASE_URL=https://model.coze.com

# 其他配置
ADMIN_INVITE_CODE=huanjing-admin-2026
ADMIN_DEFAULT_PASSWORD=admin123
APP_ENV=DEV
DEPLOY_RUN_PORT=5000
```

### 启动开发服务器

```bash
pnpm dev
```

访问 [http://localhost:5000](http://localhost:5000)

### 构建生产版本

```bash
pnpm build
pnpm start
```

## 项目结构

```
src/
├── app/                          # 页面路由
│   ├── page.tsx                  # 首页 / Landing
│   ├── layout.tsx                # 全局布局
│   ├── create/page.tsx           # 创作中心
│   ├── gallery/page.tsx          # 作品画廊
│   ├── profile/page.tsx          # 个人中心
│   ├── admin/page.tsx            # 管理后台
│   ├── auth/                     # 认证页面
│   └── api/                      # API 路由
│       ├── auth/                 # 登录/注册/测试
│       ├── generate/              # 图片/视频生成
│       ├── admin/                # 管理接口
│       ├── gallery/              # 画廊接口
│       └── ...
├── components/                    # React 组件
│   ├── navbar.tsx                # 导航栏
│   ├── create/                   # 创作组件
│   │   ├── text-to-image.tsx    # 文生图
│   │   ├── image-to-image.tsx   # 图生图
│   │   ├── text-to-video.tsx    # 文生视频
│   │   └── image-to-video.tsx   # 图生视频
│   └── ui/                       # shadcn/ui 组件
├── lib/                          # 工具库
│   ├── utils.ts                  # 工具函数
│   ├── model-config.ts           # 模型配置
│   ├── custom-api-fetch.ts       # 自定义 API
│   ├── auth-store.ts             # 认证状态
│   ├── creation-history-store.ts # 创作历史
│   └── credit-records-store.ts   # 积分记录
└── storage/
    └── database/
        ├── supabase-client.ts     # Supabase 客户端
        └── schema.ts              # 数据库 Schema

scripts/                           # 部署脚本
├── dev.sh                        # 开发启动
├── build.sh                      # 构建
└── start.sh                      # 生产启动
```

## API 接口

| 路径 | 方法 | 功能 |
|------|------|------|
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/test-api` | POST | 自定义 API 测试 |
| `/api/generate/image` | POST | AI 图片生成 |
| `/api/generate/video` | POST | AI 视频生成 |
| `/api/generate/suggest-prompt` | POST | 提示词优化 |
| `/api/profile` | GET/PUT | 用户信息 |
| `/api/gallery` | GET | 画廊列表 |
| `/api/gallery/publish` | POST | 发布作品 |
| `/api/admin/users` | GET/PUT | 用户管理 |
| `/api/admin/orders` | GET/POST | 订单管理 |
| `/api/announcements` | GET/POST/PUT/DELETE | 公告管理 |
| `/api/site-config` | GET/PUT | 网站配置 |
| `/api/site-stats` | GET/POST | 访问统计 |

## 模型系统

### 内置模型

使用 Coze AI SDK，调用字节跳动豆包系列模型：

**图片生成**
- SeeDream v5.0（默认）- 画质与创意全面升级
- SeeDream v4.5 - 高质量通用图片
- SeeDream v3.5 - 均衡性价比

**视频生成**
- SeeDance Pro（默认）- 专业视频生成
- SeeDance Lite - 轻量快速

### 自定义模型

用户可配置自己的 OpenAI 兼容 API：
- 硅基流动（FLUX.1-schnell）
- OpenAI（DALL-E 3）
- Stability AI（SDXL）
- 可灵（Kling）
- DeepSeek

### 系统模型

管理员可在后台配置系统默认 API，支持启用/禁用和积分消耗设置。

## 数据库

### 表结构

| 表名 | 说明 | RLS |
|------|------|-----|
| profiles | 用户资料 | 认证读/本人写 |
| works | 创作作品 | 公开读/本人写 |
| credit_transactions | 积分记录 | 本人读写 |
| orders | 订单 | 本人读写 |
| user_api_keys | 自定义 API | 本人读写 |
| work_likes | 作品点赞 | 公开读/本人写 |
| site_config | 网站配置 | 公开读/认证写 |
| announcements | 公告 | 公开读/认证写 |
| site_stats | 访问统计 | 公开读/认证写 |

初始化脚本：`scripts/init-database.sql`

## 部署

### Docker 部署

```bash
docker build -t miaojing:latest .

docker run -d \
  --name miaojing \
  -p 5000:5000 \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_ANON_KEY=your-anon-key \
  -e SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  -e COZE_API_KEY=your-coze-api-key \
  --restart unless-stopped \
  miaojing:latest
```

### 手动部署

1. 配置环境变量
2. 初始化数据库：`scripts/init-database.sql`
3. 构建：`pnpm build`
4. 启动：`pnpm start`

详见 [DEPLOY.md](./DEPLOY.md)

## 开发规范

- **包管理器**：必须使用 pnpm
- **UI 组件**：优先使用 shadcn/ui
- **样式**：使用 Tailwind 语义化变量，禁止硬编码颜色
- **类型**：禁止隐式 any
- **服务端**：AI SDK 仅在服务端使用，不暴露到前端
- **安全**：敏感配置使用环境变量，service role key 勿暴露前端

## License

MIT License - 详见 [LICENSE](LICENSE)
