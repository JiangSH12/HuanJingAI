import { NextRequest, NextResponse } from 'next/server';
import { buildCustomApiHeaders, fetchWithRetry, parseCustomApiError } from '@/lib/custom-api-fetch';

interface CustomApiConfig {
  apiUrl: string;
  modelName: string;
  apiKey: string;
  provider: string;
  apiFormat?: string;
}

const SUGGEST_TIMEOUT = 60_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      customApiConfig,
      systemPrefix,
    } = body as {
      prompt?: string;
      modelName?: string;
      customApiConfig?: CustomApiConfig;
      systemPrefix?: string;
    };

    if (!prompt) {
      return NextResponse.json({ error: '请提供创作描述' }, { status: 400 });
    }

    // Use custom/system text model API if provided
    if (customApiConfig && customApiConfig.apiKey) {
      const endpoint = customApiConfig.apiUrl;
      if (!endpoint) {
        return NextResponse.json({ error: '文本模型API未配置请求地址' }, { status: 400 });
      }
      if (!customApiConfig.modelName) {
        return NextResponse.json({ error: '文本模型API未配置模型名称' }, { status: 400 });
      }

      // Build system message with optional prefix
      const systemMessage = systemPrefix
        ? `${systemPrefix}。请直接返回优化后的提示词，不要加任何解释说明。`
        : '你是一个专业的AI绘图提示词优化专家。请将用户的描述优化为更详细、更有画面感的提示词，直接返回优化后的提示词，不要加任何解释说明。';

      const headers = buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat);
      const chatBody = {
        model: customApiConfig.modelName,
        stream: false,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt },
        ],
      };

      console.log('[Suggest Prompt] Using custom text model:', customApiConfig.modelName, '| prefix:', systemPrefix || 'default');

      try {
        const response = await fetchWithRetry(
          endpoint,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(chatBody),
          },
          SUGGEST_TIMEOUT,
          1,
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Suggest Prompt] API error:', response.status, errorText.slice(0, 200));
          return NextResponse.json(
            { error: parseCustomApiError(response.status, errorText) },
            { status: response.status >= 500 ? 502 : response.status }
          );
        }

        const data = await response.json();
        const choices = (data as Record<string, unknown>).choices as Array<Record<string, unknown>> | undefined;
        if (choices && choices.length > 0) {
          const message = choices[0].message as Record<string, unknown>;
          const content = message?.content;
          if (typeof content === 'string' && content.trim()) {
            return NextResponse.json({ prompt: content.trim() });
          }
        }

        return NextResponse.json({ error: '文本模型未返回有效内容' }, { status: 502 });
      } catch (fetchError: unknown) {
        const msg = fetchError instanceof Error ? fetchError.message : '请求失败';
        console.error('[Suggest Prompt] Fetch error:', msg);
        return NextResponse.json({ error: `提示词优化失败: ${msg}` }, { status: 502 });
      }
    }

    // No text model configured
    return NextResponse.json({ error: '未配置文本模型，请在API设置中添加文本类型模型' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '提示词优化失败';
    console.error('[Suggest Prompt Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
