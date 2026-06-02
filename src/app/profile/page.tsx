'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomApiKeys } from '@/lib/custom-api-store';
import { useCreationHistory, type CreationRecord, isPlaceholder } from '@/lib/creation-history-store';
import { useCreditRecords, formatRecordTime } from '@/lib/credit-records-store';
import { useUserOrders, formatOrderTime } from '@/lib/order-store';
import { useAuth } from '@/lib/auth-store';
import { CreationDetailDialog } from '@/components/creation-detail-dialog';
import {
  User,
  CreditCard,
  Crown,
  Receipt,
  Image,
  Key,
  Coins,
  Calendar,
  Shield,
  TrendingUp,
  Gift,
  Zap,
  Settings,
  Globe,
  Cpu,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Check,
  Loader2,
  Film,
  LogOut,
  LogIn,
  ExternalLink,
  Sparkles,
  MessageSquare,
  ImageOff,
  Wand2,
} from 'lucide-react';
import { SmartApiConfigDialog } from '@/components/smart-api-config-dialog';

// Mock data for demo - in production, fetch from API
const mockProfile = {
  nickname: '创作者',
  email: 'creator@huanjing-aigc.ai',
  phone: '138****8888',
  role: 'user',
  membership_tier: 'free',
  credits_balance: 10,
  daily_quota_used: 2,
  daily_quota_limit: 5,
  created_at: '2024-01-15',
};

const membershipTiers = [
  { tier: 'free', name: '免费版', price: 0, dailyQuota: 5, features: ['每日5次创作', '标准画质', '社区展示'] },
  { tier: 'basic', name: '基础版', price: 29, dailyQuota: 50, features: ['每日50次创作', '高清画质', '私有存储', '批量下载'] },
  { tier: 'pro', name: '专业版', price: 99, dailyQuota: -1, features: ['无限创作', '4K超清', '自定义API', '批量处理', '优先队列'] },
  { tier: 'enterprise', name: '企业版', price: 499, dailyQuota: -1, features: ['团队协作', '专属额度', '品牌定制', '私有部署', '7x24支持'] },
];

// Provider presets with default URLs and models
const PROVIDER_PRESETS = [
  { name: '硅基流动', defaultUrl: 'https://api.siliconflow.cn/v1/images/generations', defaultModel: 'black-forest-labs/FLUX.1-schnell', defaultType: 'image' as const, defaultFormat: 'openai' as const, website: 'https://cloud.siliconflow.cn' },
  { name: 'OpenAI', defaultUrl: 'https://api.openai.com/v1/images/generations', defaultModel: 'dall-e-3', defaultType: 'image' as const, defaultFormat: 'openai' as const },
  { name: 'Stability AI', defaultUrl: 'https://api.stability.ai/v1/generation/stable-diffusion-xl/text-to-image', defaultModel: 'stable-diffusion-xl', defaultType: 'image' as const, defaultFormat: 'openai' as const },
  { name: 'Midjourney', defaultUrl: '', defaultModel: 'midjourney-v6', defaultType: 'image' as const, defaultFormat: 'openai' as const },
  { name: 'Runway', defaultUrl: 'https://api.runwayml.com/v1/image_to_video', defaultModel: 'gen-3-alpha', defaultType: 'video' as const, defaultFormat: 'openai' as const },
  { name: 'Pika', defaultUrl: '', defaultModel: 'pika-1.0', defaultType: 'video' as const, defaultFormat: 'openai' as const },
  { name: '可灵 (Kling)', defaultUrl: 'https://api.kling.ai/v1/images/generations', defaultModel: 'kling-v3-omni', defaultType: 'image' as const, defaultFormat: 'kling' as const, website: 'https://platform.kling.ai' },
  // 阿里云 DashScope（使用 dashscope 格式，基础 URL 会自动拼接）
  { name: '阿里云', defaultUrl: 'https://dashscope.aliyuncs.com/api/v1', defaultModel: 'wan2.7-image', defaultType: 'image' as const, defaultFormat: 'dashscope' as const, website: 'https://dashscope.console.aliyun.com' },
  { name: 'DeepSeek', defaultUrl: 'https://api.deepseek.com/v1/chat/completions', defaultModel: 'deepseek-chat', defaultType: 'text' as const, defaultFormat: 'openai' as const },
  { name: '自定义', defaultUrl: '', defaultModel: '', defaultType: 'image' as const, defaultFormat: 'openai' as const },
];

