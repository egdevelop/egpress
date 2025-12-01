import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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
  TrendingUp
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export default function SEOPage() {
  const { toast } = useToast();
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<ProcessingStatus>({
    phase: "idle",
    progress: 0,
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
            SEO Analyzer
          </h1>
          <p className="text-muted-foreground">
            Analyze and optimize your blog's search engine performance
          </p>
        </div>
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

                <div className="flex items-center justify-between pt-2">
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
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
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
