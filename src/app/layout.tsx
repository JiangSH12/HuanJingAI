import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { Navbar } from '@/components/navbar';
import { SiteConfigSync } from '@/components/site-config-sync';
import { VisitTracker } from '@/components/visit-tracker';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '幻境AIGC',
    template: '%s | 幻境AIGC',
  },
  description: '妙手丹青，境随心造 - 一站式AI多模态创作平台，提供文生图、图生图、文生视频、图生视频四大核心能力',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  keywords: [
    '幻境AIGC',
    'AI创作',
    '文生图',
    '图生图',
    '文生视频',
    '图生视频',
    'AI绘画',
    'AI视频',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.APP_ENV === 'DEV';

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {isDev && <Inspector />}
          <SiteConfigSync />
          <VisitTracker />
          <Navbar />
          <main>{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
