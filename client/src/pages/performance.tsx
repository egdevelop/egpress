import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Zap, 
  Image, 
  Check,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Gauge,
  FileImage,
  ChevronRight,
  Info,
  X,
  Play,
  CheckCircle,
  AlertTriangle,
  FolderOpen
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
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getImageSeoStatus, type ImageSeoStatus } from "@/lib/utils";
import type { Repository } from "@shared/schema";

interface RepoImage {
  path: string;
  sha: string;
  size: number;
  publicPath: string;
  name: string;
}

interface ProcessedImage {
  id: string;
  original: RepoImage;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped';
  selected: boolean;
  optimized?: OptimizedImage;
  error?: string;
  seoStatus: ImageSeoStatus;
}

export default function PerformancePage() {
  const { toast } = useToast();
  
  const [selectedPreset, setSelectedPreset] = useState<CompressionPreset>('balanced');
  const [customQuality, setCustomQuality] = useState(0.85);
  const [customMaxWidth, setCustomMaxWidth] = useState(1200);
  const [customMaxHeight, setCustomMaxHeight] = useState(800);
  const [customFormat, setCustomFormat] = useState<'image/webp' | 'image/jpeg' | 'image/png'>('image/webp');
  
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [imagesScanned, setImagesScanned] = useState(false);

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: imagesData, isLoading: imagesLoading, refetch: refetchImages } = useQuery<{ success: boolean; data: RepoImage[] }>({
    queryKey: ["/api/images"],
    enabled: !!repoData?.data,
  });

  const repository = repoData?.data;
  const repoImages = imagesData?.data || [];

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

  const scanImages = useCallback(() => {
    const processed: ProcessedImage[] = repoImages.map(img => ({
      id: img.sha,
      original: img,
      status: 'pending' as const,
      selected: img.size > 200 * 1024,
      seoStatus: getImageSeoStatus(img.size),
    }));
    setProcessedImages(processed);
    setImagesScanned(true);
  }, [repoImages]);

  useEffect(() => {
    if (repoImages.length > 0 && !imagesScanned) {
      scanImages();
    }
  }, [repoImages, imagesScanned, scanImages]);

  const toggleImageSelection = useCallback((id: string) => {
    setProcessedImages(prev => prev.map(img =>
      img.id === id ? { ...img, selected: !img.selected } : img
    ));
  }, []);

  const selectAll = useCallback((selected: boolean) => {
    setProcessedImages(prev => prev.map(img => ({ ...img, selected })));
  }, []);

  const selectNeedOptimization = useCallback(() => {
    setProcessedImages(prev => prev.map(img => ({
      ...img,
      selected: img.seoStatus.status !== 'good',
    })));
  }, []);

  const optimizeAllSelected = useCallback(async () => {
    const selectedImages = processedImages.filter(img => img.selected && img.status === 'pending');
    if (selectedImages.length === 0) {
      toast({
        title: "No images selected",
        description: "Please select images to optimize",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProcessProgress(0);
    const options = getCurrentOptions();
    let processed = 0;

    for (const image of selectedImages) {
      setProcessedImages(prev => prev.map(img =>
        img.id === image.id ? { ...img, status: 'processing' } : img
      ));

      try {
        const fullUrl = `https://raw.githubusercontent.com/${repository?.fullName}/${repository?.activeBranch}/${image.original.path}`;
        
        const response = await fetch(fullUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const file = new File([blob], image.original.name, { type: blob.type });
        
        const optimized = await optimizeImage(file, options);
        
        if (optimized.optimizedSize >= image.original.size) {
          setProcessedImages(prev => prev.map(img =>
            img.id === image.id ? { ...img, status: 'skipped', error: 'Already optimized' } : img
          ));
        } else {
          const mimeType = options.format || 'image/webp';
          const ext = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/jpeg' ? 'jpg' : 'png';
          
          const originalPath = image.original.path;
          const lastSlashIndex = originalPath.lastIndexOf('/');
          const directory = lastSlashIndex >= 0 ? originalPath.substring(0, lastSlashIndex + 1) : '';
          const originalName = image.original.name.replace(/\.[^.]+$/, '');
          const optimizedFilename = `${directory}${originalName}.${ext}`;

          const base64 = optimized.dataUrl.split(',')[1];
          
          const uploadResponse = await fetch('/api/upload-image-base64', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageData: base64,
              filename: optimizedFilename,
              mimeType,
              queueOnly: true,
              previousPath: image.original.path,
            }),
            credentials: 'include',
          });

          const result = await uploadResponse.json();
          
          if (!result.success) {
            throw new Error(result.error || 'Upload failed');
          }

          setProcessedImages(prev => prev.map(img =>
            img.id === image.id ? { ...img, status: 'completed', optimized } : img
          ));
        }
      } catch (error: any) {
        setProcessedImages(prev => prev.map(img =>
          img.id === image.id ? { ...img, status: 'error', error: error.message } : img
        ));
      }

      processed++;
      setProcessProgress((processed / selectedImages.length) * 100);
    }

    setIsProcessing(false);
    
    setProcessedImages(prev => {
      const updated = [...prev];
      let completedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      
      updated.forEach(img => {
        if (img.status === 'completed') completedCount++;
        else if (img.status === 'skipped') skippedCount++;
        else if (img.status === 'error') errorCount++;
      });
      
      let description = '';
      if (completedCount > 0) {
        description += `Queued ${completedCount} optimized image${completedCount > 1 ? 's' : ''} for deploy`;
      }
      if (skippedCount > 0) {
        description += description ? ', ' : '';
        description += `${skippedCount} already optimized`;
      }
      if (errorCount > 0) {
        description += description ? ', ' : '';
        description += `${errorCount} failed`;
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/smart-deploy/queue"] });
      
      toast({
        title: "Optimization Complete",
        description: description || "No images were processed",
      });
      
      return updated;
    });

    refetchImages();
  }, [processedImages, getCurrentOptions, repository, toast, refetchImages]);

  const getTotalStats = useCallback(() => {
    const completed = processedImages.filter(img => img.optimized);
    if (completed.length === 0) return null;

    const originalTotal = completed.reduce((sum, img) => sum + img.original.size, 0);
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
  }, [processedImages]);

  const stats = getTotalStats();
  const presetConfig = COMPRESSION_PRESETS[selectedPreset];

  const selectedCount = processedImages.filter(img => img.selected).length;
  const needsOptimizationCount = processedImages.filter(img => img.seoStatus.status !== 'good').length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Performance
          </h1>
          <p className="text-muted-foreground mt-1">
            Optimize all images in your site for better SEO and faster loading
          </p>
        </div>

        {!repository ? (
          <Card className="p-8">
            <div className="text-center">
              <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
              <p className="text-muted-foreground">
                Connect a repository from the sidebar to optimize images.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
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
                        <div className="flex items-center justify-between gap-1 mb-1">
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
                    Site Images
                  </CardTitle>
                  <CardDescription>
                    {imagesLoading ? 'Loading...' : `${repoImages.length} images found in repository`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!imagesScanned ? (
                    <div className="text-center py-8">
                      <Image className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-4">
                        Scan your repository to find images that need optimization
                      </p>
                      <Button
                        onClick={scanImages}
                        disabled={imagesLoading || repoImages.length === 0}
                        data-testid="button-scan-images"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Scan {repoImages.length} Images
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => selectAll(true)}
                            disabled={isProcessing}
                            data-testid="button-select-all"
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => selectAll(false)}
                            disabled={isProcessing}
                            data-testid="button-deselect-all"
                          >
                            Deselect All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={selectNeedOptimization}
                            disabled={isProcessing}
                            data-testid="button-select-needs-opt"
                          >
                            Select Unoptimized ({needsOptimizationCount})
                          </Button>
                        </div>
                        <Badge variant="secondary">
                          {selectedCount} selected
                        </Badge>
                      </div>

                      {isProcessing && (
                        <div className="space-y-2">
                          <Progress value={processProgress} className="h-2" />
                          <p className="text-xs text-muted-foreground text-center">
                            Optimizing... {Math.round(processProgress)}%
                          </p>
                        </div>
                      )}

                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {processedImages.map((image) => (
                            <div
                              key={image.id}
                              className={`flex items-center gap-3 p-2 rounded-md border ${
                                image.status === 'completed' ? 'border-green-500/30 bg-green-50 dark:bg-green-950/20' :
                                image.status === 'error' ? 'border-red-500/30 bg-red-50 dark:bg-red-950/20' :
                                image.status === 'processing' ? 'border-primary/30 bg-primary/5' :
                                image.status === 'skipped' ? 'border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20' :
                                'border-border'
                              }`}
                              data-testid={`image-item-${image.id}`}
                            >
                              <Checkbox
                                checked={image.selected}
                                onCheckedChange={() => toggleImageSelection(image.id)}
                                disabled={isProcessing || image.status !== 'pending'}
                                data-testid={`checkbox-${image.id}`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{image.original.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{formatBytes(image.original.size)}</span>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      {image.seoStatus.status === 'good' ? (
                                        <CheckCircle className="w-3 h-3 text-green-500" />
                                      ) : image.seoStatus.status === 'warning' ? (
                                        <AlertTriangle className="w-3 h-3 text-yellow-500" />
                                      ) : (
                                        <AlertCircle className="w-3 h-3 text-red-500" />
                                      )}
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{image.seoStatus.message}</p>
                                    </TooltipContent>
                                  </Tooltip>
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
                                  {image.status === 'skipped' && (
                                    <span className="text-yellow-600 dark:text-yellow-400">
                                      Already optimized
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {image.status === 'processing' && (
                                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                                )}
                                {image.status === 'completed' && (
                                  <Check className="w-4 h-4 text-green-600" />
                                )}
                                {image.status === 'error' && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <AlertCircle className="w-4 h-4 text-red-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{image.error}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {image.status === 'skipped' && (
                                  <Check className="w-4 h-4 text-yellow-600" />
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
                            {stats.count} images: {formatBytes(stats.originalTotal)} to {formatBytes(stats.optimizedTotal)}
                            <span className="font-semibold ml-2">
                              (Saved {formatBytes(stats.savedTotal)}, avg {stats.avgRatio}% reduction)
                            </span>
                          </AlertDescription>
                        </Alert>
                      )}

                      <Button
                        className="w-full"
                        onClick={optimizeAllSelected}
                        disabled={isProcessing || selectedCount === 0}
                        data-testid="button-optimize-all"
                      >
                        {isProcessing ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Optimizing...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Optimize {selectedCount} Images
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
                  <li>Images under <strong>200KB</strong> are optimal for SEO and fast loading</li>
                  <li>Optimized images are saved as new files - originals are preserved</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}
