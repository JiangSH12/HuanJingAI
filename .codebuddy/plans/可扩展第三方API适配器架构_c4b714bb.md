---
name: 可扩展第三方API适配器架构
overview: 为用户自主接入第三方模型API（如可灵）设计可扩展的适配器架构，支持不同API格式（OpenAI兼容、可灵等），覆盖图片+视频生成，并支持未来扩展更多API提供商。
design:
  architecture:
    framework: react
    component: shadcn
  styleKeywords:
    - 水墨书房
    - 数字画布
    - 墨黑底
    - 金箔焦点
    - 表单
    - 选择器
    - 标签
  fontSystem:
    fontFamily: 思源黑体
    heading:
      size: 20px
      weight: 600
    subheading:
      size: 14px
      weight: 500
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#F5C542"
      - "#E8A020"
    background:
      - "#0A0A0A"
      - "#1A1A1A"
    text:
      - "#F5F5F5"
      - "#A0A0A0"
    functional:
      - "#22C55E"
      - "#EF4444"
      - "#3B82F6"
      - "#A855F7"
todos:
  - id: create-adapter-types
    content: 创建适配器类型定义文件 src/lib/api-adapters/types.ts，定义ApiAdapter接口和相关类型
    status: completed
  - id: create-openai-adapter
    content: 创建OpenAI兼容适配器 src/lib/api-adapters/openai.ts，实现标准OpenAI格式请求构建和响应解析
    status: completed
    dependencies:
      - create-adapter-types
  - id: create-kling-adapter
    content: 创建可灵API适配器 src/lib/api-adapters/kling.ts，实现可灵格式请求构建和响应解析
    status: completed
    dependencies:
      - create-adapter-types
  - id: create-adapter-index
    content: 创建适配器注册表 src/lib/api-adapters/index.ts，实现适配器工厂函数getAdapter()
    status: completed
    dependencies:
      - create-openai-adapter
      - create-kling-adapter
  - id: extend-custom-api-types
    content: 扩展CustomApiKey类型，在custom-api-store.ts中新增apiFormat字段，更新add/update函数
    status: completed
  - id: update-model-config
    content: 在model-config.ts中新增API_FORMAT_OPTIONS常量，新增getDefaultFormatForProvider辅助函数
    status: completed
    dependencies:
      - extend-custom-api-types
  - id: update-profile-page
    content: 更新个人中心页面，新增API格式选择器UI，新增可灵供应商预设，更新表单处理逻辑
    status: completed
    dependencies:
      - update-model-config
  - id: integrate-image-route
    content: 修改图片生成路由，集成适配器调用，替换现有硬编码的OpenAI格式逻辑
    status: completed
    dependencies:
      - create-adapter-index
  - id: integrate-video-route
    content: 修改视频生成路由，集成适配器调用，替换现有硬编码的OpenAI格式逻辑
    status: completed
    dependencies:
      - create-adapter-index
  - id: update-test-api
    content: 修改测试API路由，支持接收apiFormat参数，通过适配器构建测试请求和解析响应
    status: completed
    dependencies:
      - create-adapter-index
---

## 产品概述

妙境AI创作平台需要支持用户自主接入第三方模型API（以可灵为首个目标），用户填入API密钥后可直接使用对应的图片/视频生成能力。系统需要采用可扩展架构，未来可无缝接入Midjourney、Runway等其他供应商。

## 核心功能

- 用户可在个人中心添加可灵API密钥，配置API格式为"可灵"
- 创作中心自动识别并展示用户配置的可灵模型（图片/视频）
- 图片生成路由通过适配器调用可灵图片生成API（/v1/images/generations）
- 视频生成路由通过适配器调用可灵视频生成API
- 支持API格式选择器，用户可手动切换格式（OpenAI兼容/可灵/其他）
- 测试连接功能支持测试可灵API连通性
- 预设配置中新增可灵供应商，自动填充API地址和格式

## 技术栈选型

- 沿用现有项目技术栈：Next.js 16 (App Router) + TypeScript + React 19
- 适配器模式（Strategy Pattern + Factory Pattern）
- 无新增外部依赖

## 实现方案

### 核心架构设计

采用**适配器模式**解耦不同供应商的API格式差异：

```
创作路由 (/api/generate/image|video)
        │
        ▼
  适配器工厂 getAdapter(apiFormat)
        │
        ├──► OpenAI适配器 (openai.ts)  - 处理OpenAI兼容格式
        │     ├── buildImageRequest()
        │     ├── buildVideoRequest()
        │     ├── parseImageResponse()
        │     └── parseVideoResponse()
        │
        └──► 可灵适配器 (kling.ts)    - 处理可灵API格式
              ├── buildImageRequest()  // 使用 model_name, resolution 等字段
              ├── buildVideoRequest()
              ├── parseImageResponse()
              └── parseVideoResponse()
```

