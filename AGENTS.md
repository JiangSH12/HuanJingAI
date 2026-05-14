# 妙境 AI 创作平台

## 项目概览

妙境（MiaoJing）是一站式AI多模态创作平台，提供文生图、图生图、文生视频、图生视频四大核心能力。

## 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **AI 模型**: 硅基流动 (SiliconFlow) - 默认图片/视频生成
- **Object Storage**: AWS S3 兼容对象存储

## 目录结构

```
├── src/
│   ├── app/                          # 页面路由
│   │   ├── page.tsx                  # 首页/Landing Page
│   │   ├── layout.tsx                # 全局布局
│   │   ├── create/page.tsx           # 创作中心 (4种模式)
│   │   ├── gallery/page.tsx          # 作品画廊
│   │   ├── profile/page.tsx          # 个人中心
│   │   ├── admin/page.tsx           # 管理后台 (6个Tab: API/用户/定价/支付/公告/设置)
│   │   ├── auth/login/page.tsx       # 登录
│   │   ├── auth/register/page.tsx    # 注册
│   │   └── api/                      # API 路由
│   │       ├── auth/login/route.ts   # 登录接口
│   │       ├── auth/register/route.ts # 注册接口
│   │       ├── auth/test-api/route.ts # 自定义API连接测试
│   │       ├── auth/admin-exists/route.ts # 管理员存在检查+自动初始化
│   │       ├── admin/users/route.ts   # 管理员用户管理（列表/编辑/邮箱/密码重置）
│   │       ├── admin/orders/route.ts  # 管理员订单管理
│   │       ├── admin/data-export/route.ts # 数据导出（全量备份）
│   │       ├── admin/data-import/route.ts # 数据导入/恢复（从备份恢复）
│   │       ├── generate/image/route.ts  # 图片生成接口
│   │       ├── generate/video/route.ts  # 视频生成接口
│   │       ├── generate/suggest-prompt/route.ts  # 提示词优化接口
│   │       ├── site-config/route.ts   # 网站配置接口（名称/Logo/Favicon）
│   │       ├── announcements/route.ts # 公告接口（公开GET/管理CRUD）
│   │       ├── profile/route.ts      # 用户信息接口
│   │       ├── admin/users/route.ts  # 管理员用户列表接口（Supabase profiles）
│   │       ├── admin/orders/route.ts # 管理员订单列表接口（Supabase orders）
│   │       ├── admin/data-export/route.ts # 数据导出接口（全量备份JSON）
│   │       ├── admin/data-import/route.ts # 数据导入/恢复接口（从JSON恢复）
│   │       ├── gallery/route.ts      # 画廊公开作品列表接口（GET）
│   │       ├── gallery/publish/route.ts # 画廊作品发布接口（POST）
│   │       ├── site-stats/route.ts   # 网站访问统计接口（GET/POST）
│   │       └── download/route.ts     # 文件下载代理接口（GET，绕过CORS）
│   ├── components/
│   │   ├── navbar.tsx                # 全局导航栏
│   │   ├── announcement-popup.tsx    # 公告弹窗（从API获取，每次首页访问显示）
│   │   ├── site-brand.tsx           # 网站品牌组件（Logo/名称，从API读取）
│   │   ├── site-config-sync.tsx     # 网站配置同步（标签页标题/Favicon动态更新）
│   │   ├── creation-detail-dialog.tsx # 创作详情弹窗（图片/视频预览+下载+分享到画廊）
│   │   ├── visit-tracker.tsx        # 网站访问统计追踪器（每次会话+1）
│   │   ├── create/
│   │   │   ├── text-to-image.tsx     # 文生图面板
│   │   │   ├── image-to-image.tsx    # 图生图面板
│   │   │   ├── text-to-video.tsx     # 文生视频面板
│   │   │   └── image-to-video.tsx    # 图生视频面板
│   │   └── ui/                       # shadcn/ui 组件库
│   ├── storage/database/
│   │   ├── shared/schema.ts          # 数据库 Schema (Drizzle ORM 定义)
│   │   └── supabase-client.ts        # Supabase 客户端（统一入口 + Demo降级）
│   ├── lib/
│   │   ├── utils.ts                   # 工具函数 + safeParseJson 安全响应解析
│   │   ├── model-config.ts            # 模型配置、画面比例/分辨率选项、积分计算、自定义/系统模型工具
│   │   ├── custom-api-store.ts        # 自定义API密钥 localStorage 存储
│   │   ├── custom-api-fetch.ts        # 自定义API共享请求工具（User-Agent/重试/错误解析）
│   │   ├── creation-history-store.ts  # 创作历史记录 localStorage 存储（200条）
│   │   ├── credit-records-store.ts   # 积分变动记录 localStorage 存储（500条，精确到分钟）
│   │   ├── order-store.ts            # 订单记录 localStorage + admin双存储
│   │   ├── auth-store.ts             # 登录状态管理 localStorage + 跨标签页同步
│   │   ├── admin-store.ts            # 管理后台配置 localStorage 存储（系统API/用户/定价/支付）
│   │   ├── site-config.ts            # 网站配置 hook（从API读取+缓存，保存到Supabase）
│   │   └── api-error-parser.ts        # API错误友好提示解析
├── scripts/
│   └── init-database.sql              # 数据库初始化SQL脚本（8张表+RLS+触发器）
├── public/                            # 静态资源
├── .env.example                       # 环境变量模板
└── DEPLOY.md                          # 部署文档
```

