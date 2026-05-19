'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
  IMG2IMG_ASPECT_RATIOS,
  RESOLUTION_OPTIONS,
  IMG2IMG_STYLE_PRESETS,
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
import {
  Sparkles,
  Loader2,
  Download,
  Wand2,
  Image as ImageIcon,
  History,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  KeyRound,
  Share2,
  CheckCircle2,
  Circle,
  BookOpen,
  Play,
  Trash2,
  PanelsTopLeft,
} from 'lucide-react';
import { useCreationHistory, isPlaceholder, shareToGallery, isUrlPublished, type CreationRecord } from '@/lib/creation-history-store';
import { addCreditRecord } from '@/lib/credit-records-store';
import { downloadFile } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import { ImageLightbox } from '@/components/lightbox';
import { CreationDetailDialog } from '@/components/creation-detail-dialog';

interface RefImage {
  id: string;
  dataUrl: string;
  name: string;
}

interface ImageTask {
  id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  results: string[];
  error?: string;
  prompt: string;
  negativePrompt?: string;
  modelLabel: string;
  timestamp: number;
}

interface ComicPanel {
  index: number;
  text: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error?: string;
}

export function ImageToImagePanel() {
  const { user } = useAuth();
  const { imageKeys, textKeys } = useCustomApiKeys();
  const { config: adminConfig } = useAdminConfig();

  const [mode, setMode] = useState<'normal' | 'comic-storyboard'>('normal');

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('original');
  const [resolution, setResolution] = useState('2K');
  const [strength, setStrength] = useState(0.5);
  const [count, setCount] = useState(1);
  const [refImages, setRefImages] = useState<RefImage[]>([]);

  const [comicStoryPrompt, setComicStoryPrompt] = useState('');
  const [comicSubjectPrompt, setComicSubjectPrompt] = useState('');
  const [comicPanels, setComicPanels] = useState<ComicPanel[]>([]);
  const [comicSubjectImage, setComicSubjectImage] = useState<string | null>(null);
  const [comicSubjectTaskId, setComicSubjectTaskId] = useState<string | null>(null);
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingComicSubject, setGeneratingComicSubject] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  const triggerGenerateCooldown = useCallback(() => {
    setGenerating(true);
    window.setTimeout(() => {
      setGenerating(false);
    }, 500);
  }, []);

  const [tasks, setTasks] = useState<ImageTask[]>([]);

  const { records, add: addRecord } = useCreationHistory();
  const [showHistory, setShowHistory] = useState(false);
  const imageHistory = records.filter(r => r.type === 'image');

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<CreationRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const systemImageApis = adminConfig.systemApis.filter(api => api.type === 'image' && api.isActive);
  const systemTextApis = adminConfig.systemApis.filter(api => api.type === 'text' && api.isActive);

  const modelOptions = useMemo(() => [
    { id: 'siliconflow-default', label: '通义图像 (默认)', group: '默认模型' },
    ...systemImageApis.map(api => ({ id: buildSystemModelId(api.id), label: `${api.name} (系统)`, group: '系统模型' })),
    ...imageKeys.map(k => ({ id: buildCustomModelId(k.id), label: `${k.modelName || k.provider} (自定义)`, group: '自定义模型' })),
  ], [systemImageApis, imageKeys]);

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

  const updateTask = useCallback((taskId: string, updates: Partial<ImageTask>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const generateTaskId = () => `img2img-task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const buildImageRequestBody = useCallback((options: {
    prompt: string;
    negativePrompt?: string;
    image?: string;
    extraImages?: string[];
    count?: number;
    strength?: number;
  }) => {
    const useCustomApiSize = isCustomModel(selectedModel) || isSystemModel(selectedModel) || isSiliconFlowDefault(selectedModel);
    const resolvedSize = aspectRatio === 'original'
      ? undefined
      : useCustomApiSize
        ? resolveCustomApiImageSize(aspectRatio)
        : resolveImageSize(aspectRatio, resolution);

    let requestBody: Record<string, unknown> = {
      prompt: options.prompt,
      negativePrompt: options.negativePrompt,
      model: selectedModel,
      aspectRatio,
      resolution,
      size: resolvedSize,
      count: options.count ?? count,
      strength: options.strength ?? strength,
      image: options.image,
      extraImages: options.extraImages,
    };

    if (isCustomModel(selectedModel)) {
      const key = imageKeys.find(k => k.id === getCustomKeyId(selectedModel));
      if (key) {
        requestBody = {
          ...requestBody,
          model: key.modelName,
          customApiConfig: {
            apiUrl: key.apiUrl,
            modelName: key.modelName,
            apiKey: key.apiKey,
            apiFormat: key.apiFormat,
          },
        };
      }
    } else if (isSystemModel(selectedModel)) {
      const api = systemImageApis.find(a => a.id === getSystemApiId(selectedModel));
      if (api) {
        requestBody = {
          ...requestBody,
          model: api.modelName,
          customApiConfig: {
            apiUrl: api.apiUrl,
            modelName: api.modelName,
            apiKey: api.apiKey,
            apiFormat: (api as unknown as Record<string, unknown>).apiFormat as string | undefined,
          },
        };
      }
    }

    return requestBody;
  }, [selectedModel, aspectRatio, resolution, count, strength, imageKeys, systemImageApis]);

  const executeGeneration = useCallback(async (
    task: ImageTask,
    requestBody: Record<string, unknown>,
    taskCredits: number,
    metadata?: { referenceImage?: string; extraParams?: Record<string, unknown> },
  ) => {
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
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch {
          // ignore
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data.images && data.images.length > 0) {
        updateTask(task.id, { status: 'completed', results: data.images });
        for (const url of data.images as string[]) {
          addRecord({
            type: 'image',
            url,
            prompt: task.prompt,
            negativePrompt: task.negativePrompt,
            model: requestBody.model as string || 'unknown',
            modelLabel: task.modelLabel,
            isCustomModel: isCustomModel(requestBody.model as string) || isSystemModel(requestBody.model as string) || isSiliconFlowDefault(requestBody.model as string),
            params: {
              aspectRatio,
              resolution,
              count: requestBody.count,
              strength: requestBody.strength,
              refImageCount: refImages.length,
              ...metadata?.extraParams,
            },
            referenceImage: metadata?.referenceImage,
          });
        }
        toast.success(`生成 ${data.images.length} 张图片`);
        if (taskCredits > 0 && user) {
          const currentCredits = typeof user.creditsBalance === 'number' ? user.creditsBalance : 0;
          addCreditRecord({
            type: 'consume',
            amount: -taskCredits,
            balanceAfter: Math.max(0, currentCredits - taskCredits),
            description: `图生图 - ${task.modelLabel}`,
          });
        }
        return data.images as string[];
      }

      throw new Error(data.error || '图片生成失败');
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
      throw err;
    }
  }, [updateTask, addRecord, user, aspectRatio, resolution, refImages.length]);

  const handleOptimizePrompt = useCallback(async () => {
    if (!prompt.trim()) { toast.error('请先输入创作描述'); return; }
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
          systemPrefix: `针对${modelLabel}图片生成优化提示词`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.prompt) {
          setPrompt(data.prompt);
          toast.success('提示词已优化');
        } else {
          toast.error(data.error || '优化失败');
        }
      } else {
        toast.error('提示词优化请求失败');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error('请求超时，请尝试减少生成数量或降低分辨率');
      } else {
        toast.error(err instanceof Error ? err.message : '网络错误，请重试');
      }
    } finally {
      setOptimizing(false);
    }
  }, [prompt, textModelOptions, getCurrentModelLabel]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setRefImages(prev => [...prev, { id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, dataUrl, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const removeRefImage = useCallback((id: string) => {
    setRefImages(prev => prev.filter(img => img.id !== id));
  }, []);

  const updateComicPanelText = useCallback((index: number, text: string) => {
    setComicPanels(prev => prev.map(panel => panel.index === index ? { ...panel, text } : panel));
  }, []);

  const addComicPanel = useCallback(() => {
    const newIndex = comicPanels.length > 0 ? Math.max(...comicPanels.map(p => p.index)) + 1 : 1;
    setComicPanels(prev => [...prev, { index: newIndex, text: '', status: 'pending' }]);
  }, [comicPanels]);

  const removeComicPanel = useCallback((index: number) => {
    setComicPanels(prev => prev.filter(panel => panel.index !== index));
  }, []);

  const clearComicStoryboard = useCallback(() => {
    setComicStoryPrompt('');
    setComicSubjectPrompt('');
    setComicSubjectImage(null);
    setComicSubjectTaskId(null);
    setComicPanels([]);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { toast.error('请输入创作描述'); return; }
    if (!user) { toast.error('请先登录'); return; }
    if (refImages.length === 0) { toast.error('请至少上传一张参考图片'); return; }
    if (generating) { toast.error('正在提交任务，请稍候'); return; }

    triggerGenerateCooldown();

    const currentCredits = calcImageCredits(selectedModel, resolution, aspectRatio, count);
    const modelLabel = getCurrentModelLabel();
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

    const primaryImage = refImages[0].dataUrl;
    const requestBody = buildImageRequestBody({
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      image: primaryImage,
      extraImages: refImages.length > 1 ? refImages.slice(1).map(img => img.dataUrl) : undefined,
      count,
      strength,
    });

    executeGeneration(newTask, requestBody, currentCredits, {
      referenceImage: primaryImage,
      extraParams: { mode: 'img2img', refImageCount: refImages.length },
    }).finally(() => {});
  }, [prompt, user, refImages, generating, triggerGenerateCooldown, selectedModel, resolution, aspectRatio, count, negativePrompt, getCurrentModelLabel, buildImageRequestBody, executeGeneration, strength]);

  const handleGenerateComicStoryboard = useCallback(async () => {
    if (!comicStoryPrompt.trim()) { toast.error('请输入漫画剧情描述'); return; }
    if (textModelOptions.length === 0) { toast.error('未配置文本模型'); return; }

    setGeneratingStoryboard(true);
    try {
      const textModel = textModelOptions[0];
      const res = await fetch('/api/generate/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: comicStoryPrompt.trim(),
          mode: 'image-to-comic',
          customApiConfig: textModel.config,
          hasReferenceImage: refImages.length > 0,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || '漫画分镜生成失败');
        return;
      }

      const data = await res.json();
      if (data.subjectPrompt) {
        setComicSubjectPrompt(data.subjectPrompt);
      }
      if (Array.isArray(data.panels) && data.panels.length > 0) {
        setComicPanels(data.panels.map((panel: { index: number; text: string }) => ({
          ...panel,
          status: 'pending' as const,
        })));
        toast.success(`已生成 ${data.panels.length} 个漫画分镜`);
      } else {
        toast.error(data.error || '未生成有效分镜');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '网络错误，请重试');
    } finally {
      setGeneratingStoryboard(false);
    }
  }, [comicStoryPrompt, refImages.length, textModelOptions]);

  const handleGenerateComicSubject = useCallback(async () => {
    if (!comicSubjectPrompt.trim()) { toast.error('请先生成或填写漫画主体描述'); return; }
    if (!user) { toast.error('请先登录'); return; }

    setGeneratingComicSubject(true);
    try {
      const modelLabel = `${getCurrentModelLabel()} - 漫画主体`;
      const taskId = generateTaskId();
      const subjectTask: ImageTask = {
        id: taskId,
        status: 'pending',
        results: [],
        prompt: comicSubjectPrompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        modelLabel,
        timestamp: Date.now(),
      };
      setTasks(prev => [subjectTask, ...prev]);
      setComicSubjectTaskId(taskId);

      const primaryReferenceImage = refImages[0]?.dataUrl;
      const requestBody = buildImageRequestBody({
        prompt: comicSubjectPrompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        image: primaryReferenceImage,
        extraImages: refImages.length > 1 ? refImages.slice(1).map(img => img.dataUrl) : undefined,
        count: 1,
        strength,
      });

      const images = await executeGeneration(subjectTask, requestBody, calcImageCredits(selectedModel, resolution, aspectRatio, 1), {
        referenceImage: primaryReferenceImage,
        extraParams: { mode: 'comic-subject', storyPrompt: comicStoryPrompt.trim(), hasReferenceImage: refImages.length > 0 },
      });
      setComicSubjectImage(images[0] || null);
      toast.success('漫画主体已生成，可继续批量生成分镜');
    } catch {
      // handled in executeGeneration
    } finally {
      setGeneratingComicSubject(false);
    }
  }, [comicSubjectPrompt, user, refImages, getCurrentModelLabel, negativePrompt, buildImageRequestBody, executeGeneration, selectedModel, resolution, aspectRatio, strength, comicStoryPrompt]);

  const generateComicPanelImage = useCallback(async (panel: ComicPanel) => {
    if (!panel.text.trim()) { toast.error('分镜描述不能为空'); return; }
    if (!user) { toast.error('请先登录'); return; }
    if (!comicSubjectImage) { toast.error('请先生成漫画主体'); return; }

    setComicPanels(prev => prev.map(item => item.index === panel.index ? { ...item, status: 'generating', error: undefined } : item));

    try {
      const panelPrompt = [
        '漫画分镜，保持与漫画主体同一角色设定、服饰、画风、线稿和上色风格。',
        comicSubjectPrompt ? `漫画主体设定：${comicSubjectPrompt}` : '',
        `当前分镜：${panel.text.trim()}`,
      ].filter(Boolean).join('\n');

      const requestBody = buildImageRequestBody({
        prompt: panelPrompt,
        negativePrompt: negativePrompt.trim() || undefined,
        image: comicSubjectImage,
        extraImages: refImages.map(img => img.dataUrl),
        count: 1,
        strength: Math.max(strength, 0.55),
      });

      const modelLabel = `${getCurrentModelLabel()} - 漫画分镜 ${panel.index}`;
      const taskId = generateTaskId();
      const panelTask: ImageTask = {
        id: taskId,
        status: 'pending',
        results: [],
        prompt: panelPrompt,
        negativePrompt: negativePrompt.trim() || undefined,
        modelLabel,
        timestamp: Date.now(),
      };
      setTasks(prev => [panelTask, ...prev]);

      const images = await executeGeneration(panelTask, requestBody, calcImageCredits(selectedModel, resolution, aspectRatio, 1), {
        referenceImage: comicSubjectImage,
        extraParams: {
          mode: 'comic-storyboard',
          panelIndex: panel.index,
          storyPrompt: comicStoryPrompt.trim(),
          sourceTaskId: comicSubjectTaskId,
        },
      });

      const imageUrl = images[0];
      setComicPanels(prev => prev.map(item => item.index === panel.index ? { ...item, status: 'completed', imageUrl, error: undefined } : item));
      toast.success(`分镜 ${panel.index} 生成成功`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '分镜生成失败';
      setComicPanels(prev => prev.map(item => item.index === panel.index ? { ...item, status: 'failed', error: errorMsg } : item));
    }
  }, [user, comicSubjectImage, comicSubjectPrompt, negativePrompt, buildImageRequestBody, refImages, strength, getCurrentModelLabel, executeGeneration, selectedModel, resolution, aspectRatio, comicStoryPrompt, comicSubjectTaskId]);

  const generateAllComicPanels = useCallback(async () => {
    const pendingPanels = comicPanels.filter(panel => panel.status === 'pending' || panel.status === 'failed');
    if (pendingPanels.length === 0) { toast.info('所有分镜已生成完毕'); return; }
    if (!comicSubjectImage) { toast.error('请先生成漫画主体'); return; }

    for (const panel of pendingPanels) {
      await generateComicPanelImage(panel);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }, [comicPanels, comicSubjectImage, generateComicPanelImage]);

  const handleDownload = useCallback(async (url: string, index: number) => {
    const result = await downloadFile(url, `miaojing-img2img-${Date.now()}-${index}.png`);
    if (!result.ok) toast.error(result.error || '下载失败');
  }, []);

  const handleShareToGallery = useCallback((url: string, customPrompt?: string) => {
    if (isUrlPublished(url)) {
      toast.info('该作品已分享到画廊');
      return;
    }
    shareToGallery({
      type: 'image',
      url,
      prompt: customPrompt || prompt.trim() || comicStoryPrompt.trim(),
      model: selectedModel,
      modelLabel: getCurrentModelLabel(),
      referenceImage: refImages[0]?.dataUrl,
      params: {
        mode,
        aspectRatio,
        resolution,
      },
    });
    toast.success('已分享到画廊');
  }, [prompt, comicStoryPrompt, selectedModel, getCurrentModelLabel, refImages, mode, aspectRatio, resolution]);

  const credits = calcImageCredits(selectedModel, resolution, aspectRatio, count);
  const storyboardPendingCount = comicPanels.filter(panel => panel.status === 'pending' || panel.status === 'failed').length;
  const storyboardCompletedCount = comicPanels.filter(panel => panel.status === 'completed').length;

  return (
    <div className="flex gap-6 min-h-[600px]">
      <Tabs value={mode} onValueChange={(value) => setMode(value as 'normal' | 'comic-storyboard')} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="normal" className="gap-1.5">
            <ImageIcon className="h-4 w-4" />普通图生图
          </TabsTrigger>
          <TabsTrigger value="comic-storyboard" className="gap-1.5">
            <PanelsTopLeft className="h-4 w-4" />漫画分镜
          </TabsTrigger>
        </TabsList>

        <TabsContent value="normal" className="mt-0">
          <div className="flex gap-6 min-h-[600px]">
            <div className="w-[420px] shrink-0 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)] pr-2">
              <div className="space-y-2">
                <Label>参考图片 <span className="text-destructive">*</span> <span className="text-muted-foreground text-xs">至少1张，可上传多张</span></Label>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                <div className="flex flex-wrap gap-2">
                  {refImages.map(img => (
                    <div key={img.id} className="relative group w-20 h-20 rounded-md border border-border overflow-hidden bg-muted/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                      <button
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeRefImage(img.id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="w-20 h-20 rounded-md border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus className="h-5 w-5" />
                    <span className="text-[10px]">添加图片</span>
                  </button>
                </div>
              </div>

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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>创作描述</Label>
                </div>
                <div className="relative">
                  <Textarea
                    placeholder="描述你想要的图片变化..."
                    rows={3}
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
                  {IMG2IMG_STYLE_PRESETS.map(s => (
                    <Badge key={s} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => setPrompt(prev => prev ? `${prev}, ${s}` : s)}>
                      {s}
                    </Badge>
                  ))}
                </div>
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
                      {IMG2IMG_ASPECT_RATIOS.map(ar => (
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>重绘幅度</Label>
                  <span className="text-xs text-muted-foreground">{strength.toFixed(2)}</span>
                </div>
                <Slider value={[strength]} onValueChange={([v]) => setStrength(v)} min={0} max={1} step={0.05} />
                <p className="text-xs text-muted-foreground">低=保留原图特征，高=更贴近提示词</p>
              </div>

              <div className="space-y-2">
                <Label>生成数量</Label>
                <Select value={String(count)} onValueChange={v => setCount(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 张</SelectItem>
                    <SelectItem value="2">2 张</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={!hasModels || generating}>
                {generating ? (<><Loader2 className="h-4 w-4 animate-spin" />提交中...</>) : (<><Sparkles className="h-4 w-4" />生成图片 {credits > 0 && `(${credits} 积分)`}</>)}
              </Button>
            </div>

            <div className="flex-1 min-w-0 space-y-4">
              {tasks.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ImageIcon className="h-4 w-4" />生成任务 ({tasks.length})
                  </div>
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <div key={task.id} className="rounded-lg border border-border overflow-hidden bg-card">
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
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeTask(task.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="p-3">
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
                          {task.status === 'failed' && (
                            <div className="aspect-square bg-destructive/10 rounded-md flex items-center justify-center">
                              <div className="text-center space-y-2">
                                <X className="h-8 w-8 mx-auto text-destructive" />
                                <p className="text-xs text-destructive">{task.error || '生成失败'}</p>
                              </div>
                            </div>
                          )}
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
                                    <Button size="sm" variant="secondary" className="gap-1 h-7" onClick={() => handleShareToGallery(url, task.prompt)}><Share2 className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="secondary" className="gap-1 h-7" onClick={() => handleDownload(url, i)}><Download className="h-3 w-3" /></Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
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

              {imageHistory.length > 0 && (
                <div className="space-y-2">
                  <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowHistory(!showHistory)}>
                    <History className="h-4 w-4" />历史创作 ({imageHistory.length})
                    {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {showHistory && (
                    <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                      {imageHistory.map(record => (
                        <div key={record.id} className="group relative rounded-md border border-border overflow-hidden bg-muted/50 cursor-pointer" onClick={() => setSelectedHistoryRecord(record)}>
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

        <TabsContent value="comic-storyboard" className="mt-0">
          <div className="flex gap-6 min-h-[600px]">
            <div className="w-[420px] shrink-0 space-y-5 overflow-y-auto max-h-[calc(100vh-200px)] pr-2">
              <div className="space-y-2">
                <Label>参考图片</Label>
                <p className="text-xs text-muted-foreground">先上传角色或主体参考图，AI会先生成漫画主体，再生成多个连续分镜。</p>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                <div className="flex flex-wrap gap-2">
                  {refImages.map(img => (
                    <div key={img.id} className="relative group w-20 h-20 rounded-md border border-border overflow-hidden bg-muted/50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                      <button className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeRefImage(img.id)}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button className="w-20 h-20 rounded-md border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors" onClick={() => fileInputRef.current?.click()}>
                    <Plus className="h-5 w-5" />
                    <span className="text-[10px]">添加图片</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>漫画剧情描述</Label>
                <Textarea
                  placeholder="输入一段剧情，例如：少女带着发光的猫在雨夜穿过旧城，最后在钟楼顶端看到黎明。"
                  rows={4}
                  value={comicStoryPrompt}
                  onChange={e => setComicStoryPrompt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">会自动拆成漫画主体设定 + 多个连续分镜描述。</p>
              </div>

              <Button className="w-full gap-2" size="lg" onClick={handleGenerateComicStoryboard} disabled={generatingStoryboard || !comicStoryPrompt.trim() || textModelOptions.length === 0}>
                {generatingStoryboard ? (<><Loader2 className="h-4 w-4 animate-spin" />生成中...</>) : (<><BookOpen className="h-4 w-4" />生成漫画主体与分镜脚本</>)}
              </Button>

              {textModelOptions.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-3 text-center">
                  <p className="text-xs text-muted-foreground">需要配置文本模型才能使用漫画分镜</p>
                  <Link href="/profile" className="text-xs text-primary hover:underline">前往个人中心配置</Link>
                </div>
              )}

              {(comicSubjectPrompt || comicPanels.length > 0) && (
                <>
                  <div className="space-y-2 pt-4 border-t border-border">
                    <Label>漫画主体描述</Label>
                    <Textarea
                      placeholder="主体会用于保持角色与画风一致性..."
                      rows={4}
                      value={comicSubjectPrompt}
                      onChange={e => setComicSubjectPrompt(e.target.value)}
                    />
                    <Button className="w-full gap-2" variant="outline" onClick={handleGenerateComicSubject} disabled={generatingComicSubject || !comicSubjectPrompt.trim() || !hasModels}>
                      {generatingComicSubject ? (<><Loader2 className="h-4 w-4 animate-spin" />生成主体中...</>) : (<><Sparkles className="h-4 w-4" />生成漫画主体</>)}
                    </Button>
                  </div>

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
                        <Link href="/profile" className="text-sm text-primary hover:underline">前往添加API密钥</Link>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 pt-4 border-t border-border">
                    <Label>图片设置</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">画面比例</Label>
                        <Select value={aspectRatio} onValueChange={setAspectRatio}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {IMG2IMG_ASPECT_RATIOS.map(ar => (
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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">重绘幅度</Label>
                        <span className="text-xs text-muted-foreground">{strength.toFixed(2)}</span>
                      </div>
                      <Slider value={[strength]} onValueChange={([v]) => setStrength(v)} min={0} max={1} step={0.05} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">负面提示词</Label>
                      <Textarea placeholder="例如：崩坏手部、额外肢体、风格不统一..." rows={2} value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              {comicPanels.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Label>分镜列表 ({comicPanels.length})</Label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 gap-1" onClick={addComicPanel}>
                        <Plus className="h-3 w-3" />添加
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-destructive hover:text-destructive" onClick={clearComicStoryboard}>
                        <Trash2 className="h-3 w-3" />清空
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[420px] overflow-y-auto">
                    {comicPanels.map(panel => (
                      <div key={panel.index} className="rounded-lg border border-border p-3 space-y-2 bg-card">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">分镜 {panel.index}</span>
                          <div className="flex items-center gap-1">
                            {panel.status === 'pending' && <Badge variant="outline" className="h-5 text-[10px]">待生成</Badge>}
                            {panel.status === 'generating' && <Badge variant="default" className="h-5 text-[10px]"><Loader2 className="h-3 w-3 animate-spin mr-1" />生成中</Badge>}
                            {panel.status === 'completed' && <Badge variant="secondary" className="h-5 text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"><CheckCircle2 className="h-3 w-3 mr-1" />完成</Badge>}
                            {panel.status === 'failed' && <Badge variant="destructive" className="h-5 text-[10px]"><X className="h-3 w-3 mr-1" />失败</Badge>}
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeComicPanel(panel.index)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <Textarea placeholder="编辑分镜描述..." rows={3} value={panel.text} onChange={e => updateComicPanelText(panel.index, e.target.value)} className="text-sm" />
                        {panel.error && <p className="text-xs text-destructive">{panel.error}</p>}
                        <Button size="sm" variant="outline" className="w-full gap-1 h-8" onClick={() => generateComicPanelImage(panel)} disabled={panel.status === 'generating' || !panel.text.trim() || !comicSubjectImage || !hasModels}>
                          {panel.status === 'generating' ? (<><Loader2 className="h-3 w-3 animate-spin" />生成中...</>) : (<><Sparkles className="h-3 w-3" />生成分镜图</>)}
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button className="w-full gap-2" onClick={generateAllComicPanels} disabled={storyboardPendingCount === 0 || !comicSubjectImage || !hasModels}>
                    <Play className="h-4 w-4" />
                    生成全部 ({storyboardPendingCount} 个待生成)
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-4">
              {!comicSubjectImage && comicPanels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground rounded-lg border border-dashed border-border min-h-[400px]">
                  <PanelsTopLeft className="h-14 w-14 mb-3 opacity-20" />
                  <p className="text-sm">输入剧情后即可生成漫画分镜脚本</p>
                  <p className="text-xs mt-1 opacity-60">流程：剧情 → 漫画主体 → 多个连续分镜，参考图可选</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2 text-sm font-medium">
                      <BookOpen className="h-4 w-4" />漫画主体
                    </div>
                    <div className="p-4">
                      {comicSubjectImage ? (
                        <div className="grid gap-4 md:grid-cols-[220px_1fr] items-start">
                          <div className="relative rounded-md overflow-hidden border border-border bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={comicSubjectImage} alt="漫画主体" className="w-full aspect-square object-cover cursor-zoom-in" onClick={() => setLightboxSrc(comicSubjectImage)} />
                          </div>
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comicSubjectPrompt || '已生成漫画主体'}</p>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => setLightboxSrc(comicSubjectImage)}><ImageIcon className="h-4 w-4" />预览</Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => handleDownload(comicSubjectImage, 0)}><Download className="h-4 w-4" />下载</Button>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => handleShareToGallery(comicSubjectImage, comicSubjectPrompt)}><Share2 className="h-4 w-4" />分享</Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <ImageIcon className="h-10 w-10 opacity-20 mb-3" />
                          <p className="text-sm">请先生成漫画主体</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {comicPanels.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <PanelsTopLeft className="h-4 w-4" />漫画分镜预览 ({comicPanels.length})
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {comicPanels.map(panel => (
                          <div key={panel.index} className="rounded-lg border border-border overflow-hidden bg-card">
                            <div className="aspect-square bg-muted relative">
                              {panel.imageUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={panel.imageUrl} alt={`分镜 ${panel.index}`} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setLightboxSrc(panel.imageUrl!)} />
                              ) : panel.status === 'generating' ? (
                                <div className="w-full h-full flex items-center justify-center"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center">
                                  <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                                  <span className="text-xs text-muted-foreground mt-1">待生成</span>
                                </div>
                              )}
                              <span className="absolute top-2 left-2 px-2 py-0.5 text-xs bg-background/80 backdrop-blur-sm rounded-full">{panel.index}</span>
                              <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                                {panel.imageUrl && (
                                  <>
                                    <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={() => setLightboxSrc(panel.imageUrl!)}><ImageIcon className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={() => handleDownload(panel.imageUrl!, panel.index)}><Download className="h-3 w-3" /></Button>
                                    <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={() => handleShareToGallery(panel.imageUrl!, panel.text)}><Share2 className="h-3 w-3" /></Button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="p-2 space-y-2">
                              <p className="text-xs text-muted-foreground line-clamp-4">{panel.text}</p>
                              {panel.error && <p className="text-xs text-destructive">{panel.error}</p>}
                            </div>
                          </div>
                        ))}
                      </div>

                      {storyboardCompletedCount > 0 && (
                        <div className="space-y-2 pt-4 border-t border-border">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">已完成 {storyboardCompletedCount}/{comicPanels.length} 个分镜</span>
                            <span className="text-xs text-muted-foreground">{Math.round((storyboardCompletedCount / comicPanels.length) * 100)}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(storyboardCompletedCount / comicPanels.length) * 100}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <ImageLightbox src={lightboxSrc || ''} open={!!lightboxSrc} onClose={() => setLightboxSrc(null)} />

      <CreationDetailDialog
        record={selectedHistoryRecord}
        open={!!selectedHistoryRecord}
        onClose={() => setSelectedHistoryRecord(null)}
      />
    </div>
  );
}
