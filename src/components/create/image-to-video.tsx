'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-store';
import { useCustomApiKeys } from '@/lib/custom-api-store';
import { useAdminConfig } from '@/lib/admin-store';
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS_SHORT,
  IMG2VIDEO_CAMERA_MOVEMENTS,
  isCustomModel,
  isSystemModel,
  getCustomKeyId,
  getSystemApiId,
  buildCustomModelId,
  buildSystemModelId,
  calcVideoCredits,
} from '@/lib/model-config';
import { Sparkles, Loader2, Download, Upload, Wand2, Film, History, ChevronDown, ChevronUp, Plus, X, KeyRound, Share2 } from 'lucide-react';
import { useCreationHistory, isPlaceholder, shareToGallery, isUrlPublished, type CreationRecord } from '@/lib/creation-history-store';
import { addCreditRecord } from '@/lib/credit-records-store';
import { downloadFile } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import { CreationDetailDialog } from '@/components/creation-detail-dialog';

export function ImageToVideoPanel() {
  const { user } = useAuth();
  const { videoKeys, textKeys } = useCustomApiKeys();
  const { config: adminConfig } = useAdminConfig();

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('4');
  const [cameraMovement, setCameraMovement] = useState(IMG2VIDEO_CAMERA_MOVEMENTS[0]);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [optimizing, setOptimizing] = useState(false);

  const { records, add: addRecord } = useCreationHistory();
  const [showHistory, setShowHistory] = useState(false);

  // History detail dialog
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<CreationRecord | null>(null);
  const videoHistory = records.filter(r => r.type === 'video');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const systemVideoApis = adminConfig.systemApis.filter(api => api.type === 'video' && api.isActive);
  const systemTextApis = adminConfig.systemApis.filter(api => api.type === 'text' && api.isActive);

  // Model options — only system + custom (no builtin)
  const modelOptions = useMemo(() => [
    ...systemVideoApis.map(api => ({ id: buildSystemModelId(api.id), label: `${api.name} (系统)`, group: '系统模型' })),
    ...videoKeys.map(k => ({ id: buildCustomModelId(k.id), label: `${k.modelName || k.provider} (自定义)`, group: '自定义模型' })),
  ], [systemVideoApis, videoKeys]);

  const hasModels = modelOptions.length > 0;

  const [selectedModel, setSelectedModel] = useState('');
  useEffect(() => {
    if (modelOptions.length > 0 && !modelOptions.find(o => o.id === selectedModel)) {
      const customOpt = modelOptions.find(o => o.group === '自定义模型');
      setSelectedModel(customOpt ? customOpt.id : modelOptions[0].id);
    }
  }, [modelOptions, selectedModel]);

  const textModelOptions = useMemo(() => [
    ...textKeys.map(k => ({ id: buildCustomModelId(k.id), label: `${k.modelName || k.provider} (自定义)`, config: { apiUrl: k.apiUrl, modelName: k.modelName, apiKey: k.apiKey } })),
    ...systemTextApis.map(api => ({ id: buildSystemModelId(api.id), label: `${api.name} (系统)`, config: { apiUrl: api.apiUrl, modelName: api.modelName, apiKey: api.apiKey } })),
  ], [textKeys, systemTextApis]);

  const getCurrentModelLabel = useCallback(() => {
    if (isCustomModel(selectedModel)) {
      const key = videoKeys.find(k => k.id === getCustomKeyId(selectedModel));
      return key?.modelName || key?.provider || '自定义模型';
    }
    if (isSystemModel(selectedModel)) {
      const api = systemVideoApis.find(a => a.id === getSystemApiId(selectedModel));
      return api?.name || '系统模型';
    }
    return 'AI模型';
  }, [selectedModel, videoKeys, systemVideoApis]);

  const handleOptimizePrompt = useCallback(async () => {
    if (!prompt.trim()) { toast.error('请先输入视频描述'); return; }
    if (textModelOptions.length === 0) { toast.error('未配置文本模型'); return; }

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
          systemPrefix: `针对${modelLabel}视频生成优化提示词`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.prompt) { setPrompt(data.prompt); toast.success('提示词已优化'); }
        else toast.error(data.error || '优化失败');
      } else toast.error('提示词优化请求失败');
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error('请求超时，视频生成可能需要更长时间');
      } else {
        toast.error(err instanceof Error ? err.message : '网络错误，请重试');
      }
    }
    finally { setOptimizing(false); }
  }, [prompt, textModelOptions, getCurrentModelLabel]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setReferenceImage(dataUrl);
      setReferencePreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const credits = calcVideoCredits(duration, selectedModel);

  const handleGenerate = useCallback(async () => {
    if (!user) { toast.error('请先登录'); return; }
    if (!referenceImage && !prompt.trim()) { toast.error('请上传参考图片或输入视频描述'); return; }

    setGenerating(true);
    try {
      let requestBody: Record<string, unknown> = {
        prompt: prompt.trim() || undefined,
        negativePrompt: negativePrompt.trim() || undefined,
        model: selectedModel,
        aspectRatio,
        duration: Number(duration),
        fps: 30,
        image: referenceImage,
      };

      if (isCustomModel(selectedModel)) {
        const key = videoKeys.find(k => k.id === getCustomKeyId(selectedModel));
        if (key) {
          requestBody = { ...requestBody, model: key.modelName, customApiConfig: { apiUrl: key.apiUrl, modelName: key.modelName, apiKey: key.apiKey } };
        }
      } else if (isSystemModel(selectedModel)) {
        const api = systemVideoApis.find(a => a.id === getSystemApiId(selectedModel));
        if (api) {
          requestBody = { ...requestBody, model: api.modelName, customApiConfig: { apiUrl: api.apiUrl, modelName: api.modelName, apiKey: api.apiKey } };
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 240_000);
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorMsg = `请求失败 (${res.status})`;
        try { const errData = await res.json(); if (errData.error) errorMsg = errData.error; } catch { /* ignore */ }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data.videos && data.videos.length > 0) {
        setResults(data.videos);
        for (const url of data.videos) {
          addRecord({
            type: 'video', url, prompt: prompt.trim(),
            negativePrompt: negativePrompt.trim() || undefined,
            model: selectedModel,
            modelLabel: getCurrentModelLabel(),
            isCustomModel: isCustomModel(selectedModel) || isSystemModel(selectedModel),
            params: { aspectRatio, duration, cameraMovement },
          });
        }
        toast.success('视频生成成功');
        if (credits > 0 && user) {
          const currentCredits = typeof user.creditsBalance === 'number' ? user.creditsBalance : 0;
          addCreditRecord({
            type: 'consume',
            amount: -credits,
            balanceAfter: Math.max(0, currentCredits - credits),
            description: `图生视频 - ${getCurrentModelLabel()}`,
          });
        }
      } else {
        toast.error(data.error || '视频生成失败');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error('请求超时，视频生成可能需要更长时间');
      } else {
        toast.error(err instanceof Error ? err.message : '网络错误，请重试');
      }
    }
    finally { setGenerating(false); }
  }, [prompt, negativePrompt, selectedModel, aspectRatio, duration, cameraMovement, referenceImage, user, videoKeys, systemVideoApis, getCurrentModelLabel, addRecord]);

  const handleDownload = useCallback(async (url: string, index: number) => {
    const result = await downloadFile(url, `miaojing-img2vid-${Date.now()}-${index}.mp4`);
    if (!result.ok) toast.error(result.error || '下载失败');
  }, []);

  const handleShareToGallery = useCallback((url: string) => {
    if (isUrlPublished(url)) {
      toast.info('该作品已分享到画廊');
      return;
    }
    shareToGallery({
      type: 'video',
      url,
      prompt: prompt.trim(),
      model: selectedModel,
      modelLabel: getCurrentModelLabel(),
    });
    toast.success('已分享到画廊');
  }, [prompt, selectedModel, getCurrentModelLabel]);

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Left: Settings */}
      <div className="w-[420px] shrink-0 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)] pr-2">
        {/* Reference Image */}
        <div className="space-y-2">
          <Label>参考图片 <span className="text-destructive">*</span></Label>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          {referencePreview ? (
            <div className="relative rounded-lg border border-border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={referencePreview} alt="参考图片" className="w-full max-h-48 object-contain bg-muted/50" />
              <Button size="sm" variant="secondary" className="absolute bottom-2 right-2" onClick={() => { setReferenceImage(null); setReferencePreview(null); }}>更换图片</Button>
            </div>
          ) : (
            <button
              className="w-full h-32 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6" />
              <span className="text-sm">点击上传参考图片</span>
            </button>
          )}
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <Label>视频模型</Label>
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>视频描述 <span className="text-muted-foreground text-xs">(可选)</span></Label>
            {textModelOptions.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-primary hover:text-primary" onClick={handleOptimizePrompt} disabled={optimizing || !prompt.trim()}>
                {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                {optimizing ? '优化中...' : '优化提示词'}
              </Button>
            )}
          </div>
          <Textarea placeholder="描述你想要的视频效果..." rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>负面提示词 <span className="text-muted-foreground text-xs">(可选)</span></Label>
          <Textarea placeholder="不希望出现的元素..." rows={2} value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>画面比例</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VIDEO_ASPECT_RATIOS.map(ar => (
                  <SelectItem key={ar.value} value={ar.value}>{ar.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>视频时长</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VIDEO_DURATIONS_SHORT.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label} ({d.credits} 积分)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>镜头运动</Label>
          <Select value={cameraMovement} onValueChange={setCameraMovement}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {IMG2VIDEO_CAMERA_MOVEMENTS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={generating || !hasModels}>
          {generating ? (<><Loader2 className="h-4 w-4 animate-spin" />生成中...</>) : (<><Sparkles className="h-4 w-4" />生成视频 {credits > 0 && `(${credits} 积分)`}</>)}
        </Button>
      </div>

      {/* Right: Results + History */}
      <div className="flex-1 min-w-0 space-y-4">
        {results.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Film className="h-4 w-4" />生成结果</div>
            {results.map((url, i) => (
              <div key={i} className="rounded-lg border border-border overflow-hidden bg-muted/50">
                <video src={url} controls className="w-full" />
                <div className="p-2 flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => handleShareToGallery(url)}><Share2 className="h-3.5 w-3.5" />分享</Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => handleDownload(url, i)}><Download className="h-3.5 w-3.5" />下载</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground rounded-lg border border-dashed border-border min-h-[300px]">
            <Film className="h-14 w-14 mb-3 opacity-20" />
            <p className="text-sm">生成结果将显示在这里</p>
          </div>
        )}

        {videoHistory.length > 0 && (
          <div className="space-y-2">
            <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-4 w-4" />历史创作 ({videoHistory.length})
              {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showHistory && (
              <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
                {videoHistory.map(record => (
                  <div
                    key={record.id}
                    className="group relative rounded-md border border-border overflow-hidden bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedHistoryRecord(record)}
                  >
                    {isPlaceholder(record.url) ? (
                      <div className="w-full aspect-video flex items-center justify-center"><Film className="h-6 w-6 text-muted-foreground/30" /></div>
                    ) : (
                      <div className="w-full aspect-video relative overflow-hidden">
                        <video src={record.url} className="w-full h-full object-cover" preload="metadata" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center">
                            <Film className="h-4 w-4 text-black ml-0.5" />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="p-1.5"><p className="text-xs text-muted-foreground line-clamp-1">{record.prompt}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History Detail Dialog */}
      <CreationDetailDialog
        record={selectedHistoryRecord}
        open={!!selectedHistoryRecord}
        onClose={() => setSelectedHistoryRecord(null)}
      />
    </div>
  );
}
