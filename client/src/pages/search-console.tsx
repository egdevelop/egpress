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
  Trash2
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, Post } from "@shared/schema";

const credentialsSchema = z.object({
  siteUrl: z.string().min(1, "Site URL is required").url("Must be a valid URL"),
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

export default function SearchConsole() {
  const { toast } = useToast();
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [customUrl, setCustomUrl] = useState("");

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

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<{ success: boolean; data: IndexingStatus[] }>({
    queryKey: ["/api/search-console/status"],
    enabled: !!configData?.data?.hasCredentials,
  });

  const form = useForm<CredentialsFormValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      siteUrl: "",
      serviceAccountJson: "",
    },
  });

  useEffect(() => {
    if (configData?.data?.siteUrl) {
      form.setValue("siteUrl", configData.data.siteUrl);
    }
  }, [configData, form]);

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
          description: `${data.submitted} URL(s) submitted for indexing`,
        });
        setSelectedUrls([]);
        setCustomUrl("");
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/status"] });
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
      }
    },
  });

  const repository = repoData?.data;
  const posts = postsData?.data || [];
  const config = configData?.data;
  const indexingStatus = statusData?.data || [];

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
                  name="siteUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://yourblog.com"
                          {...field}
                          data-testid="input-site-url"
                        />
                      </FormControl>
                      <FormDescription>
                        Your verified site URL in Google Search Console
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
        <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-200">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-700">API Connected</p>
            <p className="text-xs text-green-600">{config.siteUrl}</p>
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

      {config?.hasCredentials && (
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
