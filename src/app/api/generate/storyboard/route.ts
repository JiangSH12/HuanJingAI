import { NextRequest, NextResponse } from 'next/server';
import { buildCustomApiHeaders, fetchWithRetry, parseCustomApiError } from '@/lib/custom-api-fetch';

interface CustomApiConfig {
  apiUrl: string;
  modelName: string;
  apiKey: string;
  provider: string;
  apiFormat?: string;
}

const STORYBOARD_TIMEOUT = 90_000;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      customApiConfig,
    } = body as {
      prompt?: string;
      customApiConfig?: CustomApiConfig;
    };

    if (!prompt) {
      return NextResponse.json({ error: '请提供故事描述' }, { status: 400 });
    }

    if (!customApiConfig || !customApiConfig.apiKey) {
      return NextResponse.json({ error: '未配置文本模型，请在API设置中添加文本类型模型' }, { status: 400 });
    }

    const endpoint = customApiConfig.apiUrl;
    if (!endpoint) {
      return NextResponse.json({ error: '文本模型API未配置请求地址' }, { status: 400 });
    }
    if (!customApiConfig.modelName) {
      return NextResponse.json({ error: '文本模型API未配置模型名称' }, { status: 400 });
    }

    // System prompt for manga storyboard generation
    const systemMessage = `你是一位专业的漫画分镜师，擅长将用户提供的一句话扩展成一系列生动详细的漫画分镜描述，每个分镜描述会被图像生成模型用于绘制漫画画面。请根据用户输入的一句话，创作4到6个连续且逻辑连贯的漫画分镜。输出每个分镜文本时单独一行，以"分镜 X："开头，X为序号。每个分镜描述应包含画面主体、环境、动作、构图或镜头角度、氛围等视觉元素，建议长度50-150字，确保信息充分、画面感强。避免使用模糊的词语，不要输出与分镜无关的解释或评价。输出示例如下：

用户输入：一个胆小的小猫在暴风雨夜发现了一个神秘洞穴。
分镜 1：远景，乌云密布，大雨倾盆。荒凉的山坡上，一只棕色小猫瑟缩着身体，小心翼翼靠近山坡上一处发出微弱蓝光的洞穴口，浑身湿透。
分镜 2：中景，小猫探头望向洞穴内部，眼神惊恐又好奇。洞壁上布满闪光的晶簇，照亮了小猫瞪圆的双眼和竖起的毛发。
分镜 3：特写，小猫的前爪试探着触碰一颗蓝色晶石，晶石突然发出更亮的光芒，吓得小猫耳朵后压。
分镜 4：近景，小猫被一股神秘力量悬浮起来，晶石的光包裹着它，表情从恐惧转变为惊讶和一丝兴奋。
分镜 5：全景，洞穴内部完全被照亮，显现出一幅古老的壁画，小猫漂浮在壁画前，影子投射出类似野兽的形状。

请严格按照上述格式输出，不要附加任何其他内容。`;

    const headers = buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat);
    const chatBody = {
      model: customApiConfig.modelName,
      stream: false,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: `用户输入：${prompt}。请输出对应的分镜列表，严格按照上述格式，不附加任何其他内容。` },
      ],
    };

    console.log('[Storyboard] Using text model:', customApiConfig.modelName);

    try {
      const response = await fetchWithRetry(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(chatBody),
        },
        STORYBOARD_TIMEOUT,
        1,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Storyboard] API error:', response.status, errorText.slice(0, 200));
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
          // Parse the storyboard into individual panels
          const panels = parseStoryboard(content.trim());
          return NextResponse.json({ panels, raw: content.trim() });
        }
      }

      return NextResponse.json({ error: '文本模型未返回有效内容' }, { status: 502 });
    } catch (fetchError: unknown) {
      const msg = fetchError instanceof Error ? fetchError.message : '请求失败';
      console.error('[Storyboard] Fetch error:', msg);
      return NextResponse.json({ error: `分镜生成失败: ${msg}` }, { status: 502 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '分镜生成失败';
    console.error('[Storyboard Error]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Parse storyboard text into individual panel descriptions
 * Format: "分镜 X：内容" or "分镜X：内容"
 */
function parseStoryboard(text: string): Array<{ index: number; text: string }> {
  const panels: Array<{ index: number; text: string }> = [];
  // Match patterns like "分镜 1：" or "分镜1："
  const regex = /分镜\s*(\d+)[：:]\s*([\s\S]*?)(?=分镜\s*\d+[：:]|$)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const index = parseInt(match[1], 10);
    const panelText = match[2].trim();
    if (panelText) {
      panels.push({ index, text: panelText });
    }
  }

  // If no panels found with the regex, try alternative parsing
  if (panels.length === 0) {
    // Split by "分镜 X" pattern
    const lines = text.split('\n').filter(line => line.trim());
    let currentIndex = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      // Check if line starts with "分镜" followed by a number
      const match = trimmed.match(/^分镜\s*(\d+)[：:]\s*(.*)/);
      if (match) {
        currentIndex = parseInt(match[1], 10);
        const text = match[2].trim();
        if (text) {
          panels.push({ index: currentIndex, text });
        }
      } else if (currentIndex > 0 && panels.length > 0) {
        // Append to last panel if no new panel header
        const lastPanel = panels[panels.length - 1];
        if (lastPanel && lastPanel.index === currentIndex) {
          lastPanel.text += ' ' + trimmed;
        }
      }
    }
  }

  return panels;
}
