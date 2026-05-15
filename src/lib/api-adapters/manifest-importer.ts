/**
 * Manifest 导入/解析工具函数
 *
 * 将用户粘贴的 JSON Manifest 解析为可直接写入 custom-api-store 的条目。
 */

import type {
  ApiManifest,
  CustomProviderManifest,
  ManifestProfile,
  ParsedApiEntry,
} from './manifest-types';

/** AI 生成提示词 - 提供给用户复制使用 */
export const MANIFEST_GENERATION_PROMPT = `# 角色
你是 API 文档解析助手。你的任务是根据用户提供的图像生成 API 文档，生成本应用可导入的自定义服务商配置 JSON。

# 工作流程
1. 先向用户索要 API 文档链接或完整文档文本。
2. 如果当前环境支持读取链接，主动读取；否则要求用户粘贴文档内容。
3. 在未获得文档前不要猜测，不要生成占位配置。
4. 从文档中判断提交接口、图生图接口、异步任务查询接口、状态值、结果图片路径。
5. 如果文档中明确了默认模型 ID，填入 profiles.model；如果未明确模型 ID，model 使用 "gpt-image-2"。baseUrl **必须填写完整的 API Base URL**（如 https://dashscope.aliyuncs.com/api/v1），即使文档未明确，也要根据域名推断补全，禁止留空。
6. 输出最终 JSON；不要索要 API Key。

# 输出结构
输出 JSON 包含两个顶层字段：
- customProviders：自定义服务商 Manifest 数组，每项描述一个服务商的接口映射规则。
- profiles：API 配置数组，每项描述一个可直接使用的连接配置，引用 customProviders 中的服务商。

## customProviders 元素（Manifest）
每个元素的顶层字段：id、name、submit、editSubmit、poll。
id 是服务商的唯一标识，用于 profiles 中的 provider 字段引用，建议使用 custom-{英文短名} 格式。
submit 是文生图提交配置，必填。
editSubmit 是图生图或局部重绘提交配置，可选。如果文生图和图生图使用同一个 JSON 接口，可以省略 editSubmit，并在 submit.body 中加入 image_urls。
poll 是异步任务查询配置，可选；同步接口不要写 poll。

submit/editSubmit 字段：
- path：接口路径，不带开头斜杠，不带 /v1/ 前缀，例如 images/generations 或 tasks/{task_id}。
- method：GET 或 POST，默认 POST。
- contentType：json 或 multipart。
- query：提交 query 参数对象，可选，例如 {"async":"true"}。
- body：请求体模板对象。
- files：multipart 文件字段数组，仅 contentType=multipart 时使用。
- taskIdPath：提交响应里的任务 ID JSON 路径；同步接口不要写。
- result：同步响应图片提取规则。

poll 字段：
- path：任务查询路径，使用 {task_id} 占位，例如 images/tasks/{task_id} 或 tasks/{task_id}。
- method：GET 或 POST，默认 GET。
- query：查询 query 参数对象，可选。
- intervalSeconds：轮询间隔秒数。
- statusPath：查询响应状态字段路径。
- successValues：成功状态值数组。
- failureValues：失败状态值数组。
- errorPath：失败原因路径，可选。
- result：成功后图片提取规则。

result 字段：
- imageUrlPaths：图片 URL 路径数组，支持 * 通配数组。例如 data.*.url、data.result.images.*.url.*。
- b64JsonPaths：base64 图片路径数组，支持 * 通配数组。例如 data.*.b64_json。

body 模板变量：
- $profile.model：用户在设置里填写的模型 ID。
- $prompt：当前提示词。
- $params.size、$params.quality、$params.output_format、$params.output_compression、$params.moderation、$params.n：应用内参数。
- $inputImages.dataUrls：参考图 data URL 数组；没有参考图时会自动省略该字段。
- $mask.dataUrl：遮罩图 data URL；没有遮罩时会自动省略该字段。

multipart files 示例：
- {"field":"image[]","source":"inputImages","array":true}
- {"field":"mask","source":"mask"}

## profiles 元素
每个元素的字段：
- name：配置名称，方便用户识别。
- provider：对应 customProviders 中某个元素的 id。
- baseUrl：**必须填写完整的 API Base URL（以 http:// 或 https:// 开头）**。例如 https://api.openai.com/v1、https://dashscope.aliyuncs.com/api/v1。禁止留空！如果文档中未给出完整 URL，根据文档中的域名自行推断补全。
- model：模型 ID。如果 API 文档明确了默认模型，填入该值；否则使用 "gpt-image-2"。
- apiMode：固定为 "images"。

profiles 中不要包含 apiKey（用户导入后自行填写）。

# 输出要求
- 最终回复只包含一个 \\\`\\\/\\\/json 代码块，代码块内是 JSON 对象。
- JSON 对象必须包含 customProviders 和 profiles 两个顶层字段。
- 代码块外不要附加解释文字。
- 不要输出 API Key、Authorization header。
- **profiles.baseUrl 必须填写完整 URL，禁止留空。如果文档只提供域名（如 dashscope.aliyuncs.com），需补全为 https://dashscope.aliyuncs.com/api/v1 格式。**
- 如果文档返回 task_id，就必须配置 taskIdPath 和 poll。
- 如果结果 URL 是数组，路径必须写到数组元素，例如 data.result.images.*.url.*。`;