## 构建和测试命令

- **开发**: `pnpm dev` (端口 5000, 热更新)
- **构建**: `pnpm build`
- **类型检查**: `pnpm ts-check`
- **代码检查**: `pnpm lint`
- **启动生产**: `pnpm start`

## 环境变量

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `SUPABASE_URL` | 推荐 | Supabase 项目 URL，不配置则运行 Demo 模式 |
| `SUPABASE_ANON_KEY` | 推荐 | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 推荐 | Supabase service role key（服务端操作） |
| `SILICONFLOW_API_KEY` | 必填 | 硅基流动 API 密钥（图片/视频生成） |
| `SILICONFLOW_API_URL` | 可选 | 硅基流动 API 地址，默认 `https://api.siliconflow.cn/v1` |
| `SILICONFLOW_IMAGE_MODEL` | 可选 | 图片模型，默认 `stabilityai/stable-diffusion-3-medium-native` |
| `SILICONFLOW_VIDEO_MODEL` | 可选 | 视频模型，默认 `tencent/hunyuan-video` |
| `ADMIN_INVITE_CODE` | 可选 | 管理员注册邀请码，默认 `huanjing-admin-2026` |
| `ADMIN_DEFAULT_PASSWORD` | 可选 | 默认管理员账号密码，默认 `admin123` |
| `APP_ENV` | 可选 | DEV/PROD |
| `DEPLOY_RUN_PORT` | 可选 | 服务端口，默认 5000 |
| `APP_DOMAIN` | 可选 | 对外域名 |

## 数据库 Schema

6 张核心表 + 3 张服务端配置表：
- `profiles` - 用户资料（角色/会员/积分）
- `works` - 创作作品（图片/视频）
- `credit_transactions` - 积分记录
- `orders` - 订单
- `user_api_keys` - 用户自定义 API 密钥
- `work_likes` - 作品点赞
- `site_config` - 网站配置（名称/Logo/Favicon URL），RLS: 公开读+认证写
- `announcements` - 公告（标题/内容/有效期/启用状态），RLS: 公开读+认证增删改
- `site_stats` - 网站统计（总访问量），RLS: 公开读+认证写

所有表已启用 RLS (Row Level Security)。初始化脚本：`scripts/init-database.sql`

## API 接口

