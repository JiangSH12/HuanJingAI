'use client';

import { useState, useEffect } from 'react';
import { type CreationRecord, isPlaceholder, shareToGallery, isUrlPublished } from '@/lib/creation-history-store';
import { downloadFile } from '@/lib/utils';
import { useAuth } from '@/lib/auth-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Copy, ImageOff, Film, ImageIcon, Share2, CheckCircle2, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { FullscreenPreview } from '@/components/fullscreen-preview';

interface CreationDetailDialogProps {
  record: CreationRecord | null;
  open: boolean;
  onClose: () => void;
  onPublishChange?: () => void;
}

export function CreationDetailDialog({ record, open, onClose, onPublishChange }: CreationDetailDialogProps) {
  const { user } = useAuth();
  const [isPublished, setIsPublished] = useState(false);
  const [fullscreenSrc, setFullscreenSrc] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      setIsPublished(record.published || isUrlPublished(record.url));
    }
  }, [record]);

  if (!record) return null;

  const handleDownload = async () => {
    const url = record.url;
    if (isPlaceholder(url)) {
      toast.error('图片链接已过期，无法下载');
      return;
    }

    const ext = record.type === 'video' ? 'mp4' : 'png';
    const filename = `huanjing-aigc-${Date.now()}.${ext}`;
    const result = await downloadFile(url, filename);
    if (result.ok) {
      toast.success('下载成功');
    } else {
      toast.error(result.error || '下载失败，请重试');
    }
  };

  const handleCopyPrompt = () => {
    if (record.prompt) {
      navigator.clipboard.writeText(record.prompt).then(
        () => toast.success('提示词已复制'),
        () => toast.error('复制失败'),
      );
    }
  };

  const handleShareToGallery = async () => {
    if (isPublished) {
      toast.info('该作品已分享到画廊');
      return;
    }
    try {
      await shareToGallery({
        type: record.type,
        url: record.url,
        prompt: record.prompt,
        model: record.model,
        modelLabel: record.modelLabel,
        publisherId: user?.id,
        publisherNickname: user?.nickname || user?.email?.split('@')[0] || '匿名用户',
        negativePrompt: record.negativePrompt,
        referenceImage: record.referenceImage,
        params: record.params,
      });
      setIsPublished(true);
      onPublishChange?.();
      toast.success('已分享到画廊');
    } catch {
      toast.error('分享失败，请重试');
    }
  };

  const isPlaceholderUrl = isPlaceholder(record.url);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {record.type === 'image' ? (
                <ImageIcon className="h-5 w-5" />
              ) : (
                <Film className="h-5 w-5" />
              )}
              创作详情
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Media Preview */}
            <div className="rounded-lg overflow-hidden bg-muted border border-border relative group">
              {isPlaceholderUrl ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ImageOff className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">图片链接已过期</p>
                </div>
              ) : record.type === 'image' ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={record.url}
                  alt={record.prompt}
                  className="w-full object-contain max-h-[50vh] cursor-zoom-in"
                  onDoubleClick={() => setFullscreenSrc(record.url)}
                />
              ) : (
                <video
                  src={record.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[50vh]"
                />
              )}
              {/* Fullscreen button */}
              {!isPlaceholderUrl && record.type === 'image' && (
                <button
                  onClick={() => setFullscreenSrc(record.url)}
                  className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Maximize2 className="h-4 w-4 text-white" />
                </button>
              )}
            </div>

            {/* Reference Image */}
            {record.referenceImage && !isPlaceholder(record.referenceImage) && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">参考图</p>
                <div className="rounded-lg overflow-hidden border border-border bg-muted w-40 relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={record.referenceImage}
                    alt="参考图"
                    className="w-full object-cover cursor-zoom-in"
                    onDoubleClick={() => setFullscreenSrc(record.referenceImage!)}
                  />
                  <button
                    onClick={() => setFullscreenSrc(record.referenceImage!)}
                    className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Maximize2 className="h-3 w-3 text-white" />
                  </button>
                </div>
              </div>
            )}

            {/* Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">提示词</p>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleCopyPrompt}>
                  <Copy className="h-3 w-3" />复制
                </Button>
              </div>
              <div className="rounded-md bg-muted/50 border border-border p-3">
                <p className="text-sm whitespace-pre-wrap">{record.prompt || '（无提示词）'}</p>
              </div>
            </div>

            {/* Negative Prompt */}
            {record.negativePrompt && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">负面提示词</p>
                <div className="rounded-md bg-muted/50 border border-border p-3">
                  <p className="text-sm whitespace-pre-wrap">{record.negativePrompt}</p>
                </div>
              </div>
            )}

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {record.type === 'image' ? '图片' : '视频'}
              </Badge>
              <Badge variant="secondary">
                {record.modelLabel}
              </Badge>
              {record.isCustomModel && (
                <Badge variant="outline" className="border-dashed text-xs">
                  自定义模型
                </Badge>
              )}
              {isPublished && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />已分享
                </Badge>
              )}
              {Object.entries(record.params).map(([k, v]) => (
                <Badge key={k} variant="outline" className="text-xs">
                  {k}={String(v)}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date(record.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button className="gap-2" onClick={handleDownload} disabled={isPlaceholderUrl}>
                <Download className="h-4 w-4" />
                下载{record.type === 'image' ? '图片' : '视频'}
              </Button>
              <Button
                variant={isPublished ? 'secondary' : 'outline'}
                className="gap-2"
                onClick={handleShareToGallery}
                disabled={isPublished}
              >
                {isPublished ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    已分享
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    分享到画廊
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen image preview overlay */}
      <FullscreenPreview
        src={fullscreenSrc || ''}
        alt="全屏预览"
        open={!!fullscreenSrc}
        onClose={() => setFullscreenSrc(null)}
      />
    </>
  );
}