/**
 * 验证并解析 JSON 字符串为 ApiManifest
 */
export function parseManifestJson(jsonStr: string): { success: true; data: ApiManifest } | { success: false; error: string } {
  // 清理输入文本，提取有效 JSON
  let cleaned = jsonStr.trim();

  // 1. 尝试移除 ```json ... ``` 包裹
  const tripleBlockMatch = cleaned.match(/```(?:json)?[\s]*?\n?([\s\S]*?)\n?[\s]*?```/);
  if (tripleBlockMatch) {
    cleaned = tripleBlockMatch[1].trim();
  } else {
    // 2. 移除 ``` ... ``` 包裹（无语言标识）
    const tripleMatch = cleaned.match(/```[\s]*?\n?([\s\S]*?)\n?[\s]*?```/);
    if (tripleMatch) {
      cleaned = tripleMatch[1].trim();
    } else {
      // 3. 移除 //json 单行注释前缀（可能在任意位置）
      cleaned = cleaned.replace(/^\s*\/\/ ?json\s*/m, '').trim();
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // 4. 最后兜底：尝试从文本中找 JSON 对象区间 { ... }
    const jsonObjMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonObjMatch) {
      try {
        parsed = JSON.parse(jsonObjMatch[0]);
      } catch {
        return { success: false, error: `JSON 解析失败: ${e instanceof Error ? e.message : '无效的 JSON 格式'}` };
      }
    } else {
      return { success: false, error: `JSON 解析失败: ${e instanceof Error ? e.message : '无效的 JSON 格式'}` };
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { success: false, error: '根元素必须是 JSON 对象' };
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.customProviders)) {
    return { success: false, error: '缺少 customProviders 字段或不是数组' };
  }

  if (!Array.isArray(obj.profiles)) {
    return { success: false, error: '缺少 profiles 字段或不是数组' };
  }

  if ((obj.customProviders as unknown[]).length === 0) {
    return { success: false, error: 'customProviders 数组不能为空' };
  }

  if ((obj.profiles as unknown[]).length === 0) {
    return { success: false, error: 'profiles 数组不能为空' };
  }

  // 验证每个 provider 的必要字段
  for (const p of obj.customProviders as unknown[]) {
    const provider = p as Record<string, unknown>;
    if (!provider.id || typeof provider.id !== 'string') {
      return { success: false, error: 'customProviders 中每个元素必须有 id (string)' };
    }
    if (!provider.name || typeof provider.name !== 'string') {
      return { success: false, error: `customProviders[${provider.id}] 缺少 name` };
    }
    if (!provider.submit || typeof provider.submit !== 'object') {
      return { success: false, error: `customProviders[${provider.id}] 缺少 submit 配置` };
    }
    const submit = provider.submit as Record<string, unknown>;
    if (!submit.path || typeof submit.path !== 'string') {
      return { success: false, error: `customProviders[${provider.id}].submit 缺少 path` };
    }
  }

  // 验证每个 profile 的必要字段
  for (const profile of obj.profiles as unknown[]) {
    const pf = profile as Record<string, unknown>;
    if (!pf.name || typeof pf.name !== 'string') {
      return { success: false, error: 'profiles 中每个元素必须有 name (string)' };
    }
    if (!pf.provider || typeof pf.provider !== 'string') {
      return { success: false, error: `profiles[${pf.name || '?'}] 缺少 provider 引用` };
    }
    // 检查 provider 是否存在
    const exists = (obj.customProviders as unknown[]).some(
      (p) => (p as Record<string, unknown>).id === pf.provider
    );
    if (!exists) {
      return { success: false, error: `profiles[${pf.name}] 引用的 provider "${pf.provider}" 不存在于 customProviders 中` };
    }
  }

  return { success: true, data: obj as ApiManifest };
}

/**
 * 从剪贴板读取文本
 */
export async function readClipboardText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    throw new Error('无法访问剪贴板，请手动粘贴 JSON 内容');
  }
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error('复制失败');
  }
}

/**
 * 判断 manifest 是否为异步模式（有 poll 配置）
 */
function isAsyncProvider(provider: CustomProviderManifest): boolean {
  return !!provider.poll;
}

