import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Sparkles, 
  FileText,
  Image as ImageIcon,
  Layout,
  Share2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Wand2,
  TrendingUp,
  Gauge,
  Zap,
  Eye,
  Clock,
  Smartphone,
  Monitor,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

interface SEOIssue {
  id: string;
  type: "error" | "warning" | "info";
  category: "meta" | "content" | "images" | "structure" | "social";
  title: string;
  description: string;
  affectedItem: string;
  currentValue?: string;
  suggestedValue?: string;
  autoFixable: boolean;
}

interface SEOAnalysisResult {
  score: number;
  issues: SEOIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  analyzedPosts: number;
  analyzedAt: string;
}

interface ProcessingStatus {
  phase: "idle" | "analyzing" | "optimizing" | "complete";
  currentItem?: string;
  progress: number;
  optimizedCount?: number;
  errors?: string[];
}

interface CoreWebVitals {
  lcp: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  fid: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  cls: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  inp: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  fcp: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  ttfb: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
}

interface PageSpeedCategory {
  score: number;
  title: string;
}

interface PageSpeedOpportunity {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue: string;
  savings: {
    ms?: number;
    bytes?: number;
  };
  items: any[];
  autoFixable: boolean;
  fixType?: string;
}

interface PageSpeedResult {
  url: string;
  fetchTime: string;
  strategy: "mobile" | "desktop";
  snapshotId?: string;
  categories: {
    performance: PageSpeedCategory;
    accessibility: PageSpeedCategory;
    bestPractices: PageSpeedCategory;
    seo: PageSpeedCategory;
  };
  coreWebVitals: CoreWebVitals;
  opportunities: PageSpeedOpportunity[];
  recommendations: any[];
}

