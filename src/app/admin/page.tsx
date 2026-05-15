'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';
import { useAdminConfig, type SystemApiConfig, type ManagedUser, type CreditPricing } from '@/lib/admin-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useSiteConfig } from '@/lib/site-config';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Shield, Key, Users, CreditCard, Settings, Plus, Trash2, Edit3,
  Check, Eye, EyeOff, Save, Globe, Cpu, Coins, Crown, Zap, Gift,
  ArrowLeft, Image, Film, AlertTriangle, Megaphone, Calendar, ToggleLeft,
  Upload, MessageSquare, Pencil, X, Receipt, Loader2, BarChart3, Eye as EyeIcon, KeyRound,
  Database, Download, FileUp, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

// ============================================================
// Main Admin Page
// ============================================================

export default function AdminPage() {
  const { isLoggedIn, isAdmin } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('api');

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-serif text-xl font-bold mb-2">无权访问</h2>
            <p className="text-sm text-muted-foreground mb-6">仅管理员可访问此页面</p>
            <Button variant="outline" onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />返回首页
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-serif text-xl font-light text-foreground">管理后台</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">管理员</span>
          </div>
          <p className="text-xs text-muted-foreground font-light">配置系统 API、管理用户、设置价格与支付方式</p>
        </div>

        {/* Stats Overview */}
        <AdminStatsBar />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-8 mb-6 bg-muted rounded-full h-9">
            <TabsTrigger value="api" className="gap-1 rounded-full text-xs"><Key className="h-3.5 w-3.5" /><span className="hidden lg:inline">API</span></TabsTrigger>
            <TabsTrigger value="users" className="gap-1 rounded-full text-xs"><Users className="h-3.5 w-3.5" /><span className="hidden lg:inline">用户</span></TabsTrigger>
            <TabsTrigger value="pricing" className="gap-1 rounded-full text-xs"><Coins className="h-3.5 w-3.5" /><span className="hidden lg:inline">价格</span></TabsTrigger>
            <TabsTrigger value="orders" className="gap-1 rounded-full text-xs"><Receipt className="h-3.5 w-3.5" /><span className="hidden lg:inline">订单</span></TabsTrigger>
            <TabsTrigger value="payment" className="gap-1 rounded-full text-xs"><CreditCard className="h-3.5 w-3.5" /><span className="hidden lg:inline">支付</span></TabsTrigger>
            <TabsTrigger value="announcements" className="gap-1 rounded-full text-xs"><Megaphone className="h-3.5 w-3.5" /><span className="hidden lg:inline">公告</span></TabsTrigger>
            <TabsTrigger value="data" className="gap-1 rounded-full text-xs"><Database className="h-3.5 w-3.5" /><span className="hidden lg:inline">数据</span></TabsTrigger>
            <TabsTrigger value="settings" className="gap-1 rounded-full text-xs"><Settings className="h-3.5 w-3.5" /><span className="hidden lg:inline">设置</span></TabsTrigger>
          </TabsList>

          <TabsContent value="api"><ApiManagementTab /></TabsContent>
          <TabsContent value="users"><UserManagementTab /></TabsContent>
          <TabsContent value="pricing"><PricingTab /></TabsContent>
          <TabsContent value="orders"><OrderManagementTab /></TabsContent>
          <TabsContent value="payment"><PaymentTab /></TabsContent>
          <TabsContent value="announcements"><AnnouncementTab /></TabsContent>
          <TabsContent value="data"><DataManagementTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================================
// Tab 1: API Management
// ============================================================

function ApiManagementTab() {
  const { config, addSystemApi, updateSystemApi, removeSystemApi, toggleSystemApi } = useAdminConfig();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formApiUrl, setFormApiUrl] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formType, setFormType] = useState<'image' | 'video' | 'text'>('image');
  const [formApiFormat, setFormApiFormat] = useState<'openai' | 'kling' | 'dashscope' | 'volcengine'>('openai');
  const [formCredits, setFormCredits] = useState('10');

  const resetForm = () => {
    setFormName(''); setFormApiUrl(''); setFormModelName(''); setFormApiKey('');
    setFormType('image'); setFormApiFormat('openai'); setFormCredits('10'); setEditingId(null); setShowForm(false);
  };

  const startEdit = (api: SystemApiConfig) => {
    setFormName(api.name); setFormApiUrl(api.apiUrl); setFormModelName(api.modelName);
    setFormApiKey(api.apiKey); setFormType(api.type); setFormApiFormat(api.apiFormat || 'openai'); setFormCredits(String(api.creditsPerUse));
    setEditingId(api.id); setShowForm(true);
  };

  const handleSave = () => {
    if (!formName || !formModelName) {
      toast.error('请填写模型名称和显示名称');
      return;
    }
    const data = {
      name: formName,
      apiUrl: formApiUrl,
      modelName: formModelName,
      apiKey: formApiKey,
      apiKeyPreview: formApiKey ? `${formApiKey.slice(0, 6)}...${formApiKey.slice(-4)}` : '',
      type: formType,
      apiFormat: formApiFormat,
      creditsPerUse: Number(formCredits) || 10,
      isActive: true,
    };

    if (editingId) {
      updateSystemApi(editingId, data);
      toast.success('API 已更新');
    } else {
      addSystemApi(data);
      toast.success('API 已添加');
    }
    resetForm();
  };

  const toggleKeyVisibility = (id: string) => {
    setShowKeyMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">系统默认 API</CardTitle>
              <CardDescription>配置所有用户可使用的内置模型 API，使用时不消耗用户积分</CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="h-4 w-4" />添加 API
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* API List */}
          {config.systemApis.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>暂无系统 API，请添加</p>
            </div>
          ) : (
            <div className="space-y-3">
              {config.systemApis.map(api => (
                <div key={api.id} className="flex items-center gap-4 p-4 rounded-lg border border-border">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${api.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {api.type === 'image' ? <Image className="h-5 w-5" /> : api.type === 'video' ? <Film className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{api.name}</span>
                      <Badge variant={api.isActive ? 'default' : 'secondary'} className="text-xs">
                        {api.isActive ? '已启用' : '未启用'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{api.type === 'image' ? '图片' : api.type === 'video' ? '视频' : '文本'}</Badge>
                      <Badge variant="outline" className="text-xs">{api.apiFormat === 'dashscope' ? 'DashScope' : api.apiFormat === 'kling' ? '可灵' : 'OpenAI'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                      <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{api.modelName}</span>
                      {api.apiUrl && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{api.apiUrl.slice(0, 40)}...</span>}
                      <span className="flex items-center gap-1"><Coins className="h-3 w-3" />{api.creditsPerUse} 积分/次</span>
                    </div>
                    {api.apiKey && (
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Key className="h-3 w-3" />
                        {showKeyMap[api.id] ? api.apiKey : api.apiKeyPreview || '••••••••'}
                        <button onClick={() => toggleKeyVisibility(api.id)} className="ml-1 hover:text-foreground">
                          {showKeyMap[api.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={api.isActive} onCheckedChange={() => toggleSystemApi(api.id)} />
                    <Button variant="ghost" size="sm" onClick={() => startEdit(api)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { removeSystemApi(api.id); toast.success('已删除'); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? '编辑 API' : '添加 API'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>显示名称</Label>
                <Input placeholder="如: See Dream v5.0" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={formType} onValueChange={v => setFormType(v as 'image' | 'video' | 'text')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">图片生成</SelectItem>
                    <SelectItem value="video">视频生成</SelectItem>
                    <SelectItem value="text">文本生成</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>API 格式</Label>
              <Select value={formApiFormat} onValueChange={v => setFormApiFormat(v as 'openai' | 'kling' | 'dashscope' | 'volcengine')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI 兼容</SelectItem>
                  <SelectItem value="dashscope">DashScope (通义万相)</SelectItem>
                  <SelectItem value="kling">可灵 (Kling)</SelectItem>
                  <SelectItem value="volcengine">火山引擎 (Volcengine)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">选择 API 提供商的请求格式，wan2.1/wan2.7 系列选 DashScope</p>
            </div>
            <div className="space-y-2">
              <Label>API 请求地址</Label>
              <Input placeholder="https://api.example.com/v1/images/generations" value={formApiUrl} onChange={e => setFormApiUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground">留空则使用平台内置 SDK</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>模型名称 (model)</Label>
                <Input placeholder="如: gpt-image-2" value={formModelName} onChange={e => setFormModelName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>每次消耗积分</Label>
                <Input type="number" value={formCredits} onChange={e => setFormCredits(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input type="password" placeholder="sk-..." value={formApiKey} onChange={e => setFormApiKey(e.target.value)} />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={resetForm}>取消</Button>
              <Button className="gap-1.5" onClick={handleSave}>
                <Save className="h-4 w-4" />{editingId ? '保存' : '添加'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Tab 2: User Management
// ============================================================

function UserManagementTab() {
  const { config, addUser, updateUser, removeUser, adjustUserCredits, setUserCredits } = useAdminConfig();
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [rechargeUser, setRechargeUser] = useState<ManagedUser | null>(null);
  const [realUsers, setRealUsers] = useState<Array<{
    id: string; email: string; nickname: string; role: string;
    membership_tier: string; credits_balance: number;
    daily_quota_limit: number; daily_quota_used: number;
    is_active: boolean;
    status: string; created_at: string;
  }>>([]);
  const [loadingRealUsers, setLoadingRealUsers] = useState(true);
  const [useRealData, setUseRealData] = useState(false);

  // Fetch real users from Supabase (callable from anywhere)
  const fetchRealUsers = useCallback(async () => {
    setLoadingRealUsers(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        if (data.users && data.users.length > 0) {
          setRealUsers(data.users);
          setUseRealData(true);
        }
      }
    } catch { /* ignore */ }
    setLoadingRealUsers(false);
  }, []);

  // Initial load
  useEffect(() => {
    fetchRealUsers();
  }, [fetchRealUsers]);

  // Merge: real Supabase users take priority, then admin-store users
  const displayUsers: ManagedUser[] = useRealData
    ? realUsers.map(u => ({
        id: u.id,
        email: u.email || '',
        nickname: u.nickname || u.email?.split('@')[0] || '用户',
        role: (u.role || 'user') as ManagedUser['role'],
        membershipTier: (u.membership_tier || 'free') as ManagedUser['membershipTier'],
        creditsBalance: u.credits_balance || 0,
        dailyQuotaLimit: u.daily_quota_limit || 5,
        dailyQuotaUsed: u.daily_quota_used || 0,
        status: u.is_active === false ? 'suspended' as const : 'active' as const,
        createdAt: u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '',
      }))
    : config.users;

  // Add form
  const [addEmail, setAddEmail] = useState('');
  const [addNickname, setAddNickname] = useState('');
  const [addRole, setAddRole] = useState<ManagedUser['role']>('user');
  const [addTier, setAddTier] = useState<ManagedUser['membershipTier']>('free');
  const [addCredits, setAddCredits] = useState('10');
  const [addQuota, setAddQuota] = useState('5');

  // Edit form
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<ManagedUser['role']>('user');
  const [editTier, setEditTier] = useState<ManagedUser['membershipTier']>('free');
  const [editCredits, setEditCredits] = useState('0');
  const [editQuota, setEditQuota] = useState('5');
  const [editStatus, setEditStatus] = useState<ManagedUser['status']>('active');

  // Reset password
  const [resetPwUser, setResetPwUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetPwLoading, setResetPwLoading] = useState(false);

  // Recharge form
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeReason, setRechargeReason] = useState('管理员手动充值');
  const [rechargeMode, setRechargeMode] = useState<'add' | 'set'>('add');

  const handleAddUser = () => {
    if (!addEmail) { toast.error('请填写邮箱'); return; }
    addUser({
      email: addEmail,
      nickname: addNickname || addEmail.split('@')[0],
      role: addRole,
      membershipTier: addTier,
      creditsBalance: Number(addCredits) || 0,
      dailyQuotaLimit: Number(addQuota) || 5,
      status: 'active',
    });
    setAddEmail(''); setAddNickname(''); setAddRole('user'); setAddTier('free'); setAddCredits('10'); setAddQuota('5');
    setShowAddForm(false);
    toast.success('用户已添加');
  };

  const startEdit = (user: ManagedUser) => {
    setEditingUser(user);
    setEditRole(user.role); setEditTier(user.membershipTier);
    setEditEmail(user.email || '');
    setEditCredits(String(user.creditsBalance)); setEditQuota(String(user.dailyQuotaLimit));
    setEditStatus(user.status);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    // Save to localStorage (admin-store)
    updateUser(editingUser.id, {
      role: editRole,
      membershipTier: editTier,
      creditsBalance: Number(editCredits) || 0,
      dailyQuotaLimit: Number(editQuota) || 5,
      status: editStatus,
    });
    // Also save to Supabase if using real data
    if (useRealData) {
      try {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: editingUser.id,
            email: editEmail || undefined,
            role: editRole,
            membershipTier: editTier,
            creditsBalance: Number(editCredits) || 0,
            dailyQuotaLimit: Number(editQuota) || 5,
            status: editStatus,
          }),
        });
        if (res.ok) {
          // Refresh user list from Supabase to reflect changes
          await fetchRealUsers();
        }
      } catch { /* non-critical */ }
    }
    setEditingUser(null);
    toast.success('用户信息已更新');
  };

  const startRecharge = (user: ManagedUser) => {
    setRechargeUser(user);
    setRechargeAmount('');
    setRechargeReason('管理员手动充值');
    setRechargeMode('add');
  };

  const handleRecharge = async () => {
    if (!rechargeUser) return;
    const amount = Number(rechargeAmount);
    if (!amount || amount <= 0) { toast.error('请输入有效的积分数量'); return; }
    if (rechargeMode === 'add') {
      adjustUserCredits({
        userId: rechargeUser.id,
        type: 'topup',
        amount,
        reason: rechargeReason || '管理员手动充值',
      });
      // Also update Supabase
      if (useRealData) {
        try {
          const res = await fetch('/api/admin/users', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: rechargeUser.id,
              creditsBalance: (rechargeUser.creditsBalance || 0) + amount,
            }),
          });
          if (res.ok) await fetchRealUsers();
        } catch { /* non-critical */ }
      }
      toast.success(`已为 ${rechargeUser.nickname} 充值 ${amount} 积分`);
    } else {
      setUserCredits({
        userId: rechargeUser.id,
        balance: amount,
        reason: rechargeReason || '管理员设置积分',
      });
      // Also update Supabase
      if (useRealData) {
        try {
          const res = await fetch('/api/admin/users', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: rechargeUser.id,
              creditsBalance: amount,
            }),
          });
          if (res.ok) await fetchRealUsers();
        } catch { /* non-critical */ }
      }
      toast.success(`已将 ${rechargeUser.nickname} 的积分设置为 ${amount}`);
    }
    setRechargeUser(null);
  };

  const handleQuickRecharge = async (user: ManagedUser, amount: number) => {
    adjustUserCredits({
      userId: user.id,
      type: 'topup',
      amount,
      reason: '管理员快捷充值',
    });
    // Also update Supabase
    if (useRealData) {
      try {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            creditsBalance: (user.creditsBalance || 0) + amount,
          }),
        });
        if (res.ok) await fetchRealUsers();
      } catch { /* non-critical */ }
    }
    toast.success(`已为 ${user.nickname} 充值 ${amount} 积分`);
  };

  const handleTierChange = async (user: ManagedUser, tier: ManagedUser['membershipTier']) => {
    const plan = config.membershipPlans.find(p => p.tier === tier);
    updateUser(user.id, {
      membershipTier: tier,
      dailyQuotaLimit: plan?.dailyQuota ?? user.dailyQuotaLimit,
    });
    // Also update Supabase
    if (useRealData) {
      try {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            membershipTier: tier,
            dailyQuotaLimit: plan?.dailyQuota ?? user.dailyQuotaLimit,
          }),
        });
        if (res.ok) await fetchRealUsers();
      } catch { /* non-critical */ }
    }
    toast.success(`已将 ${user.nickname} 的会员等级调整为 ${plan?.name ?? tier}`);
  };

  const handleResetPassword = async () => {
    if (!resetPwUser || !newPassword) {
      toast.error('请输入新密码');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('密码至少6位');
      return;
    }
    setResetPwLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: resetPwUser.id,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '重置失败');
      toast.success(`已重置 ${resetPwUser.nickname} 的密码`);
      setResetPwUser(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重置密码失败');
    } finally {
      setResetPwLoading(false);
    }
  };

  const roleLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    admin: { label: '管理员', variant: 'default' },
    enterprise_admin: { label: '企业管理员', variant: 'default' },
    vip: { label: 'VIP', variant: 'secondary' },
    user: { label: '普通', variant: 'outline' },
  };

  const tierLabels: Record<string, string> = { free: '免费版', basic: '基础版', pro: '专业版', enterprise: '企业版' };

  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: '正常', color: 'text-primary' },
    suspended: { label: '暂停', color: 'text-yellow-500' },
    banned: { label: '封禁', color: 'text-destructive' },
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">用户管理</CardTitle>
              <CardDescription>查看、编辑用户角色与权限资源</CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4" />添加用户
            </Button>
          </div>
        </CardHeader>
        <CardContent>
            {loadingRealUsers ? (
              <div className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                <p>加载用户数据...</p>
              </div>
            ) : (
          <div className="space-y-3">
            {displayUsers.map(user => {
              const rl = roleLabels[user.role] || roleLabels.user;
              const sl = statusLabels[user.status] || statusLabels.active;
              return (
                <div key={user.id} className="p-4 rounded-lg border border-border space-y-3">
                  {/* Row 1: user info + actions */}
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                      {user.nickname[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{user.nickname}</span>
                        <Badge variant={rl.variant}>{rl.label}</Badge>
                        <span className={`text-xs ${sl.color}`}>{sl.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        <span>{user.email}</span>
                        <span className="flex items-center gap-1"><Coins className="h-3 w-3" />{user.creditsBalance} 积分</span>
                        <span>日配额 {user.dailyQuotaUsed}/{user.dailyQuotaLimit}</span>
                        <span>{user.createdAt}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => startRecharge(user)}>
                        <Coins className="h-3.5 w-3.5" />充值
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(user)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      {user.role !== 'admin' && (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { removeUser(user.id); toast.success('已删除'); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Row 2: quick actions */}
                  <div className="flex items-center gap-2 pl-14 flex-wrap">
                    <span className="text-xs text-muted-foreground mr-1">快捷充值:</span>
                    {[50, 100, 200, 500].map(n => (
                      <Button key={n} variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => handleQuickRecharge(user, n)}>
                        +{n}
                      </Button>
                    ))}
                    <span className="text-xs text-muted-foreground ml-3 mr-1">会员等级:</span>
                    {config.membershipPlans.map(plan => (
                      <Button
                        key={plan.tier}
                        variant={user.membershipTier === plan.tier ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => handleTierChange(user, plan.tier)}
                      >
                        {plan.name}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
            )}
        </CardContent>
      </Card>

      {/* Add User Form */}
      {showAddForm && (
        <Card>
          <CardHeader><CardTitle className="text-lg">添加用户</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input placeholder="user@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>昵称</Label>
                <Input placeholder="用户昵称" value={addNickname} onChange={e => setAddNickname(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>角色</Label>
                <Select value={addRole} onValueChange={v => setAddRole(v as ManagedUser['role'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">普通用户</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>会员等级</Label>
                <Select value={addTier} onValueChange={v => setAddTier(v as ManagedUser['membershipTier'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">免费版</SelectItem>
                    <SelectItem value="basic">基础版</SelectItem>
                    <SelectItem value="pro">专业版</SelectItem>
                    <SelectItem value="enterprise">企业版</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>初始积分</Label>
                <Input type="number" value={addCredits} onChange={e => setAddCredits(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>每日配额</Label>
                <Input type="number" value={addQuota} onChange={e => setAddQuota(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>取消</Button>
              <Button className="gap-1.5" onClick={handleAddUser}><Save className="h-4 w-4" />添加</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reset Password Form */}
      {resetPwUser && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  重置密码 - {resetPwUser.nickname}
                </CardTitle>
                <CardDescription>{resetPwUser.email}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setResetPwUser(null); setNewPassword(''); }}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>新密码</Label>
              <Input
                type="text"
                placeholder="输入新密码（至少6位）"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">重置后请通知用户使用新密码登录</p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => { setResetPwUser(null); setNewPassword(''); }}>取消</Button>
              <Button className="gap-1.5" onClick={handleResetPassword} disabled={resetPwLoading || newPassword.length < 6}>
                <KeyRound className="h-4 w-4" />
                {resetPwLoading ? '重置中...' : '确认重置'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit User Form */}
      {editingUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">编辑用户: {editingUser.nickname}</CardTitle>
            <CardDescription>{editingUser.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input
                  type="email"
                  placeholder="用户邮箱"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>角色</Label>
                <Select value={editRole} onValueChange={v => setEditRole(v as ManagedUser['role'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">普通用户</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>会员等级</Label>
                <Select value={editTier} onValueChange={v => setEditTier(v as ManagedUser['membershipTier'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">免费版</SelectItem>
                    <SelectItem value="basic">基础版</SelectItem>
                    <SelectItem value="pro">专业版</SelectItem>
                    <SelectItem value="enterprise">企业版</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={editStatus} onValueChange={v => setEditStatus(v as ManagedUser['status'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">正常</SelectItem>
                    <SelectItem value="suspended">暂停</SelectItem>
                    <SelectItem value="banned">封禁</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>积分余额</Label>
                <Input type="number" value={editCredits} onChange={e => setEditCredits(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>每日配额</Label>
                <Input type="number" value={editQuota} onChange={e => setEditQuota(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 justify-between">
              <Button
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => {
                  setResetPwUser(editingUser);
                  setNewPassword('');
                }}
              >
                <KeyRound className="h-4 w-4" />重置密码
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setEditingUser(null)}>取消</Button>
                <Button className="gap-1.5" onClick={handleSaveEdit}><Save className="h-4 w-4" />保存</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recharge Dialog */}
      {rechargeUser && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Coins className="h-5 w-5 text-primary" />
                  积分充值 - {rechargeUser.nickname}
                </CardTitle>
                <CardDescription>
                  当前积分: <span className="text-primary font-bold">{rechargeUser.creditsBalance}</span>
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRechargeUser(null)}>✕</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode switch */}
            <div className="flex gap-2">
              <Button
                variant={rechargeMode === 'add' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRechargeMode('add')}
              >
                增加积分
              </Button>
              <Button
                variant={rechargeMode === 'set' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRechargeMode('set')}
              >
                设置为指定值
              </Button>
            </div>

            {/* Quick amounts */}
            <div className="space-y-2">
              <Label>快捷选择</Label>
              <div className="flex gap-2 flex-wrap">
                {[50, 100, 200, 500, 1000, 2000].map(n => (
                  <Button
                    key={n}
                    variant={rechargeAmount === String(n) ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1"
                    onClick={() => setRechargeAmount(String(n))}
                  >
                    {rechargeMode === 'add' ? '+' : ''}{n} 积分
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom amount */}
            <div className="space-y-2">
              <Label>{rechargeMode === 'add' ? '充值数量' : '设置为'}</Label>
              <Input
                type="number"
                placeholder={rechargeMode === 'add' ? '输入要增加的积分数量' : '输入要设置的积分值'}
                value={rechargeAmount}
                onChange={e => setRechargeAmount(e.target.value)}
              />
              {rechargeAmount && Number(rechargeAmount) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {rechargeMode === 'add'
                    ? `充值后余额: ${rechargeUser.creditsBalance + Number(rechargeAmount)} 积分`
                    : `设置后余额: ${Number(rechargeAmount)} 积分`
                  }
                </p>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>备注原因</Label>
              <Input
                placeholder="管理员手动充值"
                value={rechargeReason}
                onChange={e => setRechargeReason(e.target.value)}
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setRechargeUser(null)}>取消</Button>
              <Button className="gap-1.5" onClick={handleRecharge}>
                <Coins className="h-4 w-4" />
                确认{rechargeMode === 'add' ? '充值' : '设置'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Credit Transactions */}
      {config.creditTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">积分变动记录</CardTitle>
            <CardDescription>最近的积分调整记录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {config.creditTransactions.slice(0, 20).map(tx => (
                <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0 text-sm">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    tx.amount > 0 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                  }`}>
                    {tx.amount > 0 ? '+' : '-'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{tx.userEmail}</span>
                      <span className={tx.amount > 0 ? 'text-primary' : 'text-destructive'}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount} 积分
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{tx.reason}</span>
                      <span>余额: {tx.balanceAfter}</span>
                      <span>{new Date(tx.createdAt).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Tab 3: Pricing & Credits
// ============================================================

function PricingTab() {
  const { config, updateMembershipPlan, addCreditPricing, updateCreditPricing, removeCreditPricing } = useAdminConfig();
  const [editingPricing, setEditingPricing] = useState<string | null>(null);
  const [editingFeatures, setEditingFeatures] = useState<string | null>(null);
  const [featureDrafts, setFeatureDrafts] = useState<Record<string, string[]>>({});

  const getFeatureDraft = (tier: string, features: string[]): string[] => {
    if (editingFeatures === tier && featureDrafts[tier]) return featureDrafts[tier];
    return features;
  };

  const startEditFeatures = (tier: string, features: string[]) => {
    setEditingFeatures(tier);
    setFeatureDrafts(prev => ({ ...prev, [tier]: [...features] }));
  };

  const saveFeatures = (tier: string) => {
    const drafts = featureDrafts[tier];
    if (drafts) {
      updateMembershipPlan(tier, { features: drafts.filter(f => f.trim()) });
    }
    setEditingFeatures(null);
  };

  const updateFeatureDraft = (tier: string, index: number, value: string) => {
    setFeatureDrafts(prev => ({
      ...prev,
      [tier]: prev[tier].map((f, i) => i === index ? value : f),
    }));
  };

  const addFeatureDraft = (tier: string) => {
    setFeatureDrafts(prev => ({
      ...prev,
      [tier]: [...(prev[tier] || []), ''],
    }));
  };

  const removeFeatureDraft = (tier: string, index: number) => {
    setFeatureDrafts(prev => ({
      ...prev,
      [tier]: prev[tier].filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Membership Plans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">会员等级定价</CardTitle>
          <CardDescription>设置各等级会员的月费、积分、配额和权益</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {config.membershipPlans.map(plan => (
              <Card key={plan.tier} className={plan.tier === 'pro' ? 'border-primary' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {plan.tier === 'pro' && <Badge>推荐</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-3xl font-bold">
                    ¥{plan.price}<span className="text-sm font-normal text-muted-foreground">/月</span>
                  </div>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-primary" />
                      <span>每月 {plan.credits} 积分</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span>每日 {plan.dailyQuota} 次</span>
                    </div>
                  </div>
                  {/* Features */}
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">权益列表</Label>
                      {editingFeatures === plan.tier ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => saveFeatures(plan.tier)}>
                            <Check className="h-3 w-3 mr-1" />保存
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingFeatures(null)}>
                            取消
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => startEditFeatures(plan.tier, plan.features)}>
                          <Pencil className="h-3 w-3 mr-1" />编辑
                        </Button>
                      )}
                    </div>
                    {editingFeatures === plan.tier ? (
                      <div className="space-y-1.5">
                        {getFeatureDraft(plan.tier, plan.features).map((f, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <Input
                              className="h-7 text-xs"
                              value={f}
                              onChange={e => updateFeatureDraft(plan.tier, i, e.target.value)}
                              placeholder="输入权益描述..."
                            />
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeFeatureDraft(plan.tier, i)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        <Button size="sm" variant="outline" className="h-7 w-full text-xs gap-1" onClick={() => addFeatureDraft(plan.tier)}>
                          <Plus className="h-3 w-3" />添加权益
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {plan.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Check className="h-3 w-3 text-primary shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">月费 (元)</Label>
                        <Input
                          type="number" size={1}
                          value={plan.price}
                          onChange={e => updateMembershipPlan(plan.tier, { price: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">月积分</Label>
                        <Input
                          type="number"
                          value={plan.credits}
                          onChange={e => updateMembershipPlan(plan.tier, { credits: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">每日配额</Label>
                      <Input
                        type="number"
                        value={plan.dailyQuota}
                        onChange={e => updateMembershipPlan(plan.tier, { dailyQuota: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Credit Packages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">积分充值包</CardTitle>
              <CardDescription>设置可购买的积分包价格</CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => {
              addCreditPricing({ name: '新积分包', credits: 100, price: 9.9, bonusCredits: 0, isPopular: false });
              toast.success('已添加');
            }}>
              <Plus className="h-4 w-4" />添加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {config.creditPricings.map(cp => (
              <div key={cp.id} className="flex items-center gap-4 p-4 rounded-lg border border-border">
                {editingPricing === cp.id ? (
                  <>
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      <Input value={cp.name} onChange={e => updateCreditPricing(cp.id, { name: e.target.value })} placeholder="名称" />
                      <Input type="number" value={cp.credits} onChange={e => updateCreditPricing(cp.id, { credits: Number(e.target.value) })} placeholder="积分" />
                      <Input type="number" value={cp.price} onChange={e => updateCreditPricing(cp.id, { price: Number(e.target.value) })} placeholder="价格" />
                      <Input type="number" value={cp.bonusCredits} onChange={e => updateCreditPricing(cp.id, { bonusCredits: Number(e.target.value) })} placeholder="赠送" />
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPricing(null)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Gift className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cp.name}</span>
                        {cp.isPopular && <Badge className="text-xs">热门</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {cp.credits} 积分 · ¥{cp.price}
                        {cp.bonusCredits > 0 && ` · 赠送 ${cp.bonusCredits}`}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPricing(cp.id)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { removeCreditPricing(cp.id); toast.success('已删除'); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab 4: Order Management
// ============================================================

function OrderManagementTab() {
  const [orders, setOrders] = useState<Array<{
    id: string; order_no: string; product_name: string; amount: number;
    status: string; type: string; user_id: string; user_email: string;
    created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, updates: { status: newStatus } }),
      });
      if (res.ok) {
        toast.success('状态已更新');
        fetchOrders();
      } else {
        toast.error('更新失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  const filteredOrders = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款' };
    return map[s] || s;
  };
  const statusVariant = (s: string): 'default' | 'outline' | 'destructive' | 'secondary' => {
    const map: Record<string, 'default' | 'outline' | 'destructive' | 'secondary'> = { paid: 'default', pending: 'outline', cancelled: 'destructive', refunded: 'secondary' };
    return map[s] || 'outline';
  };

  const formatTime = (iso: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><Receipt className="h-5 w-5" />订单管理</CardTitle>
            <CardDescription>查看和管理所有订单</CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="pending">待支付</SelectItem>
              <SelectItem value="paid">已支付</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
              <SelectItem value="refunded">已退款</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
            <p>加载中...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>暂无订单</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between p-4 rounded-lg border border-border/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{order.product_name || '订单'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {order.order_no || order.id?.slice(0, 8)} | {formatTime(order.created_at)}
                    {order.user_email && <span> | {order.user_email}</span>}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="font-semibold">¥{(order.amount || 0).toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-1 justify-end">
                    <Badge variant={statusVariant(order.status)}>{statusLabel(order.status)}</Badge>
                    {order.status === 'pending' && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => updateStatus(order.id, 'paid')}>确认支付</Button>
                    )}
                    {order.status === 'paid' && (
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => updateStatus(order.id, 'refunded')}>退款</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Tab 5: Payment Settings
// ============================================================

function PaymentTab() {
  const { config, togglePaymentMethod, updatePaymentMethod } = useAdminConfig();
  const [editingId, setEditingId] = useState<string | null>(null);
  // Local editing state for the currently active payment method config
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});

  const paymentIcons: Record<string, string> = {
    alipay: '支付宝',
    wechat: '微信支付',
    stripe: 'Stripe',
    manual: '手动转账',
  };

  const startEdit = (pm: typeof config.paymentMethods[0]) => {
    setEditingId(pm.id);
    setEditConfig({ ...pm.config });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updatePaymentMethod(editingId, { config: { ...editConfig } });
    toast.success('配置已保存');
    setEditingId(null);
    setEditConfig({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditConfig({});
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">支付方式</CardTitle>
          <CardDescription>启用和配置可用的支付渠道</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.paymentMethods.map(pm => (
            <div key={pm.id} className="flex items-center gap-4 p-4 rounded-lg border border-border">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${pm.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{pm.name}</span>
                  <Badge variant={pm.isActive ? 'default' : 'secondary'}>
                    {pm.isActive ? '已启用' : '未启用'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{paymentIcons[pm.type] || pm.type}</p>
              </div>
              <Switch checked={pm.isActive} onCheckedChange={() => togglePaymentMethod(pm.id)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payment Config Details (when enabled) */}
      {config.paymentMethods.filter(pm => pm.isActive).map(pm => {
        const isEditing = editingId === pm.id;
        const currentConfig = isEditing ? editConfig : pm.config;

        return (
          <Card key={`config-${pm.id}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{pm.name} 配置</CardTitle>
                  <CardDescription>填写支付渠道的商户信息</CardDescription>
                </div>
                {!isEditing && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => startEdit(pm)}>
                    <Settings className="h-3.5 w-3.5" />
                    配置
                  </Button>
                )}
              </div>
            </CardHeader>
            {isEditing ? (
              <CardContent className="space-y-4">
                {pm.type === 'alipay' && (
                  <>
                    <div className="space-y-2">
                      <Label>应用ID (App ID)</Label>
                      <Input
                        placeholder="2021xxx"
                        value={currentConfig.appId || ''}
                        onChange={e => setEditConfig(prev => ({ ...prev, appId: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>商户私钥</Label>
                      <Input
                        type="password"
                        placeholder="MIIEvQ..."
                        value={currentConfig.privateKey || ''}
                        onChange={e => setEditConfig(prev => ({ ...prev, privateKey: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>支付宝公钥</Label>
                      <Input
                        type="password"
                        placeholder="MIIBIjAN..."
                        value={currentConfig.alipayPublicKey || ''}
                        onChange={e => setEditConfig(prev => ({ ...prev, alipayPublicKey: e.target.value }))}
                      />
                    </div>
                  </>
                )}
                {pm.type === 'wechat' && (
                  <>
                    <div className="space-y-2">
                      <Label>商户号 (Mch ID)</Label>
                      <Input
                        placeholder="16xxxx"
                        value={currentConfig.mchId || ''}
                        onChange={e => setEditConfig(prev => ({ ...prev, mchId: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>API 密钥</Label>
                      <Input
                        type="password"
                        placeholder="32位密钥"
                        value={currentConfig.apiKey || ''}
                        onChange={e => setEditConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                      />
                    </div>
                  </>
                )}
                {pm.type === 'manual' && (
                  <div className="space-y-2">
                    <Label>转账说明</Label>
                    <Textarea
                      placeholder="请将款项转入以下账户：&#10;开户行：xxx银行&#10;账号：6222xxxx&#10;户名：xxx公司"
                      value={currentConfig.instructions || ''}
                      onChange={e => setEditConfig(prev => ({ ...prev, instructions: e.target.value }))}
                    />
                  </div>
                )}
                {pm.type === 'stripe' && (
                  <>
                    <div className="space-y-2">
                      <Label>Publishable Key</Label>
                      <Input
                        placeholder="pk_live_..."
                        value={currentConfig.publishableKey || ''}
                        onChange={e => setEditConfig(prev => ({ ...prev, publishableKey: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Secret Key</Label>
                      <Input
                        type="password"
                        placeholder="sk_live_..."
                        value={currentConfig.secretKey || ''}
                        onChange={e => setEditConfig(prev => ({ ...prev, secretKey: e.target.value }))}
                      />
                    </div>
                  </>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" className="gap-1.5" onClick={saveEdit}>
                    <Save className="h-3.5 w-3.5" />
                    保存
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    取消
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent>
                {Object.keys(pm.config).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">尚未配置，点击右上角「配置」按钮开始</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(pm.config).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground min-w-[120px]">{key}</span>
                        <span className="font-mono text-xs">
                          {key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('private')
                            ? '••••••••'
                            : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Warning */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">安全提示</p>
            <p className="text-xs text-muted-foreground mt-1">
              支付密钥信息当前存储在浏览器本地，仅供演示使用。生产环境请通过后端环境变量或加密数据库存储密钥，切勿在前端暴露。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab 5: Announcement Management
// ============================================================

interface ServerAnnouncement {
  id: string;
  title: string;
  content: string;
  start_date: string;
  end_date: string;
  enabled: boolean;
  created_at: string;
}

function AnnouncementTab() {
  const [announcements, setAnnouncements] = useState<ServerAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [now, setNow] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNow(Date.now()); }, []);

  // Fetch announcements from server API
  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch('/api/announcements');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data || []);
      }
    } catch (err) {
      console.error('[AnnouncementTab] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormStartDate('');
    setFormEndDate('');
    setFormEnabled(true);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (ann: ServerAnnouncement) => {
    setEditingId(ann.id);
    setFormTitle(ann.title);
    setFormContent(ann.content);
    setFormStartDate(ann.start_date.slice(0, 16));
    setFormEndDate(ann.end_date.slice(0, 16));
    setFormEnabled(ann.enabled);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('请填写公告标题和内容');
      return;
    }
    if (!formStartDate || !formEndDate) {
      toast.error('请设置有效期');
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: formTitle.trim(),
        content: formContent.trim(),
        startDate: new Date(formStartDate).toISOString(),
        endDate: new Date(formEndDate).toISOString(),
        enabled: formEnabled,
      };

      let res: Response;
      if (editingId) {
        res = await fetch('/api/announcements', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...body }),
        });
      } else {
        res = await fetch('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        toast.success(editingId ? '公告已更新' : '公告已创建');
        resetForm();
        fetchAnnouncements();
      } else {
        const err = await res.json();
        toast.error(err.error || '操作失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/announcements?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('公告已删除');
        fetchAnnouncements();
      } else {
        toast.error('删除失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch('/api/announcements', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (res.ok) {
        fetchAnnouncements();
      }
    } catch {
      toast.error('操作失败');
    }
  };

  const isActive = (ann: ServerAnnouncement) => {
    if (!ann.enabled) return false;
    if (!now) return false;
    const end = new Date(ann.end_date);
    end.setHours(23, 59, 59, 999);
    return now >= new Date(ann.start_date).getTime() && now <= end.getTime();
  };

  const getStatusBadge = (ann: ServerAnnouncement) => {
    if (isActive(ann)) return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">生效中</Badge>;
    if (!ann.enabled) return <Badge variant="secondary">已禁用</Badge>;
    if (now && now < new Date(ann.start_date).getTime()) return <Badge variant="outline">待生效</Badge>;
    return <Badge variant="secondary">已过期</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          加载中...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                公告管理
              </CardTitle>
              <CardDescription>创建和管理首页弹窗公告，可设置有效期，所有访客可见</CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="h-3.5 w-3.5" />
              新建公告
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {announcements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无公告</p>
            </div>
          ) : (
            announcements.map(ann => (
              <div key={ann.id} className="flex items-start gap-4 p-4 rounded-lg border border-border">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isActive(ann) ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium truncate">{ann.title}</span>
                    {getStatusBadge(ann)}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{ann.content}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(ann.start_date).toLocaleDateString('zh-CN')} - {new Date(ann.end_date).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={ann.enabled}
                    onCheckedChange={(checked) => handleToggleEnabled(ann.id, checked)}
                  />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(ann)}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(ann.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? '编辑公告' : '新建公告'}</CardTitle>
            <CardDescription>设置公告标题、内容和有效期</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>公告标题</Label>
              <Input
                placeholder="例如：系统维护通知"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>公告内容</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={!previewMode ? 'default' : 'outline'}
                    className="h-7 text-xs px-2"
                    onClick={() => setPreviewMode(false)}
                  >
                    编辑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={previewMode ? 'default' : 'outline'}
                    className="h-7 text-xs px-2"
                    onClick={() => setPreviewMode(true)}
                  >
                    预览
                  </Button>
                </div>
              </div>
              {previewMode ? (
                <div className="announcement-markdown rounded-md border border-input bg-background p-3 min-h-[100px] max-h-[300px] overflow-y-auto">
                  {formContent ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{formContent}</ReactMarkdown>
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无内容，请先在编辑模式输入</p>
                  )}
                </div>
              ) : (
                <Textarea
                  placeholder="支持 Markdown 格式，例如：&#10;## 标题&#10;**加粗** *斜体* ~~删除线~~&#10;- 列表项&#10;[链接文字](URL)&#10;> 引用&#10;`行内代码` ```代码块```"
                  rows={8}
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                />
              )}
              <p className="text-xs text-muted-foreground">支持完整 Markdown 语法：标题、加粗、斜体、列表、链接、引用、代码块、表格等</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>开始时间</Label>
                <Input
                  type="datetime-local"
                  value={formStartDate}
                  onChange={e => setFormStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>结束时间</Label>
                <Input
                  type="datetime-local"
                  value={formEndDate}
                  onChange={e => setFormEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
              <Label>创建后立即启用</Label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                <Save className="h-3.5 w-3.5" />
                {saving ? '保存中...' : editingId ? '保存修改' : '创建公告'}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Tab 6: Settings
// ============================================================

function SettingsTab() {
  const { config: adminConfig, setShowBillingPlan } = useAdminConfig();
  const { config: siteConfig, saveSiteConfig } = useSiteConfig();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Local form state (not committed until save)
  const [formSiteName, setFormSiteName] = useState('');
  const [formTabTitle, setFormTabTitle] = useState('');
  const [formLogoBase64, setFormLogoBase64] = useState<string | null>(null);
  const [formFaviconBase64, setFormFaviconBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Sync site config to form when loaded
  useEffect(() => {
    if (!initialized) {
      setFormSiteName(siteConfig.siteName);
      setFormTabTitle(siteConfig.siteTabTitle);
      setInitialized(true);
    }
  }, [siteConfig, initialized]);

  const handleFileUpload = async (
    file: File,
    setter: (val: string | null) => void,
    maxSizeKB: number = 2048,
    targetSize: number = 64,
  ) => {
    if (file.size > maxSizeKB * 1024) {
      toast.error(`文件大小不能超过 ${maxSizeKB >= 1024 ? `${maxSizeKB / 1024}MB` : `${maxSizeKB}KB`}`);
      return;
    }

    // SVG: read as text data URL directly
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) setter(result);
      };
      reader.readAsDataURL(file);
      return;
    }

    // PNG/JPG: resize to target dimensions
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) { toast.error('浏览器不支持 Canvas'); return; }
      ctx.drawImage(bitmap, 0, 0, targetSize, targetSize);
      bitmap.close();
      setter(canvas.toDataURL('image/png'));
    } catch {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) setter(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSiteConfig({
        siteName: formSiteName,
        siteTabTitle: formTabTitle,
        logoBase64: formLogoBase64 || undefined,
        faviconBase64: formFaviconBase64 || undefined,
      });
      // Clear pending uploads after save
      setFormLogoBase64(null);
      setFormFaviconBase64(null);
      toast.success('网站配置已保存，所有访客将看到更新');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const currentLogoSrc = formLogoBase64 || siteConfig.logoUrl || '/logo.png';
  const currentFaviconSrc = formFaviconBase64 || siteConfig.faviconUrl || '/favicon.png';

  return (
    <div className="space-y-6">
      {/* Site Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            网站配置
          </CardTitle>
          <CardDescription>自定义网站名称、Logo 和浏览器标签页图标，保存后所有访客可见</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Site Name */}
          <div className="space-y-2">
            <Label>网站名称</Label>
            <p className="text-xs text-muted-foreground">显示在导航栏、首页标题等位置</p>
            <Input
              value={formSiteName}
              onChange={e => setFormSiteName(e.target.value)}
              placeholder="幻镜"
            />
          </div>

          {/* Browser Tab Title */}
          <div className="space-y-2">
            <Label>浏览器标签页标题</Label>
            <p className="text-xs text-muted-foreground">显示在浏览器标签页上的文字</p>
            <Input
              value={formTabTitle}
              onChange={e => setFormTabTitle(e.target.value)}
              placeholder="幻镜 - AI创作平台"
            />
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <Label>网站 Logo</Label>
            <p className="text-xs text-muted-foreground">
              支持 PNG / JPG / SVG 格式，建议尺寸 64×64px，正方形，最大 2MB
            </p>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                <img src={currentLogoSrc} alt="Logo" className="h-full w-full object-contain" />
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, setFormLogoBase64, 2048, 64);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  上传 Logo
                </Button>
              </div>
            </div>
          </div>

          {/* Favicon Upload */}
          <div className="space-y-2">
            <Label>浏览器标签页图标 (Favicon)</Label>
            <p className="text-xs text-muted-foreground">
              支持 PNG / JPG / SVG 格式，建议尺寸 32×32px 或 64×64px，正方形，最大 1MB
            </p>
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                <img src={currentFaviconSrc} alt="Favicon" className="h-full w-full object-contain" />
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, setFormFaviconBase64, 1024, 32);
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => faviconInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  上传图标
                </Button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? '保存中...' : '保存网站配置'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ToggleLeft className="h-5 w-5 text-primary" />
            功能开关
          </CardTitle>
          <CardDescription>控制前台页面的功能显示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-sm">首页计费方案</p>
                <p className="text-xs text-muted-foreground">在首页展示会员套餐与积分购买方案</p>
              </div>
            </div>
            <Switch
              checked={adminConfig.showBillingPlan}
              onCheckedChange={setShowBillingPlan}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Data Management Tab — Export / Import
// ============================================================

interface ImportTableResult {
  imported: number;
  skipped: number;
  errors: string[];
}

function DataManagementTab() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Record<string, ImportTableResult> | null>(null);
  const [skipAuth, setSkipAuth] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/admin/data-export');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '导出失败' }));
        throw new Error(errData.error || '导出失败');
      }
      const data = await res.json();

      // Create downloadable JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.href = url;
      link.download = `miaojing-backup-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`数据导出成功，共 ${Object.values(data._meta.counts as Record<string, number>).reduce((a: number, b: number) => a + b, 0)} 条记录`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.length) {
      toast.error('请选择要导入的备份文件');
      return;
    }

    const file = fileInput.files[0];
    if (file.size > 50 * 1024 * 1024) {
      toast.error('文件大小不能超过 50MB');
      return;
    }

    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('文件格式错误：无法解析 JSON');
      }

      const res = await fetch('/api/admin/data-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          options: { skipAuth },
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '导入失败');

      setImportResult(result.details || {});
      const totalImported = Object.values(result.details || {}).reduce(
        (sum: number, r: unknown) => sum + ((r as ImportTableResult).imported || 0), 0
      );
      toast.success(`数据导入完成，共导入 ${totalImported} 条记录`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            数据导出
          </CardTitle>
          <CardDescription>
            一键导出平台所有数据（用户、作品、订单、配置等），生成 JSON 备份文件
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium">导出内容包括：</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>用户资料 (profiles) + 认证账号 (auth_users)</li>
              <li>创作作品 (works) + 点赞记录 (work_likes)</li>
              <li>积分记录 (credit_transactions) + 订单 (orders)</li>
              <li>用户 API 密钥 (user_api_keys)</li>
              <li>公告 (announcements) + 网站配置 (site_config) + 访问统计 (site_stats)</li>
            </ul>
          </div>
          <Button onClick={handleExport} disabled={exporting} className="gap-1.5">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? '导出中...' : '导出全部数据'}
          </Button>
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            数据导入
          </CardTitle>
          <CardDescription>
            从备份文件恢复数据到当前平台，或迁移到新平台。支持 upsert 模式（已存在的记录更新，不存在则创建）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm font-medium">注意事项</p>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6">
              <li>导入将合并数据，不会删除已有记录（upsert 模式）</li>
              <li>新平台的数据库需先运行初始化脚本 (init-database.sql)</li>
              <li>认证账号会自动创建，密码为随机临时密码，用户需通过管理员重置</li>
              <li>如新平台已有相同邮箱的用户，将更新其信息而非重复创建</li>
              <li>大型数据集导入可能需要较长时间，请耐心等待</li>
            </ul>
          </div>

          {/* File input */}
          <div className="space-y-2">
            <Label>选择备份文件</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-medium
                file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20
                file:cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">仅支持 .json 格式，文件大小不超过 50MB</p>
          </div>

          {/* Options */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
            <Switch
              id="skip-auth"
              checked={skipAuth}
              onCheckedChange={setSkipAuth}
            />
            <div>
              <Label htmlFor="skip-auth" className="cursor-pointer">跳过认证账号导入</Label>
              <p className="text-xs text-muted-foreground">仅导入 profiles 数据，不创建 auth 账号（用户需自行注册后关联）</p>
            </div>
          </div>

          <Button onClick={handleImport} disabled={importing} className="gap-1.5">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {importing ? '导入中...' : '开始导入'}
          </Button>

          {/* Import Result */}
          {importResult && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <p className="text-sm font-medium">导入结果</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(importResult).map(([table, r]) => (
                  <div key={table} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                    <span className="text-muted-foreground">{table}</span>
                    <span className="font-medium">
                      {r.imported > 0 && <span className="text-emerald-600">{r.imported} 导入</span>}
                      {r.skipped > 0 && <span className="text-amber-600 ml-2">{r.skipped} 跳过</span>}
                      {r.imported === 0 && r.skipped === 0 && <span className="text-muted-foreground">无数据</span>}
                    </span>
                  </div>
                ))}
              </div>
              {/* Show errors if any */}
              {Object.entries(importResult).some(([, r]) => r.errors.length > 0) && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-600">部分记录导入失败：</p>
                  <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-0.5">
                    {Object.entries(importResult).map(([table, r]) =>
                      r.errors.map((err, i) => (
                        <div key={`${table}-${i}`} className="flex gap-1">
                          <AlertCircle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                          <span>{err}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Admin Stats Bar
// ============================================================
function AdminStatsBar() {
  const [stats, setStats] = useState<{
    totalVisits: number;
    totalUsers: number;
    totalWorks: number;
  }>({ totalVisits: 0, totalUsers: 0, totalWorks: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [visitsRes, usersRes, worksRes] = await Promise.all([
          fetch('/api/site-stats'),
          fetch('/api/admin/users'),
          fetch('/api/gallery?limit=0'),
        ]);

        const visitsData = await visitsRes.json().catch(() => ({ totalVisits: 0 }));
        const usersData = await usersRes.json().catch(() => ({ total: 0 }));
        const worksData = await worksRes.json().catch(() => ({ total: 0 }));

        setStats({
          totalVisits: visitsData.totalVisits || 0,
          totalUsers: usersData.total || usersData.users?.length || 0,
          totalWorks: worksData.total || 0,
        });
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const items = [
    { label: '总访问量', value: stats.totalVisits, icon: EyeIcon, color: 'text-blue-500' },
    { label: '注册用户', value: stats.totalUsers, icon: Users, color: 'text-emerald-500' },
    { label: '公开作品', value: stats.totalWorks, icon: BarChart3, color: 'text-amber-500' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${item.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-2xl font-bold">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : item.value.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