/**
 * 根据 manifest 结构推断模型类型
 * 有 editSubmit + submit body 含 image_urls → image
 * 有 video 相关关键词 → video
 * 默认 → image
 */
function inferModelType(provider: CustomProviderManifest): 'image' | 'video' | 'text' {
  const name = (provider.name || '').toLowerCase();
  const submitPath = (provider.submit?.path || '').toLowerCase();

  // 视频相关关键词检测
  const videoKeywords = ['video', 'vid', 'animation', 'animate', 'runway', 'pika', 'kling-video', 'hunyuan-video'];
  if (videoKeywords.some(k => name.includes(k) || submitPath.includes(k))) {
    return 'video';
  }

  // 文本相关关键词检测（chat/completions 路径）
  if (submitPath.includes('chat/completions') || submitPath.includes('text')) {
    return 'text';
  }

  // 有图生图配置 → 图片
  if (provider.editSubmit) {
    return 'image';
  }

  // 默认图片
  return 'image';
}

/**
 * 根据 manifest 内容推断应使用的 API 格式适配器
 *
 * 检测规则：
 * - DashScope: 路径含 services/aigc、域名 dashscope.aliyuncs.com、poll 含 X-DashScope 风格
 * - Kling: 名称含 kling/可灵
 * - OpenAI 兼容: 其他情况默认
 */
export function inferApiFormat(
  provider: CustomProviderManifest,
  baseUrl: string
): 'openai' | 'kling' | 'dashscope' {
  const name = (provider.name || '').toLowerCase();
  const submitPath = (provider.submit?.path || '').toLowerCase();
  const pollPath = (provider.poll?.path || '').toLowerCase();
  const domain = (baseUrl || '').toLowerCase();

  // === DashScope 检测 ===
  const dashscopePaths = ['services/aigc', 'dashscope', 'wan2.', 'happyhorse'];
  if (
    dashscopePaths.some(k => submitPath.includes(k)) ||
    dashscopePaths.some(k => name.includes(k)) ||
    domain.includes('dashscope') ||
    pollPath.includes('/api/v1/tasks')
  ) {
    return 'dashscope';
  }

  // === Kling 检测 ===
  if (
    name.includes('kling') ||
    name.includes('可灵') ||
    domain.includes('kling.ai')
  ) {
    return 'kling';
  }

  // === 默认 OpenAI 兼容 ===
  return 'openai';
}

/**
 * 将 baseUrl 和 path 组装为完整 apiUrl
 */
function buildApiUrl(baseUrl: string, submitPath: string): string {
  const base = baseUrl.replace(/\/+$/, ''); // 移除尾部斜杠
  const path = submitPath.replace(/^\/+/, '');   // 移除开头斜杠
  if (!base) return path;
  // 如果 base 已经以 /v1 结尾且 path 不含 /v1，直接拼接
  if (base.endsWith('/v1')) {
    return `${base}/${path}`;
  }
  return `${base}/${path}`;
}

/**
 * 将 ApiManifest 解析为一组 ParsedApiEntry
 *
 * 每个 profile 生成一个条目，引用对应的 customProvider。
 */
export function manifestToEntries(manifest: ApiManifest): ParsedApiEntry[] {
  const providerMap = new Map<string, CustomProviderManifest>(
    manifest.customProviders.map(p => [p.id, p])
  );

  const entries: ParsedApiEntry[] = [];

  for (const profile of manifest.profiles) {
    const provider = providerMap.get(profile.provider);
    if (!provider) continue;

    const modelType = inferModelType(provider);
    const builtUrl = buildApiUrl(profile.baseUrl, provider.submit.path);
    const inferredFormat = inferApiFormat(provider, profile.baseUrl);

    // 检测常见问题
    const warnings: string[] = [];
    if (!profile.baseUrl) {
      warnings.push(`baseUrl 为空，拼接 URL 可能不完整`);
    }
    if (profile.baseUrl && !profile.baseUrl.startsWith('http://') && !profile.baseUrl.startsWith('https://')) {
      warnings.push(`baseUrl 应以 http:// 或 https:// 开头`);
    }
    if (inferredFormat === 'dashscope') {
      warnings.push(`已自动识别为 DashScope 格式适配器`);
    } else if (inferredFormat === 'kling') {
      warnings.push(`已自动识别为可灵(Kling)格式适配器`);
    }

    entries.push({
      name: profile.name || provider.name,
      apiUrl: builtUrl,
      modelName: profile.model || 'gpt-image-2',
      type: modelType,
      apiFormat: inferredFormat,
      manifest: provider,
      warnings: warnings.length > 0 ? warnings : undefined,
      inferredFormat,
    });
  }

  return entries;
}