| 路径 | 方法 | 功能 | Demo模式 |
|------|------|------|----------|
| `/api/auth/login` | POST | 用户登录（支持邮箱/手机号/用户名） | 返回模拟用户 |
| `/api/auth/register` | POST | 用户注册（赠送10积分，邀请码注册管理员） | 返回模拟用户 |
| `/api/auth/test-api` | POST | 自定义API连接测试 | 正常工作 |
| `/api/auth/admin-exists` | GET | 检查管理员是否存在，不存在则自动创建默认管理员(admin/admin123) | 返回exists:true |
| `/api/generate/image` | POST | AI图片生成（文生图/图生图） | 需自定义API |
| `/api/generate/video` | POST | AI视频生成（文生视频/图生视频） | 需自定义API |
| `/api/generate/suggest-prompt` | POST | AI提示词优化 | 需自定义API |
| `/api/profile` | GET/PUT | 用户信息查询与更新 | 返回推断数据 |
| `/api/site-config` | GET/PUT | 网站配置 | GET返回默认值，PUT返回503 |
| `/api/announcements` | GET/POST/PUT/DELETE | 公告管理 | GET返回空，写操作503 |
| `/api/admin/users` | GET/PUT | 管理员用户列表 | 503 |
| `/api/admin/orders` | GET/POST/PUT | 管理员订单管理 | 503 |
| `/api/admin/data-export` | GET | 数据导出（全量备份为JSON） | 503 |
| `/api/admin/data-import` | POST | 数据导入/恢复（从JSON备份恢复） | 503 |
| `/api/gallery` | GET | 画廊公开作品列表 | 返回空数组 |
| `/api/gallery/publish` | POST | 发布作品到画廊 | 返回demo:true |
| `/api/site-stats` | GET/POST | 网站访问统计 | GET返回0, POST无效 |
| `/api/download` | GET | 文件下载代理（绕过CORS） | 正常工作 |

## 开发规范

- 使用 pnpm 管理依赖
- 颜色必须使用 Tailwind 语义化变量 (`bg-primary`, `text-muted-foreground` 等)
- 禁止硬编码颜色值和 Tailwind 原生色盘
- 禁止隐式 `any`
- AI 模型使用硅基流动 API，通过环境变量配置
- Supabase 未配置时，所有 API 自动降级为 Demo 模式

### Supabase 客户端

- 统一入口：`getSupabaseClient(token?)` — `src/storage/database/supabase-client.ts`
- 无 token 时使用 service role key（管理员权限），有 token 时使用 anon key + Authorization
- 未配置时 throw Error，调用方 try/catch 降级为 Demo 模式


### S3 媒体持久化

- 所有 AI 生成的 data URL 和远程 URL 均上传 S3 后返回 presigned URL
- `persistMediaToStorage()`: data URL → S3 → presigned URL（30s 超时）
- `persistRemoteUrlToStorage()`: 远程 URL → S3 → presigned URL（45s 超时）
- `persistAllMediaUrls()`: 批量处理，>5MB data URL 跳过
- presigned URL 有效期 30 天

### 自定义API密钥系统

- 用户可添加自定义 OpenAI 兼容 API（含 URL、模型名、Key、类型）
- 模型类型：`image`（生图）、`video`（视频）、`text`（文本，用于提示词优化）
- 自定义模型 ID 格式：`custom:${keyId}`（前缀区分内置模型）
- 自定义 API 不消耗积分（`calcImageCredits`/`calcVideoCredits` 返回 0）
- 后端请求体包含标准 OpenAI 字段 + guidance_scale/aspect_ratio
- 支持 `b64_json` 响应格式，自动上传 S3
- 测试连接：优先 GET /models 端点快速验证，降级为 POST 实际端点
- 存储：localStorage (`custom-api-store.ts`)，跨组件通过 CustomEvent 同步

### 系统模型（管理员配置的默认API）

- 管理员可在管理后台添加系统 API（含 URL、模型名、Key、类型、积分消耗）
- 模型类型：`image`（生图）、`video`（视频）、`text`（文本，用于提示词优化）
- 系统模型 ID 格式：`system:${apiId}`（前缀区分内置/自定义模型）
- 系统 API 消耗积分，按管理员配置的 `creditsPerUse` 计算
- 前端创作中心自动展示已激活的系统模型，与内置/自定义模型分区显示
- 系统 API 请求方式与自定义 API 相同（通过 `customApiConfig` 传递到后端）
- 存储：localStorage (`admin-store.ts`)，跨组件通过 CustomEvent 同步

### 提示词优化系统

- 创作描述输入框右上方有「优化提示词」按钮
- 需要配置文本类型模型 API（自定义或系统）才能使用
- 优化时自动在用户描述前加前缀：`针对{当前模型名}图片/视频生成优化提示词`
- 用户看不到此前缀，系统提示词直接发送给文本模型
- 优化结果直接填充到创作描述输入框中
- API 路由：`/api/generate/suggest-prompt`，支持 `systemPrefix` 参数

### 创作参数系统

