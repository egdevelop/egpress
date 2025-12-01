import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Zap, 
  Image, 
  Check,
  AlertCircle,
  RefreshCw,
  HardDrive,
  FileImage,
  ChevronDown,
  ChevronRight,
  Info,
  Trash2,
  Play,
  CheckCircle,
  AlertTriangle,
  FolderOpen,
  Sparkles,
  TrendingDown,
  ArchiveX
} from "lucide-react";
import { 
  optimizeImage, 
  formatBytes, 
  getPresetOptions,
  type OptimizedImage,
} from "@/lib/image-utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

interface RepoImage {
  path: string;
  sha: string;
  size: number;
  publicPath: string;
  name: string;
}

interface PerformanceAnalysis {
  summary: {
    totalImages: number;
    totalSize: number;
    unusedCount: number;
    unusedSize: number;
    largeCount: number;
    optimizableCount: number;
    potentialSavings: number;
  };
  unusedImages: RepoImage[];
  usedImages: RepoImage[];
  largeImages: RepoImage[];
  optimizableImages: RepoImage[];
  referencedPaths: string[];
}

interface ProcessingStatus {
  phase: 'idle' | 'analyzing' | 'optimizing' | 'cleaning' | 'complete';
  progress: number;
  currentItem?: string;
  optimizedCount: number;
  skippedCount: number;
  deletedCount: number;
  errors: string[];
}

