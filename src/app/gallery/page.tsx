'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LayoutGrid,
  Heart,
  Download,
  Brush,
  ImagePlus,
  Video,
  Film,
  X,
  User,
  Clock,
  Cpu,
  Sparkles,
  Image as ImageIcon,
  MessageSquare,
  Copy,
  Maximize2,
  ArrowLeft,
} from 'lucide-react';
import { downloadFile } from '@/lib/utils';
import { usePublishedWorks, useCreationHistory, syncPublishedToSupabase, type PublishedWork } from '@/lib/creation-history-store';
import { useAuth } from '@/lib/auth-store';
import { FullscreenPreview } from '@/components/fullscreen-preview';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'all', label: '全部', icon: LayoutGrid },
  { value: 'text2img', label: '文生图', icon: Brush },
  { value: 'img2img', label: '图生图', icon: ImagePlus },
  { value: 'text2video', label: '文生视频', icon: Video },
  { value: 'img2video', label: '图生视频', icon: Film },
];

/* ---------- Gallery Work (from API) ---------- */
interface GalleryWork {
  id: string;
  type: string;
  title?: string | null;
  prompt?: string | null;
  negativePrompt?: string | null;
  url: string;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  likes: number;
  creditsCost?: number | null;
  params: Record<string, unknown>;
  referenceImage?: string | null;
  publisherId: string;
  publisherNickname: string;
  publishedAt: string;
}

function getCategoryFromWork(work: GalleryWork): string {
  if (work.type === 'text2video' || work.type === 'img2video') {
    return work.type;
  }
  if (work.type === 'img2img') return work.type;
  // Fallback: infer from type + referenceImage
  if (work.type === 'video' || work.duration) {
    return work.referenceImage ? 'img2video' : 'text2video';
  }
  return work.referenceImage ? 'img2img' : 'text2img';
}

function getCategoryLabel(work: GalleryWork): string {
  const cat = CATEGORIES.find(c => c.value === getCategoryFromWork(work));
  return cat?.label ?? work.type;
}

function isVideoWork(work: GalleryWork): boolean {
  return work.type === 'video' || work.type === 'text2video' || work.type === 'img2video' || Boolean(work.duration);
}

