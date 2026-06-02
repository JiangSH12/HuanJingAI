# 妙境 AI 创作平台

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149ECA)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Auth%20%2B%20Storage-3ECF8E)](https://supabase.com)

**一个面向 AI 图像与视频创作场景的全栈平台。**  
支持 **文生图、图生图、文生视频、图生视频、提示词优化、作品画廊、管理后台、数据导入导出、网站品牌配置** 等完整能力。

</div>

---

## 项目简介

`妙境 AI 创作平台` 是一个基于 **Next.js App Router** 构建的全栈 AI 创作应用，定位为一站式多模态内容生成平台。

项目核心目标：

- 为普通用户提供易用的 AI 创作入口
- 支持多种模型来源：**平台默认模型 / 管理员配置系统模型 / 用户自定义模型**
- 提供从 **生成、预览、下载、历史记录、分享到画廊** 的完整创作链路
- 提供管理端能力，包括 **用户管理、模型管理、定价、支付配置、公告、数据备份恢复、网站设置**
- 在未接入 Supabase 时仍可进入 **Demo 模式**，便于本地开发与快速演示

---

## 核心能力

### AI 创作能力

- **文生图**：输入描述词生成图片
- **图生图**：上传参考图进行风格迁移、改图、重绘等
- **文生视频**：输入描述词生成短视频
- **图生视频**：上传静态图生成动态视频
- **提示词优化**：接入文本模型，对当前创作描述自动增强
- **故事板生成**：提供 `storyboard` 接口，便于后续扩展视频脚本与镜头拆分能力

### 用户侧功能

- **登录 / 注册**：支持普通用户与管理员邀请码注册
- **积分与配额体系**：按模型、分辨率、时长等维度控制消耗或配额
- **创作历史记录**：自动保存在本地，可跨页面查看与回看
- **详情弹窗**：查看作品大图 / 视频、提示词、参数、参考图、下载
- **作品分享**：将作品发布到公开画廊
- **画廊浏览**：支持类型筛选、最新 / 热门排序

### 管理后台

管理后台位于 `/admin`，目前包含 8 个主要 Tab：

- **API 管理**：维护系统默认模型 API
- **用户管理**：查看与编辑用户信息、角色、会员等级、积分、密码
- **价格管理**：管理会员套餐与积分充值包
- **订单管理**：查看订单并修改状态
- **支付设置**：配置支付宝 / 微信 / Stripe / 手动转账等支付参数
- **公告管理**：发布首页公告，支持 Markdown
- **数据管理**：全量数据导出 / 导入恢复
- **网站设置**：站点名、Tab 标题、Logo、Favicon、自定义前台展示项

---

## 当前项目架构

### 前端

- **框架**：Next.js 16 + React 19
- **路由**：App Router
- **语言**：TypeScript 5
- **样式**：Tailwind CSS 4
- **组件库**：shadcn/ui + Radix UI
- **图标**：lucide-react
- **表单与校验**：react-hook-form、zod
- **通知**：sonner

### 后端

本项目不是“前后端分离双仓库”结构，而是 **Next.js 单仓全栈架构**：

- 页面层使用 Next.js 页面与组件
- 服务端接口使用 `app/api/**/route.ts`
- 数据访问通过 Supabase 与对象存储完成
- AI 请求统一由服务端 API Route 代理与编排

这种方式的优势：

- 部署简单，前后端一体化
- 服务端可以安全保存密钥
- 页面、接口、类型、工具函数都在同一仓库中维护

### 数据与外部服务

- **数据库 / 认证 / 部分存储**：Supabase
- **AI 模型服务**：默认使用 **硅基流动（SiliconFlow）**
- **对象存储**：兼容 S3 的 MinIO / 对象存储服务
- **本地持久化**：localStorage（创作历史、管理配置缓存、自定义 API 等）

---

## 模型与 API 策略

项目支持三类模型来源：

### 1. 平台默认模型

默认走环境变量中配置的 **SiliconFlow**：

- `SILICONFLOW_IMAGE_MODEL`
- `SILICONFLOW_VIDEO_MODEL`

适合快速开箱即用。

### 2. 系统模型（管理员配置）

管理员可在后台添加系统级模型配置，供所有用户使用。

支持的类型：

- `image`
- `video`
- `text`

支持的 API 格式：

- `openai`
- `dashscope`
- `kling`
- `volcengine`

### 3. 自定义模型（用户配置）

用户可以在前端添加自己的模型接口，适合接入第三方 OpenAI 兼容服务。

典型场景：

- 自己购买了第三方模型 API
- 不想走平台默认模型
- 想接入某个特定模型做图片 / 视频 / 文本优化

---

## 主要业务流程

### 图片 / 视频生成流程

1. 用户在创作中心填写提示词与参数
2. 前端请求 `app/api/generate/*` 接口
3. 服务端根据当前模型配置组装请求体
4. 调用 SiliconFlow 或自定义 / 系统模型 API
5. 将生成结果上传到对象存储
6. 返回可访问 URL 给前端
7. 前端写入本地历史记录，并支持进一步分享到画廊

### 画廊发布流程

1. 用户在详情弹窗点击“分享到画廊”
2. 前端先本地标记作品为已发布
3. 后端调用 `/api/gallery/publish`
4. 数据写入 Supabase `works` 表
5. 画廊页同时合并：
   - Supabase 公开作品
   - 本地已发布但尚未同步的作品

### 网站配置流程

1. 管理员在后台上传 Logo / Favicon 并修改站点名称
2. 服务端写入 `site_config` 表，资源上传到存储桶
3. 前端通过 `useSiteConfig` 拉取配置并做缓存
4. 所有访客看到新的站点品牌信息

---

## 技术栈清单

| 分类 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Next.js 16 | App Router + 全栈能力 |
| UI 核心 | React 19 | 现代组件开发 |
| 语言 | TypeScript 5 | 类型安全 |
| 样式 | Tailwind CSS 4 | 原子化样式与语义化变量 |
| 组件库 | shadcn/ui | 基于 Radix UI |
| 数据服务 | Supabase | PostgreSQL + Auth + Storage |
| 对象存储 | S3 兼容存储 / MinIO | 持久化图片视频 |
| AI 接口 | SiliconFlow / OpenAI 兼容接口 | 图片、视频、文本模型 |
| 表单 | react-hook-form | 表单管理 |
| 校验 | zod | 数据校验 |
| 图表 / 展示 | recharts | 统计图表支持 |

---

## 目录结构

```text
.
├─ public/                        # 静态资源
├─ scripts/                       # 构建、启动、数据库初始化等脚本
├─ src/
│  ├─ app/                        # Next.js 页面与 API 路由
│  │  ├─ admin/                   # 管理后台
│  │  ├─ auth/                    # 登录 / 注册页面
│  │  ├─ create/                  # 创作中心
│  │  ├─ gallery/                 # 公开画廊
│  │  ├─ profile/                 # 个人中心
│  │  └─ api/                     # 后端接口
│  │     ├─ admin/                # 后台接口（用户、订单、导入导出）
│  │     ├─ auth/                 # 登录、注册、管理员检查、测试接口
│  │     ├─ generate/             # 图片、视频、提示词、故事板生成
│  │     ├─ gallery/              # 画廊查询与发布
│  │     ├─ works/                # 作品接口
│  │     ├─ announcements/        # 公告接口
│  │     ├─ profile/              # 用户资料接口
│  │     ├─ site-config/          # 网站配置接口
│  │     ├─ site-stats/           # 站点统计接口
│  │     └─ download/             # 下载代理
│  ├─ components/                 # 业务组件与基础 UI 组件
│  │  ├─ create/                  # 四种创作模式面板
│  │  └─ ui/                      # shadcn/ui 基础组件
│  ├─ hooks/                      # 自定义 hooks
│  ├─ lib/                        # 业务工具、前端存储、模型配置等
│  ├─ storage/                    # 数据访问与数据库封装
│  └─ server.ts                   # 服务端入口辅助代码
├─ .env.example                   # 环境变量模板
├─ DEPLOY.md                      # 部署说明
├─ package.json                   # 依赖与脚本
└─ README.md                      # 项目说明
```

---

## 关键页面说明

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页 | `/` | 平台介绍、品牌展示、入口导航 |
| 创作中心 | `/create` | 四大创作模式统一入口 |
| 画廊 | `/gallery` | 展示公开发布作品 |
| 个人中心 | `/profile` | 查看历史记录、个人信息、作品详情 |
| 登录 | `/auth/login` | 用户登录 |
| 注册 | `/auth/register` | 用户注册 |
| 管理后台 | `/admin` | 系统管理面板 |

---

## 关键 API 一览

### 认证与用户

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | `POST` | 登录 |
| `/api/auth/register` | `POST` | 注册 |
| `/api/auth/admin-exists` | `GET` | 检查 / 初始化管理员 |
| `/api/auth/test-api` | `POST` | 测试自定义 API |
| `/api/profile` | `GET` / `PUT` | 用户资料读取与更新 |

### AI 生成

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/generate/image` | `POST` | 文生图 / 图生图 |
| `/api/generate/video` | `POST` | 文生视频 / 图生视频 |
| `/api/generate/suggest-prompt` | `POST` | 提示词优化 |
| `/api/generate/storyboard` | `POST` | 故事板 / 脚本辅助生成 |

### 画廊与作品

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/gallery` | `GET` | 获取公开作品 |
| `/api/gallery/publish` | `POST` | 发布作品到画廊 |
| `/api/works` | `GET` / `POST` | 作品数据相关接口 |
| `/api/download` | `GET` | 代理下载，规避部分跨域问题 |

### 站点与后台

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/announcements` | `GET` / `POST` / `PUT` / `DELETE` | 公告管理 |
| `/api/site-config` | `GET` / `PUT` | 网站配置 |
| `/api/site-stats` | `GET` / `POST` | 访问统计 |
| `/api/admin/users` | `GET` / `PUT` | 用户管理 |
| `/api/admin/orders` | `GET` / `POST` / `PUT` | 订单管理 |
| `/api/admin/data-export` | `GET` | 全量数据导出 |
| `/api/admin/data-import` | `POST` | 全量数据导入 / 恢复 |

---

## 数据库设计

数据库初始化脚本位于：`scripts/init-database.sql`

当前包含 9 张核心表：

| 表名 | 说明 |
|------|------|
| `profiles` | 用户资料、角色、积分、会员等级、配额 |
| `works` | AI 生成作品 |
| `credit_transactions` | 积分变动记录 |
| `orders` | 订单 |
| `user_api_keys` | 用户自定义 API 密钥 |
| `work_likes` | 作品点赞 |
| `site_config` | 网站品牌配置 |
| `announcements` | 公告 |
| `site_stats` | 站点统计 |

### 数据库特性

- 启用 **RLS（Row Level Security）**
- 新用户注册后自动创建 `profile`
- 自动记录注册赠送积分
- 提供 `increment_visits()` 原子访问量更新函数
- 多数表带有索引与 `updated_at` 自动更新时间触发器

---

## 本地存储与缓存策略

项目中存在一部分前端本地持久化设计，用于提升交互体验与降低接口依赖：

| 模块 | 说明 |
|------|------|
| `auth-store.ts` | 登录状态与跨标签页同步 |
| `creation-history-store.ts` | 创作历史记录 |
| `credit-records-store.ts` | 积分本地记录 |
| `custom-api-store.ts` | 用户自定义 API 配置 |
| `admin-store.ts` | 管理后台本地配置缓存 |
| `site-config.ts` | 网站配置读取与缓存 |

### 设计目的

- 提升页面响应速度
- 支持 Demo 模式运行
- 降低部分高频前端操作对后端的依赖
- 提供更平滑的开发与演示体验

---

## Demo 模式说明

当未正确配置 Supabase 时，项目会自动进入 **Demo 模式**。

### Demo 模式下的表现

- 登录 / 注册返回模拟数据
- 部分列表与信息使用默认或推断值
- 画廊、站点配置、公告等接口会降级返回默认数据
- 管理后台的部分写操作会返回 `503`
- 前端 UI 仍然可以完整打开和体验

### 适用场景

- 本地 UI 联调
- 快速展示界面
- 没有准备好 Supabase 与对象存储时先做前端开发

---

## 环境要求

建议环境：

- **Node.js** `20+`
- **pnpm** `9+`
- 可访问 Supabase / SiliconFlow / 对象存储服务

> 项目 `package.json` 已限制使用 `pnpm`，执行 `npm install` 会被拦截。

---

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

复制模板文件：

```bash
cp .env.example .env.local
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env.local
```

### 3. 填写 `.env.local`

最常用环境变量如下：

```env
# SiliconFlow
SILICONFLOW_API_KEY=your_siliconflow_api_key_here
SILICONFLOW_API_URL=https://api.siliconflow.cn/v1
SILICONFLOW_IMAGE_MODEL=Tongyi-MAI/Z-Image-Turbo
SILICONFLOW_VIDEO_MODEL=Wan-AI/Wan2.2-I2V-A14B

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# S3 / MinIO
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=media
```

### 4. 启动开发环境

```bash
pnpm dev
```

默认端口：`5000`  
打开：`http://localhost:5000`

---

## 环境变量说明

### AI 相关

| 变量 | 必填 | 说明 |
|------|------|------|
| `SILICONFLOW_API_KEY` | 推荐 | 硅基流动 API Key |
| `SILICONFLOW_API_URL` | 否 | 硅基流动 API 地址 |
| `SILICONFLOW_IMAGE_MODEL` | 否 | 默认图片模型 |
| `SILICONFLOW_VIDEO_MODEL` | 否 | 默认视频模型 |

### Supabase 相关

| 变量 | 必填 | 说明 |
|------|------|------|
| `SUPABASE_URL` | 推荐 | Supabase 项目地址 |
| `SUPABASE_ANON_KEY` | 推荐 | 前台匿名访问 Key |
| `SUPABASE_SERVICE_ROLE_KEY` | 推荐 | 服务端高权限 Key |

### 对象存储相关

| 变量 | 必填 | 说明 |
|------|------|------|
| `MINIO_ENDPOINT` | 推荐 | 对象存储地址 |
| `MINIO_ACCESS_KEY` | 推荐 | Access Key |
| `MINIO_SECRET_KEY` | 推荐 | Secret Key |
| `MINIO_BUCKET` | 推荐 | 存储桶名称 |
| `MINIO_REGION` | 否 | 区域 |
| `MINIO_USE_SSL` | 否 | 是否使用 HTTPS |
| `MINIO_PUBLIC_BASE_URL` | 否 | 公共访问基地址 |
| `MINIO_PUBLIC_READ` | 否 | 是否直接公开读 |
| `MINIO_SIGNED_URL_EXPIRES_IN` | 否 | 预签名链接过期时间 |

### 其他配置

| 变量 | 必填 | 说明 |
|------|------|------|
| `DEPLOY_RUN_PORT` | 否 | 运行端口，默认 `5000` |
| `ADMIN_INVITE_CODE` | 否 | 管理员邀请码 |
| `APP_ENV` | 否 | `DEV` / `PROD` |
| `APP_DOMAIN` | 否 | 对外域名 |

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发环境 |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务 |
| `pnpm lint` | 运行 ESLint |
| `pnpm ts-check` | TypeScript 类型检查 |

---

## 初始化数据库

1. 创建 Supabase 项目
2. 打开 Supabase SQL Editor
3. 执行 `scripts/init-database.sql`
4. 根据需要创建存储桶

建议至少准备：

- `site-assets`：用于站点 Logo / Favicon
- 媒体对象存储桶：用于图片与视频产物

> 详细部署流程请查看 `DEPLOY.md`

---

## 开发说明

### 前端风格约定

- 优先使用 **shadcn/ui** 组件
- 使用 **Tailwind 语义化变量**，避免直接硬编码颜色
- 保持移动端与桌面端基本可用
- 使用轻量、清晰、偏产品化的 UI 语言

### 类型与代码规范

- 禁止隐式 `any`
- 优先复用 `lib/` 中的工具与 store
- 服务端敏感逻辑放在 `app/api/**` 中处理
- API Key 与高权限密钥不得泄漏到前端

### 数据安全建议

- `SUPABASE_SERVICE_ROLE_KEY` 只允许服务端使用
- 支付密钥、系统模型密钥不要直接暴露到客户端
- 生产环境中应将敏感配置放入安全的环境变量管理系统

---

## 部署说明

项目支持以下部署方式：

- 直接在 Linux / Node 环境部署
- Docker 部署
- PM2 + Nginx 部署

详细步骤请查看：[`DEPLOY.md`](./DEPLOY.md)

---

## 适用场景

这个项目适合用于：

- AI 生图 / 生视频 SaaS 平台原型
- 企业内部 AI 创作工作台
- 带用户体系、画廊与后台的完整全栈项目模板
- 需要支持多模型接入与对象存储持久化的内容生成平台

---

## 后续可扩展方向

如果你准备继续演进这个项目，比较自然的方向包括：

- 接入真实支付闭环
- 增加队列与异步任务系统
- 引入更严格的权限系统与审计日志
- 支持更多模型供应商
- 画廊点赞 / 评论 / 收藏持久化
- 接入 CDN 与更完善的媒体处理流水线
- 补齐自动化测试与 E2E 测试

---

## 许可证

当前仓库未见单独的 `LICENSE` 文件时，请按你的实际开源 / 商用策略补充。  
如果你计划公开发布，建议明确添加 `LICENSE` 文件与商用说明。
