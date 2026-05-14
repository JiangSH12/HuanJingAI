'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Megaphone } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ServerAnnouncement {
  id: string;
  title: string;
  content: string;
  start_date: string;
  end_date: string;
  enabled: boolean;
}

function isActive(ann: ServerAnnouncement): boolean {
  if (!ann.enabled) return false;
  const now = Date.now();
  const start = new Date(ann.start_date).getTime();
  // Set end date to end of day
  const end = new Date(ann.end_date);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end.getTime();
}

/**
 * Announcement popup — shown to ALL visitors (including unauthenticated).
 * Shows on every homepage visit (no sessionStorage dismiss tracking).
 */
export function AnnouncementPopup() {
  const [open, setOpen] = useState(false);
  const [currentAnn, setCurrentAnn] = useState<ServerAnnouncement | null>(null);

  useEffect(() => {
    // Fetch active announcements from server (public API, no auth required)
    fetch('/api/announcements')
      .then(res => res.ok ? res.json() : [])
      .then((data: ServerAnnouncement[]) => {
        const activeAnns = (data || []).filter(isActive);
        // Show the first active announcement
        if (activeAnns.length > 0) {
          setCurrentAnn(activeAnns[0]);
          // Delay so page renders first
          const timer = setTimeout(() => setOpen(true), 800);
          return () => clearTimeout(timer);
        }
      })
      .catch(() => { /* silently fail */ });
  }, []);

  if (!currentAnn) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            {currentAnn.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            平台公告：{currentAnn.title}
          </DialogDescription>
        </DialogHeader>
        <div className="announcement-markdown py-2 max-h-[60vh] overflow-y-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {currentAnn.content}
          </ReactMarkdown>
        </div>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            我知道了
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
