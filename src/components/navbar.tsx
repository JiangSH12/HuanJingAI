'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-store';
import { useSiteConfig } from '@/lib/site-config';
import {
  Brush,
  LayoutGrid,
  User,
  Menu,
  X,
  LogIn,
  Sparkles,
  LogOut,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/', label: '首页', icon: Sparkles },
  { href: '/create', label: '创作', icon: Brush },
  { href: '/gallery', label: '画廊', icon: LayoutGrid },
  { href: '/profile', label: '我的', icon: User },
];

const adminNavItem = { href: '/admin', label: '管理', icon: Shield };

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, user, logout, isAdmin, refreshProfile } = useAuth();
  const { config: siteConfig, loaded: siteLoaded } = useSiteConfig();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Wait for client-side hydration before rendering auth-dependent UI
  useEffect(() => {
    setMounted(true);
  }, []);

  // Refresh profile on mount to pick up admin changes (membership, credits, etc.)
  useEffect(() => {
    if (isLoggedIn) {
      refreshProfile();
    }
  }, [isLoggedIn, refreshProfile]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="font-serif text-lg font-medium tracking-wide text-foreground">
            {siteLoaded ? (siteConfig.siteName || '幻镜') : '幻镜'}
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                  isActive
                    ? 'text-foreground bg-muted'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
          {mounted && isAdmin && (
            <Link
              href={adminNavItem.href}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                pathname === adminNavItem.href || pathname.startsWith(adminNavItem.href)
                  ? 'text-foreground bg-muted'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              {adminNavItem.label}
            </Link>
          )}
        </nav>

        {/* Right Actions */}
        <div className="hidden md:flex items-center gap-2">
          {!mounted ? (
            <div className="h-8 w-32" />
          ) : isLoggedIn && user ? (
            <>
              <Link href="/profile">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8 rounded-full">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-foreground text-xs font-medium">
                    {user.nickname.charAt(0).toUpperCase()}
                  </div>
                  {user.nickname}
                </Button>
              </Link>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-muted-foreground" onClick={handleLogout}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost" size="sm" className="text-xs h-8 rounded-full text-muted-foreground">
                  登录
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button size="sm" className="text-xs h-8 rounded-full gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  开始
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl">
          <nav className="flex flex-col p-4 gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'text-foreground bg-muted'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            {mounted && isAdmin && (
              <Link
                href={adminNavItem.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  pathname === adminNavItem.href
                    ? 'text-foreground bg-muted'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Shield className="h-4 w-4" />
                {adminNavItem.label}
              </Link>
            )}
            <div className="flex gap-2 mt-3 pt-3 border-t border-border/40">
              {!mounted ? (
                <div className="h-8 w-full" />
              ) : isLoggedIn && user ? (
                <>
                  <Link href="/profile" className="flex-1" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full rounded-full" size="sm">
                      {user.nickname}
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full text-muted-foreground"
                    onClick={() => { handleLogout(); setMobileOpen(false); }}
                  >
                    退出
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/auth/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full rounded-full" size="sm">登录</Button>
                  </Link>
                  <Link href="/auth/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full rounded-full" size="sm">开始</Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
