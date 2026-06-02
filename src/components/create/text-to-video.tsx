'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-store';
import { useCustomApiKeys } from '@/lib/custom-api-store';
import { useAdminConfig } from '@/lib/admin-store';
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VIDEO_STYLES,
  CAMERA_MOVEMENTS,
  isCustomModel,
  isSystemModel,
  isSiliconFlowDefault,
  getCustomKeyId,
  getSystemApiId,
  buildCustomModelId,
  buildSystemModelId,
  calcVideoCredits,
} from '@/lib/model-config';
import { Sparkles, Loader2, Download, Wand2, Video, Film, History, ChevronDown, ChevronUp, KeyRound, Share2, X, CheckCircle2, Circle } from 'lucide-react';
import { useCreationHistory, isPlaceholder, shareToGallery, isUrlPublished, type CreationRecord } from '@/lib/creation-history-store';
import { addCreditRecord } from '@/lib/credit-records-store';
import { downloadFile } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';
import { CreationDetailDialog } from '@/components/creation-detail-dialog';

// Task types
interface VideoTask {
  id: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  results: string[];
  error?: string;
  prompt: string;
  negativePrompt?: string;
  modelLabel: string;
  timestamp: number;
}

export function TextToVideoPanel() {
  const { user } = useAuth();
  const { videoKeys, textKeys } = useCustomApiKeys();
  const { config: adminConfig } = useAdminConfig();

  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('6');
  const [cameraMovement, setCameraMovement] = useState(CAMERA_MOVEMENTS[0]);
  const [style, setStyle] = useState(VIDEO_STYLES[0]);

  const [generating, setGenerating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);

  // Tasks queue state
  const [tasks, setTasks] = useState<VideoTask[]>([]);

  const { records, add: addRecord } = useCreationHistory();
  const [showHistory, setShowHistory] = useState(false);

  // History detail dialog
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<CreationRecord | null>(null);
  const videoHistory = records.filter(r => r.type === 'video');

  // Helper to update task status
  const updateTask = useCallback((taskId: string, updates: Partial<VideoTask>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
  }, []);

  // Remove task
  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  // Helper to generate a unique task ID
  const generateTaskId = () => `video-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const persistWorks = useCallback(async (urls: string[], task: VideoTask, requestBody: Record<string, unknown>, creditsCost: number) => {
    if (!user || urls.length === 0) return;
    try {
      await fetch('/api/works', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          type: 'video',
          prompt: task.prompt,
          negativePrompt: task.negativePrompt,
          resultUrls: urls,
          duration: Number(requestBody.duration) || undefined,
          params: { aspectRatio, duration: requestBody.duration, cameraMovement, style },
          model: requestBody.model,
          modelLabel: task.modelLabel,
          creditsCost,
        }),
      });
    } catch { /* 非阻塞 */ }
  }, [user, aspectRatio, cameraMovement, style]);

  // Execute video generation request
  const executeGeneration = useCallback(async (task: VideoTask, requestBody: Record<string, unknown>, credits: number) => {
    updateTask(task.id, { status: 'generating' });
    
    try {
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        let errorMsg = `请求失败 (${res.status})`;
        try { const errData = await res.json(); if (errData.error) errorMsg = errData.error; } catch { /* ignore */ }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data.videos && data.videos.length > 0) {
        updateTask(task.id, { status: 'completed', results: data.videos });
        // Save to history
        for (const url of data.videos) {
          addRecord({
            type: 'video', url, prompt: task.prompt,
            negativePrompt: task.negativePrompt,
            model: requestBody.model as string || 'unknown',
            modelLabel: task.modelLabel,
            isCustomModel: isCustomModel(requestBody.model as string) || isSystemModel(requestBody.model as string) || isSiliconFlowDefault(requestBody.model as string),
            params: { aspectRatio, duration: requestBody.duration, cameraMovement, style },
          });
        }
        // Persist works to Supabase
        await persistWorks(data.videos, task, requestBody, credits);
        // Record credits
        if (credits > 0 && user) {
          const currentCredits = typeof user.creditsBalance === 'number' ? user.creditsBalance : 0;
          addCreditRecord({
            type: 'consume',
            amount: -credits,
            balanceAfter: Math.max(0, currentCredits - credits),
            description: `文生视频 - ${task.modelLabel}`,
          });
        }
        toast.success(`视频生成成功: ${task.prompt.slice(0, 30)}...`);
      } else {
        throw new Error(data.error || '视频生成失败');
      }
    } catch (err: unknown) {
      let errorMsg = '生成失败';
      if (err instanceof DOMException && err.name === 'AbortError') {
        errorMsg = '请求超时，视频生成可能需要更长时间';
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }
      updateTask(task.id, { status: 'failed', error: errorMsg });
      toast.error(errorMsg);
    }
  }, [updateTask, addRecord, persistWorks, user, aspectRatio, cameraMovement, style]);

  const systemVideoApis = adminConfig.systemApis.filter(api => api.type === 'video' && api.isActive);
  const systemTextApis = adminConfig.systemApis.filter(api => api.type === 'text' && api.isActive);

  // Model options — include siliconflow default + system + custom
  const modelOptions = useMemo(() => [
    { id: 'siliconflow-default', label: '万梦视频 (默认)', group: '默认模型' },
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
    if (selectedModel === 'siliconflow-default') return '硅基流动';
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

  const credits = calcVideoCredits(duration, selectedModel);

  const triggerGenerateCooldown = useCallback(() => {
    setGenerating(true);
    window.setTimeout(() => setGenerating(false), 500);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { toast.error('请输入视频描述'); return; }
    if (!user) { toast.error('请先登录'); return; }
    if (generating) { toast.error('正在提交任务，请稍候'); return; }

    triggerGenerateCooldown();

    const currentCredits = calcVideoCredits(duration, selectedModel);
    const modelLabel = getCurrentModelLabel();

    // Create task immediately
    const taskId = generateTaskId();
    const newTask: VideoTask = {
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
    let requestBody: Record<string, unknown> = {
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      model: selectedModel,
      aspectRatio,
      duration: Number(duration),
      fps: 30,
    };

    if (isCustomModel(selectedModel)) {
      const key = videoKeys.find(k => k.id === getCustomKeyId(selectedModel));
      if (key) {
        requestBody = { ...requestBody, model: key.modelName, customApiConfig: { apiUrl: key.apiUrl, modelName: key.modelName, apiKey: key.apiKey, apiFormat: key.apiFormat } };
      }
    } else if (isSystemModel(selectedModel)) {
      const api = systemVideoApis.find(a => a.id === getSystemApiId(selectedModel));
      if (api) {
        requestBody = { ...requestBody, model: api.modelName, customApiConfig: { apiUrl: api.apiUrl, modelName: api.modelName, apiKey: api.apiKey, apiFormat: api.apiFormat } };
      }
    }
    // siliconflow-default 不传 customApiConfig，让后端使用默认配置

    // Execute generation asynchronously - don't block UI
    executeGeneration(newTask, requestBody, currentCredits).finally(() => {});
  }, [prompt, negativePrompt, selectedModel, aspectRatio, duration, cameraMovement, style, user, videoKeys, systemVideoApis, getCurrentModelLabel, executeGeneration]);

  const handleDownload = useCallback(async (url: string, index: number) => {
    const result = await downloadFile(url, `miaojing-video-${Date.now()}-${index}.mp4`);
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
            <Label>视频描述</Label>
          </div>
          <div className="relative">
            <Textarea
              placeholder="描述你想要生成的视频画面..."
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
            {VIDEO_STYLES.map(s => (
              <Badge key={s} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => setStyle(s)}>{s}</Badge>
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
                {VIDEO_DURATIONS.map(d => (
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
              {CAMERA_MOVEMENTS.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full gap-2" size="lg" onClick={handleGenerate} disabled={!hasModels}>
          {generating ? (<><Loader2 className="h-4 w-4 animate-spin" />提交中...</>) : (<><Sparkles className="h-4 w-4" />生成视频 {credits > 0 && `(${credits} 积分)`}</>)}
        </Button>
      </div>

      {/* Right: Results + History */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Tasks area */}
        {tasks.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Video className="h-4 w-4" />生成任务 ({tasks.length})
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
                    {/* Generating/pending state */}
                    {(task.status === 'generating' || task.status === 'pending') && (
                      <div className="aspect-video bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 animate-pulse rounded-md flex items-center justify-center">
                        <div className="text-center space-y-3">
                          <div className="relative">
                            <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Film className="h-5 w-5 text-primary/50" />
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {task.status === 'generating' ? '视频生成中...' : '等待生成...'}
                          </p>
                          {task.status === 'generating' && (
                            <p className="text-xs text-muted-foreground/60">异步任务可能需要较长时间，请耐心等待</p>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Failed state */}
                    {task.status === 'failed' && (
                      <div className="aspect-video bg-destructive/10 rounded-md flex items-center justify-center">
                        <div className="text-center space-y-2">
                          <X className="h-8 w-8 mx-auto text-destructive" />
                          <p className="text-xs text-destructive">{task.error || '生成失败'}</p>
                        </div>
                      </div>
                    )}
                    {/* Results */}
                    {task.status === 'completed' && task.results.length > 0 && (
                      <div className="space-y-2">
                        {task.results.map((url, i) => (
                          <div key={i} className="rounded-md border border-border overflow-hidden bg-muted/50">
                            <video src={url} controls className="w-full" />
                            <div className="p-2 flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => handleShareToGallery(url)}><Share2 className="h-3.5 w-3.5" />分享</Button>
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => handleDownload(url, i)}><Download className="h-3.5 w-3.5" />下载</Button>
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
            <Video className="h-14 w-14 mb-3 opacity-20" />
            <p className="text-sm">点击左侧「生成视频」开始创作</p>
            <p className="text-xs mt-1 opacity-60">可以同时创建多个任务</p>
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