export default function SEOPage() {
  const { toast } = useToast();
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<ProcessingStatus>({
    phase: "idle",
    progress: 0,
  });
  const [activeMainTab, setActiveMainTab] = useState<"content" | "performance">("content");
  const [pageSpeedUrl, setPageSpeedUrl] = useState("");
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<"mobile" | "desktop">("mobile");
  const [pageSpeedResult, setPageSpeedResult] = useState<PageSpeedResult | null>(null);
  const [selectedOptimizations, setSelectedOptimizations] = useState<Set<string>>(new Set());

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: analysisData, isLoading, refetch } = useQuery<{ success: boolean; data: SEOAnalysisResult }>({
    queryKey: ["/api/seo/analyze"],
    refetchOnWindowFocus: false,
  });

  const { data: hasApiKey } = useQuery<{ success: boolean; data: { hasKey: boolean } }>({
    queryKey: ["/api/ai/key"],
  });

  const analysis = analysisData?.data;
  const issues = analysis?.issues || [];

  const pageSpeedMutation = useMutation({
    mutationFn: async ({ url, strategy }: { url: string; strategy: "mobile" | "desktop" }) => {
      const response = await apiRequest("POST", "/api/pagespeed/analyze", { url, strategy });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setPageSpeedResult(data.data);
        toast({
          title: "Analysis Complete",
          description: `PageSpeed score: ${data.data.categories.performance.score}`,
        });
      } else {
        toast({
          title: "Analysis Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze URL",
        variant: "destructive",
      });
    },
  });

  const optimizeMutation = useMutation({
    mutationFn: async ({ recommendations, snapshotId }: { recommendations: any[]; snapshotId?: string }) => {
      const response = await apiRequest("POST", "/api/pagespeed/optimize", {
        recommendations,
        snapshotId,
        queueOnly: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Optimizations Applied",
          description: `${data.data.appliedOptimizations?.length || 0} changes queued for deployment`,
        });
        setSelectedOptimizations(new Set());
        queryClient.invalidateQueries({ queryKey: ["/api/smart-deploy/queue"] });
      } else {
        toast({
          title: "Optimization Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "meta": return <FileText className="w-4 h-4" />;
      case "content": return <Layout className="w-4 h-4" />;
      case "images": return <ImageIcon className="w-4 h-4" />;
      case "structure": return <Layout className="w-4 h-4" />;
      case "social": return <Share2 className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "error": return <AlertCircle className="w-4 h-4 text-destructive" />;
      case "warning": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "info": return <Info className="w-4 h-4 text-blue-500" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-destructive";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 80) return "Good";
    if (score >= 60) return "Needs Work";
    if (score >= 40) return "Poor";
    return "Critical";
  };

  const getCWVColor = (score: "good" | "needs-improvement" | "poor") => {
    switch (score) {
      case "good": return "text-green-500 bg-green-500/10";
      case "needs-improvement": return "text-yellow-500 bg-yellow-500/10";
      case "poor": return "text-red-500 bg-red-500/10";
    }
  };

  const autoFixableIssues = issues.filter(i => i.autoFixable);
  const postsWithIssues = [...new Set(autoFixableIssues.map(i => i.affectedItem).filter(a => a !== "site-settings"))];

  const handleSelectAll = () => {
    if (selectedPosts.size === postsWithIssues.length) {
      setSelectedPosts(new Set());
    } else {
      setSelectedPosts(new Set(postsWithIssues));
    }
  };

  const handleTogglePost = (slug: string) => {
    const newSelected = new Set(selectedPosts);
    if (newSelected.has(slug)) {
      newSelected.delete(slug);
    } else {
      newSelected.add(slug);
    }
    setSelectedPosts(newSelected);
  };

  const runOptimization = async () => {
    if (selectedPosts.size === 0) {
      toast({
        title: "No posts selected",
        description: "Select posts to optimize",
        variant: "destructive",
      });
      return;
    }

    if (!hasApiKey?.data?.hasKey) {
      toast({
        title: "API Key Required",
        description: "Please set your Gemini API key in AI Settings first",
        variant: "destructive",
      });
      return;
    }

    setProcessing({
      phase: "optimizing",
      currentItem: "Optimizing posts with AI...",
      progress: 10,
    });

    try {
      const response = await fetch("/api/seo/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postSlugs: Array.from(selectedPosts),
          queueOnly: true,
        }),
        credentials: "include",
      });

      const result = await response.json();

      if (result.success) {
        setProcessing({
          phase: "complete",
          progress: 100,
          optimizedCount: result.data.optimizedCount,
        });

        queryClient.invalidateQueries({ queryKey: ["/api/seo/analyze"] });
        queryClient.invalidateQueries({ queryKey: ["/api/smart-deploy/queue"] });

        toast({
          title: "SEO Optimization Complete",
          description: `Optimized ${result.data.optimizedCount} post${result.data.optimizedCount !== 1 ? 's' : ''}. Changes queued for deployment.`,
        });

        setSelectedPosts(new Set());
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      setProcessing({
        phase: "complete",
        progress: 100,
        errors: [error.message],
      });

      toast({
        title: "Optimization Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const runPageSpeedAnalysis = () => {
    if (!pageSpeedUrl) {
      toast({
        title: "URL Required",
        description: "Please enter a URL to analyze",
        variant: "destructive",
      });
      return;
    }

    pageSpeedMutation.mutate({ url: pageSpeedUrl, strategy: pageSpeedStrategy });
  };

  const handleApplyOptimizations = () => {
    if (!pageSpeedResult || selectedOptimizations.size === 0) return;

    const selectedRecs = pageSpeedResult.recommendations.filter(
      r => selectedOptimizations.has(r.id)
    );

    optimizeMutation.mutate({ 
      recommendations: selectedRecs, 
      snapshotId: pageSpeedResult.snapshotId 
    });
  };

  const issuesByCategory = {
    meta: issues.filter(i => i.category === "meta"),
    content: issues.filter(i => i.category === "content"),
    images: issues.filter(i => i.category === "images"),
    structure: issues.filter(i => i.category === "structure"),
    social: issues.filter(i => i.category === "social"),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Analyzing SEO...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Search className="w-6 h-6" />
            SEO & Performance
          </h1>
          <p className="text-muted-foreground">
            Analyze and optimize your blog's search engine and performance
          </p>
        </div>
      </div>

      <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as "content" | "performance")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="content" className="gap-2" data-testid="tab-content-seo">
            <FileText className="w-4 h-4" />
            Content SEO
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2" data-testid="tab-performance">
            <Gauge className="w-4 h-4" />
            PageSpeed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
              data-testid="button-refresh-seo"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Re-analyze
            </Button>
          </div>

          {analysis && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${getScoreColor(analysis.score)}`}>
                        {analysis.score}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">SEO Score</p>
                      <Badge variant="outline" className="mt-2">
                        {getScoreLabel(analysis.score)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-destructive/10">
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{analysis.summary.errors}</div>
                        <p className="text-sm text-muted-foreground">Errors</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-yellow-500/10">
                        <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{analysis.summary.warnings}</div>
                        <p className="text-sm text-muted-foreground">Warnings</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-blue-500/10">
                        <Info className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{analysis.summary.info}</div>
                        <p className="text-sm text-muted-foreground">Suggestions</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {autoFixableIssues.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wand2 className="w-5 h-5" />
                      One-Click SEO Optimization
                    </CardTitle>
                    <CardDescription>
                      {autoFixableIssues.length} issues can be automatically fixed using AI.
                      Select posts to optimize:
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {processing.phase !== "idle" && processing.phase !== "complete" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>{processing.currentItem}</span>
                          <span>{Math.round(processing.progress)}%</span>
                        </div>
                        <Progress value={processing.progress} />
                      </div>
                    )}

                    {processing.phase === "complete" && (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="w-5 h-5" />
                        <span>
                          Optimized {processing.optimizedCount} post{processing.optimizedCount !== 1 ? 's' : ''}.
                          {processing.errors && processing.errors.length > 0 && ` (${processing.errors.length} errors)`}
                        </span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={selectedPosts.size === postsWithIssues.length && postsWithIssues.length > 0}
                            onCheckedChange={handleSelectAll}
                            data-testid="checkbox-select-all-posts"
                          />
                          <span className="text-sm font-medium">Select All ({postsWithIssues.length} posts)</span>
                        </label>
                      </div>

                      <ScrollArea className="h-40 border rounded-md p-2">
                        <div className="space-y-1">
                          {postsWithIssues.map(slug => {
                            const postIssues = autoFixableIssues.filter(i => i.affectedItem === slug);
                            return (
                              <label key={slug} className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer">
                                <Checkbox
                                  checked={selectedPosts.has(slug)}
                                  onCheckedChange={() => handleTogglePost(slug)}
                                  data-testid={`checkbox-post-${slug}`}
                                />
                                <span className="text-sm flex-1">{slug}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {postIssues.length} issue{postIssues.length !== 1 ? 's' : ''}
                                </Badge>
                              </label>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="flex items-center justify-between pt-2 gap-4 flex-wrap">
                      <p className="text-sm text-muted-foreground">
                        AI will generate optimized meta descriptions and tags for selected posts
                      </p>
                      <Button
                        onClick={runOptimization}
                        disabled={selectedPosts.size === 0 || processing.phase === "optimizing"}
                        data-testid="button-optimize-seo"
                      >
                        {processing.phase === "optimizing" ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Optimizing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Optimize {selectedPosts.size > 0 ? `${selectedPosts.size} Post${selectedPosts.size !== 1 ? 's' : ''}` : 'Selected'}
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    All Issues ({issues.length})
                  </CardTitle>
                  <CardDescription>
                    Analyzed {analysis.analyzedPosts} posts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="all">
                    <TabsList className="flex-wrap h-auto gap-1">
                      <TabsTrigger value="all" className="gap-1">
                        All
                        <Badge variant="secondary" className="ml-1">{issues.length}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value="meta" className="gap-1">
                        <FileText className="w-3 h-3" />
                        Meta
                        <Badge variant="secondary" className="ml-1">{issuesByCategory.meta.length}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value="content" className="gap-1">
                        <Layout className="w-3 h-3" />
                        Content
                        <Badge variant="secondary" className="ml-1">{issuesByCategory.content.length}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value="images" className="gap-1">
                        <ImageIcon className="w-3 h-3" />
                        Images
                        <Badge variant="secondary" className="ml-1">{issuesByCategory.images.length}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value="social" className="gap-1">
                        <Share2 className="w-3 h-3" />
                        Social
                        <Badge variant="secondary" className="ml-1">{issuesByCategory.social.length}</Badge>
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="mt-4">
                      <IssueList issues={issues} getTypeIcon={getTypeIcon} getCategoryIcon={getCategoryIcon} />
                    </TabsContent>
                    <TabsContent value="meta" className="mt-4">
                      <IssueList issues={issuesByCategory.meta} getTypeIcon={getTypeIcon} getCategoryIcon={getCategoryIcon} />
                    </TabsContent>
                    <TabsContent value="content" className="mt-4">
                      <IssueList issues={issuesByCategory.content} getTypeIcon={getTypeIcon} getCategoryIcon={getCategoryIcon} />
                    </TabsContent>
                    <TabsContent value="images" className="mt-4">
                      <IssueList issues={issuesByCategory.images} getTypeIcon={getTypeIcon} getCategoryIcon={getCategoryIcon} />
                    </TabsContent>
                    <TabsContent value="social" className="mt-4">
                      <IssueList issues={issuesByCategory.social} getTypeIcon={getTypeIcon} getCategoryIcon={getCategoryIcon} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          )}

          {!analysis && !isLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Analysis Available</h3>
                <p className="text-muted-foreground mb-4">
                  Connect a repository with blog posts to analyze SEO
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5" />
                PageSpeed Insights
              </CardTitle>
              <CardDescription>
                Analyze your site's performance using Google PageSpeed Insights API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    placeholder="Enter URL to analyze (e.g., https://example.com)"
                    value={pageSpeedUrl}
                    onChange={(e) => setPageSpeedUrl(e.target.value)}
                    data-testid="input-pagespeed-url"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={pageSpeedStrategy === "mobile" ? "default" : "outline"}
                    size="icon"
                    onClick={() => setPageSpeedStrategy("mobile")}
                    data-testid="button-strategy-mobile"
                  >
                    <Smartphone className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={pageSpeedStrategy === "desktop" ? "default" : "outline"}
                    size="icon"
                    onClick={() => setPageSpeedStrategy("desktop")}
                    data-testid="button-strategy-desktop"
                  >
                    <Monitor className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  onClick={runPageSpeedAnalysis}
                  disabled={pageSpeedMutation.isPending || !pageSpeedUrl}
                  data-testid="button-analyze-pagespeed"
                >
                  {pageSpeedMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Analyze
                    </>
                  )}
                </Button>
              </div>

              {repoData?.data && (
                <p className="text-sm text-muted-foreground">
                  Tip: Enter your deployed site URL to analyze performance
                </p>
              )}
            </CardContent>
          </Card>

          {pageSpeedResult && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ScoreCard
                  title="Performance"
                  score={pageSpeedResult.categories.performance.score}
                  icon={<Zap className="w-5 h-5" />}
                />
                <ScoreCard
                  title="Accessibility"
                  score={pageSpeedResult.categories.accessibility.score}
                  icon={<Eye className="w-5 h-5" />}
                />
                <ScoreCard
                  title="Best Practices"
                  score={pageSpeedResult.categories.bestPractices.score}
                  icon={<CheckCircle2 className="w-5 h-5" />}
                />
                <ScoreCard
                  title="SEO"
                  score={pageSpeedResult.categories.seo.score}
                  icon={<Search className="w-5 h-5" />}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Core Web Vitals
                  </CardTitle>
                  <CardDescription>
                    Key metrics that measure real-world user experience
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <MetricCard
                      name="LCP"
                      fullName="Largest Contentful Paint"
                      value={pageSpeedResult.coreWebVitals.lcp.displayValue}
                      score={pageSpeedResult.coreWebVitals.lcp.score}
                    />
                    <MetricCard
                      name="FID"
                      fullName="First Input Delay"
                      value={pageSpeedResult.coreWebVitals.fid.displayValue}
                      score={pageSpeedResult.coreWebVitals.fid.score}
                    />
                    <MetricCard
                      name="CLS"
                      fullName="Cumulative Layout Shift"
                      value={pageSpeedResult.coreWebVitals.cls.displayValue}
                      score={pageSpeedResult.coreWebVitals.cls.score}
                    />
                    <MetricCard
                      name="INP"
                      fullName="Interaction to Next Paint"
                      value={pageSpeedResult.coreWebVitals.inp.displayValue}
                      score={pageSpeedResult.coreWebVitals.inp.score}
                    />
                    <MetricCard
                      name="FCP"
                      fullName="First Contentful Paint"
                      value={pageSpeedResult.coreWebVitals.fcp.displayValue}
                      score={pageSpeedResult.coreWebVitals.fcp.score}
                    />
                    <MetricCard
                      name="TTFB"
                      fullName="Time to First Byte"
                      value={pageSpeedResult.coreWebVitals.ttfb.displayValue}
                      score={pageSpeedResult.coreWebVitals.ttfb.score}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wand2 className="w-5 h-5" />
                    One-Click Optimization
                  </CardTitle>
                  <CardDescription>
                    {pageSpeedResult.recommendations && pageSpeedResult.recommendations.length > 0
                      ? `${pageSpeedResult.recommendations.length} optimizations can be automatically applied`
                      : "Automated optimizations based on PageSpeed analysis"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pageSpeedResult.recommendations && pageSpeedResult.recommendations.length > 0 ? (
                    <>
                      <ScrollArea className="h-60 border rounded-md p-2">
                        <div className="space-y-2">
                          {pageSpeedResult.recommendations.map((rec: any) => (
                            <label
                              key={rec.id}
                              className="flex items-start gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                              data-testid={`recommendation-${rec.id}`}
                            >
                              <Checkbox
                                checked={selectedOptimizations.has(rec.id)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(selectedOptimizations);
                                  if (checked) {
                                    newSet.add(rec.id);
                                  } else {
                                    newSet.delete(rec.id);
                                  }
                                  setSelectedOptimizations(newSet);
                                }}
                                data-testid={`checkbox-optimization-${rec.id}`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{rec.title}</span>
                                  <Badge
                                    variant={rec.priority === "high" ? "destructive" : rec.priority === "medium" ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {rec.priority}
                                  </Badge>
                                  {rec.estimatedSavings && (
                                    <Badge variant="outline" className="text-xs">
                                      Save {rec.estimatedSavings}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            </label>
                          ))}
                        </div>
                      </ScrollArea>

                      <div className="flex items-center justify-between pt-2 gap-4 flex-wrap">
                        <p className="text-sm text-muted-foreground">
                          Selected optimizations will be queued for Smart Deploy
                        </p>
                        <Button
                          onClick={handleApplyOptimizations}
                          disabled={selectedOptimizations.size === 0 || optimizeMutation.isPending}
                          data-testid="button-apply-optimizations"
                        >
                          {optimizeMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Applying...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Apply {selectedOptimizations.size} Optimization{selectedOptimizations.size !== 1 ? 's' : ''}
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground" data-testid="no-recommendations-message">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-500" />
                      <p className="font-medium text-foreground">Great job! No automated fixes needed</p>
                      <p className="text-sm mt-1">
                        {pageSpeedResult.categories.performance.score >= 90
                          ? "Your site already has excellent performance."
                          : "Check the opportunities section below for manual optimization suggestions."}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {pageSpeedResult.opportunities && pageSpeedResult.opportunities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Opportunities ({pageSpeedResult.opportunities.length})
                    </CardTitle>
                    <CardDescription>
                      Suggestions to improve page load performance
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-80">
                      <div className="space-y-2">
                        {pageSpeedResult.opportunities.map((opp) => (
                          <div
                            key={opp.id}
                            className="p-3 border rounded-md space-y-2"
                            data-testid={`opportunity-${opp.id}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`p-1 rounded ${opp.score < 0.5 ? 'bg-red-500/10' : opp.score < 0.9 ? 'bg-yellow-500/10' : 'bg-green-500/10'}`}>
                                {opp.score < 0.5 ? (
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                                ) : opp.score < 0.9 ? (
                                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{opp.title}</span>
                                  {opp.displayValue && (
                                    <Badge variant="outline" className="text-xs">
                                      {opp.displayValue}
                                    </Badge>
                                  )}
                                  {opp.autoFixable && (
                                    <Badge variant="secondary" className="text-xs gap-1">
                                      <Wand2 className="w-3 h-3" />
                                      Auto-fixable
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {opp.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!pageSpeedResult && !pageSpeedMutation.isPending && (
            <Card>
              <CardContent className="py-12 text-center">
                <Gauge className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Analysis Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Enter a URL above to analyze its PageSpeed performance
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScoreCard({ title, score, icon }: { title: string; score: number; icon: React.ReactNode }) {
  const getColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getBgColor = (score: number) => {
    if (score >= 90) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full border-4 flex items-center justify-center relative">
            <span className={`text-2xl font-bold ${getColor(score)}`}>{score}</span>
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/20"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${score * 2.83} 283`}
                className={getBgColor(score)}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="flex items-center justify-center gap-1 text-muted-foreground">
            {icon}
            <span className="text-sm font-medium">{title}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ name, fullName, value, score }: { name: string; fullName: string; value: string; score: "good" | "needs-improvement" | "poor" }) {
  const getColor = (score: "good" | "needs-improvement" | "poor") => {
    switch (score) {
      case "good": return "text-green-500 border-green-500/30 bg-green-500/5";
      case "needs-improvement": return "text-yellow-500 border-yellow-500/30 bg-yellow-500/5";
      case "poor": return "text-red-500 border-red-500/30 bg-red-500/5";
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${getColor(score)}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{fullName}</p>
          <p className="text-lg font-bold">{name}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-mono font-bold">{value}</p>
          <Badge variant="outline" className={`text-xs ${getColor(score)}`}>
            {score === "good" ? "Good" : score === "needs-improvement" ? "Needs Work" : "Poor"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function IssueList({ 
  issues, 
  getTypeIcon, 
  getCategoryIcon 
}: { 
  issues: SEOIssue[]; 
  getTypeIcon: (type: string) => JSX.Element;
  getCategoryIcon: (category: string) => JSX.Element;
}) {
  if (issues.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
        No issues in this category
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {issues.map(issue => (
          <div
            key={issue.id}
            className="p-3 border rounded-md space-y-2"
            data-testid={`issue-${issue.id}`}
          >
            <div className="flex items-start gap-3">
              {getTypeIcon(issue.type)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{issue.title}</span>
                  <Badge variant="outline" className="text-xs gap-1">
                    {getCategoryIcon(issue.category)}
                    {issue.category}
                  </Badge>
                  {issue.autoFixable && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Wand2 className="w-3 h-3" />
                      Auto-fixable
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {issue.affectedItem}
                  </Badge>
                  {issue.currentValue && (
                    <span className="truncate max-w-xs">Current: {issue.currentValue}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
