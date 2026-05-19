'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Sparkles, Loader2, Download, Wand2, Image as ImageIcon, History, ChevronDown, ChevronUp, KeyRound, Share2, X, CheckCircle2, Circle, BookOpen, Pencil, Play, Plus, Trash2, GripVertical } from 'lucide-react';
import { useCreationHistory, isPlaceholder, shareToGallery, isUrlPublished, type CreationRecord } from '@/lib/creation-history-store';
import { addCreditRecord } from '@/lib/credit-records-store';
import { downloadFile } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import { ImageLightbox } from '@/components/lightbox';
import { CreationDetailDialog } from '@/components/creation-detail-dialog';

// Task types
interface ImageTask {
  id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  results: string[];
  error?: string;
  prompt: string;
  negativePrompt?: string;
  modelLabel: string;
  timestamp: number;
  panelIndex?: number; // For storyboard panels
}

// Storyboard types
interface StoryboardPanel {
  index: number;
  text: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error?: string;
}

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

  // Storyboard state
  const [storyMode, setStoryMode] = useState<'normal' | 'storyboard'>('normal');
  const [storyPrompt, setStoryPrompt] = useState(''); // One-line story input
  const [storyPanels, setStoryPanels] = useState<StoryboardPanel[]>([]);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  const triggerGenerateCooldown = useCallback(() => {
    setGenerating(true);
    window.setTimeout(() => {
      setGenerating(false);
    }, 500);
  }, []);

  // Tasks queue state
  const [tasks, setTasks] = useState<ImageTask[]>([]);

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

  // Helper to update task status
  const updateTask = useCallback((taskId: string, updates: Partial<ImageTask>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  }, []);

  // Remove task
  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  // Helper to generate a unique task ID
  const generateTaskId = () => `img-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Execute image generation request
  const executeGeneration = useCallback(async (task: ImageTask, requestBody: Record<string, unknown>, credits: number) => {
    updateTask(task.id, { status: 'generating' });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    try {
      const res = await fetch('/api/generate/image', {
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
      if (data.images && data.images.length > 0) {
        updateTask(task.id, { status: 'completed', results: data.images });
        // Save to history
        for (const url of data.images) {
          addRecord({
            type: 'image', url, prompt: task.prompt,
            negativePrompt: task.negativePrompt,
            model: requestBody.model as string || 'unknown',
            modelLabel: task.modelLabel,
            isCustomModel: isCustomModel(requestBody.model as string) || isSystemModel(requestBody.model as string) || isSiliconFlowDefault(requestBody.model as string),
            params: { aspectRatio: task.negativePrompt, resolution, count, guidanceScale },
          });
        }
        // Record credits
        if (credits > 0 && user) {
          const currentCredits = typeof user.creditsBalance === 'number' ? user.creditsBalance : 0;
          addCreditRecord({
            type: 'consume',
            amount: -credits,
            balanceAfter: Math.max(0, currentCredits - credits),
            description: `文生图 - ${task.modelLabel}`,
          });
        }
        toast.success(`生成成功: ${task.prompt.slice(0, 30)}...`);
      } else {
        throw new Error(data.error || '图片生成失败');
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      let errorMsg = '生成失败';
      if (err instanceof DOMException && err.name === 'AbortError') {
        errorMsg = '请求超时，请尝试减少生成数量或降低分辨率';
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      updateTask(task.id, { status: 'failed', error: errorMsg });
      toast.error(errorMsg);
    }
  }, [updateTask, addRecord, user, resolution, count, guidanceScale]);

  // Generate
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { toast.error('请输入创作描述'); return; }
    if (!user) { toast.error('请先登录'); return; }
    if (generating) { toast.error('正在提交任务，请稍候'); return; }

    triggerGenerateCooldown();

    const currentCredits = calcImageCredits(selectedModel, resolution, aspectRatio, count);
    const modelLabel = getCurrentModelLabel();

    // Create task immediately
    const taskId = generateTaskId();
    const newTask: ImageTask = {
      id: taskId,
      status: 'pending',
      results: [],
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      modelLabel,
      timestamp: Date.now(),
    };

    setTasks(prev => [newTask, ...prev]);
    
    // Build request body
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
        requestBody = { ...requestBody, model: api.modelName, customApiConfig: { apiUrl: api.apiUrl, modelName: api.modelName, apiKey: api.apiKey, apiFormat: (api as unknown as Record<string, unknown>).apiFormat as string | undefined } };
      }
    }

    // Execute generation asynchronously - don't block UI
    executeGeneration(newTask, requestBody, currentCredits).finally(() => {});
  }, [prompt, negativePrompt, selectedModel, aspectRatio, resolution, count, guidanceScale, user, imageKeys, systemImageApis, getCurrentModelLabel, executeGeneration]);

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

  // ========== Storyboard Functions ==========

  // Generate storyboard from story prompt
  const handleGenerateStoryboard = useCallback(async () => {
    if (!storyPrompt.trim()) { toast.error('请输入故事描述'); return; }
    if (textModelOptions.length === 0) { toast.error('未配置文本模型，请先在API设置中添加文本类型模型'); return; }

    setGeneratingStoryboard(true);
    try {
      const textModel = textModelOptions[0];
      const res = await fetch('/api/generate/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: storyPrompt.trim(),
          customApiConfig: textModel.config,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.panels && data.panels.length > 0) {
          setStoryPanels(data.panels.map((p: { index: number; text: string }) => ({
            ...p,
            status: 'pending' as const,
          })));
          toast.success(`生成了 ${data.panels.length} 个分镜`);
        } else if (data.error) {
          toast.error(data.error);
        } else {
          toast.error('分镜生成失败，未返回有效内容');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || '分镜生成请求失败');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络错误，请重试');
    } finally {
      setGeneratingStoryboard(false);
    }
  }, [storyPrompt, textModelOptions]);

  // Update a panel's text
  const updatePanelText = useCallback((index: number, text: string) => {
    setStoryPanels(prev => prev.map(p => p.index === index ? { ...p, text } : p));
  }, []);

  // Add a new panel
  const addPanel = useCallback(() => {
    const newIndex = storyPanels.length > 0 ? Math.max(...storyPanels.map(p => p.index)) + 1 : 1;
    setStoryPanels(prev => [...prev, { index: newIndex, text: '', status: 'pending' }]);
  }, [storyPanels]);

  // Remove a panel
  const removePanel = useCallback((index: number) => {
    setStoryPanels(prev => prev.filter(p => p.index !== index));
  }, []);

  // Generate image for a single panel
  const generatePanelImage = useCallback(async (panel: StoryboardPanel) => {
    if (!panel.text.trim()) { toast.error('分镜描述不能为空'); return; }
    if (!user) { toast.error('请先登录'); return; }

    // Update panel status to generating
    setStoryPanels(prev => prev.map(p =>
      p.index === panel.index ? { ...p, status: 'generating', error: undefined } : p
    ));

    const modelLabel = getCurrentModelLabel();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    try {
      const useCustomApiSize = isCustomModel(selectedModel) || isSystemModel(selectedModel) || isSiliconFlowDefault(selectedModel);
      const resolvedSize = useCustomApiSize
        ? resolveCustomApiImageSize(aspectRatio)
        : resolveImageSize(aspectRatio, resolution);

      let requestBody: Record<string, unknown> = {
        prompt: panel.text.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        model: selectedModel,
        aspectRatio,
        resolution,
        size: resolvedSize,
        count: 1,
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
          requestBody = { ...requestBody, model: api.modelName, customApiConfig: { apiUrl: api.apiUrl, modelName: api.modelName, apiKey: api.apiKey, apiFormat: (api as unknown as Record<string, unknown>).apiFormat as string | undefined } };
        }
      }

      const res = await fetch('/api/generate/image', {
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
      if (data.images && data.images.length > 0) {
        const imageUrl = data.images[0];
        setStoryPanels(prev => prev.map(p =>
          p.index === panel.index ? { ...p, status: 'completed', imageUrl } : p
        ));
        // Save to history
        addRecord({
          type: 'image', url: imageUrl, prompt: panel.text,
          negativePrompt: negativePrompt.trim() || undefined,
          model: requestBody.model as string || 'unknown',
          modelLabel: `${modelLabel} - 分镜 ${panel.index}`,
          isCustomModel: isCustomModel(requestBody.model as string) || isSystemModel(requestBody.model as string) || isSiliconFlowDefault(requestBody.model as string),
          params: { aspectRatio, resolution, isStoryboard: true },
        });
        toast.success(`分镜 ${panel.index} 生成成功`);
      } else {
        throw new Error(data.error || '图片生成失败');
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      let errorMsg = '生成失败';
      if (err instanceof DOMException && err.name === 'AbortError') {
        errorMsg = '请求超时，请重试';
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      setStoryPanels(prev => prev.map(p =>
        p.index === panel.index ? { ...p, status: 'failed', error: errorMsg } : p
      ));
      toast.error(errorMsg);
    }
  }, [user, selectedModel, aspectRatio, resolution, guidanceScale, negativePrompt, imageKeys, systemImageApis, getCurrentModelLabel, addRecord]);

  // Generate all pending panel images
  const generateAllPanels = useCallback(async () => {
    const pendingPanels = storyPanels.filter(p => p.status === 'pending' || p.status === 'failed');
    if (pendingPanels.length === 0) { toast.info('所有分镜已生成完毕'); return; }
    if (!user) { toast.error('请先登录'); return; }

    for (const panel of pendingPanels) {
      await generatePanelImage(panel);
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }, [storyPanels, user, generatePanelImage]);

  // Clear all storyboard
  const clearStoryboard = useCallback(() => {
    setStoryPanels([]);
    setStoryPrompt('');
  }, []);

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
      {/* Mode Tabs */}
      <Tabs value={storyMode} onValueChange={(v) => setStoryMode(v as 'normal' | 'storyboard')} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="normal" className="gap-1.5">
            <ImageIcon className="h-4 w-4" />
            文生图
          </TabsTrigger>
          <TabsTrigger value="storyboard" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            漫画分镜
          </TabsTrigger>
        </TabsList>

        {/* Normal Text-to-Image Mode */}
        <TabsContent value="normal" className="mt-0">
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
                <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={!hasModels || generating}>
                  {generating ? (<><Loader2 className="h-4 w-4 animate-spin" />提交中...</>) : (<><Sparkles className="h-4 w-4" />生成图片 {credits > 0 && `(${credits} 积分)`}</>)}
                </Button>
            </div>

            {/* Right: Results + History (flex-1, takes remaining space) */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Tasks area */}
              {tasks.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ImageIcon className="h-4 w-4" />生成任务 ({tasks.length})
                  </div>
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <div key={task.id} className="rounded-lg border border-border overflow-hidden bg-card">
                        {/* Task header */}
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                          <div className="flex items-center gap-2">
                            {task.status === 'completed' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : task.status === 'failed' ? (
                              <X className="h-4 w-4 text-destructive" />
                            ) : task.status === 'generating' ? (
                              <Loader2 className="h-4 w-4 text-primary animate-spin" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="text-xs font-medium">
                              {task.status === 'completed' ? '已完成' : task.status === 'failed' ? '失败' : task.status === 'generating' ? '生成中' : '等待中'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{task.modelLabel}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => removeTask(task.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {/* Task content */}
                        <div className="p-3">
                          {/* Generating/pending/failed state */}
                          {(task.status === 'generating' || task.status === 'pending') && (
                            <div className="aspect-square bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 animate-pulse rounded-md flex items-center justify-center">
                              <div className="text-center space-y-2">
                                <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
                                <p className="text-xs text-muted-foreground">
                                  {task.status === 'generating' ? '图片生成中...' : '等待生成...'}
                                </p>
                              </div>
                            </div>
                          )}
                          {/* Failed state */}
                          {task.status === 'failed' && (
                            <div className="aspect-square bg-destructive/10 rounded-md flex items-center justify-center">
                              <div className="text-center space-y-2">
                                <X className="h-8 w-8 mx-auto text-destructive" />
                                <p className="text-xs text-destructive">{task.error || '生成失败'}</p>
                              </div>
                            </div>
                          )}
                          {/* Results */}
                          {task.status === 'completed' && task.results.length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                              {task.results.map((url, i) => (
                                <div key={i} className="group relative rounded-md border border-border overflow-hidden bg-muted/50">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`生成结果 ${i + 1}`}
                                    className="w-full aspect-square object-cover cursor-zoom-in"
                                    onDoubleClick={() => setLightboxSrc(url)}
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                    <Button size="sm" variant="secondary" className="gap-1 h-7" onClick={() => setLightboxSrc(url)}><ImageIcon className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="secondary" className="gap-1 h-7" onClick={() => handleShareToGallery(url)}><Share2 className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="secondary" className="gap-1 h-7" onClick={() => handleDownload(url, i)}><Download className="h-3 w-3" /></Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Prompt */}
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground line-clamp-2">{task.prompt}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground rounded-lg border border-dashed border-border min-h-[300px]">
                  <ImageIcon className="h-14 w-14 mb-3 opacity-20" />
                  <p className="text-sm">点击左侧「生成图片」开始创作</p>
                  <p className="text-xs mt-1 opacity-60">可以同时创建多个任务</p>
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
          </div>
        </TabsContent>

        {/* Storyboard Mode */}
        <TabsContent value="storyboard" className="mt-0">
          <div className="flex gap-6 min-h-[600px]">
            {/* Left: Storyboard Settings */}
            <div className="w-[420px] shrink-0 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)] pr-2">
              {/* Story Input */}
              <div className="space-y-2">
                <Label>故事描述</Label>
                <Textarea
                  placeholder="输入一句话故事描述，例如：一只勇敢的小猫在暴风雨夜发现了神秘洞穴..."
                  rows={3}
                  value={storyPrompt}
                  onChange={e => setStoryPrompt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">输入一句话，AI会自动扩展成多个漫画分镜</p>
              </div>

              {/* Generate Storyboard Button */}
              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleGenerateStoryboard}
                disabled={generatingStoryboard || !storyPrompt.trim() || textModelOptions.length === 0}
              >
                {generatingStoryboard ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />生成分镜中...</>
                ) : (
                  <><BookOpen className="h-4 w-4" />生成漫画分镜</>
                )}
              </Button>

              {textModelOptions.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-3 text-center">
                  <p className="text-xs text-muted-foreground">
                    需要配置文本模型才能使用分镜功能
                  </p>
                  <Link href="/profile" className="text-xs text-primary hover:underline">
                    前往个人中心配置
                  </Link>
                </div>
              )}

              {/* Storyboard Panels */}
              {storyPanels.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>分镜列表 ({storyPanels.length})</Label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 gap-1" onClick={addPanel}>
                        <Plus className="h-3 w-3" />添加
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={clearStoryboard}>
                        <Trash2 className="h-3 w-3" />清空
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {storyPanels.map(panel => (
                      <div key={panel.index} className="rounded-lg border border-border p-3 space-y-2 bg-card">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">分镜 {panel.index}</span>
                          <div className="flex items-center gap-1">
                            {panel.status === 'pending' && (
                              <Badge variant="outline" className="h-5 text-[10px]">待生成</Badge>
                            )}
                            {panel.status === 'generating' && (
                              <Badge variant="default" className="h-5 text-[10px]">
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />生成中
                              </Badge>
                            )}
                            {panel.status === 'completed' && (
                              <Badge variant="secondary" className="h-5 text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                                <CheckCircle2 className="h-3 w-3 mr-1" />完成
                              </Badge>
                            )}
                            {panel.status === 'failed' && (
                              <Badge variant="destructive" className="h-5 text-[10px]">
                                <X className="h-3 w-3 mr-1" />失败
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removePanel(panel.index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          placeholder="编辑分镜描述..."
                          rows={3}
                          value={panel.text}
                          onChange={e => updatePanelText(panel.index, e.target.value)}
                          className="text-sm"
                        />
                        {panel.error && (
                          <p className="text-xs text-destructive">{panel.error}</p>
                        )}
                        {/* Panel Image Preview */}
                        {panel.imageUrl && (
                          <div className="relative rounded-md overflow-hidden bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={panel.imageUrl}
                              alt={`分镜 ${panel.index}`}
                              className="w-full h-auto object-contain cursor-zoom-in"
                              onClick={() => setLightboxSrc(panel.imageUrl!)}
                            />
                          </div>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full gap-1 h-8"
                          onClick={() => generatePanelImage(panel)}
                          disabled={panel.status === 'generating' || !panel.text.trim() || !hasModels}
                        >
                          {panel.status === 'generating' ? (
                            <><Loader2 className="h-3 w-3 animate-spin" />生成中...</>
                          ) : (
                            <><Sparkles className="h-3 w-3" />生成分镜图</>
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Generate All Button */}
                  <Button
                    className="w-full gap-2"
                    onClick={generateAllPanels}
                    disabled={storyPanels.every(p => p.status === 'completed') || !hasModels}
                  >
                    <Play className="h-4 w-4" />
                    生成全部 ({storyPanels.filter(p => p.status === 'pending' || p.status === 'failed').length}个待生成)
                  </Button>
                </div>
              )}

              {/* Image Model Selection for Storyboard */}
              {storyPanels.length > 0 && (
                <div className="space-y-2 pt-4 border-t border-border">
                  <Label>图片生成模型</Label>
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
                        前往添加API密钥
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Image Settings for Storyboard */}
              {storyPanels.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <Label>图片设置</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">画面比例</Label>
                      <Select value={aspectRatio} onValueChange={setAspectRatio}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ASPECT_RATIOS.map(ar => (
                            <SelectItem key={ar.value} value={ar.value}>{ar.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">分辨率</Label>
                      <Select value={resolution} onValueChange={setResolution}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RESOLUTION_OPTIONS.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Storyboard Preview */}
            <div className="flex-1 min-w-0 space-y-4">
              {storyPanels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground rounded-lg border border-dashed border-border min-h-[400px]">
                  <BookOpen className="h-14 w-14 mb-3 opacity-20" />
                  <p className="text-sm">输入故事描述并点击「生成漫画分镜」</p>
                  <p className="text-xs mt-1 opacity-60">AI会自动扩展成多个分镜描述</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <BookOpen className="h-4 w-4" />
                    分镜预览 ({storyPanels.length})
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {storyPanels.map(panel => (
                      <div key={panel.index} className="rounded-lg border border-border overflow-hidden bg-card">
                        {/* Image area */}
                        <div className="aspect-square bg-muted relative">
                          {panel.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={panel.imageUrl}
                              alt={`分镜 ${panel.index}`}
                              className="w-full h-full object-cover cursor-zoom-in"
                              onClick={() => setLightboxSrc(panel.imageUrl!)}
                            />
                          ) : panel.status === 'generating' ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                              <span className="text-xs text-muted-foreground mt-1">待生成</span>
                            </div>
                          )}
                          {/* Panel number badge */}
                          <span className="absolute top-2 left-2 px-2 py-0.5 text-xs bg-background/80 backdrop-blur-sm rounded-full">
                            {panel.index}
                          </span>
                          {/* Action buttons */}
                          <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                            {panel.imageUrl && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 gap-1"
                                  onClick={() => setLightboxSrc(panel.imageUrl!)}
                                >
                                  <ImageIcon className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 gap-1"
                                  onClick={() => handleDownload(panel.imageUrl, panel.index)}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-8 gap-1"
                                  onClick={() => handleShareToGallery(panel.imageUrl!)}
                                >
                                  <Share2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Text area */}
                        <div className="p-2">
                          <p className="text-xs text-muted-foreground line-clamp-3">{panel.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated History in Storyboard Mode */}
              {storyPanels.filter(p => p.status === 'completed').length > 0 && (
                <div className="space-y-2 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      已完成 {storyPanels.filter(p => p.status === 'completed').length}/{storyPanels.length} 个分镜
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(storyPanels.filter(p => p.status === 'completed').length / storyPanels.length * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(storyPanels.filter(p => p.status === 'completed').length / storyPanels.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