function ApiKeyManager() {
  const { keys, add, update, remove, toggleActive } = useCustomApiKeys();
  const [showForm, setShowForm] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSmartConfig, setShowSmartConfig] = useState(false);

  // Form state
  const [provider, setProvider] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [formType, setFormType] = useState<'image' | 'video' | 'text'>('image');
  const [formFormat, setFormFormat] = useState<'openai' | 'kling' | 'dashscope' | 'volcengine'>('openai');

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [keyTestResults, setKeyTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // Edit state
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);

  // Auto-fill URL and model when provider preset is selected
  const handleProviderChange = (value: string) => {
    setProvider(value);
    const preset = PROVIDER_PRESETS.find(p => p.name === value);
    if (preset) {
      // 硅基流动：根据类型使用不同的端点
      if (preset.name === '硅基流动') {
        if (formType === 'text') {
          setApiUrl('https://api.siliconflow.cn/v1/chat/completions');
        } else if (formType === 'video') {
          setApiUrl('https://api.siliconflow.cn/v1/video/submit');
        } else {
          setApiUrl(preset.defaultUrl);
        }
      } else {
        setApiUrl(preset.defaultUrl);
      }
      setModelName(preset.defaultModel);
      if (preset.defaultType) setFormType(preset.defaultType);
      if (preset.defaultFormat) setFormFormat(preset.defaultFormat);
    }
    setTestResult(null);
  };

  // 切换模型类型时，如果是硅基流动，自动更新API地址
  const handleTypeChange = (type: 'image' | 'video' | 'text') => {
    setFormType(type);
    if (provider === '硅基流动') {
      if (type === 'text') {
        setApiUrl('https://api.siliconflow.cn/v1/chat/completions');
      } else if (type === 'video') {
        setApiUrl('https://api.siliconflow.cn/v1/video/submit');
      } else {
        const preset = PROVIDER_PRESETS.find(p => p.name === '硅基流动');
        setApiUrl(preset?.defaultUrl || '');
      }
    }
  };

  const handleAddKey = () => {
    // 可灵格式需要 accessKey 和 secretKey
    const isKling = formFormat === 'kling';
    const keyValue = isKling
      ? (accessKey.trim() && secretKey.trim() ? `${accessKey.trim()}:${secretKey.trim()}` : '')
      : apiKey.trim();
    if (!provider.trim() || !keyValue) return;
    if (editingKeyId) {
      // Update existing key
      update(editingKeyId, {
        provider: provider.trim(),
        apiUrl: apiUrl.trim(),
        modelName: modelName.trim(),
        apiKey: keyValue,
        accessKey: isKling ? accessKey.trim() : undefined,
        secretKey: isKling ? secretKey.trim() : undefined,
        type: formType,
        apiFormat: formFormat,
        isActive: true,
      });
      setEditingKeyId(null);
    } else {
      // Add new key
      add({
        provider: provider.trim(),
        apiUrl: apiUrl.trim(),
        modelName: modelName.trim(),
        apiKey: keyValue,
        accessKey: isKling ? accessKey.trim() : undefined,
        secretKey: isKling ? secretKey.trim() : undefined,
        type: formType,
        apiFormat: formFormat,
        isActive: true,
      });
    }
    setProvider('');
    setApiUrl('');
    setModelName('');
    setApiKey('');
    setAccessKey('');
    setSecretKey('');
    setFormType('image');
    setFormFormat('openai');
    setShowForm(false);
    setShowApiKey(false);
    setTestResult(null);
  };

  const handleEditKey = (keyId: string) => {
    const key = keys.find(k => k.id === keyId);
    if (!key) return;
    setEditingKeyId(keyId);
    setProvider(key.provider);
    setApiUrl(key.apiUrl);
    setModelName(key.modelName);
    // 可灵格式解析 accessKey:secretKey
    if (key.apiFormat === 'kling' && key.apiKey.includes(':')) {
      const [ak, sk] = key.apiKey.split(':');
      setAccessKey(ak || '');
      setSecretKey(sk || '');
      setApiKey('');
    } else {
      setApiKey(key.apiKey);
      setAccessKey('');
      setSecretKey('');
    }
    setFormType(key.type || 'image');
    setFormFormat(key.apiFormat || 'openai');
    setShowForm(true);
    setShowApiKey(false);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    const isKling = formFormat === 'kling';
    const keyValue = isKling
      ? (accessKey.trim() && secretKey.trim() ? `${accessKey.trim()}:${secretKey.trim()}` : '')
      : apiKey.trim();
    if (!apiUrl.trim() || !keyValue) {
      setTestResult({ success: false, message: `请先填写 API 请求地址和 ${isKling ? 'AccessKey/SecretKey' : 'API Key'}` });
      return;
    }
    // Validate URL format
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      setTestResult({ success: false, message: `API 地址无效：${apiUrl} — 请填写完整 URL（以 http:// 或 https:// 开头）` });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/auth/test-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: apiUrl.trim(),
          apiKey: keyValue,
          modelName: modelName.trim(),
          provider: provider.trim(),
          apiFormat: formFormat,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({ success: true, message: data.message });
      } else {
        const parts = [data.error];
        if (data.suggestion) parts.push(data.suggestion);
        setTestResult({ success: false, message: parts.join(' — ') });
      }
    } catch {
      setTestResult({ success: false, message: '测试请求发送失败，请检查网络' });
    } finally {
      setTesting(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setShowApiKey(false);
    setProvider('');
    setApiUrl('');
    setModelName('');
    setApiKey('');
    setAccessKey('');
    setSecretKey('');
    setFormType('image');
    setFormFormat('openai');
    setTestResult(null);
    setEditingKeyId(null);
  };

  const handleTestExistingKey = async (keyId: string) => {
    const key = keys.find(k => k.id === keyId);
    if (!key) return;
    setTestingKeyId(keyId);
    setKeyTestResults(prev => {
      const next = { ...prev };
      delete next[keyId];
      return next;
    });
        try {
      const res = await fetch('/api/auth/test-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: key.apiUrl,
          apiKey: key.apiKey,
          modelName: key.modelName,
          provider: key.provider,
          apiFormat: key.apiFormat || 'openai',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setKeyTestResults(prev => ({ ...prev, [keyId]: { success: true, message: data.message } }));
      } else {
        const parts = [data.error];
        if (data.suggestion) parts.push(data.suggestion);
        setKeyTestResults(prev => ({ ...prev, [keyId]: { success: false, message: parts.join(' — ') } }));
      }
    } catch {
      setKeyTestResults(prev => ({ ...prev, [keyId]: { success: false, message: '测试请求发送失败' } }));
    } finally {
      setTestingKeyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" />API 管理</CardTitle>
          <CardDescription>配置第三方模型API，添加后可在创作中心直接选用</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Supported providers */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
            <h3 className="font-medium mb-2">支持的模型供应商</h3>
            <div className="flex flex-wrap gap-2">
              {PROVIDER_PRESETS.filter(p => p.name !== '自定义').map((p) => (
                <Badge key={p.name} variant="outline">{p.name}</Badge>
              ))}
              <Badge variant="outline" className="border-dashed">+ 自定义</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              添加密钥后，创作中心的模型列表会自动出现你配置的自定义模型
            </p>
          </div>

          <Separator />

          {/* Add key button / form */}
          <div className="flex items-center gap-3">
            {!showForm ? (
              <Button variant="outline" className="gap-2" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />添加 API 密钥
              </Button>
            ) : (
              <Button variant="outline" className="gap-2" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />添加 API 密钥
              </Button>
            )}
            <Button variant="outline" className="gap-2 text-primary border-primary/30 hover:bg-primary/5" onClick={() => setShowSmartConfig(true)}>
              <Wand2 className="h-4 w-4" />智能配置 API
            </Button>
            {showForm && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                收起表单
              </Button>
            )}
          </div>

          {/* 表单区域 */}
          {showForm && (
          <div className="space-y-4 p-4 rounded-lg border border-primary/20 bg-primary/5 mt-4">
              <h3 className="font-medium flex items-center gap-2">
                {editingKeyId ? (
                  <>
                    <Settings className="h-4 w-4 text-primary" />
                    编辑 API 密钥
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 text-primary" />
                    添加 API 密钥
                  </>
                )}
              </h3>

              {/* Row 1: Provider + API URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    供应商 <span className="text-destructive">*</span>
                  </Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                  >
                    <option value="">选择供应商...</option>
                    {PROVIDER_PRESETS.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    API 请求地址
                  </Label>
                  <Input
                    placeholder="https://api.openai.com/v1/images/generations"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">填写完整的 API 请求端点 URL</p>
                </div>
              </div>

              {/* Model Type */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  模型类型 <span className="text-destructive">*</span>
                </Label>
                <Select value={formType} onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">
                      <span className="flex items-center gap-2">
                        <Image className="h-3.5 w-3.5" />
                        生图模型
                      </span>
                    </SelectItem>
                    <SelectItem value="video">
                      <span className="flex items-center gap-2">
                        <Film className="h-3.5 w-3.5" />
                        视频模型
                      </span>
                    </SelectItem>
                    <SelectItem value="text">
                      <span className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5" />
                        文本模型
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">生图模型用于文生图/图生图，视频模型用于文生视频/图生视频，文本模型用于提示词优化</p>
              </div>

              {/* API Format */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  API 格式 <span className="text-destructive">*</span>
                </Label>
                <Select value={formFormat} onValueChange={v => setFormFormat(v as 'openai' | 'kling' | 'dashscope' | 'volcengine')}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择 API 格式..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI 兼容</SelectItem>
                    <SelectItem value="dashscope">DashScope (通义万相)</SelectItem>
                    <SelectItem value="kling">可灵 (Kling)</SelectItem>
                    <SelectItem value="volcengine">火山引擎 (Volcengine)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">OpenAI 兼容适用于大部分 API，DashScope 适用于通义万相/wan2.x 系列，可灵适用于可灵官方 API，火山引擎适用于豆包/Seedance 系列</p>
              </div>

              {/* Row 2: Model Name + API Key (OpenAI) / AccessKey + SecretKey (Kling) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    模型名称
                  </Label>
                  <Input
                    placeholder={formFormat === 'kling' ? '例如: kling-v3-omni' : '例如: dall-e-3, stable-diffusion-xl'}
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">留空则使用平台默认模型</p>
                </div>
                {formFormat === 'kling' ? (
                  <>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Key className="h-3.5 w-3.5 text-muted-foreground" />
                        AccessKey <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="可灵 AccessKey"
                        value={accessKey}
                        onChange={(e) => setAccessKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Key className="h-3.5 w-3.5 text-muted-foreground" />
                        SecretKey <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="可灵 SecretKey"
                          value={secretKey}
                          onChange={(e) => setSecretKey(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-muted-foreground" />
                      API Key <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="sk-..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center gap-3">
                  <Button
                    className="gap-2"
                    onClick={handleAddKey}
                    disabled={!provider.trim() || (formFormat === 'kling' ? !(accessKey.trim() && secretKey.trim()) : !apiKey.trim())}
                  >
                    <Check className="h-4 w-4" />
                    {editingKeyId ? '保存修改' : '确认添加'}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={handleTestConnection}
                    disabled={!apiUrl.trim() || (formFormat === 'kling' ? !(accessKey.trim() && secretKey.trim()) : !apiKey.trim()) || testing}
                  >
                    {testing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    {testing ? '测试中...' : '测试连接'}
                  </Button>
                  <Button variant="ghost" onClick={resetForm}>
                    取消
                  </Button>
                </div>
                {/* Test result */}
                {testResult && (
                  <div
                    className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                      testResult.success
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {testResult.success ? (
                      <Check className="h-4 w-4 mt-0.5 shrink-0" />
                    ) : (
                      <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 智能配置 API 弹窗 */}
          <SmartApiConfigDialog open={showSmartConfig} onOpenChange={setShowSmartConfig} />

          <Separator />

          {/* Configured keys list */}
          <div>
            <h3 className="font-medium mb-3">已配置的密钥</h3>
            {keys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">暂无配置的API密钥</p>
                <p className="text-xs mt-1">点击上方按钮添加你的第一个密钥</p>
              </div>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      key.isActive ? 'border-border/80 bg-card' : 'border-border/40 bg-muted/30 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Header: Provider + Status */}
                        <div className="flex items-center gap-2">
                          <Badge variant={key.isActive ? 'default' : 'secondary'}>
                            {key.provider}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {(key.type === 'video') ? (
                              <span className="flex items-center gap-1"><Film className="h-3 w-3" />视频</span>
                            ) : (key.type === 'text') ? (
                              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />文本</span>
                            ) : (
                              <span className="flex items-center gap-1"><Image className="h-3 w-3" />生图</span>
                            )}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${key.apiFormat === 'kling' ? 'border-purple-500/50 text-purple-600 dark:text-purple-400' : key.apiFormat === 'dashscope' ? 'border-green-500/50 text-green-600 dark:text-green-400' : key.apiFormat === 'volcengine' ? 'border-orange-500/50 text-orange-600 dark:text-orange-400' : 'border-blue-500/50 text-blue-600 dark:text-blue-400'}`}>
                            {key.apiFormat === 'kling' ? '可灵' : key.apiFormat === 'dashscope' ? 'DashScope' : key.apiFormat === 'volcengine' ? '火山引擎' : 'OpenAI'}
                          </Badge>
                          <Badge variant="outline" className="font-mono text-xs">
                            {key.apiKeyPreview}
                          </Badge>
                          {!key.isActive && (
                            <Badge variant="outline" className="text-muted-foreground">已禁用</Badge>
                          )}
                        </div>

                        {/* Details: URL + Model */}
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                          {key.apiUrl && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Globe className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate max-w-[280px]">{key.apiUrl}</span>
                            </div>
                          )}
                          {key.modelName && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Cpu className="h-3.5 w-3.5 shrink-0" />
                              <span>{key.modelName}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            <span>{key.createdAt}</span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleTestExistingKey(key.id)}
                          disabled={testingKeyId === key.id}
                          title="测试连接"
                        >
                          {testingKeyId === key.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleEditKey(key.id)}
                          title="编辑"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => toggleActive(key.id)}
                          title={key.isActive ? '禁用' : '启用'}
                        >
                          {key.isActive ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-destructive hover:text-destructive"
                          onClick={() => remove(key.id)}
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {/* Per-key test result */}
                    {keyTestResults[key.id] && (
                      <div
                        className={`mt-2 flex items-start gap-2 rounded-md px-3 py-1.5 text-xs ${
                          keyTestResults[key.id].success
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {keyTestResults[key.id].success ? (
                          <Check className="h-3 w-3 mt-0.5 shrink-0" />
                        ) : (
                          <Shield className="h-3 w-3 mt-0.5 shrink-0" />
                        )}
                        <span>{keyTestResults[key.id].message}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CreationHistoryTab() {
  const { records, remove, clear } = useCreationHistory();
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [selectedRecord, setSelectedRecord] = useState<CreationRecord | null>(null);

  const filtered = filter === 'all' ? records : records.filter(r => r.type === filter);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Image className="h-5 w-5" />创作历史</CardTitle>
            <CardDescription>点击记录查看详情、提示词和参考图</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {records.length > 0 && (
              <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={clear}>
                清空历史
              </Button>
            )}
          </div>
        </div>
        {/* Filter */}
        <div className="flex gap-2 mt-2">
          {(['all', 'image', 'video'] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? '全部' : f === 'image' ? '图片' : '视频'}
              {f === 'all' ? ` (${records.length})` : ` (${records.filter(r => r.type === f).length})`}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>还没有创作记录，去创作中心开始创作吧</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((record) => {
              const isPlaceholderUrl = isPlaceholder(record.url);
              return (
                <div
                  key={record.id}
                  className="group relative rounded-lg border border-border/80 overflow-hidden bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedRecord(record)}
                >
                  {isPlaceholderUrl ? (
                    <div className="w-full aspect-square flex flex-col items-center justify-center gap-1">
                      <ImageOff className="h-6 w-6 text-muted-foreground/30" />
                      <span className="text-[10px] text-muted-foreground/50">链接已过期</span>
                    </div>
                  ) : record.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={record.url}
                      alt={record.prompt}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center relative">
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center">
                          <Film className="h-5 w-5 text-black ml-0.5" />
                        </div>
                      </div>
                      <Film className="h-10 w-10 text-muted-foreground opacity-20" />
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col justify-end p-2 opacity-0 group-hover:opacity-100">
                    <p className="text-xs text-white line-clamp-2 mb-1">{record.prompt}</p>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-white/30 text-white/80">
                        {record.modelLabel}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Detail Dialog */}
      <CreationDetailDialog
        record={selectedRecord}
        open={!!selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </Card>
  );
}

export default function ProfilePage() {
  const { isLoggedIn, user, logout, isAdmin, isVip, refreshProfile } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('account');
  const [mounted, setMounted] = useState(false);
  const { records: creationRecords } = useCreationHistory();
  const { records: creditRecords } = useCreditRecords();
  const { orders } = useUserOrders();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Refresh profile from server on mount to pick up admin changes
  useEffect(() => {
    if (isLoggedIn) {
      refreshProfile();
    }
  }, [isLoggedIn, refreshProfile]);

  // Use auth store data directly
  const profile = {
    nickname: user?.nickname || '游客',
    email: user?.email || '',
    phone: user?.phone || '',
    role: user?.role || 'user',
    membership_tier: user?.membershipTier || 'free',
    credits_balance: user?.creditsBalance ?? 0,
    daily_quota_used: user?.dailyQuotaUsed ?? 0,
    daily_quota_limit: user?.dailyQuotaLimit ?? 5,
    created_at: user?.createdAt || '',
  };

  const tierInfo = membershipTiers.find(t => t.tier === profile.membership_tier) || membershipTiers[0];

  // Role display info
  const roleInfo: Record<string, { label: string; color: string }> = {
    admin: { label: '管理员', color: 'text-primary' },
    enterprise_admin: { label: '企业管理员', color: 'text-primary' },
    vip: { label: 'VIP', color: 'text-primary' },
    user: { label: '普通用户', color: 'text-muted-foreground' },
  };
  const currentRole = roleInfo[profile.role] || roleInfo.user;

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Not logged in (after hydration) - show login prompt
  if (mounted && !isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="font-serif text-xl font-bold mb-2">尚未登录</h2>
            <p className="text-sm text-muted-foreground mb-6">登录后可以管理你的创作、积分和 API 密钥</p>
            <Button className="gap-2" onClick={() => router.push('/auth/login')}>
              <LogIn className="h-4 w-4" />
              立即登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Before hydration - render placeholder to avoid SSR/client mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <div className="mb-8">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
              <div className="space-y-2">
                <div className="h-6 w-24 rounded bg-muted animate-pulse" />
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        {/* Profile Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-foreground text-xl font-serif font-medium">
                {profile.nickname[0]}
              </div>
              <div>
                <h1 className="font-serif text-xl font-light text-foreground">{profile.nickname}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {currentRole.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{profile.email}</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground rounded-full h-8 text-xs" onClick={handleLogout}>
              <LogOut className="h-3.5 w-3.5" />
              退出
            </Button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="p-4 rounded-xl border border-border/40 bg-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Coins className="h-4 w-4 text-foreground/60" />
                </div>
                <div>
                  <p className="text-xl font-light">{profile.credits_balance}</p>
                  <p className="text-[10px] text-muted-foreground">剩余积分</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-border/40 bg-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Zap className="h-4 w-4 text-foreground/60" />
                </div>
                <div>
                  <p className="text-xl font-light">{profile.daily_quota_used}/{profile.daily_quota_limit}</p>
                  <p className="text-[10px] text-muted-foreground">今日额度</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-border/40 bg-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Film className="h-4 w-4 text-foreground/60" />
                </div>
                <div>
                  <p className="text-xl font-light">{creationRecords.length}</p>
                  <p className="text-[10px] text-muted-foreground">创作记录</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-border/40 bg-card">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Crown className="h-4 w-4 text-foreground/60" />
                </div>
                <div>
                  <p className="text-xl font-light">{tierInfo.name}</p>
                  <p className="text-[10px] text-muted-foreground">当前会员</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 max-w-3xl bg-muted rounded-full h-9">
            <TabsTrigger value="account" className="gap-1.5 rounded-full text-xs"><User className="h-3.5 w-3.5" /><span className="hidden sm:inline">账户</span></TabsTrigger>
            <TabsTrigger value="membership" className="gap-1.5 rounded-full text-xs"><Crown className="h-3.5 w-3.5" /><span className="hidden sm:inline">会员</span></TabsTrigger>
            <TabsTrigger value="credits" className="gap-1.5 rounded-full text-xs"><Coins className="h-3.5 w-3.5" /><span className="hidden sm:inline">积分</span></TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5 rounded-full text-xs"><Receipt className="h-3.5 w-3.5" /><span className="hidden sm:inline">订单</span></TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 rounded-full text-xs"><Image className="h-3.5 w-3.5" /><span className="hidden sm:inline">历史</span></TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5 rounded-full text-xs"><Key className="h-3.5 w-3.5" /><span className="hidden sm:inline">API</span></TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />账户信息</CardTitle>
                <CardDescription>管理你的账户基本信息</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>昵称</Label>
                    <Input defaultValue={profile.nickname} />
                  </div>
                  <div className="space-y-2">
                    <Label>邮箱</Label>
                    <Input defaultValue={profile.email} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>手机号</Label>
                    <Input defaultValue={profile.phone} />
                  </div>
                  <div className="space-y-2">
                    <Label>注册时间</Label>
                    <Input defaultValue={profile.created_at} disabled />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button>保存修改</Button>
                </div>
                <Separator />
                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2"><Shield className="h-4 w-4" />安全设置</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">登录密码</span>
                      <Button variant="outline" size="sm">修改密码</Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">两步验证</span>
                      <Button variant="outline" size="sm">开启</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Membership Tab */}
          <TabsContent value="membership" className="mt-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5" />会员订阅</CardTitle>
                  <CardDescription>升级会员享受更多创作权益</CardDescription>
                </CardHeader>
              </Card>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {membershipTiers.map((tier) => (
                  <Card key={tier.tier} className={`flex flex-col ${tier.tier === profile.membership_tier ? 'border-primary' : ''}`}>
                    <CardContent className="p-6 flex-1 flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-serif font-semibold">{tier.name}</h3>
                        {tier.tier === profile.membership_tier && (
                          <Badge>当前</Badge>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1 mb-4">
                        <span className="text-3xl font-bold">¥{tier.price}</span>
                        <span className="text-sm text-muted-foreground">/月</span>
                      </div>
                      <ul className="space-y-2 mb-6 flex-1">
                        {tier.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-sm">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full shrink-0"
                        variant={tier.tier === profile.membership_tier ? 'outline' : 'default'}
                        disabled={tier.tier === profile.membership_tier}
                      >
                        {tier.tier === profile.membership_tier ? '当前方案' : '升级'}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Credits Tab */}
          <TabsContent value="credits" className="mt-6">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" />积分中心</CardTitle>
                  <CardDescription>管理你的积分余额与充值</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">当前余额</p>
                      <p className="text-3xl font-bold text-primary">{profile.credits_balance} <span className="text-sm font-normal">积分</span></p>
                    </div>
                    <Button className="gap-2"><CreditCard className="h-4 w-4" />充值积分</Button>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    {[
                      { amount: 50, price: 9.9, bonus: 5 },
                      { amount: 200, price: 29.9, bonus: 30 },
                      { amount: 500, price: 59.9, bonus: 100 },
                    ].map((pkg) => (
                      <Card key={pkg.amount} className="cursor-pointer hover:border-primary/50 transition-colors">
                        <CardContent className="p-4 text-center">
                          <p className="text-2xl font-bold">{pkg.amount}</p>
                          <p className="text-xs text-muted-foreground">积分</p>
                          <p className="text-sm font-semibold text-primary mt-2">¥{pkg.price}</p>
                          <Badge variant="secondary" className="mt-1">送{pkg.bonus}积分</Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">积分记录</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {creditRecords.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">暂无积分记录</p>
                      </div>
                    ) : creditRecords.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${tx.amount > 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                            {tx.amount > 0 ? <Gift className="h-4 w-4 text-emerald-500" /> : <TrendingUp className="h-4 w-4 text-rose-500" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">{formatRecordTime(tx.createdAt)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`font-semibold ${tx.amount > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                          </span>
                          <p className="text-xs text-muted-foreground">余额 {tx.balanceAfter}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />订单管理</CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>暂无订单</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                        <div>
                          <p className="font-medium">{order.productName}</p>
                          <p className="text-xs text-muted-foreground mt-1">{order.orderNo} | {formatOrderTime(order.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">¥{order.amount.toFixed(2)}</p>
                          <Badge variant={order.status === 'paid' ? 'default' : order.status === 'cancelled' ? 'destructive' : 'outline'} className="mt-1">
                            {order.status === 'paid' ? '已支付' : order.status === 'cancelled' ? '已取消' : order.status === 'refunded' ? '已退款' : '待支付'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Works Tab */}
          <TabsContent value="history" className="mt-6">
            <CreationHistoryTab />
          </TabsContent>

          {/* API Tab */}
          <TabsContent value="api" className="mt-6">
            <ApiKeyManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
