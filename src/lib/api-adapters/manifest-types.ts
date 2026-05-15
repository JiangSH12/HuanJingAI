/**
 * 智能配置 API - JSON Manifest 类型定义
 *
 * 用户通过 AI 生成或手动编写的自定义服务商配置 JSON，
 * 描述一个 API 供应商的接口映射规则（提交、编辑、轮询）。
 */

/** 结果提取规则 */
export interface ManifestResult {
  /** 图片 URL 路径数组，支持 * 通配数组 */
  imageUrlPaths?: string[];
  /** base64 图片路径数组，支持 * 通配数组 */
  b64JsonPaths?: string[];
}

/** 提交配置（文生图 / 文生视频） */
export interface ManifestSubmit {
  /** 接口路径，不带开头斜杠，不带 /v1/ 前缀 */
  path: string;
  /** HTTP 方法 */
  method?: 'GET' | 'POST';
  /** 请求内容类型：json 或 multipart */
  contentType?: 'json' | 'multipart';
  /** query 参数对象 */
  query?: Record<string, string>;
  /** 请求体模板对象（支持变量替换） */
  body?: Record<string, unknown>;
  /** multipart 文件字段数组，仅 contentType=multipart 时使用 */
  files?: ManifestFileField[];
  /** 提交响应中的任务 ID JSON 路径；同步接口不填 */
  taskIdPath?: string;
  /** 同步响应图片提取规则 */
  result?: ManifestResult;
}

/** multipart 文件字段定义 */
export interface ManifestFileField {
  /** 表单字段名 */
  field: string;
  /** 数据来源：inputImages / mask */
  source: 'inputImages' | 'mask';
  /** 是否为数组字段 */
  array?: boolean;
}

/** 异步任务轮询配置 */
export interface ManifestPoll {
  /** 任务查询路径，使用 {task_id} 占位符 */
  path: string;
  /** HTTP 方法 */
  method?: 'GET' | 'POST';
  /** 查询 query 参数 */
  query?: Record<string, string>;
  /** 轮询间隔秒数 */
  intervalSeconds?: number;
  /** 查询响应状态字段 JSON 路径 */
  statusPath: string;
  /** 成功状态值数组 */
  successValues: string[];
  /** 失败状态值数组 */
  failureValues: string[];
  /** 失败原因路径 */
  errorPath?: string;
  /** 成功后图片提取规则 */
  result?: ManifestResult;
}

/** 自定义服务商 Manifest */
export interface CustomProviderManifest {
  /** 服务商唯一标识，格式 custom-{英文短名} */
  id: string;
  /** 服务商显示名称 */
  name: string;
  /** 文生图/文生视频提交配置 */
  submit: ManifestSubmit;
  /** 图生图/局部重绘提交配置，可选 */
  editSubmit?: ManifestSubmit;
  /** 异步任务查询配置，可选；同步接口不写 */
  poll?: ManifestPoll;
}

/** API 配置 Profile */
export interface ManifestProfile {
  /** 配置名称 */
  name: string;
  /** 引用的 customProviders id */
  provider: string;
  /** API Base URL，留空由用户填写 */
  baseUrl: string;
  /** 模型 ID */
  model: string;
  /** 固定为 "images" */
  apiMode: 'images';
}

/** 完整 Manifest 导入结构 */
export interface ApiManifest {
  /** 自定义服务商 Manifest 数组 */
  customProviders: CustomProviderManifest[];
  /** API 配置数组 */
  profiles: ManifestProfile[];
}

/**
 * 从 Manifest 解析出的、可直接写入 custom-api-store 的条目
 */
export interface ParsedApiEntry {
  /** 服务商名称（来自 profile.name 或 provider.name） */
  name: string;
  /** API Base URL（profile.baseUrl + submit.path 组合为完整 apiUrl） */
  apiUrl: string;
  /** 模型名称（profile.model） */
  modelName: string;
  /** 模型类型 - 根据 manifest 结构推断 */
  type: 'image' | 'video' | 'text';
  /** API 格式 - 统一标记为 manifest */
  apiFormat: 'openai' | 'kling' | 'dashscope' | 'manifest';
  /** 原始 manifest 数据（用于后续适配器扩展） */
  manifest: CustomProviderManifest;
  /** 解析警告信息（如 baseUrl 为空等） */
  warnings?: string[];
  /** 推断的 API 格式（用于导入时选择正确的适配器） */
  inferredFormat: 'openai' | 'kling' | 'dashscope';
}
