'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Brush, Mail, Lock, User, Phone, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { addCreditRecord } from '@/lib/credit-records-store';

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');

  const handleRegister = async () => {
    if (!email || !password) {
      toast.error('请填写邮箱和密码');
      return;
    }
    if (password.length < 6) {
      toast.error('密码至少6位');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '注册失败');
      toast.success('注册成功，赠送10积分体验金');
      addCreditRecord({ type: 'gift', amount: 10, balanceAfter: 10, description: '新用户注册奖励' });
      router.push('/create');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Brush className="h-5 w-5" />
            </div>
            <span className="font-serif text-2xl font-bold">幻镜</span>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">创建账号</CardTitle>
            <CardDescription>注册即可获得10积分体验金</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱 *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">昵称</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="nickname" placeholder="你的昵称" value={nickname} onChange={(e) => setNickname(e.target.value)} className="pl-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">手机号</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="phone" type="tel" placeholder="13800138000" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-10" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码 *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="至少6位" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 pr-10" />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full h-11" onClick={handleRegister} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              注册
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              已有账号？ <Link href="/auth/login" className="text-primary hover:underline">去登录</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
