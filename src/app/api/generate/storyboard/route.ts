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

interface StoryboardResponse {
  subjectPrompt?: string;
  panels: Array<{ index: number; text: string }>;
  raw?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      customApiConfig,
      mode = 'normal',
      hasReferenceImage = false,
    } = body as {
      prompt?: string;
      customApiConfig?: CustomApiConfig;
      mode?: 'normal' | 'image-to-comic';
      hasReferenceImage?: boolean;
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

    const systemMessage = mode === 'image-to-comic'
      ? `你是一位专业的漫画编剧与分镜导演，当前任务是将用户提供的一段剧情，拆解为“漫画主体设定”与“连续漫画分镜”。用户稍后会先根据主体设定生成一张漫画主体图片，再基于这张主体图生成多个分镜，因此你必须保证人物设定、服装、画风、色彩倾向、时代背景和关键道具在所有分镜中高度统一。\n\n请严格按照以下格式输出，不要添加任何解释：\n主体：用1段话描述漫画主体画面，内容要适合图生图生成“漫画主题主视觉”，需包含主角身份、外貌特征、服饰、画风、线稿上色风格、场景基调、核心道具和氛围，长度80-180字。\n分镜 1：描述第1个分镜的画面。\n分镜 2：描述第2个分镜的画面。\n分镜 3：描述第3个分镜的画面。\n……\n\n要求：\n1. 一共输出4到6个分镜。\n2. 每个分镜都必须是可直接用于生成漫画画面的视觉描述，包含镜头远近、主体动作、构图、场景、情绪。\n3. 分镜之间必须连续推进剧情，且明确继承“主体”中的角色设定。\n4. 如果用户会上传参考图，请默认需要保留参考图主体特征，并在主体和分镜中强调“保持角色一致性、服装一致性、画风一致性”。\n5. 不要输出编号列表之外的额外说明。`
      : `你是一位专业的漫画分镜师，擅长将用户提供的一句话扩展成一系列生动详细的漫画分镜描述，每个分镜描述会被图像生成模型用于绘制漫画画面。请根据用户输入的一句话，创作4到6个连续且逻辑连贯的漫画分镜。输出每个分镜文本时单独一行，以"分镜 X："开头，X为序号。每个分镜描述应包含画面主体、环境、动作、构图或镜头角度、氛围等视觉元素，建议长度50-150字，确保信息充分、画面感强。避免使用模糊的词语，不要输出与分镜无关的解释或评价。输出示例如下：\n\n用户输入：一个胆小的小猫在暴风雨夜发现了一个神秘洞穴。\n分镜 1：远景，乌云密布，大雨倾盆。荒凉的山坡上，一只棕色小猫瑟缩着身体，小心翼翼靠近山坡上一处发出微弱蓝光的洞穴口，浑身湿透。\n分镜 2：中景，小猫探头望向洞穴内部，眼神惊恐又好奇。洞壁上布满闪光的晶簇，照亮了小猫瞪圆的双眼和竖起的毛发。\n分镜 3：特写，小猫的前爪试探着触碰一颗蓝色晶石，晶石突然发出更亮的光芒，吓得小猫耳朵后压。\n分镜 4：近景，小猫被一股神秘力量悬浮起来，晶石的光包裹着它，表情从恐惧转变为惊讶和一丝兴奋。\n分镜 5：全景，洞穴内部完全被照亮，显现出一幅古老的壁画，小猫漂浮在壁画前，影子投射出类似野兽的形状。\n\n请严格按照上述格式输出，不要附加任何其他内容。`;

    const userPrompt = mode === 'image-to-comic'
      ? `用户剧情：${prompt}。${hasReferenceImage ? '用户会提供参考图，请尽量保持参考图主体特征并强化漫画角色一致性。' : ''}请输出主体设定和连续分镜，严格按照要求格式，不要附加任何其他内容。`
      : `用户输入：${prompt}。请输出对应的分镜列表，严格按照上述格式，不附加任何其他内容。`;

    const headers = buildCustomApiHeaders(customApiConfig.apiKey, customApiConfig.apiFormat);
    const chatBody = {
      model: customApiConfig.modelName,
      stream: false,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt },
      ],
    };

    console.log('[Storyboard] Using text model:', customApiConfig.modelName, '| mode:', mode);

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
          const parsed = parseStoryboard(content.trim(), mode);
          return NextResponse.json({ ...parsed, raw: content.trim() } satisfies StoryboardResponse);
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

function parseStoryboard(text: string, mode: 'normal' | 'image-to-comic'): StoryboardResponse {
  const panels: Array<{ index: number; text: string }> = [];
  const regex = /分镜\s*(\d+)[：:]\s*([\s\S]*?)(?=分镜\s*\d+[：:]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const index = parseInt(match[1], 10);
    const panelText = match[2].trim();
    if (panelText) {
      panels.push({ index, text: panelText });
    }
  }

  if (panels.length === 0) {
    const lines = text.split('\n').filter(line => line.trim());
    let currentIndex = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      const lineMatch = trimmed.match(/^分镜\s*(\d+)[：:]\s*(.*)/);
      if (lineMatch) {
        currentIndex = parseInt(lineMatch[1], 10);
        const panelText = lineMatch[2].trim();
        if (panelText) {
          panels.push({ index: currentIndex, text: panelText });
        }
      } else if (currentIndex > 0 && panels.length > 0) {
        const lastPanel = panels[panels.length - 1];
        if (lastPanel && lastPanel.index === currentIndex) {
          lastPanel.text += ` ${trimmed}`;
        }
      }
    }
  }

  const result: StoryboardResponse = { panels };

  if (mode === 'image-to-comic') {
    const subjectMatch = text.match(/主体[：:]\s*([\s\S]*?)(?=分镜\s*1[：:]|分镜\s*\d+[：:]|$)/);
    if (subjectMatch?.[1]) {
      result.subjectPrompt = subjectMatch[1].trim();
    }
  }

  return result;
}
