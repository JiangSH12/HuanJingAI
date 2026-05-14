import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AnnouncementPopup } from '@/components/announcement-popup';
import { BillingPlanGuard } from '@/components/billing-plan-guard';
import { SiteName } from '@/components/site-brand';
import {
  Brush,
  ImagePlus,
  Video,
  Film,
  ArrowRight,
  Zap,
  Shield,
  Coins,
  Layers,
  Check,
  Sparkles,
} from 'lucide-react';

const features = [
  {
    icon: Brush,
    title: '文生图',
    desc: '用文字描述你的想象，AI即刻生成精美画作',
    href: '/create?type=text2img',
  },
  {
    icon: ImagePlus,
    title: '图生图',
    desc: '上传参考图片，AI进行风格迁移与创意延展',
    href: '/create?type=img2img',
  },
  {
    icon: Video,
    title: '文生视频',
    desc: '输入场景描述，AI生成流畅的动态视频',
    href: '/create?type=text2video',
  },
  {
    icon: Film,
    title: '图生视频',
    desc: '将静态图片转化为动态视频，照片动画化',
    href: '/create?type=img2video',
  },
];

const highlights = [
  { icon: Zap, title: '极速创作', desc: '数秒出图，分钟出视频' },
  { icon: Shield, title: '数据安全', desc: '企业级安全标准' },
  { icon: Coins, title: '灵活计费', desc: '积分制+订阅制双模式' },
  { icon: Layers, title: '多模型支持', desc: '支持自备API，灵活切换' },
];

const pricing = [
  {
    tier: '免费版',
    price: '0',
    desc: '体验核心创作能力',
    features: ['每日5次创作额度', '标准画质输出', '社区作品展示', '基础参数调整'],
    cta: '免费开始',
    popular: false,
  },
  {
    tier: '基础版',
    price: '29',
    desc: '适合轻度创作者',
    features: ['每日50次创作额度', '高清画质输出', '私有作品存储', '全部参数解锁', '作品批量下载'],
    cta: '立即订阅',
    popular: false,
  },
  {
    tier: '专业版',
    price: '99',
    desc: '适合专业创作者与团队',
    features: ['无限创作额度', '4K超清输出', '自定义API接入', '批量处理能力', '优先处理队列', '高级风格预设'],
    cta: '升级专业版',
    popular: true,
  },
  {
    tier: '企业版',
    price: '499',
    desc: '适合企业与大型团队',
    features: ['无限创作+团队协作', '专属API额度', '品牌风格定制', '私有化部署选项', '7x24技术支持', '商业版权保障'],
    cta: '联系销售',
    popular: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <AnnouncementPopup />

      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center min-h-[85vh] px-4">
        <div className="text-center">
          <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight text-foreground">
            幻镜<span className="font-normal">AIGC</span>
          </h1>

          <p className="mt-8 mx-auto max-w-lg text-base text-muted-foreground leading-relaxed font-light">
            用AI释放你的创造力，从想象到作品只需一步
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/create">
              <Button
                size="lg"
                variant="outline"
                className="gap-2 px-6 text-sm h-11 rounded-full border-border hover:bg-foreground hover:text-background transition-all duration-300"
              >
                <Brush className="h-4 w-4" />
                开始创作
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href="/gallery">
              <Button
                size="lg"
                variant="ghost"
                className="gap-2 px-6 text-sm h-11 rounded-full text-muted-foreground hover:text-foreground"
              >
                浏览作品
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-12 sm:gap-16 max-w-2xl mx-auto">
          {[
            { value: '4', label: '创作模式' },
            { value: '10s', label: '平均出图' },
            { value: '100+', label: '风格预设' },
            { value: '99.9%', label: '可用性' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-light text-foreground">{stat.value}</div>
              <div className="mt-1 text-xs text-muted-foreground font-light">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Core Features */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-serif text-2xl sm:text-3xl font-light text-foreground">创作能力</h2>
            <p className="mt-3 text-sm text-muted-foreground font-light">四大核心模式，覆盖你的创作需求</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <Link key={feat.title} href={feat.href}>
                  <div className="group p-6 rounded-xl border border-border/60 bg-card hover:border-foreground/20 hover:shadow-sm transition-all duration-300 cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className="p-2.5 rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-foreground/70" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-medium text-foreground group-hover:text-foreground transition-colors">
                          {feat.title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                          {feat.desc}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-20 bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="font-serif text-2xl sm:text-3xl font-light text-foreground">为什么选择幻镜</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="text-center">
                  <div className="inline-flex p-3 rounded-xl bg-card border border-border/60 mb-4">
                    <Icon className="h-5 w-5 text-foreground/60" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <BillingPlanGuard>
        <section className="py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-12">
              <h2 className="font-serif text-2xl sm:text-3xl font-light text-foreground">计费方案</h2>
              <p className="mt-3 text-sm text-muted-foreground font-light">按需选择，灵活付费</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {pricing.map((plan) => (
                <div
                  key={plan.tier}
                  className={`relative p-6 rounded-xl border ${
                    plan.popular
                      ? 'border-foreground/20 bg-card'
                      : 'border-border/60 bg-card/50'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-0.5 text-xs bg-foreground text-background rounded-full">
                        推荐
                      </span>
                    </div>
                  )}
                  <h3 className="text-sm font-medium text-foreground">{plan.tier}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-light">¥{plan.price}</span>
                    <span className="text-xs text-muted-foreground">/月</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.desc}</p>
                  <ul className="mt-5 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <Check className="h-3.5 w-3.5 text-foreground/50 mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/auth/register" className="mt-5 block">
                    <Button
                      className="w-full rounded-full text-xs h-9"
                      variant={plan.popular ? 'default' : 'outline'}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </BillingPlanGuard>

      {/* CTA */}
      <section className="py-20 bg-muted/30">
        <div className="mx-auto max-w-xl px-4 sm:px-6 text-center">
          <h2 className="font-serif text-2xl font-light text-foreground">开始创作</h2>
          <p className="mt-3 text-sm text-muted-foreground font-light">
            加入创作者社区，用AI开启你的创作之旅
          </p>
          <div className="mt-6">
            <Link href="/create">
              <Button
                size="lg"
                variant="outline"
                className="gap-2 px-8 h-11 rounded-full text-sm border-foreground/20 hover:bg-foreground hover:text-background transition-all duration-300"
              >
                <Sparkles className="h-4 w-4" />
                免费开始创作
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm font-medium text-foreground"><SiteName /></span>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <span className="hover:text-foreground cursor-pointer transition-colors">关于</span>
              <span className="hover:text-foreground cursor-pointer transition-colors">条款</span>
              <span className="hover:text-foreground cursor-pointer transition-colors">隐私</span>
              <span className="hover:text-foreground cursor-pointer transition-colors">帮助</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
