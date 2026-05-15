'use client';

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCustomApiKeys } from '@/lib/custom-api-store';
import {
  MANIFEST_GENERATION_PROMPT,
  parseManifestJson,
  readClipboardText,
  copyToClipboard,
  manifestToEntries,
} from '@/lib/api-adapters/manifest-importer';
import type { ParsedApiEntry, ApiManifest } from '@/lib/api-adapters/manifest-types';
import {
  Sparkles,
  Copy,
  ClipboardPaste,
  Check,
  AlertCircle,
  Loader2,
  Wand2,
  Image,
  Film,
  MessageSquare,
  Key,
  Eye,
  EyeOff,
  X,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

interface SmartApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'menu' | 'prompt' | 'json' | 'result';

export function SmartApiConfigDialog({ open, onOpenChange }: SmartApiConfigDialogProps) {
  const { add } = useCustomApiKeys();
  const [step, setStep] = useState<Step>('menu');
  const [jsonInput, setJsonInput] = useState('');
  const [parseResult, setParseResult] = useState<{ success: true; data: ApiManifest; entries: ParsedApiEntry[] } | { success: false; error: string } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  // 每个条目的 API Key 输入
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});

  const resetState = useCallback(() => {
    setStep('menu');
    setJsonInput('');
    setParseResult(null);
    setParsing(false);
    setCopiedPrompt(false);
    setImporting(false);
    setImportedIds([]);
    setApiKeys({});
    setShowApiKeys({});
  }, []);

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  // 复制提示词
  const handleCopyPrompt = async () => {
    try {
      await copyToClipboard(MANIFEST_GENERATION_PROMPT);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      // 静默失败
    }
  };

  // 从剪贴板粘贴 JSON
  const handlePasteFromClipboard = async () => {
    try {
      const text = await readClipboardText();
      setJsonInput(text);
      handleParseJson(text);
    } catch (err) {
      setParseResult({ success: false, error: err instanceof Error ? err.message : '读取剪贴板失败' });
      setStep('result');
    }
  };

  // 解析 JSON
  const handleParseJson = (text?: string) => {
    const content = text ?? jsonInput;
    if (!content.trim()) {
      setParseResult({ success: false, error: '请输入或粘贴 JSON 内容' });
      setStep('result');
      return;
    }
    setParsing(true);
    // 使用 setTimeout 避免 UI 卡顿
    setTimeout(() => {
      const result = parseManifestJson(content);
      if (result.success) {
        const entries = manifestToEntries(result.data);
        // 初始化每个条目的 apiKey 状态
        const keyMap: Record<string, string> = {};
        entries.forEach(e => { keyMap[e.name] = ''; });
        setApiKeys(keyMap);
        setParseResult({ ...result, entries });
      } else {
        setParseResult(result);
      }
      setParsing(false);
      setStep('result');
    }, 100);
  };

  // 导入配置（仅导入有填写 API Key 的条目）
  const handleImport = async () => {
    if (!parseResult || !parseResult.success) return;

    const entriesToImport = parseResult.entries.filter(e => apiKeys[e.name]?.trim());
    if (entriesToImport.length === 0) return;

    setImporting(true);

    // 逐个添加，带小延迟让 UI 更新
    const newIds: string[] = [];
    for (const entry of entriesToImport) {
      add({
        provider: entry.name,
        apiUrl: entry.apiUrl,
        modelName: entry.modelName,
        apiKey: apiKeys[entry.name].trim(),
        type: entry.type,
        apiFormat: entry.inferredFormat, // 使用自动推断的 API 格式
        isActive: true,
      });
      newIds.push(entry.name);
      await new Promise(r => setTimeout(r, 50));
    }

    setImportedIds(newIds);
    setImporting(false);
  };

  // 获取模型类型图标和标签
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'video':
        return <Badge variant="outline" className="text-xs"><Film className="h-3 w-3 mr-1" />视频</Badge>;
      case 'text':
        return <Badge variant="outline" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />文本</Badge>;
      default:
        return <Badge variant="outline" className="text-xs"><Image className="h-3 w-3 mr-1" />生图</Badge>;
    }
  };

  // JSON 预览格式化
  const formatJsonPreview = (raw: string): string => {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            智能配置 API
          </DialogTitle>
          <DialogDescription>
            导入 AI 生成的自定义服务商 Manifest，系统会为每个模型创建独立配置。
          </DialogDescription>
        </DialogHeader>

        {/* ===== 步骤：主菜单 ===== */}
        {step === 'menu' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {/* AI 一键生成 */}
            <button
              onClick={() => { setStep('prompt'); }}
              className="group p-5 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/3 transition-all text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="font-medium">AI 一键生成</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                复制专用提示词，发给任意 AI 助手，让它根据 API 文档自动生成标准配置 JSON
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <span>开始</span><ChevronRight className="h-3 w-3" />
              </div>
            </button>

            {/* 剪贴板导入 */}
            <button
              onClick={handlePasteFromClipboard}
              className="group p-5 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/3 transition-all text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-lg bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <ClipboardPaste className="h-5 w-5" />
                </div>
                <span className="font-medium">剪贴板导入</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                直接从剪贴板读取已复制的 Manifest JSON，一键解析并导入
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <span>从剪贴板读取</span><ChevronRight className="h-3 w-3" />
              </div>
            </button>

            {/* 手动粘贴 JSON */}
            <button
              onClick={() => { setStep('json'); }}
              className="group p-5 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:bg-primary/3 transition-all text-left sm:col-span-2"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-lg bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <Copy className="h-5 w-5" />
                </div>
                <span className="font-medium">手动粘贴配置</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                将 AI 生成的 JSON Manifest 粘贴到文本框中，系统会自动验证并解析可导入的配置项
              </p>
              <div className="flex items-center gap-1 mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <span>粘贴并导入</span><ChevronRight className="h-3 w-3" />
              </div>
            </button>

            {/* 说明文字 */}
            <div className="sm:col-span-2 p-4 rounded-lg bg-muted/30 border border-dashed border-border/50">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>使用流程：</strong>点击「AI 一键生成」复制提示词 → 发给 AI + 提供 API 文档 → 获得 JSON → 回到这里「剪贴板导入」或「手动粘贴」→ 填写 API Key → 创建配置
              </p>
            </div>
          </div>
        )}

        {/* ===== 步骤：显示提示词 ===== */}
        {step === 'prompt' && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">生成提示词</Label>
              <Button
                size="sm"
                variant={copiedPrompt ? 'default' : 'outline'}
                className="gap-1.5"
                onClick={handleCopyPrompt}
              >
                {copiedPrompt ? (
                  <><Check className="h-3.5 w-3.5" />已复制</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" />复制提示词</>
                )}
              </Button>
            </div>
            <div className="relative">
              <pre className="p-4 rounded-lg bg-muted/50 border border-border/50 text-xs leading-relaxed max-h-[50vh] overflow-auto whitespace-pre-wrap break-words font-mono">
                {MANIFEST_GENERATION_PROMPT}
              </pre>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep('menu')}
              >
                返回
              </Button>
              <Button
                className="gap-1.5"
                onClick={() => { setStep('json'); }}
              >
                <ClipboardPaste className="h-4 w-4" />
                我已有 JSON，去粘贴
              </Button>
            </div>
            {/* 提示 */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">下一步：</strong>将上面复制的提示词发送给 AI（如 ChatGPT、Claude、DeepSeek 等），同时提供你要接入的服务商 API 文档链接或文档内容。AI 会返回一段 JSON 代码块，复制它后回到本页面点击「剪贴板导入」。
              </p>
            </div>
          </div>
        )}

        {/* ===== 步骤：JSON 编辑 ===== */}
        {step === 'json' && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">JSON Manifest</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handlePasteFromClipboard}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  从剪贴板粘贴
                </Button>
                <Badge
                  variant={jsonInput.trim() ? 'default' : 'secondary'}
                  className="text-xs cursor-pointer"
                  onClick={() => handleParseJson()}
                >
                  可导入
                </Badge>
              </div>
            </div>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={'{\n  "customProviders": [...],\n  "profiles": [...]\n}'}
              className="w-full min-h-[300px] max-h-[50vh] p-4 rounded-lg bg-muted/50 border border-border/50 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              spellCheck={false}
            />
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep('menu')}
              >
                返回
              </Button>
              <Button
                className="gap-1.5"
                onClick={() => handleParseJson()}
                disabled={!jsonInput.trim() || parsing}
              >
                {parsing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />解析中...</>
                ) : (
                  <><Sparkles className="h-4 w-4" />解析并继续</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ===== 步骤：结果 / 导入确认 ===== */}
        {step === 'result' && parseResult && (
          <div className="mt-4 space-y-4">
            {!parseResult.success ? (
              /* 错误状态 */
              <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive text-sm">JSON 解析失败</p>
                    <p className="text-sm text-muted-foreground mt-1">{parseResult.error}</p>
                  </div>
                </div>
              </div>
            ) : importedIds.length > 0 ? (
              /* 导入成功状态 */
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <div className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-emerald-600 dark:text-emerald-400 text-sm">
                        成功导入 {importedIds.length} 个配置
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        已添加: {importedIds.join('、')}。你可以在创作中心选择这些自定义模型。
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => handleClose(false)}>
                    完成
                  </Button>
                </div>
              </div>
            ) : (
              /* 导入表单 */
              <>
                {/* 解析成功摘要 */}
                <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    成功解析 {parseResult.data.customProviders.length} 个服务商，{parseResult.entries.length} 个配置
                  </p>
                </div>

                {/* JSON 预览（可折叠） */}
                <details className="group">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
                    <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    查看 JSON 原始内容
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-muted/50 border border-border/50 text-xs font-mono max-h-[200px] overflow-auto">
                    {formatJsonPreview(jsonInput)}
                  </pre>
                </details>

                {/* 配置列表 - 每个 profile 一个卡片 */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    填写 API Key
                    <span className="text-muted-foreground font-normal ml-2">（导入后仍可在 API 管理页编辑密钥）</span>
                  </Label>

                  {parseResult.entries.map((entry, idx) => {
                    const isImported = importedIds.includes(entry.name);
                    const hasPoll = !!entry.manifest.poll;

                    // 格式标签
                    const formatLabel = entry.inferredFormat === 'dashscope' ? 'DashScope' :
                                       entry.inferredFormat === 'kling' ? '可灵(Kling)' :
                                       entry.inferredFormat === 'volcengine' ? '火山引擎(Volcengine)' : 'OpenAI 兼容';
                    const formatColor = entry.inferredFormat === 'dashscope' ? 'text-green-600 dark:text-green-400 border-green-500/50' :
                                      entry.inferredFormat === 'kling' ? 'text-purple-600 dark:text-purple-400 border-purple-500/50' :
                                      entry.inferredFormat === 'volcengine' ? 'text-orange-600 dark:text-orange-400 border-orange-500/50' :
                                      'text-blue-600 dark:text-blue-400 border-blue-500/50';

                    return (
                      <div
                        key={entry.name}
                        className={`p-4 rounded-lg border transition-colors ${
                          isImported
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-border/60 bg-card'
                        }`}
                      >
                        {/* 条目头部 */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{idx + 1}. {entry.name}</span>
                            {getTypeBadge(entry.type)}
                            <Badge variant="outline" className={`text-xs ${formatColor}`}>
                              {formatLabel}
                            </Badge>
                            {hasPoll && (
                              <Badge variant="outline" className="text-xs text-orange-600 dark:text-orange-400">异步轮询</Badge>
                            )}
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {entry.manifest.id}
                            </Badge>
                          </div>
                        </div>

                        {/* 详情 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground mb-3">
                          <div className="truncate" title={entry.apiUrl}>
                            <span className="font-medium">URL:</span> {entry.apiUrl || '(待填 baseUrl)'}
                          </div>
                          <div>
                            <span className="font-medium">模型:</span> {entry.modelName}
                          </div>
                          <div>
                            <span className="font-medium">提交路径:</span> {entry.manifest.submit.path}
                            <span className="ml-1 text-[10px]">({entry.manifest.submit.method || 'POST'})</span>
                          </div>
                          {hasPoll && (
                            <div>
                              <span className="font-medium">轮询路径:</span> {entry.manifest.poll!.path}
                              <span className="ml-1 text-[10px]">(每 {entry.manifest.poll!.intervalSeconds || 5}s)</span>
                            </div>
                          )}
                        </div>

                        {/* 警告信息 */}
                        {entry.warnings && entry.warnings.length > 0 && (
                          <div className="mb-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <div className="text-xs text-amber-700 dark:text-amber-300">
                                {entry.warnings.map((w, i) => (
                                  <p key={i}>{w}</p>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* API Key 输入 */}
                        {!isImported && (
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                type={showApiKeys[entry.name] ? 'text' : 'password'}
                                placeholder="API Key（必填才可导入此配置）"
                                value={apiKeys[entry.name] || ''}
                                onChange={(e) => setApiKeys(prev => ({ ...prev, [entry.name]: e.target.value }))}
                                className="pl-9 pr-10 h-9 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => setShowApiKeys(prev => ({ ...prev, [entry.name]: !prev[entry.name] }))}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showApiKeys[entry.name] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 已导入标记 */}
                        {isImported && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" />
                            已导入
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => { setStep('menu'); setParseResult(null); }}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    重新开始
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setStep('json')}
                    >
                      编辑 JSON
                    </Button>
                    <Button
                      className="gap-1.5"
                      onClick={handleImport}
                      disabled={
                        importing ||
                        parseResult.entries.filter(e => apiKeys[e.name]?.trim()).length === 0
                      }
                    >
                      {importing ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />导入中...</>
                      ) : (
                        <><Check className="h-4 w-4" />
                          创建并使用 ({parseResult.entries.filter(e => apiKeys[e.name]?.trim()).length})
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* 提示信息 */}
                <div className="p-3 rounded-lg bg-muted/30 border border-dashed border-border/50">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    导入后 API Key 仅存储在本地浏览器中（localStorage），不会上传至任何服务器。未填写 API Key 的配置将被跳过，你可以稍后在 API 管理页面补充密钥。
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
