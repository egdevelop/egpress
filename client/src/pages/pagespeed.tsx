import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Search, 
  AlertTriangle, 
  AlertCircle, 
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
  ChevronRight,
  ChevronDown,
  Sparkles,
  Key,
  Settings,
  ExternalLink,
  Save
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

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

export default function PageSpeedPage() {
  const { toast } = useToast();
  const [pageSpeedUrl, setPageSpeedUrl] = useState("");
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<"mobile" | "desktop">("mobile");
  const [pageSpeedResult, setPageSpeedResult] = useState<PageSpeedResult | null>(null);
  const [selectedOptimizations, setSelectedOptimizations] = useState<Set<string>>(new Set());
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: configData, refetch: refetchConfig } = useQuery<{ 
    success: boolean; 
    data: { 
      hasApiKey: boolean; 
      hasServiceAccount: boolean;
      authMethod: "service_account" | "api_key" | "none";
    } 
  }>({
    queryKey: ["/api/pagespeed/config"],
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await apiRequest("POST", "/api/pagespeed/config", { apiKey });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "API Key Saved",
          description: "PageSpeed API key has been configured",
        });
        setApiKeyInput("");
        setShowApiKeySettings(false);
        refetchConfig();
      } else {
        toast({
          title: "Failed to Save",
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

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

  const hasApiKey = configData?.data?.hasApiKey;
  const hasServiceAccount = configData?.data?.hasServiceAccount;
  const authMethod = configData?.data?.authMethod;
  const isAuthenticated = authMethod === "service_account" || authMethod === "api_key";

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="w-6 h-6" />
            PageSpeed Insights
          </h1>
          <p className="text-muted-foreground">
            Analyze your site's performance using Google PageSpeed Insights API
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {authMethod === "service_account" ? "Using Service Account" : "Using API Key"}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowApiKeySettings(!showApiKeySettings)}
            data-testid="button-pagespeed-settings"
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {hasServiceAccount && (
        <div className="flex items-start gap-3 p-4 rounded-md bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-green-700 dark:text-green-400">Using Search Console Service Account</p>
            <p className="text-sm text-muted-foreground">
              PageSpeed API is using the same Service Account as Search Console. 
              No additional configuration needed.
            </p>
          </div>
        </div>
      )}

      {!isAuthenticated && (
        <div className="flex items-start gap-3 p-4 rounded-md bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-yellow-700 dark:text-yellow-400">No Authentication Configured</p>
            <p className="text-sm text-muted-foreground">
              PageSpeed API has very low quota without authentication (about 25 requests/day). 
              Configure Search Console Service Account first, or add an API key.
            </p>
            <Button
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => setShowApiKeySettings(true)}
            >
              Configure API Key
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Collapsible open={showApiKeySettings} onOpenChange={setShowApiKeySettings}>
        <CollapsibleContent>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                PageSpeed Authentication
              </CardTitle>
              <CardDescription>
                Configure authentication for PageSpeed Insights API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasServiceAccount && (
                <div className="p-3 rounded-md bg-green-500/10 border border-green-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Service Account Active
                  </div>
                  <p className="text-sm text-muted-foreground">
                    PageSpeed is using the Service Account from Search Console. 
                    This is the recommended configuration.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {hasServiceAccount ? "Alternative: Use API Key" : "Option: Use API Key"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {hasServiceAccount 
                    ? "You can optionally configure a separate API key as fallback."
                    : "If you don't have Search Console configured, you can use an API key instead."}
                </p>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                  <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Google Cloud Console <ExternalLink className="w-3 h-3" /></a></li>
                  <li>Select the same project as Search Console</li>
                  <li>Enable the "PageSpeed Insights API"</li>
                  <li>Create an API key and paste it below</li>
                </ol>
              </div>
              
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Enter your PageSpeed API key (optional if using Service Account)"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  data-testid="input-pagespeed-apikey"
                />
                <Button
                  onClick={() => saveApiKeyMutation.mutate(apiKeyInput)}
                  disabled={saveApiKeyMutation.isPending || !apiKeyInput}
                  data-testid="button-save-pagespeed-apikey"
                >
                  {saveApiKeyMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>

              {hasApiKey && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  API key is configured {hasServiceAccount && "(fallback)"}
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5" />
            Performance Analysis
          </CardTitle>
          <CardDescription>
            Enter your deployed site URL to analyze performance metrics
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