export default function PerformancePage() {
  const { toast } = useToast();
  
  const [processing, setProcessing] = useState<ProcessingStatus>({
    phase: 'idle',
    progress: 0,
    optimizedCount: 0,
    skippedCount: 0,
    deletedCount: 0,
    errors: [],
  });
  
  const [selectedOptimizable, setSelectedOptimizable] = useState<Set<string>>(new Set());
  const [selectedUnused, setSelectedUnused] = useState<Set<string>>(new Set());
  const [expandedSection, setExpandedSection] = useState<string | null>('optimize');

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: analysisData, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery<{ success: boolean; data: PerformanceAnalysis }>({
    queryKey: ["/api/performance/analyze"],
    enabled: !!repoData?.data,
    refetchOnWindowFocus: false,
  });

  const repository = repoData?.data;
  const analysis = analysisData?.data;

  useEffect(() => {
    if (analysis) {
      setSelectedOptimizable(new Set(analysis.optimizableImages.map(img => img.path)));
      setSelectedUnused(new Set(analysis.unusedImages.map(img => img.path)));
    }
  }, [analysis]);

  const toggleOptimizable = useCallback((path: string) => {
    setSelectedOptimizable(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleUnused = useCallback((path: string) => {
    setSelectedUnused(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectAllOptimizable = useCallback((selected: boolean) => {
    if (selected && analysis) {
      setSelectedOptimizable(new Set(analysis.optimizableImages.map(img => img.path)));
    } else {
      setSelectedOptimizable(new Set());
    }
  }, [analysis]);

  const selectAllUnused = useCallback((selected: boolean) => {
    if (selected && analysis) {
      setSelectedUnused(new Set(analysis.unusedImages.map(img => img.path)));
    } else {
      setSelectedUnused(new Set());
    }
  }, []);

  const runOneClickOptimization = useCallback(async () => {
    if (!analysis || !repository) return;

    const imagesToOptimize = analysis.optimizableImages.filter(img => selectedOptimizable.has(img.path));
    const imagesToDelete = analysis.unusedImages.filter(img => selectedUnused.has(img.path));
    
    const totalSteps = imagesToOptimize.length + (imagesToDelete.length > 0 ? 1 : 0);
    if (totalSteps === 0) {
      toast({
        title: "Nothing to optimize",
        description: "Select images to optimize or unused assets to delete",
        variant: "destructive",
      });
      return;
    }

    const errors: string[] = [];
    let optimizedCount = 0;
    let skippedCount = 0;
    let deletedCount = 0;
    let currentStep = 0;

    setProcessing({
      phase: 'optimizing',
      progress: 0,
      optimizedCount: 0,
      skippedCount: 0,
      deletedCount: 0,
      errors: [],
    });

    const options = getPresetOptions('balanced');

    for (const image of imagesToOptimize) {
      setProcessing(prev => ({
        ...prev,
        currentItem: image.name,
        progress: (currentStep / totalSteps) * 100,
      }));

      try {
        const fullUrl = `https://raw.githubusercontent.com/${repository.fullName}/${repository.activeBranch}/${image.path}`;
        
        const response = await fetch(fullUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const file = new File([blob], image.name, { type: blob.type });
        
        const originalExt = image.name.split('.').pop()?.toLowerCase() || 'webp';
        const mimeTypeMap: Record<string, 'image/png' | 'image/jpeg' | 'image/webp'> = {
          'png': 'image/png',
          'jpg': 'image/jpeg', 
          'jpeg': 'image/jpeg',
          'webp': 'image/webp',
        };
        const originalMimeType = mimeTypeMap[originalExt] || 'image/webp';
        
        const replacementOptions = {
          ...options,
          format: originalMimeType,
        };
        
        const optimized = await optimizeImage(file, replacementOptions);
        
        if (optimized.optimizedSize >= image.size) {
          skippedCount++;
          setProcessing(prev => ({ ...prev, skippedCount }));
          currentStep++;
          continue;
        }

        const base64 = optimized.dataUrl.split(',')[1];
        
        const uploadResponse = await fetch('/api/upload-image-base64', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: base64,
            filename: image.path,
            mimeType: originalMimeType,
            queueOnly: true,
            previousPath: image.path,
          }),
          credentials: 'include',
        });

        const result = await uploadResponse.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        optimizedCount++;
        setProcessing(prev => ({ ...prev, optimizedCount }));
      } catch (error: any) {
        errors.push(`${image.name}: ${error.message}`);
      }

      currentStep++;
    }

    if (imagesToDelete.length > 0) {
      setProcessing(prev => ({
        ...prev,
        phase: 'cleaning',
        currentItem: `Deleting ${imagesToDelete.length} unused assets...`,
        progress: (currentStep / totalSteps) * 100,
      }));

      try {
        const deleteResponse = await fetch('/api/performance/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imagePaths: imagesToDelete.map(img => img.publicPath),
            queueOnly: true,
          }),
          credentials: 'include',
        });

        const deleteResult = await deleteResponse.json();
        
        if (deleteResult.success) {
          deletedCount = deleteResult.deletedCount || imagesToDelete.length;
          if (deleteResult.blockedCount > 0) {
            errors.push(`${deleteResult.blockedCount} assets are still in use and were not deleted`);
          }
        } else {
          errors.push(`Cleanup: ${deleteResult.error}`);
        }
      } catch (error: any) {
        errors.push(`Cleanup: ${error.message}`);
      }
    }

    setProcessing({
      phase: 'complete',
      progress: 100,
      optimizedCount,
      skippedCount,
      deletedCount,
      errors,
    });

    queryClient.invalidateQueries({ queryKey: ["/api/smart-deploy/queue"] });
    queryClient.invalidateQueries({ queryKey: ["/api/performance/analyze"] });

    const parts: string[] = [];
    if (optimizedCount > 0) parts.push(`${optimizedCount} images optimized`);
    if (skippedCount > 0) parts.push(`${skippedCount} already optimized`);
    if (deletedCount > 0) parts.push(`${deletedCount} unused assets queued for deletion`);
    if (errors.length > 0) parts.push(`${errors.length} errors`);

    toast({
      title: "Optimization Complete",
      description: parts.join(', ') || "No changes needed",
      variant: errors.length > 0 ? "destructive" : "default",
    });
  }, [analysis, repository, selectedOptimizable, selectedUnused, toast]);

  const isProcessing = processing.phase !== 'idle' && processing.phase !== 'complete';

  const totalIssues = (analysis?.summary.optimizableCount || 0) + (analysis?.summary.unusedCount || 0);
  const potentialSavings = (analysis?.summary.potentialSavings || 0) + (analysis?.summary.unusedSize || 0);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Performance Optimization
          </h1>
          <p className="text-muted-foreground mt-1">
            One-click optimization for faster site loading and better SEO
          </p>
        </div>

        {!repository ? (
          <Card className="p-8">
            <div className="text-center">
              <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
              <p className="text-muted-foreground">
                Connect a repository from the sidebar to analyze performance.
              </p>
            </div>
          </Card>
        ) : analysisLoading ? (
          <Card className="p-8">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-primary mx-auto mb-4 animate-spin" />
              <h2 className="text-lg font-medium mb-2">Analyzing Repository...</h2>
              <p className="text-muted-foreground">
                Scanning images and detecting unused assets
              </p>
            </div>
          </Card>
        ) : analysis ? (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Performance Summary
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {totalIssues === 0 ? (
                        "Your site is already optimized!"
                      ) : (
                        `${totalIssues} issues found - potential savings of ${formatBytes(potentialSavings)}`
                      )}
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refetchAnalysis()}
                    disabled={isProcessing}
                    data-testid="button-refresh-analysis"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Re-scan
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-3 rounded-md bg-muted/50">
                    <FileImage className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-2xl font-bold">{analysis.summary.totalImages}</div>
                    <div className="text-xs text-muted-foreground">Total Images</div>
                  </div>
                  <div className="text-center p-3 rounded-md bg-muted/50">
                    <HardDrive className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-2xl font-bold">{formatBytes(analysis.summary.totalSize)}</div>
                    <div className="text-xs text-muted-foreground">Total Size</div>
                  </div>
                  <div className={`text-center p-3 rounded-md ${analysis.summary.optimizableCount > 0 ? 'bg-yellow-500/10' : 'bg-green-500/10'}`}>
                    <TrendingDown className={`w-5 h-5 mx-auto mb-1 ${analysis.summary.optimizableCount > 0 ? 'text-yellow-600' : 'text-green-600'}`} />
                    <div className="text-2xl font-bold">{analysis.summary.optimizableCount}</div>
                    <div className="text-xs text-muted-foreground">Need Optimization</div>
                  </div>
                  <div className={`text-center p-3 rounded-md ${analysis.summary.unusedCount > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                    <ArchiveX className={`w-5 h-5 mx-auto mb-1 ${analysis.summary.unusedCount > 0 ? 'text-red-600' : 'text-green-600'}`} />
                    <div className="text-2xl font-bold">{analysis.summary.unusedCount}</div>
                    <div className="text-xs text-muted-foreground">Unused Assets</div>
                  </div>
                </div>

                {isProcessing && (
                  <div className="space-y-3 mb-6 p-4 rounded-md bg-primary/5 border border-primary/20">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {processing.phase === 'optimizing' && 'Optimizing images...'}
                        {processing.phase === 'cleaning' && 'Cleaning unused assets...'}
                        {processing.phase === 'analyzing' && 'Analyzing...'}
                      </span>
                      <span className="text-muted-foreground">{Math.round(processing.progress)}%</span>
                    </div>
                    <Progress value={processing.progress} className="h-2" />
                    {processing.currentItem && (
                      <p className="text-xs text-muted-foreground truncate">
                        {processing.currentItem}
                      </p>
                    )}
                  </div>
                )}

                {processing.phase === 'complete' && (
                  <Alert className="mb-6 border-green-500/50 bg-green-50 dark:bg-green-950/20">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <AlertTitle className="text-green-700 dark:text-green-400">Optimization Complete</AlertTitle>
                    <AlertDescription className="text-green-600 dark:text-green-500 text-sm">
                      {processing.optimizedCount > 0 && `${processing.optimizedCount} images optimized. `}
                      {processing.skippedCount > 0 && `${processing.skippedCount} already optimized. `}
                      {processing.deletedCount > 0 && `${processing.deletedCount} unused assets queued for deletion. `}
                      {processing.errors.length > 0 && `${processing.errors.length} errors occurred.`}
                      {processing.optimizedCount === 0 && processing.deletedCount === 0 && processing.skippedCount === 0 && "No changes needed."}
                      {(processing.optimizedCount > 0 || processing.deletedCount > 0) && (
                        <>
                          <br />
                          <span className="font-medium">Changes are queued - click Deploy in the navbar to apply them.</span>
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  size="lg"
                  className="w-full"
                  onClick={runOneClickOptimization}
                  disabled={isProcessing || (selectedOptimizable.size === 0 && selectedUnused.size === 0)}
                  data-testid="button-one-click-optimize"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Optimize All ({selectedOptimizable.size + selectedUnused.size} items)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Tabs defaultValue="optimize" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="optimize" className="gap-2" data-testid="tab-optimize">
                  <TrendingDown className="w-4 h-4" />
                  Optimize ({analysis.summary.optimizableCount})
                </TabsTrigger>
                <TabsTrigger value="cleanup" className="gap-2" data-testid="tab-cleanup">
                  <Trash2 className="w-4 h-4" />
                  Cleanup ({analysis.summary.unusedCount})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="optimize" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Image className="w-4 h-4" />
                          Large Images ({analysis.optimizableImages.length})
                        </CardTitle>
                        <CardDescription>
                          Images over 200KB that can be compressed
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectAllOptimizable(true)}
                          disabled={isProcessing}
                          data-testid="button-select-all-optimize"
                        >
                          Select All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectAllOptimizable(false)}
                          disabled={isProcessing}
                          data-testid="button-deselect-all-optimize"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {analysis.optimizableImages.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <p>All images are already optimized!</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {analysis.optimizableImages.map((image) => (
                            <div
                              key={image.path}
                              className={`flex items-center gap-3 p-3 rounded-md border ${
                                selectedOptimizable.has(image.path)
                                  ? 'border-primary/50 bg-primary/5'
                                  : 'border-border'
                              }`}
                              data-testid={`optimize-item-${image.name}`}
                            >
                              <Checkbox
                                checked={selectedOptimizable.has(image.path)}
                                onCheckedChange={() => toggleOptimizable(image.path)}
                                disabled={isProcessing}
                                data-testid={`checkbox-optimize-${image.name}`}
                              />
                              <FileImage className="w-8 h-8 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{image.name}</p>
                                <p className="text-xs text-muted-foreground">{image.path}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <Badge variant="secondary">{formatBytes(image.size)}</Badge>
                                <p className="text-xs text-muted-foreground mt-1">
                                  ~{Math.round(image.size * 0.4 / 1024)}KB after
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="cleanup" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <ArchiveX className="w-4 h-4" />
                          Unused Assets ({analysis.unusedImages.length})
                        </CardTitle>
                        <CardDescription>
                          Images not referenced in any posts or settings
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectAllUnused(true)}
                          disabled={isProcessing}
                          data-testid="button-select-all-unused"
                        >
                          Select All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => selectAllUnused(false)}
                          disabled={isProcessing}
                          data-testid="button-deselect-all-unused"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {analysis.unusedImages.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <p>No unused assets found!</p>
                      </div>
                    ) : (
                      <>
                        <Alert className="mb-4">
                          <AlertTriangle className="w-4 h-4" />
                          <AlertDescription className="text-sm">
                            These images are not used in any blog posts, hero images, or site settings.
                            Deleting them will free up {formatBytes(analysis.summary.unusedSize)} of space.
                          </AlertDescription>
                        </Alert>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-2">
                            {analysis.unusedImages.map((image) => (
                              <div
                                key={image.path}
                                className={`flex items-center gap-3 p-3 rounded-md border ${
                                  selectedUnused.has(image.path)
                                    ? 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
                                    : 'border-border'
                                }`}
                                data-testid={`unused-item-${image.name}`}
                              >
                                <Checkbox
                                  checked={selectedUnused.has(image.path)}
                                  onCheckedChange={() => toggleUnused(image.path)}
                                  disabled={isProcessing}
                                  data-testid={`checkbox-unused-${image.name}`}
                                />
                                <FileImage className="w-8 h-8 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{image.name}</p>
                                  <p className="text-xs text-muted-foreground">{image.path}</p>
                                </div>
                                <Badge variant="outline" className="shrink-0">
                                  {formatBytes(image.size)}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <Alert>
              <Info className="w-4 h-4" />
              <AlertTitle>How it works</AlertTitle>
              <AlertDescription className="text-sm">
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Images are compressed while keeping their original format (PNG stays PNG, JPG stays JPG)</li>
                  <li>Unused assets are images not referenced in any posts, hero images, or site settings</li>
                  <li>All changes are queued to Smart Deploy - click the Deploy button in the navbar to apply them</li>
                  <li>This batches all changes into a single commit, saving Vercel build minutes</li>
                </ul>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <Card className="p-8">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-medium mb-2">Analysis Failed</h2>
              <p className="text-muted-foreground mb-4">
                Could not analyze repository performance.
              </p>
              <Button onClick={() => refetchAnalysis()} data-testid="button-retry-analysis">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