### 关键数据结构扩展

在 `CustomApiKey` 接口新增 `apiFormat` 字段：

```typescript
export interface CustomApiKey {
  id: string;
  provider: string;
  apiUrl: string;
  modelName: string;
  apiKey: string;
  apiKeyPreview: string;
  type: 'image' | 'video' | 'text';
  apiFormat: 'openai' | 'kling';  // 新增：API格式类型
  isActive: boolean;
  createdAt: string;
}
```

### 适配器接口定义

```typescript
export interface ApiAdapter {
  // 构建图片生成请求体
  buildImageRequest(params: ImageAdapterParams): Record<string, unknown>;
  // 构建视频生成请求体
  buildVideoRequest(params: VideoAdapterParams): Record<string, unknown>;
  // 解析图片生成响应，提取URL数组
  parseImageResponse(data: Record<string, unknown>): string[];
  // 解析视频生成响应，提取URL数组
  parseVideoResponse(data: Record<string, unknown>): string[];
  // 构建测试连接请求
  buildTestRequest(modelName: string): { url: string; body: Record<string, unknown>; method: string };
  // 解析测试响应
  parseTestResponse(data: Record<string, unknown>, status: number): { success: boolean; message: string };
}
```

### 可灵API适配器实现要点

**图片生成请求体（可灵格式）：**

```typescript
buildImageRequest(params) {
  return {
    model_name: params.modelName,
    prompt: params.prompt,
    resolution: params.resolution || '2k',
    result_type: 'series',
    series_amount: params.count || 1,
    aspect_ratio: params.aspectRatio || 'auto',
    ...(params.negativePrompt && { negative_prompt: params.negativePrompt }),
  };
}
```

**响应解析：** 可灵返回格式需根据实际API文档解析，提取图片URL或base64数据。

### 文件修改清单

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `src/lib/api-adapters/types.ts` | 新增 | 适配器接口定义 |
| `src/lib/api-adapters/index.ts` | 新增 | 适配器注册表和工厂函数 |
| `src/lib/api-adapters/openai.ts` | 新增 | OpenAI兼容格式适配器（从现有路由中提取逻辑） |
| `src/lib/api-adapters/kling.ts` | 新增 | 可灵API格式适配器 |
| `src/lib/custom-api-store.ts` | 修改 | CustomApiKey新增apiFormat字段 |
| `src/lib/model-config.ts` | 修改 | 新增API_FORMAT_OPTIONS常量 |
| `src/app/profile/page.tsx` | 修改 | UI新增API格式选择器，新增可灵预设 |
| `src/app/api/generate/image/route.ts` | 修改 | 集成适配器调用 |
| `src/app/api/generate/video/route.ts` | 修改 | 集成适配器调用 |
| `src/app/api/auth/test-api/route.ts` | 修改 | 支持测试不同格式API |


### 实施细节

1. **向后兼容**：现有用户的自定义API默认 `apiFormat = 'openai'`，无需迁移
2. **预设配置**：`PROVIDER_PRESETS` 新增可灵预设：`{ name: '可灵', defaultUrl: 'https://api.kling.ai/v1/images/generations', defaultModel: 'kling-v3-omni', defaultType: 'image', defaultFormat: 'kling' }`
3. **测试连接**：`/api/auth/test-api` 接收 `apiFormat` 参数，通过适配器构建测试请求
4. **错误处理**：适配器解析失败时，回退到通用响应解析逻辑

### 性能考虑

- 适配器为纯函数，无性能开销
- 适配器注册表使用静态Map，O(1)查找
- 无需额外网络请求

## 设计风格

个人中心API管理界面采用与现有风格一致的水墨书房×数字画布风格，在添加/编辑API密钥表单中新增「API格式」选择器。

## 页面设计

### API管理Tab（个人中心）

**区块1：支持的供应商标签**

- 现有Badge列表新增「可灵」Badge

**区块2：推荐API平台**

- 新增可灵平台推荐卡片（类似现有mozheAPI推荐样式）

**区块3：添加/编辑API表单**

- 新增「API格式」字段，使用Select组件，选项：OpenAI兼容 / 可灵
- 选择供应商预设时自动填充API格式
- 表单验证：API格式为必选项

**区块4：已配置密钥列表**

- 每个密钥卡片新增格式标签（如「OpenAI」「可灵」）
- 颜色区分：OpenAI蓝色系，可灵紫色系

## 创作中心（影响）

- 模型选择下拉列表中，自定义模型标注格式类型（如「kling-v3-omni (可灵)」）
- 无需大幅改动创作中心UI

## Agent Extensions

### SubAgent

- **code-explorer**
- 用途：探索现有代码库中自定义API相关的所有文件和函数，确保适配器实现与现有逻辑一致
- 预期结果：获得完整的代码结构图谱，包括所有涉及自定义API调用的位置和格式处理逻辑