'use client';

import { useState, useCallback, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

interface FullscreenPreviewProps {
  /** Current image URL */
  src: string;
  /** Alt text */
  alt?: string;
  /** All image URLs for navigation (optional) */
  images?: string[];
  /** Initial index in the images array */
  initialIndex?: number;
  /** Whether the preview is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
}

/**
 * Fullscreen image preview overlay with zoom and navigation.
 * Supports keyboard navigation (ESC to close, arrow keys to navigate).
 */
export function FullscreenPreview({ src, alt, images, initialIndex = 0, open, onClose }: FullscreenPreviewProps) {
  const [zoomed, setZoomed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setZoomed(false);
      setCurrentIndex(initialIndex);
    }
  }, [open, initialIndex]);

  const currentSrc = images?.length ? images[currentIndex] : src;

  const goToPrev = useCallback(() => {
    if (!images?.length) return;
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images]);

  const goToNext = useCallback(() => {
    if (!images?.length) return;
    setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, goToPrev, goToNext]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <X className="h-5 w-5 text-white" />
      </button>

      {/* Zoom toggle */}
      <button
        onClick={() => setZoomed(!zoomed)}
        className="absolute top-4 right-16 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        {zoomed ? <ZoomOut className="h-5 w-5 text-white" /> : <ZoomIn className="h-5 w-5 text-white" />}
      </button>

      {/* Image counter */}
      {images && images.length > 1 && (
        <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-white/10 text-white text-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Navigation arrows */}
      {images && images.length > 1 && (
        <>
          <button
            onClick={goToPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-6 w-6 text-white" />
          </button>
        </>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentSrc}
        alt={alt || 'Preview'}
        className={`transition-transform duration-200 ${zoomed ? 'max-w-none cursor-zoom-out' : 'max-w-[90vw] max-h-[90vh] cursor-zoom-in object-contain'}`}
        style={zoomed ? { width: '150%', height: 'auto' } : undefined}
        onDoubleClick={() => setZoomed(!zoomed)}
      />
    </div>
  );
}

/**
 * Hook to manage double-click fullscreen preview state.
 * Returns props to spread onto an img element and the FullscreenPreview component.
 */
export function useFullscreenPreview() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewAlt, setPreviewAlt] = useState('');

  const openPreview = useCallback((src: string, alt?: string) => {
    setPreviewSrc(src);
    setPreviewAlt(alt || '');
    setPreviewOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  const getDoubleClickProps = useCallback((src: string, alt?: string) => ({
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      openPreview(src, alt);
    },
    className: 'cursor-zoom-in',
  }), [openPreview]);

  return {
    previewOpen,
    previewSrc,
    previewAlt,
    openPreview,
    closePreview,
    getDoubleClickProps,
    FullscreenPreviewComponent: previewOpen ? (
      <FullscreenPreview
        src={previewSrc}
        alt={previewAlt}
        open={previewOpen}
        onClose={closePreview}
      />
    ) : null,
  };
}
