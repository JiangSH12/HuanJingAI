'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Brush, Mail, Lock, User, Phone, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, parseApiUser } from '@/lib/auth-store';

export default function AuthPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Login form
  const [loginAccount, setLoginAccount] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regNickname, setRegNickname] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regInviteCode, setRegInviteCode] = useState('');
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [showForgotPw, setShowForgotPw] = useState(false);

  // Auto-initialize default admin account on mount (fire-and-forget)
  useEffect(() => {
    fetch('/api/auth/admin-exists').catch(() => {/* silent */});
  }, []);

  const handleLogin = async () => {
    if (!loginAccount || !loginPassword) {
      toast.error('请填写账号和密码');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: loginAccount, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登录失败');

      // Save auth state with full profile
      const authUser = parseApiUser(data.user || {});
      login(authUser, data.session?.access_token || data.access_token || 'demo-token');

      toast.success('登录成功');
      router.push('/create');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regEmail || !regPassword) {
      toast.error('请填写邮箱和密码');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          nickname: regNickname,
          phone: regPhone,
          inviteCode: regInviteCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '注册失败');

      // Save auth state with full profile
      const authUser = parseApiUser(data.user || {});
      login(authUser, data.session?.access_token || data.access_token || 'demo-token');

      toast.success(data.message || '注册成功');
      router.push('/create');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="font-serif text-2xl font-light text-foreground">幻境AIGC</span>
          </Link>
          <p className="mt-2 text-xs text-muted-foreground font-light">AI 创作平台</p>
        </div>

        <Card className="border-border/40 shadow-none">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="pb-0">
              <TabsList className="grid w-full grid-cols-2 bg-muted rounded-full h-9">
                <TabsTrigger value="login" className="rounded-full text-xs">登录</TabsTrigger>
                <TabsTrigger value="register" className="rounded-full text-xs">注册</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent className="pt-6">
              <TabsContent value="login" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="login-account">邮箱 / 手机号 / 用户名</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-account"
                      type="text"
                      placeholder="邮箱、手机号或用户名"
                      value={loginAccount}
                      onChange={(e) => setLoginAccount(e.target.value)}
                      className="pl-10"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="输入密码"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 pr-10"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForgotPw(true)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    忘记密码?
                  </button>
                </div>
                <Button className="w-full h-10 rounded-full text-sm" onClick={handleLogin} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  登录
                </Button>
              </TabsContent>

              <TabsContent value="register" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="reg-email">邮箱</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="your@email.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-nickname">昵称</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-nickname"
                      placeholder="你的昵称"
                      value={regNickname}
                      onChange={(e) => setRegNickname(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-phone">手机号 (选填)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-phone"
                      type="tel"
                      placeholder="13800138000"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="至少6位密码"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="pl-10 pr-10"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRegister(); }}
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {/* Admin invite code */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="reg-invite" className="text-xs text-muted-foreground">邀请码 (选填)</Label>
                    <button
                      type="button"
                      onClick={() => setShowInviteCode(!showInviteCode)}
                      className="text-xs text-primary hover:underline"
                    >
                      {showInviteCode ? '隐藏' : '管理员注册?'}
                    </button>
                  </div>
                  {showInviteCode && (
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="reg-invite"
                        type="text"
                        placeholder="输入管理员邀请码"
                        value={regInviteCode}
                        onChange={(e) => setRegInviteCode(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  )}
                </div>
                <Button className="w-full h-10 rounded-full text-sm" onClick={handleRegister} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  注册
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  注册即表示同意服务条款和隐私政策
                </p>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        {/* Forgot Password Dialog */}
        <Dialog open={showForgotPw} onOpenChange={setShowForgotPw}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>忘记密码</DialogTitle>
              <DialogDescription>
                如需重置密码，请联系管理员
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/50 p-4 text-center space-y-2">
                <p className="text-sm text-muted-foreground">请发送邮件至</p>
                <a
                  href="mailto:work@fengoffer.cn"
                  className="text-lg font-medium text-primary hover:underline"
                >
                  work@fengoffer.cn
                </a>
                <p className="text-xs text-muted-foreground">说明您的注册邮箱，管理员将为您重置密码</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowForgotPw(false)}>我知道了</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
