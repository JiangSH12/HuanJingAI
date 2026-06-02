'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/lib/utils';

interface LightboxProps {
  /** Image URL to display */
  src: string;
  /** Alt text */
  alt?: string;
  /** Whether the lightbox is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
}

export function ImageLightbox({ src, alt, open, onClose }: LightboxProps) {
  const [zoom, setZoom] = useState(1);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.5, 4));
    if (e.key === '-') setZoom(z => Math.max(z - 0.5, 0.5));
    if (e.key === '0') setZoom(1);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  useEffect(() => {
    setZoom(1);
  }, [src]);

  if (!open) return null;

  const handleDownload = async () => {
    const result = await downloadFile(src, `huanjing-aigc-${Date.now()}.png`);
    if (!result.ok) {
      // Fallback: open in new tab
      window.open(src, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2" onClick={e => e.stopPropagation()}>
        <Button variant="secondary" size="sm" className="gap-1" onClick={() => setZoom(z => Math.min(z + 0.5, 4))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" className="gap-1" onClick={() => setZoom(z => Math.max(z - 0.5, 0.5))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" className="gap-1" onClick={() => setZoom(1)}>
          1:1
        </Button>
        <Button variant="secondary" size="sm" className="gap-1" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Info bar */}
      <div className="absolute bottom-4 left-4 z-10 text-white/60 text-xs" onClick={e => e.stopPropagation()}>
        {zoom !== 1 && <span>{Math.round(zoom * 100)}% {' | '} </span>}
        双指/滚轮缩放 | ESC 关闭
      </div>

      {/* Image */}
      <div
        className="flex items-center justify-center w-full h-full p-8"
        onClick={e => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt || '预览图片'}
          className="max-w-full max-h-full object-contain transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
          onWheel={e => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            setZoom(z => Math.max(0.25, Math.min(4, z + delta)));
          }}
        />
      </div>
    </div>
  );
}
