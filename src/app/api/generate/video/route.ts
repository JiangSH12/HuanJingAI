import { NextRequest, NextResponse } from 'next/server';
import { buildCustomApiHeaders, fetchWithRetry, parseCustomApiError } from '@/lib/custom-api-fetch';
import { getAspectRatioPromptHint } from '@/lib/model-config';
import { getAdapter, buildDashScopeVideoSynthesisUrl, buildDashScopePollUrl, extractVideoTaskId, extractVideoTaskStatus, buildVolcEngineVideoSubmitUrl, buildVolcEnginePollUrl, extractVolcEngineTaskId, extractVolcEngineTaskStatus } from '@/lib/api-adapters';
import type { VideoAdapterParams } from '@/lib/api-adapters/types';

// 硅基流动默认配置
const SILICONFLOW_CONFIG = {
  apiKey: process.env.SILICONFLOW_API_KEY,
  apiUrl: process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1',
  modelName: process.env.SILICONFLOW_VIDEO_MODEL || 'Wan-AI/Wan2.2-I2V-A14B',
};

const GENERATION_TIMEOUT = 300_000; // 5分钟

// 动态导入 S3 模块以兼容 Next.js 15 Turbopack
async function getS3Upload() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const { Upload } = await import('@aws-sdk/lib-storage');
  return { S3Client, Upload };
}