function getPreviewUrl(work: GalleryWork): string | null {
  if (work.thumbnailUrl && !work.thumbnailUrl.startsWith('[')) {
    return work.thumbnailUrl;
  }
  if (!isVideoWork(work) && work.url && !work.url.startsWith('[')) {
    return work.url;
  }
  if (work.referenceImage && !work.referenceImage.startsWith('[')) {
    return work.referenceImage;
  }
  return null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function GalleryPage() {
  const [apiWorks, setApiWorks] = useState<GalleryWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [category, setCategory] = useState('all');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [selectedWork, setSelectedWork] = useState<GalleryWork | null>(null);
  const [fullscreenSrc, setFullscreenSrc] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');

  // ESC to close detail overlay
  useEffect(() => {
    if (!selectedWork) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedWork(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedWork]);

  // Prevent body scroll when detail is open
  useEffect(() => {
    if (selectedWork) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedWork]);
  const { works: localPublished } = usePublishedWorks();
  const { records: creationHistory } = useCreationHistory();
  const { user } = useAuth();

  // Fetch works from API, after syncing localStorage to Supabase
  const fetchWorks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery?sort=${sortBy}&limit=200`);
      if (res.ok) {
        const data = await res.json();
        setApiWorks(data.works || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [sortBy]);

  // Sync localStorage to Supabase on first mount only
  useEffect(() => {
    setSyncStatus('syncing');
    syncPublishedToSupabase().then(synced => {
      setSyncStatus('done');
      if (synced > 0) {
        // Re-fetch after sync to show newly synced works
        fetchWorks();
      }
    }).catch(() => {
      setSyncStatus('done');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchWorks();
  }, [fetchWorks]);

  // Merge API works with localStorage published works + published creation history
  // This ensures previously shared works are visible even if not yet in Supabase
  const works = useMemo(() => {
    const apiUrls = new Set(apiWorks.map(w => w.url));

    // From localStorage published gallery
    const localAsGallery: GalleryWork[] = localPublished
      .filter(w => !apiUrls.has(w.url))
      .map(w => ({
        id: w.id,
        type: w.type === 'video' ? (w.referenceImage ? 'img2video' : 'text2video') : (w.referenceImage ? 'img2img' : 'text2img'),
        prompt: w.prompt,
        negativePrompt: w.negativePrompt,
        url: w.url,
        thumbnailUrl: w.type === 'image' ? w.url : w.referenceImage || null,
        width: null,
        height: null,
        duration: null,
        likes: w.likes || 0,
        creditsCost: null,
        params: { model: w.model, modelLabel: w.modelLabel, ...w.params },
        referenceImage: w.referenceImage,
        publisherId: w.publisherId,
        publisherNickname: w.publisherNickname,
        publishedAt: w.publishedAt,
      }));

    // From creation history records marked as published
    const existingUrls = new Set([...apiUrls, ...localAsGallery.map(w => w.url)]);
    const historyPublished = creationHistory
      .filter(r => r.published && r.url && !existingUrls.has(r.url) && !r.url.startsWith('data:') && !r.url.startsWith('['))
      .map(r => ({
        id: r.id,
        type: r.type === 'video' ? (r.referenceImage ? 'img2video' : 'text2video') : (r.referenceImage ? 'img2img' : 'text2img'),
        prompt: r.prompt,
        negativePrompt: r.negativePrompt,
        url: r.url,
        thumbnailUrl: r.type === 'image' ? r.url : r.referenceImage || null,
        width: null,
        height: null,
        duration: null,
        likes: 0,
        creditsCost: null,
        params: { model: r.model, modelLabel: r.modelLabel, ...r.params },
        referenceImage: r.referenceImage,
        publisherId: user?.id || 'anonymous',
        publisherNickname: user?.nickname || user?.email?.split('@')[0] || '匿名用户',
        publishedAt: r.createdAt,
      }));

    return [...apiWorks, ...localAsGallery, ...historyPublished];
  }, [apiWorks, localPublished, creationHistory, user]);

  const filteredWorks = useMemo(() => {
    if (category === 'all') return works;
    return works.filter(w => getCategoryFromWork(w) === category);
  }, [works, category]);

  const toggleLike = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (likedIds.has(id)) return;
    setLikedIds(prev => new Set(prev).add(id));
  };

  const handleDownload = async (url: string, filename: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const result = await downloadFile(url, filename);
    if (!result.ok) {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl font-light text-foreground">作品画廊</h1>
            {syncStatus === 'syncing' && (
              <span className="text-xs text-muted-foreground animate-pulse">同步中...</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground font-light">探索社区创作，发现灵感之美</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    category === cat.value
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {cat.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('newest')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                sortBy === 'newest'
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              最新
            </button>
            <button
              onClick={() => setSortBy('popular')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                sortBy === 'popular'
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              热门
            </button>
          </div>
        </div>

        {/* Gallery Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Sparkles className="h-8 w-8 mb-3 animate-pulse opacity-20" />
            <p className="text-sm font-light">加载中...</p>
          </div>
        ) : filteredWorks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <LayoutGrid className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-light">暂无作品</p>
            <p className="text-xs mt-1 text-muted-foreground/70">创作并发布你的作品</p>
            <Button
              className="mt-4 rounded-full text-xs h-8"
              variant="outline"
              onClick={() => window.location.href = '/create'}
            >
              <Sparkles className="h-3 w-3 mr-1.5" />
              前往创作
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredWorks.map((work) => {
              const previewUrl = getPreviewUrl(work);
              const video = isVideoWork(work);

              return (
              <div
                key={work.id}
                className="group overflow-hidden rounded-xl border border-border/40 bg-card hover:border-foreground/10 hover:shadow-sm transition-all duration-300 cursor-pointer"
                onClick={() => setSelectedWork(work)}
              >
                <div className="relative aspect-square bg-muted">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={(work.prompt || '').slice(0, 30)}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onDoubleClick={(e) => { e.stopPropagation(); setFullscreenSrc(work.url); }}
                    />
                  ) : work.url && !work.url.startsWith('data:') && video ? (
                    <video
                      src={work.url}
                      muted
                      preload="metadata"
                      className="w-full h-full object-cover"
                      onDoubleClick={(e) => { e.stopPropagation(); setFullscreenSrc(work.url); }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-muted">
                      <Sparkles className="h-6 w-6 text-muted-foreground/15" />
                    </div>
                  )}
                  {video && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] bg-background/80 backdrop-blur-sm rounded-full text-foreground/70">
                      视频
                    </span>
                  )}
                  <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] bg-background/80 backdrop-blur-sm rounded-full text-foreground/70">
                    {getCategoryLabel(work)}
                  </span>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <p className="text-white text-xs line-clamp-2 px-4 text-center font-light">
                      {work.prompt}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="h-7 w-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                        onClick={(e) => toggleLike(work.id, e)}
                      >
                        <Heart className={`h-3.5 w-3.5 text-white ${likedIds.has(work.id) ? 'fill-white' : ''}`} />
                      </button>
                      <button
                        className="h-7 w-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
                        onClick={(e) => handleDownload(work.url, `huanjing-aigc-${work.id}.png`, e)}
                      >
                        <Download className="h-3.5 w-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate max-w-[60%] text-foreground/80">
                      {work.publisherNickname}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Heart className={`h-3 w-3 ${likedIds.has(work.id) ? 'fill-foreground/60 text-foreground/60' : ''}`} />
                      {work.likes + (likedIds.has(work.id) ? 1 : 0)}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                    {work.prompt}
                  </p>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail - Fullscreen Overlay */}
      {selectedWork && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedWork(null); }}
        >
          <div className="w-[98vw] h-[96vh] bg-background rounded-xl overflow-hidden flex shadow-2xl">
            {/* Left: Image/Video */}
            <div className="flex-1 min-w-0 bg-black flex items-center justify-center relative">
              {selectedWork.type === 'video' || selectedWork.type === 'text2video' || selectedWork.type === 'img2video' ? (
                <video
                  src={selectedWork.url}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={selectedWork.url}
                  alt={(selectedWork.prompt || '').slice(0, 30)}
                  className="w-full h-full object-contain cursor-zoom-in"
                  onDoubleClick={() => setFullscreenSrc(selectedWork.url)}
                />
              )}
              {/* Fullscreen button overlay */}
              {selectedWork.type !== 'video' && selectedWork.type !== 'text2video' && selectedWork.type !== 'img2video' && (
                <button
                  onClick={() => setFullscreenSrc(selectedWork.url)}
                  className="absolute bottom-4 right-4 h-10 w-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
                >
                  <Maximize2 className="h-5 w-5 text-white" />
                </button>
              )}
            </div>

            {/* Right: Info Panel */}
            <div className="w-[380px] shrink-0 flex flex-col bg-background border-l border-border overflow-y-auto">
              {/* Close header */}
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                <button
                  onClick={() => setSelectedWork(null)}
                  className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="font-serif text-lg font-semibold">作品详情</h2>
                <button
                  onClick={() => setSelectedWork(null)}
                  className="ml-auto h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 px-5 py-4 space-y-5 overflow-y-auto">
                {/* Publisher info */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{selectedWork.publisherNickname}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(selectedWork.publishedAt)}
                    </p>
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={likedIds.has(selectedWork.id) ? 'default' : 'outline'}
                    onClick={() => toggleLike(selectedWork.id)}
                  >
                    <Heart className={`h-4 w-4 mr-1 ${likedIds.has(selectedWork.id) ? 'fill-current' : ''}`} />
                    {selectedWork.likes + (likedIds.has(selectedWork.id) ? 1 : 0)}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(selectedWork.url, `huanjing-aigc-${selectedWork.id}.png`)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    下载
                  </Button>
                </div>

                {/* Prompt */}
                {(selectedWork.prompt || selectedWork.negativePrompt) && (
                  <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                    {selectedWork.prompt && (
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-muted-foreground">提示词</p>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(selectedWork.prompt || '').then(
                                  () => toast.success('已复制'),
                                  () => {},
                                );
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            >
                              <Copy className="h-3 w-3" />复制
                            </button>
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">{selectedWork.prompt}</p>
                        </div>
                      </div>
                    )}
                    {selectedWork.negativePrompt && (
                      <div className="flex items-start gap-2">
                        <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1">负面提示词</p>
                          <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
                            {selectedWork.negativePrompt}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reference Image */}
                {selectedWork.referenceImage && (
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">参考图</p>
                    </div>
                    <div className="rounded-md overflow-hidden bg-muted max-w-xs">
                      <img
                        src={selectedWork.referenceImage}
                        alt="参考图"
                        className="w-full object-contain max-h-[200px] cursor-zoom-in"
                        onDoubleClick={() => setFullscreenSrc(selectedWork.referenceImage!)}
                      />
                    </div>
                  </div>
                )}

                {/* Model & Params */}
                {selectedWork.params && Object.keys(selectedWork.params).length > 0 && (
                  <div className="rounded-lg bg-muted/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Cpu className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">模型与参数</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {(!!selectedWork.params.modelLabel || !!selectedWork.params.model) && (
                        <div>
                          <p className="text-xs text-muted-foreground">模型</p>
                          <p className="font-medium">{String(selectedWork.params.modelLabel || selectedWork.params.model || '')}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">类型</p>
                        <Badge variant="secondary">{getCategoryLabel(selectedWork)}</Badge>
                      </div>
                      {!!selectedWork.params.size && (
                        <div>
                          <p className="text-xs text-muted-foreground">尺寸</p>
                          <p>{String(selectedWork.params.size)}</p>
                        </div>
                      )}
                      {!!selectedWork.params.steps && (
                        <div>
                          <p className="text-xs text-muted-foreground">步数</p>
                          <p>{String(selectedWork.params.steps)}</p>
                        </div>
                      )}
                      {!!selectedWork.params.cfg_scale && (
                        <div>
                          <p className="text-xs text-muted-foreground">引导系数</p>
                          <p>{String(selectedWork.params.cfg_scale)}</p>
                        </div>
                      )}
                      {!!selectedWork.params.seed && (
                        <div>
                          <p className="text-xs text-muted-foreground">种子</p>
                          <p>{String(selectedWork.params.seed)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen image preview overlay */}
      <FullscreenPreview
        src={fullscreenSrc || ''}
        alt="全屏预览"
        open={!!fullscreenSrc}
        onClose={() => setFullscreenSrc(null)}
      />
    </div>
  );
}
