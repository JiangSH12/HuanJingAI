'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TextToImagePanel } from '@/components/create/text-to-image';
import { ImageToImagePanel } from '@/components/create/image-to-image';
import { TextToVideoPanel } from '@/components/create/text-to-video';
import { ImageToVideoPanel } from '@/components/create/image-to-video';
import { Brush, ImagePlus, Video, Film, Loader2 } from 'lucide-react';

function CreateContent() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get('type') || 'text2img';

  const typeMap: Record<string, string> = {
    text2img: 'text2img',
    img2img: 'img2img',
    text2video: 'text2video',
    img2video: 'img2video',
  };

  const [activeTab, setActiveTab] = useState(typeMap[typeParam] || 'text2img');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="grid w-full grid-cols-4 max-w-2xl">
        <TabsTrigger value="text2img" className="gap-2">
          <Brush className="h-4 w-4" />
          <span className="hidden sm:inline">文生图</span>
        </TabsTrigger>
        <TabsTrigger value="img2img" className="gap-2">
          <ImagePlus className="h-4 w-4" />
          <span className="hidden sm:inline">图生图</span>
        </TabsTrigger>
        <TabsTrigger value="text2video" className="gap-2">
          <Video className="h-4 w-4" />
          <span className="hidden sm:inline">文生视频</span>
        </TabsTrigger>
        <TabsTrigger value="img2video" className="gap-2">
          <Film className="h-4 w-4" />
          <span className="hidden sm:inline">图生视频</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="text2img">
        <TextToImagePanel />
      </TabsContent>
      <TabsContent value="img2img">
        <ImageToImagePanel />
      </TabsContent>
      <TabsContent value="text2video">
        <TextToVideoPanel />
      </TabsContent>
      <TabsContent value="img2video">
        <ImageToVideoPanel />
      </TabsContent>
    </Tabs>
  );
}

export default function CreatePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="font-serif text-2xl font-light text-foreground">创作中心</h1>
          <p className="mt-1 text-sm text-muted-foreground font-light">
            选择创作模式，释放你的想象力
          </p>
        </div>
        <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
          <CreateContent />
        </Suspense>
      </div>
    </div>
  );
}