- 图片生成参数：画面比例（1:1/16:9/9:16/4:3/3:4）+ 分辨率（1080P/2K/4K）
- `resolveImageSize(aspectRatio, resolution)` — 内置模型使用高清像素尺寸
- `resolveCustomApiImageSize(aspectRatio)` — 自定义 API 使用常用标准尺寸
- `getAspectRatioPromptHint(aspectRatio)` — 提示词增强，嵌入画面比例描述
- 图生图额外支持「原比例」选项
- 视频生成参数：画面比例 + 时长 + 帧率 + 镜头运动
- 历史创作记录：localStorage 持久化，结果区域可展开查看历史

### 图生图多策略系统

图生图使用 3 策略依次尝试：
1. `/images/edits` + multipart/form-data — OpenAI 官方格式（Cherry Studio 兼容）
2. `/chat/completions` + image_url — 多模态聊天格式
3. `/images/generations` + init_image — Stable Diffusion 格式

### 管理后台

- 仅管理员角色可访问 `/admin` 页面
- 8 个功能 Tab：API 管理、用户管理、定价与积分、订单管理、支付设置、公告管理、数据管理、网站设置
- API 管理：增删改系统默认 API（图片/视频/文本），配置积分消耗，启用/禁用
- 用户管理：增删改用户，配置角色/会员等级/积分/每日配额/状态
- 定价与积分：编辑会员套餐价格，管理积分购买包
- 支付设置：启用/禁用支付方式（支付宝/微信/Stripe/手动），配置支付凭证
- 公告管理：创建/编辑/删除公告，支持 Markdown，通过 API 存储到 Supabase，所有访客可见
- 网站设置：自定义网站名称/Logo/Favicon，通过 API 存储到 Supabase Storage，所有访客可见

### 公告系统

- 公告数据存储在 Supabase `announcements` 表（非 localStorage）
- API 路由 `/api/announcements`：GET 公开读取，POST/PUT/DELETE 需认证
- `AnnouncementPopup` 组件从 API 获取活跃公告，未登录用户也可见
- 每次访问首页都会显示公告弹窗（不记录关闭状态，无 sessionStorage）
- 管理后台可设置公告有效期、启用/禁用，支持完整 Markdown 语法

### 创作历史记录系统

- 每次生成成功后自动保存记录到 localStorage (`creation-history-store.ts`)
- 最多保存 200 条，FIFO 淘汰
- 记录包含：类型、URL、提示词、负面提示词、模型名、是否自定义、参数、时间
- 个人中心"历史"Tab 展示全部记录，缩略图网格 + 点击打开详情弹窗
- 创作面板结果区域也可查看历史并点击打开详情
- `CreationDetailDialog` 组件：图片/视频预览、参考图、提示词复制、下载
- 跨标签页同步：storage event + CustomEvent

### 网站配置系统

- 网站名称、Logo、Favicon 存储在 Supabase `site_config` 表 + `site-assets` Storage 桶
- API 路由 `/api/site-config`：GET 公开读取，PUT 保存（含图片上传）
- `useSiteConfig` hook：API 获取 + localStorage 5分钟缓存 + fallback 默认值
- 管理后台"设置"Tab 编辑保存，所有访客即时生效

### 画廊系统

- 画廊页面所有访客可见（含未登录用户），无需认证
- 数据来源：Supabase `works` 表（`is_public = true`）+ localStorage 已发布作品合并
- API 路由 `/api/gallery`：GET 查询公开作品（支持类型筛选、最新/最受欢迎排序）
- API 路由 `/api/gallery/publish`：POST 发布作品到 Supabase
- `shareToGallery()` 同时保存到 localStorage 和 Supabase（fire-and-forget）
- `isUrlPublished(url)` 检查作品是否已发布，防止重复分享
- `markRecordAsPublished(url)` 标记创作记录为已发布
- CreationDetailDialog 包含"分享到画廊"按钮，已分享的显示"已分享"并禁用
- 创作面板的分享按钮也检查 `isUrlPublished` 防止重复

### 网站访问统计

- 访问量存储在 Supabase `site_stats` 表（原子递增 via `increment_visits()` SQL 函数）
- `VisitTracker` 组件在 layout.tsx 中引入，每个浏览器会话只计数一次（sessionStorage 去重）
- 管理后台顶部 `AdminStatsBar` 显示：总访问量、注册用户数、公开作品数



## 部署

详见 [DEPLOY.md](./DEPLOY.md)
