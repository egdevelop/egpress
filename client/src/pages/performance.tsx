import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Zap, 
  Image, 
  Settings, 
  Upload,
  Download,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Gauge,
  FileImage,
  Rocket,
  Clock,
  GitCommit,
  ChevronRight,
  Info,
  X,
  Play
} from "lucide-react";
import { 
  optimizeImage, 
  formatBytes, 
  COMPRESSION_PRESETS, 
  getPresetOptions,
  type CompressionPreset,
  type OptimizedImage,
  type OptimizeOptions
} from "@/lib/image-utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, BlogPost } from "@shared/schema";

interface BatchImage {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  optimized?: OptimizedImage;
  error?: string;
}

interface PendingChange {
  type: 'new' | 'edit' | 'delete';
  title: string;
  slug: string;
  timestamp: Date;
}

export default function PerformancePage() {
  const { toast } = useToast();
  
  const [selectedPreset, setSelectedPreset] = useState<CompressionPreset>('balanced');
  const [customQuality, setCustomQuality] = useState(0.85);
  const [customMaxWidth, setCustomMaxWidth] = useState(1200);
  const [customMaxHeight, setCustomMaxHeight] = useState(800);
  const [customFormat, setCustomFormat] = useState<'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  
  const [batchImages, setBatchImages] = useState<BatchImage[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [deployBatching, setDeployBatching] = useState(true);
  const [deployConfirmOpen, setDeployConfirmOpen] = useState(false);

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: postsData } = useQuery<{ success: boolean; data: BlogPost[] }>({
    queryKey: ["/api/posts"],
    enabled: !!repoData?.data,
  });

  const repository = repoData?.data;

  const getCurrentOptions = useCallback((): OptimizeOptions => {
    if (selectedPreset === 'custom') {
      return {
        maxWidth: customMaxWidth,
        maxHeight: customMaxHeight,
        quality: customQuality,
        format: customFormat,
      };
    }
    return getPresetOptions(selectedPreset);
  }, [selectedPreset, customMaxWidth, customMaxHeight, customQuality, customFormat]);

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const newImages: BatchImage[] = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        originalSize: file.size,
        status: 'pending' as const,
      }));
    
    setBatchImages(prev => [...prev, ...newImages]);
  }, []);

  const removeFromBatch = useCallback((id: string) => {
    setBatchImages(prev => prev.filter(img => img.id !== id));
  }, []);

  const clearBatch = useCallback(() => {
    setBatchImages([]);
    setBatchProgress(0);
  }, []);

  const processBatch = useCallback(async () => {
    if (batchImages.length === 0) return;
    
    setIsBatchProcessing(true);
    setBatchProgress(0);
    
    const options = getCurrentOptions();
    const total = batchImages.filter(img => img.status === 'pending').length;
    let processed = 0;
    
    for (const image of batchImages) {
      if (image.status !== 'pending') continue;
      
      setBatchImages(prev => prev.map(img => 
        img.id === image.id ? { ...img, status: 'processing' } : img
      ));
      
      try {
        const optimized = await optimizeImage(image.file, options);
        
        setBatchImages(prev => prev.map(img => 
          img.id === image.id ? { ...img, status: 'completed', optimized } : img
        ));
      } catch (error: any) {
        setBatchImages(prev => prev.map(img => 
          img.id === image.id ? { ...img, status: 'error', error: error.message } : img
        ));
      }
      
      processed++;
      setBatchProgress((processed / total) * 100);
    }
    
    setIsBatchProcessing(false);
    
    const completed = batchImages.filter(img => img.status === 'completed' || img.optimized).length + 
      batchImages.filter(img => img.status === 'pending').length;
    
    toast({
      title: "Batch Processing Complete",
      description: `Optimized ${processed} images`,
    });
  }, [batchImages, getCurrentOptions, toast]);

  const downloadOptimized = useCallback((image: BatchImage) => {
    if (!image.optimized) return;
    
    const link = document.createElement('a');
    link.href = image.optimized.dataUrl;
    const ext = getCurrentOptions().format === 'image/webp' ? 'webp' : 
                getCurrentOptions().format === 'image/jpeg' ? 'jpg' : 'png';
    link.download = image.name.replace(/\.[^.]+$/, `.${ext}`);
    link.click();
  }, [getCurrentOptions]);

  const downloadAllOptimized = useCallback(() => {
    batchImages
      .filter(img => img.optimized)
      .forEach(img => downloadOptimized(img));
  }, [batchImages, downloadOptimized]);

  const getTotalStats = useCallback(() => {
    const completed = batchImages.filter(img => img.optimized);
    if (completed.length === 0) return null;
    
    const originalTotal = completed.reduce((sum, img) => sum + img.originalSize, 0);
    const optimizedTotal = completed.reduce((sum, img) => sum + (img.optimized?.optimizedSize || 0), 0);
    const savedTotal = originalTotal - optimizedTotal;
    const avgRatio = completed.reduce((sum, img) => sum + (img.optimized?.compressionRatio || 0), 0) / completed.length;
    
    return {
      originalTotal,
      optimizedTotal,
      savedTotal,
      avgRatio: Math.round(avgRatio),
      count: completed.length,
    };
  }, [batchImages]);

  const stats = getTotalStats();
  const presetConfig = COMPRESSION_PRESETS[selectedPreset];

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Performance
          </h1>
          <p className="text-muted-foreground mt-1">
            Optimize images and manage deployments efficiently
          </p>
        </div>

        <Tabs defaultValue="image" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="image" className="gap-2">
              <Image className="w-4 h-4" />
              Image Optimization
            </TabsTrigger>
            <TabsTrigger value="deploy" className="gap-2">
              <Rocket className="w-4 h-4" />
              Smart Deploy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="image" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="w-5 h-5" />
                    Compression Settings
                  </CardTitle>
                  <CardDescription>
                    Choose a preset or customize compression settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.entries(COMPRESSION_PRESETS) as [CompressionPreset, typeof COMPRESSION_PRESETS.aggressive][]).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedPreset(key)}
                        className={`p-3 rounded-md border text-left transition-all ${
                          selectedPreset === key 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover-elevate'
                        }`}
                        data-testid={`preset-${key}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{preset.name}</span>
                          {selectedPreset === key && (
                            <Check className="w-4 h-4 text-primary" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {preset.description}
                        </p>
                        <Badge variant="secondary" className="mt-2 text-xs">
                          ~{preset.estimatedSaving} smaller
                        </Badge>
                      </button>
                    ))}
                  </div>

                  {selectedPreset === 'custom' && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Quality</Label>
                          <span className="text-sm text-muted-foreground">{Math.round(customQuality * 100)}%</span>
                        </div>
                        <Slider
                          value={[customQuality]}
                          onValueChange={([v]) => setCustomQuality(v)}
                          min={0.1}
                          max={1}
                          step={0.05}
                          data-testid="slider-quality"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Max Width (px)</Label>
                          <Input
                            type="number"
                            value={customMaxWidth}
                            onChange={(e) => setCustomMaxWidth(parseInt(e.target.value) || 800)}
                            min={200}
                            max={4000}
                            data-testid="input-max-width"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Max Height (px)</Label>
                          <Input
                            type="number"
                            value={customMaxHeight}
                            onChange={(e) => setCustomMaxHeight(parseInt(e.target.value) || 600)}
                            min={200}
                            max={4000}
                            data-testid="input-max-height"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Format</Label>
                        <Select value={customFormat} onValueChange={(v) => setCustomFormat(v as typeof customFormat)}>
                          <SelectTrigger data-testid="select-format">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="image/webp">WebP (Best compression)</SelectItem>
                            <SelectItem value="image/jpeg">JPEG (Wide compatibility)</SelectItem>
                            <SelectItem value="image/png">PNG (Lossless)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <Alert>
                    <Info className="w-4 h-4" />
                    <AlertTitle>Current Settings</AlertTitle>
                    <AlertDescription className="text-xs mt-2">
                      {selectedPreset === 'custom' ? (
                        <span>
                          {customMaxWidth}x{customMaxHeight}px, {Math.round(customQuality * 100)}% quality, {customFormat.split('/')[1].toUpperCase()}
                        </span>
                      ) : (
                        <span>
                          {presetConfig.maxWidth}x{presetConfig.maxHeight}px, {Math.round(presetConfig.quality * 100)}% quality, {presetConfig.format.split('/')[1].toUpperCase()}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileImage className="w-5 h-5" />
                    Batch Optimizer
                  </CardTitle>
                  <CardDescription>
                    Optimize multiple images at once
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    className="border-2 border-dashed rounded-md p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => document.getElementById('batch-file-input')?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleFilesSelected(e.dataTransfer.files);
                    }}
                    data-testid="batch-dropzone"
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop images here or click to select
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports PNG, JPG, WebP, GIF
                    </p>
                    <input
                      id="batch-file-input"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFilesSelected(e.target.files)}
                    />
                  </div>

                  {batchImages.length > 0 && (
                    <>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {batchImages.length} image{batchImages.length !== 1 ? 's' : ''} queued
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearBatch}
                            disabled={isBatchProcessing}
                            data-testid="button-clear-batch"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Clear
                          </Button>
                          {stats && stats.count > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={downloadAllOptimized}
                              data-testid="button-download-all"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download All
                            </Button>
                          )}
                        </div>
                      </div>

                      {isBatchProcessing && (
                        <div className="space-y-2">
                          <Progress value={batchProgress} className="h-2" />
                          <p className="text-xs text-muted-foreground text-center">
                            Processing... {Math.round(batchProgress)}%
                          </p>
                        </div>
                      )}

                      <ScrollArea className="h-[200px]">
                        <div className="space-y-2">
                          {batchImages.map((image) => (
                            <div
                              key={image.id}
                              className={`flex items-center justify-between gap-3 p-2 rounded-md border ${
                                image.status === 'completed' ? 'border-green-500/30 bg-green-50 dark:bg-green-950/20' :
                                image.status === 'error' ? 'border-red-500/30 bg-red-50 dark:bg-red-950/20' :
                                image.status === 'processing' ? 'border-primary/30 bg-primary/5' :
                                'border-border'
                              }`}
                              data-testid={`batch-item-${image.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{image.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{formatBytes(image.originalSize)}</span>
                                  {image.optimized && (
                                    <>
                                      <ChevronRight className="w-3 h-3" />
                                      <span className="text-green-600 dark:text-green-400">
                                        {formatBytes(image.optimized.optimizedSize)}
                                      </span>
                                      <Badge variant="secondary" className="text-xs">
                                        -{image.optimized.compressionRatio}%
                                      </Badge>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {image.status === 'processing' && (
                                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                                )}
                                {image.status === 'completed' && (
                                  <>
                                    <Check className="w-4 h-4 text-green-600" />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => downloadOptimized(image)}
                                      data-testid={`download-${image.id}`}
                                    >
                                      <Download className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {image.status === 'error' && (
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                )}
                                {image.status === 'pending' && !isBatchProcessing && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeFromBatch(image.id)}
                                    data-testid={`remove-${image.id}`}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>

                      {stats && (
                        <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                          <HardDrive className="w-4 h-4 text-green-600" />
                          <AlertTitle className="text-green-700 dark:text-green-400">
                            Space Saved
                          </AlertTitle>
                          <AlertDescription className="text-green-600 dark:text-green-500 text-sm">
                            {stats.count} images: {formatBytes(stats.originalTotal)} → {formatBytes(stats.optimizedTotal)} 
                            <span className="font-semibold ml-2">
                              (Saved {formatBytes(stats.savedTotal)}, avg {stats.avgRatio}% reduction)
                            </span>
                          </AlertDescription>
                        </Alert>
                      )}

                      <Button
                        className="w-full"
                        onClick={processBatch}
                        disabled={isBatchProcessing || batchImages.filter(i => i.status === 'pending').length === 0}
                        data-testid="button-process-batch"
                      >
                        {isBatchProcessing ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Optimize {batchImages.filter(i => i.status === 'pending').length} Images
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Alert>
              <Zap className="w-4 h-4" />
              <AlertTitle>Performance Tips</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>Use <strong>WebP format</strong> for best compression (30-50% smaller than JPEG)</li>
                  <li>Hero images work best at <strong>1200x800px</strong> for most blog layouts</li>
                  <li>Use <strong>Aggressive</strong> preset for thumbnails and small images</li>
                  <li>AI-generated images are automatically optimized when saving</li>
                </ul>
              </AlertDescription>
            </Alert>
          </TabsContent>

          <TabsContent value="deploy" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Deployment Settings
                  </CardTitle>
                  <CardDescription>
                    Control how and when deployments happen
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-md border bg-muted/30">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <GitCommit className="w-4 h-4" />
                        Batch Changes
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Collect multiple changes before deploying
                      </p>
                    </div>
                    <Switch
                      checked={deployBatching}
                      onCheckedChange={setDeployBatching}
                      data-testid="switch-batch-deploy"
                    />
                  </div>

                  <Alert>
                    <Info className="w-4 h-4" />
                    <AlertTitle>Smart Deploy</AlertTitle>
                    <AlertDescription className="text-sm mt-2">
                      <p>When enabled, changes are collected and you can review them before deploying. This helps:</p>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Reduce Vercel build minutes usage</li>
                        <li>Bundle multiple posts into one deployment</li>
                        <li>Preview all changes before going live</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Deployment Tips</h4>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Create multiple posts with Bulk AI Generator before deploying</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Edit all theme/branding settings at once, then deploy</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Use scheduled deploys for content calendars</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Deployment Strategy
                  </CardTitle>
                  <CardDescription>
                    Best practices for efficient deployments
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="p-4 rounded-md border bg-muted/30">
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <Badge variant="secondary">1</Badge>
                        Bulk Create Content
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Use the Bulk AI Generator to create 5-10 posts at once. 
                        All posts are saved to GitHub but not deployed yet.
                      </p>
                    </div>

                    <div className="p-4 rounded-md border bg-muted/30">
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <Badge variant="secondary">2</Badge>
                        Review & Organize
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Edit titles, adjust categories, and finalize content. 
                        Changes are committed to GitHub incrementally.
                      </p>
                    </div>

                    <div className="p-4 rounded-md border bg-muted/30">
                      <h4 className="font-medium flex items-center gap-2 mb-2">
                        <Badge variant="secondary">3</Badge>
                        Single Deploy
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        When ready, trigger one deployment from the Vercel page. 
                        All your changes go live together.
                      </p>
                    </div>
                  </div>

                  <Alert className="border-primary/50 bg-primary/5">
                    <Rocket className="w-4 h-4 text-primary" />
                    <AlertTitle className="text-primary">Pro Tip</AlertTitle>
                    <AlertDescription className="text-sm">
                      Vercel auto-deploys on every GitHub push. To batch changes:
                      <ol className="list-decimal list-inside mt-2 space-y-1">
                        <li>Disable auto-deploy in Vercel project settings</li>
                        <li>Create all your content in EG Press</li>
                        <li>Manually trigger deploy when ready</li>
                      </ol>
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="w-5 h-5" />
                  Vercel Auto-Deploy Control
                </CardTitle>
                <CardDescription>
                  How to control automatic deployments in Vercel
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 rounded-md border">
                    <h4 className="font-medium mb-2">Disable Auto-Deploy</h4>
                    <ol className="text-sm text-muted-foreground space-y-2">
                      <li className="flex gap-2">
                        <span className="text-primary font-medium">1.</span>
                        Go to Vercel Dashboard → Your Project
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary font-medium">2.</span>
                        Settings → Git → Build & Development
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary font-medium">3.</span>
                        Turn off "Automatically deploy on push"
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary font-medium">4.</span>
                        Use "Trigger Deploy" button in EG Press Vercel page
                      </li>
                    </ol>
                  </div>

                  <div className="p-4 rounded-md border">
                    <h4 className="font-medium mb-2">Ignored Build Step</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Add this to Vercel settings to skip deploys for drafts:
                    </p>
                    <code className="block p-2 rounded bg-muted text-xs font-mono">
                      git diff HEAD^ HEAD --quiet -- src/content/blog/
                    </code>
                    <p className="text-xs text-muted-foreground mt-2">
                      This skips deploy if only draft posts changed.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