async function persistMediaToStorage(dataUrl: string, prefix: string): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;

  try {
    const { S3Client, Upload } = await getS3Upload();
    const match = dataUrl.match(/^data:((?:image|video)\/[^;]+);base64,(.+)$/);
    if (!match) return dataUrl;
    const [, mimeType, base64Data] = match;
    const ext = mimeType.split('/')[1] || 'mp4';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const s3Client = new S3Client({});
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET || 'media',
        Key: fileName,
        Body: buffer,
        ContentType: mimeType,
      },
    });

    await upload.done();
    return `https://${process.env.S3_BUCKET || 'media'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
  } catch (err) {
    console.error('[Persist Media Error]', err instanceof Error ? err.message : err);
    return dataUrl;
  }
}

async function persistRemoteUrlToStorage(url: string, prefix: string): Promise<string> {
  if (!url.startsWith('http')) return url;
  return url;
}

async function persistAllMediaUrls(urls: string[], prefix: string): Promise<string[]> {
  const results = await Promise.all(
    urls.map(async (url) => {
      if (url.startsWith('data:')) {
        return persistMediaToStorage(url, prefix);
      }
      if (url.startsWith('http')) {
        return persistRemoteUrlToStorage(url, prefix);
      }
      return url;
    }),
  );
  return results;
}

async function uploadDataUrlAndGetPublicUrl(dataUrl: string): Promise<string | null> {
  try {
    const { S3Client, Upload } = await getS3Upload();
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return null;
    const [, mimeType, base64Data] = match;
    const ext = mimeType.split('/')[1] || 'png';
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `img2vid-ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const s3Client = new S3Client({});
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: process.env.S3_BUCKET || 'media',
        Key: fileName,
        Body: buffer,
        ContentType: mimeType,
      },
    });

    await upload.done();
    return `https://${process.env.S3_BUCKET || 'media'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
  } catch (err) {
    console.error('[Upload Ref Image Error]', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      negativePrompt,
      aspectRatio = '16:9',
      duration = 5,
      fps = 30,
      image,
      customApiConfig,
    } = body as {
      prompt?: string;
      negativePrompt?: string;
      aspectRatio?: string;
      duration?: number;
      fps?: number;
      image?: string;
      customApiConfig?: {
        apiUrl: string;
        modelName: string;
        apiKey: string;
        provider: string;
        apiFormat?: string;
      };
    };

    if (!prompt && !image) {
      return NextResponse.json({ error: '请提供视频描述或上传图片' }, { status: 400 });
    }

    // ---- Custom API mode ----
    if (customApiConfig && customApiConfig.apiKey) {
      try {
        const adapter = getAdapter(customApiConfig.apiFormat);

        // 火山引擎需要公网可访问的图片 URL，不能使用 data URL
        // 在构建 params 前上传参考图
        let imageUrl: string | undefined;
        if (image) {
          if (image.startsWith('data:') && customApiConfig.apiFormat === 'volcengine') {
            const uploadedUrl = await uploadDataUrlAndGetPublicUrl(image);
            if (uploadedUrl) imageUrl = uploadedUrl;
          } else {
            imageUrl = image;
          }
        }

        const params: VideoAdapterParams = {
          apiUrl: customApiConfig.apiUrl,
          modelName: customApiConfig.modelName,
          apiKey: customApiConfig.apiKey,
          prompt,
          negativePrompt,
          aspectRatio,
          duration,
          fps,
          image: imageUrl,
        };

        const requestBody = adapter.buildVideoRequest(params);

        // 确定请求 URL（dashscope/volcengine 格式使用专用视频端点）
        let requestUrl = customApiConfig.apiUrl;
        if (customApiConfig.apiFormat === 'dashscope') {
          requestUrl = buildDashScopeVideoSynthesisUrl(customApiConfig.apiUrl);
        } else if (customApiConfig.apiFormat === 'volcengine') {
          requestUrl = buildVolcEngineVideoSubmitUrl(customApiConfig.apiUrl);
        }

        // 构建请求头
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // dashscope 格式需要 X-DashScope-Async 头
        if (customApiConfig.apiFormat === 'dashscope') {
          headers['X-DashScope-Async'] = 'enable';
          headers['Authorization'] = `Bearer ${customApiConfig.apiKey}`;
        } else {
          Object.assign(headers, buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat));
        }

        let customResponse: Response;
        try {
          customResponse = await fetchWithRetry(
            requestUrl,
            { method: 'POST', headers, body: JSON.stringify(requestBody) },
            GENERATION_TIMEOUT,
            1,
          );
        } catch (fetchError: unknown) {
          if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
            return NextResponse.json({ error: '自定义API请求超时' }, { status: 504 });
          }
          const msg = fetchError instanceof Error ? fetchError.message : '请求失败';
          return NextResponse.json({ error: `自定义API网络错误: ${msg}` }, { status: 502 });
        }

        if (!customResponse.ok) {
          const errorText = await customResponse.text();
          return NextResponse.json({ error: parseCustomApiError(customResponse.status, errorText) }, { status: customResponse.status });
        }

        const customData = await customResponse.json();
        console.log('[Custom API Video] Raw response:', JSON.stringify(customData).slice(0, 500));

        // 检测异步任务响应（task_id + task_status）
        const responseTaskId = (customData as Record<string, unknown>).task_id as string ||
          ((customData as Record<string, unknown>).output as Record<string, unknown>)?.task_id as string;
        const responseTaskStatus = (customData as Record<string, unknown>).task_status as string ||
          ((customData as Record<string, unknown>).output as Record<string, unknown>)?.task_status as string;
        // 有些API使用 request_id 作为轮询标识
        const responseRequestId = (customData as Record<string, unknown>).request_id as string;

        console.log('[Custom API Video] Parsed ids - taskId:', responseTaskId, 'status:', responseTaskStatus, 'requestId:', responseRequestId);

        // dashscope 异步模式：轮询获取结果
        if (customApiConfig.apiFormat === 'dashscope') {
          const taskId = extractVideoTaskId(customData);
          if (taskId) {
            // 异步模式：轮询获取结果
            const pollUrl = buildDashScopePollUrl(customApiConfig.apiUrl, taskId);

            const maxRetries = 120; // 最多等待 10 分钟
            // 动态轮询间隔：前30秒每2秒一次，之后每5秒一次
            const getPollInterval = (i: number) => i < 15 ? 2000 : 5000;

            console.log(`[Custom API Video] Starting dashscope polling, URL: ${pollUrl}, taskId: ${taskId}`);

            for (let i = 0; i < maxRetries; i++) {
              await new Promise(resolve => setTimeout(resolve, getPollInterval(i)));

              try {
                const pollResponse = await fetch(pollUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${customApiConfig.apiKey}`,
                  },
                });

                if (!pollResponse.ok) {
                  console.log(`[Custom API Video] Poll ${i + 1} failed: ${pollResponse.status}`);
                  continue;
                }

                const pollData = await pollResponse.json();
                const { status, videoUrl, error } = extractVideoTaskStatus(pollData);

                if (status === 'succeeded') {
                  if (videoUrl) {
                    console.log(`[Custom API Video] Success!`);
                    const videos = [videoUrl];
                    const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
                    return NextResponse.json({ videos: persistedVideos });
                  }
                }

                if (status === 'failed') {
                  console.log(`[Custom API Video] Failed: ${error}`);
                  return NextResponse.json({ error: error || '视频生成失败' }, { status: 500 });
                }

                // 每10次打印一次进度
                if (i % 10 === 0) {
                  console.log(`[Custom API Video] Poll ${i + 1}, status: ${status}`);
                }
              } catch {
                // 静默处理网络错误
              }
            }

            return NextResponse.json({ error: '视频生成超时，请稍后重试' }, { status: 504 });
          }
        }

        // volcengine 异步模式：轮询获取结果
        if (customApiConfig.apiFormat === 'volcengine') {
          const taskId = extractVolcEngineTaskId(customData as Record<string, unknown>);
          if (taskId) {
            const pollUrl = buildVolcEnginePollUrl(customApiConfig.apiUrl, taskId);

            const maxRetries = 120; // 最多等待 10 分钟
            // 动态轮询间隔：前30秒每3秒一次，之后每5秒一次
            const getPollInterval = (i: number) => i < 10 ? 3000 : 5000;

            console.log(`[VolcEngine Video] Starting polling, submitUrl: ${customApiConfig.apiUrl}`);
            console.log(`[VolcEngine Video] Poll URL: ${pollUrl}, taskId: ${taskId}`);
            console.log(`[VolcEngine Video] Raw submit response:`, JSON.stringify(customData).slice(0, 500));

            for (let i = 0; i < maxRetries; i++) {
              await new Promise(resolve => setTimeout(resolve, getPollInterval(i)));

              try {
                const pollResponse = await fetch(pollUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${customApiConfig.apiKey}`,
                  },
                });

                if (!pollResponse.ok) {
                  console.log(`[VolcEngine Video] Poll ${i + 1} failed: ${pollResponse.status}`);
                  continue;
                }

                const pollData = await pollResponse.json();
                console.log(`[VolcEngine Video] Poll ${i + 1} response:`, JSON.stringify(pollData).slice(0, 500));
                
                const { status, videoUrl, error } = extractVolcEngineTaskStatus(pollData as Record<string, unknown>);

                if (status === 'succeeded' && videoUrl) {
                  console.log(`[VolcEngine Video] Success!`);
                  const videos = [videoUrl];
                  const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
                  return NextResponse.json({ videos: persistedVideos });
                }

                if (status === 'failed') {
                  console.log(`[VolcEngine Video] Failed: ${error}`);
                  return NextResponse.json({ error: error || '视频生成失败' }, { status: 500 });
                }

                // 每3次打印一次进度（每9-15秒一次）
                if (i % 3 === 0) {
                  console.log(`[VolcEngine Video] Poll ${i + 1}, status: ${status}, elapsed: ${(i + 1) * 3}s`);
                }
              } catch {
                // 静默处理网络错误
              }
            }

            return NextResponse.json({ error: '视频生成超时，请稍后重试' }, { status: 504 });
          } else {
            console.log(`[VolcEngine Video] No taskId found in response:`, JSON.stringify(customData).slice(0, 500));
          }
        }

        // 通用异步模式：响应包含 task_id 且状态为 PENDING/PROCESSING
        if (responseTaskId && responseTaskStatus &&
            ['PENDING', 'PROCESSING', 'SUBMITTED', 'RUNNING'].includes(responseTaskStatus)) {
          // 构建轮询 URL：尝试多个常见端点格式
          const baseUrl = customApiConfig.apiUrl.replace(/\/$/, '');

          // 同时尝试 task_id 和 request_id 两种标识
          const ids = [responseTaskId];
          if (responseRequestId) ids.push(responseRequestId);

          const pollEndpoints: string[] = [];
          for (const id of ids) {
            pollEndpoints.push(
              `${baseUrl}/tasks/${id}`,
              `${baseUrl}/task/${id}`,
              `${baseUrl}/jobs/${id}`,
              `${baseUrl}/async/task/${id}`,
              `${baseUrl}/requests/${id}`,
              `${baseUrl}/async/result/${id}`,
              `${baseUrl}/video/task/${id}`,
              `${baseUrl}/video/result/${id}`,
            );
          }

          const maxRetries = 360; // 最多等待 30 分钟
          // 动态轮询间隔：前30秒每2秒一次，之后每5秒一次
          const getPollInterval = (i: number) => i < 15 ? 2000 : 5000;

          console.log(`[Custom API Video] Async mode detected, task_id: ${responseTaskId}, request_id: ${responseRequestId}`);

          let lastPollData: Record<string, unknown> | null = null;

          for (let i = 0; i < maxRetries; i++) {
            await new Promise(resolve => setTimeout(resolve, getPollInterval(i)));

            // 尝试所有可能的端点
            for (const pollUrl of pollEndpoints) {
              try {
                const pollResponse = await fetch(pollUrl, {
                  method: 'GET',
                  headers: buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat),
                });

                if (!pollResponse.ok) continue;

                const pollData = await pollResponse.json();
                lastPollData = pollData;

                // 尝试从响应中提取视频 URL
                const videos = adapter.parseVideoResponse(pollData as Record<string, unknown>);

                if (videos.length > 0) {
                  console.log(`[Custom API Video] Success!`);
                  const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
                  return NextResponse.json({ videos: persistedVideos });
                }

                // 检查状态是否成功/失败
                const pollStatus = (pollData as Record<string, unknown>).task_status as string ||
                  ((pollData as Record<string, unknown>).output as Record<string, unknown>)?.task_status as string ||
                  (pollData as Record<string, unknown>).status as string;

                if (pollStatus === 'SUCCEEDED' || pollStatus === 'succeeded' || pollStatus === 'success') {
                  const videos = adapter.parseVideoResponse(pollData as Record<string, unknown>);
                  if (videos.length > 0) {
                    console.log(`[Custom API Video] Success!`);
                    const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
                    return NextResponse.json({ videos: persistedVideos });
                  }
                }

                if (pollStatus === 'FAILED' || pollStatus === 'failed' || pollStatus === 'fail') {
                  console.log(`[Custom API Video] Failed`);
                  return NextResponse.json({ error: '视频生成失败' }, { status: 500 });
                }

                // 每30秒打印一次进度
                if (i % 10 === 0) {
                  console.log(`[Custom API Video] Poll ${i + 1}, status: ${pollStatus || 'unknown'}`);
                }
                break; // 找到有效端点，不再尝试其他
              } catch {
                // 继续尝试下一个端点
              }
            }
          }

          // 超时后返回最后的状态信息
          const lastStatus = lastPollData ? JSON.stringify(lastPollData).slice(0, 200) : '无响应';
          return NextResponse.json({
            error: `视频生成超时（已等待30分钟），任务可能仍在处理中。你可以使用 task_id: ${responseTaskId} 稍后手动查询结果`,
            taskId: responseTaskId,
            lastStatus
          }, { status: 504 });
        }

        // 非异步模式：直接解析响应
        const videos = adapter.parseVideoResponse(customData as Record<string, unknown>);

        if (videos.length === 0) {
          return NextResponse.json({ error: '自定义API未返回有效视频数据', raw: customData }, { status: 502 });
        }

        const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
        return NextResponse.json({ videos: persistedVideos });
      } catch (customError: unknown) {
        const err = customError instanceof Error ? customError : new Error(String(customError));
        console.error('[Custom API Video Exception]', err.message, err.stack);
        return NextResponse.json({ error: `自定义API异常: ${err.message}` }, { status: 502 });
      }
    }

    // ---- SiliconFlow default mode ----
    if (!SILICONFLOW_CONFIG.apiKey) {
      return NextResponse.json({ error: '请在环境变量中配置 SILICONFLOW_API_KEY 或使用自定义API' }, { status: 503 });
    }

    try {
      // 上传参考图
      let imageUrl: string | undefined;
      if (image) {
        if (image.startsWith('data:')) {
          const uploadedUrl = await uploadDataUrlAndGetPublicUrl(image);
          if (uploadedUrl) imageUrl = uploadedUrl;
        } else {
          imageUrl = image;
        }
      }

      // 构建提示词
      let fullPrompt = prompt || '';
      if (negativePrompt) {
        fullPrompt += `\n\n避免: ${negativePrompt}`;
      }

      // 使用适配器构建请求
      const adapter = getAdapter('openai');
      const params: VideoAdapterParams = {
        apiUrl: SILICONFLOW_CONFIG.apiUrl,
        modelName: SILICONFLOW_CONFIG.modelName,
        apiKey: SILICONFLOW_CONFIG.apiKey,
        prompt: fullPrompt,
        aspectRatio,
        duration,
        fps,
        image: imageUrl,
      };

      const requestBody = adapter.buildVideoRequest(params);

      console.log('[SiliconFlow Video] model:', SILICONFLOW_CONFIG.modelName, '| hasImage:', !!imageUrl);

      const response = await fetchWithRetry(
        `${SILICONFLOW_CONFIG.apiUrl}/video/submit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SILICONFLOW_CONFIG.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: JSON.stringify(requestBody),
        },
        GENERATION_TIMEOUT,
        1,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SiliconFlow Video Error]', response.status, errorText.slice(0, 500));
        return NextResponse.json({ error: parseCustomApiError(response.status, errorText) }, { status: response.status });
      }

      const data = await response.json();
      console.log('[SiliconFlow Video] Submit response:', JSON.stringify(data).slice(0, 500));

      // 异步等待视频生成结果
      if (data.task_id) {
        const taskId = data.task_id;
        const queryEndpoint = `${SILICONFLOW_CONFIG.apiUrl}/video/query/${taskId}`;
        let retries = 60;

        while (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 5000));

          try {
            const queryResponse = await fetch(queryEndpoint, {
              headers: {
                'Authorization': `Bearer ${SILICONFLOW_CONFIG.apiKey}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            });

            if (queryResponse.ok) {
              const queryData = await queryResponse.json();
              console.log('[SiliconFlow Video] Query response:', JSON.stringify(queryData).slice(0, 300));

              if (queryData.status === 'succeed' && queryData.data?.video_url) {
                const videos = [queryData.data.video_url];
                const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
                return NextResponse.json({ videos: persistedVideos, provider: 'siliconflow' });
              } else if (queryData.status === 'failed') {
                return NextResponse.json({ error: '视频生成失败，请稍后重试' }, { status: 500 });
              }
            }
          } catch (e) {
            console.warn('[SiliconFlow Video] Query error:', e);
          }
          retries--;
        }
      }

      // 如果没有返回 task_id，尝试直接解析响应
      const videos = adapter.parseVideoResponse(data as Record<string, unknown>);
      if (videos.length > 0) {
        const persistedVideos = await persistAllMediaUrls(videos, 'generated/videos');
        return NextResponse.json({ videos: persistedVideos, provider: 'siliconflow' });
      }

      return NextResponse.json({ error: '视频生成超时，请稍后重试' }, { status: 500 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '视频生成失败';
      console.error('[Video Generation Error]', message);
      return NextResponse.json({ error: `生成失败: ${message}` }, { status: 500 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '视频生成失败';
    console.error('[Video Generation Error]', message);
    return NextResponse.json({ error: `生成失败: ${message}` }, { status: 500 });
  }
}
