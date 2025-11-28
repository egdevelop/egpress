import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Search, 
  Send, 
  RefreshCw, 
  Key, 
  Check, 
  X, 
  ExternalLink,
  FileText,
  Globe,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  Plus,
  Copy,
  Wand2,
  FileCode
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, Post } from "@shared/schema";

const credentialsSchema = z.object({
  serviceAccountJson: z.string().min(1, "Service account JSON is required"),
});

type CredentialsFormValues = z.infer<typeof credentialsSchema>;

interface IndexingStatus {
  url: string;
  status: "pending" | "submitted" | "indexed" | "error";
  lastSubmitted?: string;
  message?: string;
}

interface SearchConsoleConfig {
  siteUrl: string;
  hasCredentials: boolean;
}

interface SearchConsoleSite {
  siteUrl: string;
  permissionLevel: string;
}

interface Sitemap {
  path: string;
  lastSubmitted?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  lastDownloaded?: string;
  warnings?: number;
  errors?: number;
}

export default function SearchConsole() {
  const { toast } = useToast();
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [sitemapDomain, setSitemapDomain] = useState("");
  const [showSitesDialog, setShowSitesDialog] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [customUrl, setCustomUrl] = useState("");
  const [showAddDomainDialog, setShowAddDomainDialog] = useState(false);
  const [newDomainUrl, setNewDomainUrl] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [verificationStep, setVerificationStep] = useState<"enter" | "verify" | "confirm">("enter");

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: postsData } = useQuery<{ success: boolean; data: Post[] }>({
    queryKey: ["/api/posts"],
    enabled: !!repoData?.data,
  });

  const { data: configData, isLoading: configLoading } = useQuery<{ success: boolean; data: SearchConsoleConfig | null }>({
    queryKey: ["/api/search-console/config"],
  });

  const { data: sitesData, isLoading: sitesLoading, isError: sitesError, refetch: refetchSites } = useQuery<{ success: boolean; data: SearchConsoleSite[] }>({
    queryKey: ["/api/search-console/sites"],
    enabled: !!configData?.data?.hasCredentials,
  });

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<{ success: boolean; data: IndexingStatus[] }>({
    queryKey: ["/api/search-console/status"],
    enabled: !!configData?.data?.hasCredentials,
  });

  const { data: sitemapsData, isLoading: sitemapsLoading, refetch: refetchSitemaps } = useQuery<{ success: boolean; data: Sitemap[] }>({
    queryKey: ["/api/search-console/sitemaps"],
    enabled: !!configData?.data?.hasCredentials && !!configData?.data?.siteUrl,
  });

  const form = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      serviceAccountJson: "",
    },
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: CredentialsFormValues) => {
      const response = await apiRequest("POST", "/api/search-console/credentials", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Credentials Saved",
          description: "Google Search Console credentials have been configured",
        });
        setShowCredentialsDialog(false);
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/config"] });
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save credentials",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "An error occurred while saving credentials",
        variant: "destructive",
      });
    },
  });

  const submitUrlMutation = useMutation({
    mutationFn: async (urls: string[]) => {
      const response = await apiRequest("POST", "/api/search-console/submit", { urls });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "URLs Submitted",
          description: `${data.submitted}/${data.total} URL(s) submitted to Google Indexing API`,
        });
        setSelectedUrls([]);
        setCustomUrl("");
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/status"] });
        
        if (data.errors && data.errors.length > 0) {
          toast({
            title: "Some URLs Failed",
            description: data.errors.slice(0, 3).join("; "),
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Submission Failed",
          description: data.error || "Failed to submit URLs",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Submission Failed",
        description: "An error occurred while submitting URLs",
        variant: "destructive",
      });
    },
  });

  const submitSitemapMutation = useMutation({
    mutationFn: async (sitemapUrl: string) => {
      const response = await apiRequest("POST", "/api/search-console/submit-sitemap", { sitemapUrl });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Sitemap Submitted",
          description: data.message || "Sitemap has been submitted to Google",
        });
        setSitemapUrl("");
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/sitemaps"] });
      } else {
        toast({
          title: "Sitemap Submission Failed",
          description: data.error || "Failed to submit sitemap",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Sitemap Submission Failed",
        description: "An error occurred while submitting sitemap",
        variant: "destructive",
      });
    },
  });

  const clearCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/search-console/credentials");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Credentials Cleared",
          description: "Google Search Console credentials have been removed",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/config"] });
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/sites"] });
      }
    },
  });

  const selectSiteMutation = useMutation({
    mutationFn: async (siteUrl: string) => {
      const response = await apiRequest("POST", "/api/search-console/select-site", { siteUrl });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Site Selected",
          description: "Site URL has been configured",
        });
        setShowSitesDialog(false);
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/config"] });
      } else {
        toast({
          title: "Selection Failed",
          description: data.error || "Failed to select site",
          variant: "destructive",
        });
      }
    },
  });

  const autoGenerateSitemapMutation = useMutation({
    mutationFn: async (domain: string) => {
      const response = await apiRequest("POST", "/api/sitemap/auto-generate", { domain });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Sitemap Generated",
          description: data.message || `Generated sitemap with ${data.urlCount} URLs`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/sitemaps"] });
      } else {
        toast({
          title: "Generation Failed",
          description: data.error || "Failed to generate sitemap",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "An error occurred while generating sitemap",
        variant: "destructive",
      });
    },
  });

  const getVerificationTokenMutation = useMutation({
    mutationFn: async (siteUrl: string) => {
      const response = await apiRequest("POST", "/api/search-console/verify-domain", { siteUrl, method: "FILE" });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setVerificationToken(data.token);
        setVerificationStep("verify");
      } else {
        toast({
          title: "Failed to Get Token",
          description: data.error || "Could not get verification token",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Failed to Get Token",
        description: "An error occurred while getting verification token",
        variant: "destructive",
      });
    },
  });

  const commitVerificationMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", "/api/search-console/commit-verification", { token, siteUrl: newDomainUrl });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Verification File Committed",
          description: "Deploy your site, then click 'Verify & Add Site'",
        });
        setVerificationStep("confirm");
      } else {
        toast({
          title: "Commit Failed",
          description: data.error || "Failed to commit verification file",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Commit Failed",
        description: "An error occurred while committing verification file",
        variant: "destructive",
      });
    },
  });

  const addSiteMutation = useMutation({
    mutationFn: async (siteUrl: string) => {
      const response = await apiRequest("POST", "/api/search-console/add-site", { siteUrl });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Site Added",
          description: "Site has been verified and added to Search Console!",
        });
        setShowAddDomainDialog(false);
        setNewDomainUrl("");
        setVerificationToken("");
        setVerificationStep("enter");
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/sites"] });
      } else {
        toast({
          title: "Verification Failed",
          description: data.error || "Failed to verify site",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Verification Failed",
        description: "An error occurred while verifying site",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;
  const posts = postsData?.data || [];
  const config = configData?.data;
  const sites = sitesData?.data || [];
  const indexingStatus = statusData?.data || [];
  const sitemaps = sitemapsData?.data || [];

  const getPostUrl = (post: Post) => {
    if (!config?.siteUrl) return "";
    const baseUrl = config.siteUrl.replace(/\/$/, "");
    return `${baseUrl}/blog/${post.slug}`;
  };

  const toggleUrlSelection = (url: string) => {
    setSelectedUrls(prev => 
      prev.includes(url) 
        ? prev.filter(u => u !== url)
        : [...prev, url]
    );
  };

  const selectAllUrls = () => {
    const allUrls = posts.map(getPostUrl).filter(Boolean);
    setSelectedUrls(allUrls);
  };

  const handleSubmitSelected = () => {
    if (selectedUrls.length > 0) {
      submitUrlMutation.mutate(selectedUrls);
    }
  };

  const handleSubmitCustomUrl = () => {
    if (customUrl.trim()) {
      submitUrlMutation.mutate([customUrl.trim()]);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "indexed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "submitted":
        return <Clock className="w-4 h-4 text-amber-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "indexed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-200">Indexed</Badge>;
      case "submitted":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">Submitted</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <div className="text-center">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository to use Google Search Console integration.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <Search className="w-8 h-8 text-primary" />
            Google Search Console
          </h1>
          <p className="text-muted-foreground mt-1">
            Submit URLs for indexing and track indexing status
          </p>
        </div>

        <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
          <DialogTrigger asChild>
            <Button variant={config?.hasCredentials ? "outline" : "default"} data-testid="button-configure-credentials">
              <Key className="w-4 h-4 mr-2" />
              {config?.hasCredentials ? "Update Credentials" : "Configure API"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Google Search Console API Credentials</DialogTitle>
              <DialogDescription>
                Enter your Google Cloud service account credentials for the Indexing API
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => saveCredentialsMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="serviceAccountJson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Account JSON</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='{"type": "service_account", "project_id": "...", ...}'
                          rows={8}
                          className="font-mono text-sm"
                          {...field}
                          data-testid="input-service-account-json"
                        />
                      </FormControl>
                      <FormDescription>
                        Paste your Google Cloud service account JSON key (with Indexing API permissions)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCredentialsDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveCredentialsMutation.isPending}
                    data-testid="button-save-credentials"
                  >
                    {saveCredentialsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Save Credentials
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {config?.hasCredentials ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-200">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-700">API Connected</p>
              {config.siteUrl ? (
                <p className="text-xs text-green-600">{config.siteUrl}</p>
              ) : (
                <p className="text-xs text-amber-600">No site selected - choose a site below</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearCredentialsMutation.mutate()}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              data-testid="button-clear-credentials"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {!config.siteUrl && sites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Select a Site
                </CardTitle>
                <CardDescription>
                  Choose a verified site from your Google Search Console account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {sites.map((site) => (
                    <Button
                      key={site.siteUrl}
                      variant="outline"
                      className="justify-start h-auto py-3 px-4"
                      onClick={() => selectSiteMutation.mutate(site.siteUrl)}
                      disabled={selectSiteMutation.isPending}
                      data-testid={`button-select-site-${site.siteUrl}`}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1 text-left">
                          <p className="font-medium">{site.siteUrl}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {site.permissionLevel?.toLowerCase() || "owner"}
                          </p>
                        </div>
                        {selectSiteMutation.isPending && (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!config.siteUrl && sitesLoading && (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading sites from your Search Console account...</span>
                </div>
              </CardContent>
            </Card>
          )}

          {!config.siteUrl && !sitesLoading && sitesError && (
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="py-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">Failed to Load Sites</p>
                    <p className="text-sm text-red-700 mt-1">
                      There was an error loading sites from Google Search Console. Check that your service account credentials are valid.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => refetchSites()}
                      data-testid="button-retry-sites"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!config.siteUrl && !sitesLoading && !sitesError && sites.length === 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="py-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-amber-800">No Sites Found</p>
                      <p className="text-sm text-amber-700 mt-1">
                        The service account needs to be added as a user in Google Search Console.
                      </p>
                    </div>
                    
                    <div className="bg-amber-100/50 rounded-md p-3 text-sm text-amber-800 space-y-2">
                      <p className="font-medium">How to add access:</p>
                      <ol className="list-decimal list-inside space-y-1 text-amber-700">
                        <li>Go to <a href="https://search.google.com/search-console/" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900">Google Search Console</a></li>
                        <li>Select your site/property</li>
                        <li>Click <strong>Settings</strong> → <strong>Users and permissions</strong></li>
                        <li>Click <strong>Add user</strong></li>
                        <li>Enter the service account email (from <code className="bg-amber-200/50 px-1 rounded">client_email</code> in your JSON file)</li>
                        <li>Set permission to <strong>Full</strong></li>
                        <li>Click <strong>Add</strong></li>
                      </ol>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchSites()}
                        data-testid="button-refresh-sites"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setShowAddDomainDialog(true)}
                        data-testid="button-add-domain"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Domain
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {config.siteUrl && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSitesDialog(true)}
                data-testid="button-change-site"
              >
                <Globe className="w-4 h-4 mr-2" />
                Change Site
              </Button>
            </div>
          )}

          <Dialog open={showSitesDialog} onOpenChange={setShowSitesDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Select a Site</DialogTitle>
                <DialogDescription>
                  Choose a verified site from your Google Search Console account
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                {sitesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : sites.length > 0 ? (
                  sites.map((site) => (
                    <Button
                      key={site.siteUrl}
                      variant={site.siteUrl === config.siteUrl ? "secondary" : "outline"}
                      className="justify-start h-auto py-3 px-4"
                      onClick={() => selectSiteMutation.mutate(site.siteUrl)}
                      disabled={selectSiteMutation.isPending}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1 text-left">
                          <p className="font-medium">{site.siteUrl}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {site.permissionLevel?.toLowerCase() || "owner"}
                          </p>
                        </div>
                        {site.siteUrl === config.siteUrl && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </Button>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No sites found in your Search Console account</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowSitesDialog(false);
                  setShowAddDomainDialog(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Domain
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddDomainDialog} onOpenChange={(open) => {
            setShowAddDomainDialog(open);
            if (!open) {
              setNewDomainUrl("");
              setVerificationToken("");
              setVerificationStep("enter");
            }
          }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Domain</DialogTitle>
                <DialogDescription>
                  Verify and add a new site to Google Search Console
                </DialogDescription>
              </DialogHeader>

              {verificationStep === "enter" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Site URL</label>
                    <Input
                      placeholder="https://yourblog.com"
                      value={newDomainUrl}
                      onChange={(e) => setNewDomainUrl(e.target.value)}
                      data-testid="input-new-domain-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the full URL including https://
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => getVerificationTokenMutation.mutate(newDomainUrl)}
                    disabled={!newDomainUrl.trim() || getVerificationTokenMutation.isPending}
                    data-testid="button-get-verification-token"
                  >
                    {getVerificationTokenMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Key className="w-4 h-4 mr-2" />
                    )}
                    Get Verification Token
                  </Button>
                </div>
              )}

              {verificationStep === "verify" && (
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Verification File</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(verificationToken);
                          toast({ title: "Copied!", description: "Token copied to clipboard" });
                        }}
                      >
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <code className="block text-xs bg-background p-2 rounded border break-all">
                      {verificationToken}
                    </code>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      A verification file will be committed to your repository at:
                    </p>
                    <code className="block text-xs bg-muted p-2 rounded">
                      public/{verificationToken}
                    </code>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setVerificationStep("enter")}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => commitVerificationMutation.mutate(verificationToken)}
                      disabled={commitVerificationMutation.isPending}
                      className="flex-1"
                      data-testid="button-commit-verification"
                    >
                      {commitVerificationMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileCode className="w-4 h-4 mr-2" />
                      )}
                      Commit to Repo
                    </Button>
                  </div>
                </div>
              )}

              {verificationStep === "confirm" && (
                <div className="space-y-4">
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div className="text-sm text-amber-800">
                          <p className="font-medium">Deploy your site first!</p>
                          <p className="mt-1">
                            The verification file has been committed. Deploy your site to Vercel (or your hosting provider) so Google can access the file.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setVerificationStep("verify")}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={() => addSiteMutation.mutate(newDomainUrl)}
                      disabled={addSiteMutation.isPending}
                      className="flex-1"
                      data-testid="button-verify-site"
                    >
                      {addSiteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Verify & Add Site
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <Key className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <h3 className="font-medium mb-1">API Not Configured</h3>
                <p className="text-sm text-muted-foreground">
                  Configure your Google Search Console API credentials to start submitting URLs for indexing
                </p>
              </div>
              <Button onClick={() => setShowCredentialsDialog(true)}>
                <Key className="w-4 h-4 mr-2" />
                Configure API Credentials
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {config?.hasCredentials && config?.siteUrl && (
        <Tabs defaultValue="posts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="posts" data-testid="tab-posts">
              <FileText className="w-4 h-4 mr-2" />
              Blog Posts
            </TabsTrigger>
            <TabsTrigger value="custom" data-testid="tab-custom">
              <Globe className="w-4 h-4 mr-2" />
              Custom URL
            </TabsTrigger>
            <TabsTrigger value="sitemap" data-testid="tab-sitemap">
              <FileText className="w-4 h-4 mr-2" />
              Sitemap
            </TabsTrigger>
            <TabsTrigger value="status" data-testid="tab-status">
              <Clock className="w-4 h-4 mr-2" />
              Indexing Status
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Submit Posts for Indexing</CardTitle>
                    <CardDescription>
                      Select posts to submit to Google for indexing
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={selectAllUrls} data-testid="button-select-all">
                      Select All
                    </Button>
                    <Button
                      size="sm"
                      disabled={selectedUrls.length === 0 || submitUrlMutation.isPending}
                      onClick={handleSubmitSelected}
                      data-testid="button-submit-selected"
                    >
                      {submitUrlMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Submit ({selectedUrls.length})
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Post Title</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posts.length > 0 ? posts.map(post => {
                        const url = getPostUrl(post);
                        const status = indexingStatus.find(s => s.url === url);
                        const isSelected = selectedUrls.includes(url);
                        
                        return (
                          <TableRow 
                            key={post.slug}
                            className="cursor-pointer"
                            onClick={() => toggleUrlSelection(url)}
                            data-testid={`row-post-${post.slug}`}
                          >
                            <TableCell>
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                              }`}>
                                {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{post.title}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                              {url}
                            </TableCell>
                            <TableCell>
                              {status ? getStatusBadge(status.status) : <Badge variant="outline">New</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No posts found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Submit Custom URL</CardTitle>
                <CardDescription>
                  Submit any URL from your site for indexing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://yourblog.com/page"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="flex-1"
                    data-testid="input-custom-url"
                  />
                  <Button
                    onClick={handleSubmitCustomUrl}
                    disabled={!customUrl.trim() || submitUrlMutation.isPending}
                    data-testid="button-submit-custom-url"
                  >
                    {submitUrlMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Submit URL
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use this to submit pages like your homepage, about page, or any other URL on your site.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sitemap" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Sitemap Management</CardTitle>
                    <CardDescription>
                      Generate, commit, and submit sitemaps for your site
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchSitemaps()}
                    disabled={sitemapsLoading}
                    data-testid="button-refresh-sitemaps"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${sitemapsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
                  <CardContent className="py-4 space-y-4">
                    <div className="space-y-1">
                      <h4 className="font-medium flex items-center gap-2">
                        <Wand2 className="w-4 h-4 text-primary" />
                        Auto-Generate Sitemap
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Generate sitemap.xml from your posts, commit to repo, and submit to Google
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://yourblog.com"
                        value={sitemapDomain}
                        onChange={(e) => setSitemapDomain(e.target.value)}
                        className="flex-1"
                        data-testid="input-sitemap-domain"
                      />
                      <Button
                        onClick={() => autoGenerateSitemapMutation.mutate(sitemapDomain)}
                        disabled={autoGenerateSitemapMutation.isPending || !sitemapDomain.trim()}
                        data-testid="button-auto-generate-sitemap"
                      >
                        {autoGenerateSitemapMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <FileCode className="w-4 h-4 mr-2" />
                        )}
                        Generate & Submit
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter your site domain (e.g., https://myblog.com) - this will be used as the base URL for all sitemap entries
                    </p>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  <h4 className="font-medium">Submit Existing Sitemap</h4>
                  <div className="flex gap-2">
                    <Input
                      placeholder={`${config?.siteUrl || "https://yourblog.com"}/sitemap.xml`}
                      value={sitemapUrl}
                      onChange={(e) => setSitemapUrl(e.target.value)}
                      className="flex-1"
                      data-testid="input-sitemap-url"
                    />
                    <Button
                      onClick={() => submitSitemapMutation.mutate(sitemapUrl)}
                      disabled={!sitemapUrl.trim() || submitSitemapMutation.isPending}
                      data-testid="button-submit-sitemap"
                    >
                      {submitSitemapMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-2" />
                      )}
                      Submit
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Submit an existing sitemap.xml URL to Google
                  </p>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Submitted Sitemaps</h4>
                  {sitemapsLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map(i => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : sitemaps.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sitemap URL</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                          <TableHead className="w-40">Last Submitted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sitemaps.map((sm, index) => (
                          <TableRow key={index} data-testid={`row-sitemap-${index}`}>
                            <TableCell className="font-medium text-sm truncate max-w-xs">
                              <a href={sm.path} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                {sm.path}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </TableCell>
                            <TableCell>
                              {sm.isPending ? (
                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">Pending</Badge>
                              ) : sm.errors && sm.errors > 0 ? (
                                <Badge variant="destructive">{sm.errors} errors</Badge>
                              ) : sm.warnings && sm.warnings > 0 ? (
                                <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">{sm.warnings} warnings</Badge>
                              ) : (
                                <Badge className="bg-green-500/10 text-green-600 border-green-200">OK</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {sm.lastSubmitted ? new Date(sm.lastSubmitted).toLocaleDateString() : "N/A"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>No sitemaps submitted yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Indexing Status</CardTitle>
                    <CardDescription>
                      Track the indexing status of submitted URLs
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchStatus()}
                    disabled={statusLoading}
                    data-testid="button-refresh-status"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${statusLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {statusLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : indexingStatus.length > 0 ? (
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>URL</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                          <TableHead className="w-40">Last Submitted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {indexingStatus.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell className="max-w-md">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(item.status)}
                                <span className="truncate text-sm">{item.url}</span>
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 text-muted-foreground hover:text-foreground"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                              {item.message && (
                                <p className="text-xs text-muted-foreground mt-1">{item.message}</p>
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(item.status)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.lastSubmitted ? new Date(item.lastSubmitted).toLocaleString() : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No URLs submitted yet</p>
                    <p className="text-sm mt-1">Submit URLs from the Blog Posts or Custom URL tab</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Card className="border-dashed bg-muted/30">
        <CardContent className="p-4">
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
            How to set up Google Indexing API
          </h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Cloud Console</a> and create a project</li>
            <li>Enable the "Indexing API" for your project</li>
            <li>Create a Service Account and download the JSON key</li>
            <li>Add the service account email as an owner in <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Search Console</a></li>
            <li>Paste the JSON key above to connect</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
