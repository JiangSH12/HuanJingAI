'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-store';
import { useCustomApiKeys } from '@/lib/custom-api-store';
import { useAdminConfig } from '@/lib/admin-store';
import {
  ASPECT_RATIOS,
  RESOLUTION_OPTIONS,
  STYLE_PRESETS,
  isCustomModel,
  isSystemModel,
  isSiliconFlowDefault,
  getCustomKeyId,
  getSystemApiId,
  buildCustomModelId,
  buildSystemModelId,
  calcImageCredits,
  resolveImageSize,
  resolveCustomApiImageSize,
} from '@/lib/model-config';
import { Sparkles, Loader2, Download, Upload, Wand2, Image as ImageIcon, History, ChevronDown, ChevronUp, Plus, KeyRound, Share2 } from 'lucide-react';
import { useCreationHistory, isPlaceholder, shareToGallery, isUrlPublished, type CreationRecord } from '@/lib/creation-history-store';
import { addCreditRecord } from '@/lib/credit-records-store';
import { downloadFile } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import { ImageLightbox } from '@/components/lightbox';
import { CreationDetailDialog } from '@/components/creation-detail-dialog';

export function TextToImagePanel() {
  const { user } = useAuth();
  const { imageKeys, textKeys } = useCustomApiKeys();
  const { config: adminConfig } = useAdminConfig();

  // Form state
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [resolution, setResolution] = useState('2K');
  const [count, setCount] = useState(1);
  const [guidanceScale, setGuidanceScale] = useState(7);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [optimizing, setOptimizing] = useState(false);

  // History state
  const { records, add: addRecord } = useCreationHistory();
  const [showHistory, setShowHistory] = useState(false);
  const imageHistory = records.filter(r => r.type === 'image');

  // Lightbox state
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // History detail dialog
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<CreationRecord | null>(null);

  // System APIs
  const systemImageApis = adminConfig.systemApis.filter(api => api.type === 'image' && api.isActive);
  const systemTextApis = adminConfig.systemApis.filter(api => api.type === 'text' && api.isActive);

  // Model options — include siliconflow default + system + custom
  const modelOptions = useMemo(() => [
    { id: 'siliconflow-default', label: '通义图像 (默认)', group: '默认模型' },
    ...systemImageApis.map(api => ({ id: buildSystemModelId(api.id), label: `${api.name} (系统)`, group: '系统模型' })),
    ...imageKeys.map(k => ({ id: buildCustomModelId(k.id), label: `${k.modelName || k.provider} (自定义)`, group: '自定义模型' })),
  ], [systemImageApis, imageKeys]);

  const hasModels = modelOptions.length > 0;

  // Default to first available: system > custom; prefer custom if available
  const [selectedModel, setSelectedModel] = useState('');
  useEffect(() => {
    if (modelOptions.length > 0 && !modelOptions.find(o => o.id === selectedModel)) {
      // Prefer custom model as default
      const customOpt = modelOptions.find(o => o.group === '自定义模型');
      setSelectedModel(customOpt ? customOpt.id : modelOptions[0].id);
    }
  }, [modelOptions, selectedModel]);

  // Text model options for prompt optimization — memoized
  const textModelOptions = useMemo(() => [
    ...textKeys.map(k => ({ id: buildCustomModelId(k.id), label: `${k.modelName || k.provider} (自定义)`, config: { apiUrl: k.apiUrl, modelName: k.modelName, apiKey: k.apiKey } })),
    ...systemTextApis.map(api => ({ id: buildSystemModelId(api.id), label: `${api.name} (系统)`, config: { apiUrl: api.apiUrl, modelName: api.modelName, apiKey: api.apiKey } })),
  ], [textKeys, systemTextApis]);

  const getCurrentModelLabel = useCallback(() => {
    if (selectedModel === 'siliconflow-default') return '硅基流动';
    if (isCustomModel(selectedModel)) {
      const key = imageKeys.find(k => k.id === getCustomKeyId(selectedModel));
      return key?.modelName || key?.provider || '自定义模型';
    }
    if (isSystemModel(selectedModel)) {
      const api = systemImageApis.find(a => a.id === getSystemApiId(selectedModel));
      return api?.name || '系统模型';
    }
    return 'AI模型';
  }, [selectedModel, imageKeys, systemImageApis]);

  // Prompt optimization
  const handleOptimizePrompt = useCallback(async () => {
    if (!prompt.trim()) { toast.error('请先输入创作描述'); return; }
    if (textModelOptions.length === 0) { toast.error('未配置文本模型，请先在API设置中添加文本类型模型'); return; }

    setOptimizing(true);
    try {
      const textModel = textModelOptions[0];
      const modelLabel = getCurrentModelLabel();
      const res = await fetch('/api/generate/suggest-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          modelName: textModel.config.modelName,
          customApiConfig: textModel.config,
          systemPrefix: `针对${modelLabel}图片生成优化提示词`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.prompt) { setPrompt(data.prompt); toast.success('提示词已优化'); }
        else toast.error(data.error || '优化失败');
      } else toast.error('提示词优化请求失败');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error('请求超时，请尝试减少生成数量或降低分辨率');
      } else {
        toast.error(err instanceof Error ? err.message : '网络错误，请重试');
      }
    }
    finally { setOptimizing(false); }
  }, [prompt, textModelOptions, getCurrentModelLabel]);

  const credits = calcImageCredits(selectedModel, resolution, aspectRatio, count);

  // Generate
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { toast.error('请输入创作描述'); return; }
    if (!user) { toast.error('请先登录'); return; }

    setGenerating(true);
    try {
      // Use API-compatible sizes for custom/system/siliconflow models
      const useCustomApiSize = isCustomModel(selectedModel) || isSystemModel(selectedModel) || isSiliconFlowDefault(selectedModel);
      const resolvedSize = useCustomApiSize
        ? resolveCustomApiImageSize(aspectRatio)
        : resolveImageSize(aspectRatio, resolution);

      let requestBody: Record<string, unknown> = {
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        model: selectedModel,
        aspectRatio,
        resolution,
        size: resolvedSize,
        count,
        guidanceScale,
      };

      if (isCustomModel(selectedModel)) {
        const key = imageKeys.find(k => k.id === getCustomKeyId(selectedModel));
        if (key) {
          requestBody = { ...requestBody, model: key.modelName, customApiConfig: { apiUrl: key.apiUrl, modelName: key.modelName, apiKey: key.apiKey, apiFormat: key.apiFormat } };
        }
      } else if (isSystemModel(selectedModel)) {
        const api = systemImageApis.find(a => a.id === getSystemApiId(selectedModel));
        if (api) {
          requestBody = { ...requestBody, model: api.modelName, customApiConfig: { apiUrl: api.apiUrl, modelName: api.modelName, apiKey: api.apiKey, apiFormat: (api as Record<string, unknown>).apiFormat as string | undefined } };
        }
      }
      // siliconflow-default 不传 customApiConfig，让后端使用默认配置

      // Fetch with 180s timeout for image generation
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300_000);

      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorMsg = `请求失败 (${res.status})`;
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch { /* ignore json parse error */ }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data.images && data.images.length > 0) {
        setResults(data.images);
        for (const url of data.images) {
          addRecord({
            type: 'image', url, prompt: prompt.trim(),
            negativePrompt: negativePrompt.trim() || undefined,
            model: selectedModel,
            modelLabel: getCurrentModelLabel(),
            isCustomModel: isCustomModel(selectedModel) || isSystemModel(selectedModel) || isSiliconFlowDefault(selectedModel),
            params: { aspectRatio, resolution, count, guidanceScale },
          });
        }
        toast.success(`生成 ${data.images.length} 张图片`);
        // Record credit consumption (custom/system models cost 0 credits)
        if (credits > 0 && user) {
          const currentCredits = typeof user.creditsBalance === 'number' ? user.creditsBalance : 0;
          addCreditRecord({
            type: 'consume',
            amount: -credits,
            balanceAfter: Math.max(0, currentCredits - credits),
            description: `文生图 - ${getCurrentModelLabel()}`,
          });
        }
      } else {
        toast.error(data.error || '图片生成失败');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error('请求超时，请尝试减少生成数量或降低分辨率');
      } else {
        toast.error(err instanceof Error ? err.message : '网络错误，请重试');
      }
    }
    finally { setGenerating(false); }
  }, [prompt, negativePrompt, selectedModel, aspectRatio, resolution, count, guidanceScale, user, imageKeys, systemImageApis, getCurrentModelLabel, addRecord]);

  // Download
  const handleDownload = useCallback(async (url: string, index: number) => {
    const result = await downloadFile(url, `miaojing-${Date.now()}-${index}.png`);
    if (!result.ok) toast.error(result.error || '下载失败');
  }, []);

  const handleShareToGallery = useCallback((url: string) => {
    if (isUrlPublished(url)) {
      toast.info('该作品已分享到画廊');
      return;
    }
    shareToGallery({
      type: 'image',
      url,
      prompt: prompt.trim(),
      model: selectedModel,
      modelLabel: getCurrentModelLabel(),
    });
    toast.success('已分享到画廊');
  }, [prompt, selectedModel, getCurrentModelLabel]);

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Left: Settings (scrollable) */}
      <div className="w-[420px] shrink-0 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)] pr-2">
        {/* Model Selection */}
        <div className="space-y-2">
          <Label>生成模型</Label>
          {hasModels ? (
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
              <SelectContent>
                {modelOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-2">
              <KeyRound className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">暂无可用模型</p>
              <Link href="/profile" className="text-sm text-primary hover:underline">
                前往 我的 → API 中添加API密钥
              </Link>
            </div>
          )}
        </div>

        {/* Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>创作描述</Label>
          </div>
          <div className="relative">
            <Textarea
              placeholder="描述你想要生成的图片，越详细效果越好..."
              rows={4}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              className="pr-20 pb-8"
            />
            <div className="absolute bottom-2 right-2">
              {textModelOptions.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10"
                  onClick={handleOptimizePrompt}
                  disabled={optimizing || !prompt.trim()}
                >
                  {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  {optimizing ? '优化中...' : '优化'}
                </Button>
              ) : (
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="前往个人中心配置文本模型"
                >
                  <Wand2 className="h-3 w-3" />
                  配置模型
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_PRESETS.map(s => (
              <Badge key={s} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => setPrompt(prev => prev ? `${prev}, ${s}` : s)}>
                {s}
              </Badge>
            ))}
          </div>
        </div>

        {/* Negative Prompt */}
        <div className="space-y-2">
          <Label>负面提示词 <span className="text-muted-foreground text-xs">(可选)</span></Label>
          <Textarea placeholder="不希望出现的元素..." rows={2} value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} />
        </div>

        {/* Aspect Ratio + Resolution */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>画面比例</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map(ar => (
                  <SelectItem key={ar.value} value={ar.value}>{ar.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>分辨率</Label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESOLUTION_OPTIONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Guidance Scale */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>引导系数</Label>
            <span className="text-xs text-muted-foreground">{guidanceScale}</span>
          </div>
          <Slider value={[guidanceScale]} onValueChange={([v]) => setGuidanceScale(v)} min={1} max={20} step={1} />
        </div>

        {/* Count */}
        <div className="space-y-2">
          <Label>生成数量</Label>
          <Select value={String(count)} onValueChange={v => setCount(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 张</SelectItem>
              <SelectItem value="2">2 张</SelectItem>
              <SelectItem value="4">4 张</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Generate Button */}
        <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={generating || !hasModels}>
          {generating ? (<><Loader2 className="h-4 w-4 animate-spin" />生成中...</>) : (<><Sparkles className="h-4 w-4" />生成图片 {credits > 0 && `(${credits} 积分)`}</>)}
        </Button>
      </div>

      {/* Right: Results + History (flex-1, takes remaining space) */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Results area */}
        {results.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><ImageIcon className="h-4 w-4" />生成结果</div>
            <div className="grid grid-cols-2 gap-3">
              {results.map((url, i) => (
                <div key={i} className="group relative rounded-lg border border-border overflow-hidden bg-muted/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`生成结果 ${i + 1}`}
                    className="w-full aspect-square object-cover cursor-zoom-in"
                    onDoubleClick={() => setLightboxSrc(url)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <Button size="sm" variant="secondary" className="gap-1" onClick={() => setLightboxSrc(url)}><ImageIcon className="h-3.5 w-3.5" />预览</Button>
                    <Button size="sm" variant="secondary" className="gap-1" onClick={() => handleShareToGallery(url)}><Share2 className="h-3.5 w-3.5" />分享</Button>
                    <Button size="sm" variant="secondary" className="gap-1" onClick={() => handleDownload(url, i)}><Download className="h-3.5 w-3.5" />下载</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground rounded-lg border border-dashed border-border min-h-[300px]">
            <ImageIcon className="h-14 w-14 mb-3 opacity-20" />
            <p className="text-sm">生成结果将显示在这里</p>
          </div>
        )}

        {/* History */}
        {imageHistory.length > 0 && (
          <div className="space-y-2">
            <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-4 w-4" />历史创作 ({imageHistory.length})
              {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showHistory && (
              <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                {imageHistory.map(record => (
                  <div
                    key={record.id}
                    className="group relative rounded-md border border-border overflow-hidden bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedHistoryRecord(record)}
                  >
                    {isPlaceholder(record.url) ? (
                      <div className="w-full aspect-square flex items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground/30" /></div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={record.url} alt={record.prompt?.slice(0, 20) || '历史记录'} className="w-full aspect-square object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-1.5 opacity-0 group-hover:opacity-100">
                      <p className="text-xs text-white line-clamp-2">{record.prompt}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <ImageLightbox src={lightboxSrc || ''} open={!!lightboxSrc} onClose={() => setLightboxSrc(null)} />

      {/* History Detail Dialog */}
      <CreationDetailDialog
        record={selectedHistoryRecord}
        open={!!selectedHistoryRecord}
        onClose={() => setSelectedHistoryRecord(null)}
      />
    </div>
  );
}
