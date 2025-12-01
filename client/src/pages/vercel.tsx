import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  GitBranch,
  Globe,
  Info,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  Trash2,
  Unlink,
  X,
  Zap,
} from "lucide-react";
import { SiVercel } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, VercelProject, VercelDeployment, VercelDomain, DraftQueue, SmartDeploySettings } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Pencil, ImageIcon, Palette, File } from "lucide-react";

const tokenSchema = z.object({
  token: z.string().min(1, "Vercel token is required"),
  teamId: z.string().optional(),
});

const domainSchema = z.object({
  domain: z.string().min(1, "Domain is required").regex(/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z0-9-_.]+$/, "Invalid domain format"),
});

interface VercelConfig {
  hasToken: boolean;
  username?: string;
  teamId?: string;
  project?: VercelProject;
}

export default function VercelPage() {
  const { toast } = useToast();
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showDomainDialog, setShowDomainDialog] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [domainSearch, setDomainSearch] = useState("");

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: configData, isLoading: configLoading } = useQuery<{ success: boolean; data: VercelConfig }>({
    queryKey: ["/api/vercel/config"],
  });

  const { data: projectsData, isLoading: projectsLoading } = useQuery<{ success: boolean; data: VercelProject[] }>({
    queryKey: ["/api/vercel/projects"],
    enabled: !!configData?.data?.hasToken && !configData?.data?.project,
  });

  const { data: deploymentsData, isLoading: deploymentsLoading, refetch: refetchDeployments } = useQuery<{ success: boolean; data: VercelDeployment[] }>({
    queryKey: ["/api/vercel/deployments"],
    enabled: !!configData?.data?.project,
    refetchInterval: configData?.data?.project ? 30000 : false,
  });

  const { data: domainsData, isLoading: domainsLoading, refetch: refetchDomains } = useQuery<{ success: boolean; data: VercelDomain[] }>({
    queryKey: ["/api/vercel/domains"],
    enabled: !!configData?.data?.project,
  });

  // Smart Deploy queries
  const { data: smartDeploySettingsData, refetch: refetchSettings } = useQuery<{ success: boolean; settings: SmartDeploySettings }>({
    queryKey: ["/api/smart-deploy/settings"],
  });

  const { data: draftQueueData, refetch: refetchQueue } = useQuery<{ success: boolean; queue: DraftQueue | null }>({
    queryKey: ["/api/smart-deploy/queue"],
  });

  const [deployCommitMessage, setDeployCommitMessage] = useState("");

  const smartDeploySettings = smartDeploySettingsData?.settings;
  const draftQueue = draftQueueData?.queue;
  const pendingChangesCount = draftQueue?.changes?.length || 0;

  const tokenForm = useForm({
    resolver: zodResolver(tokenSchema),
    defaultValues: {
      token: "",
      teamId: "",
    },
  });

  const domainForm = useForm({
    resolver: zodResolver(domainSchema),
    defaultValues: {
      domain: "",
    },
  });

  const saveTokenMutation = useMutation({
    mutationFn: async (data: z.infer<typeof tokenSchema>) => {
      const response = await apiRequest("POST", "/api/vercel/token", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Connected to Vercel",
          description: `Logged in as ${data.data.username}`,
        });
        setShowTokenDialog(false);
        tokenForm.reset();
        queryClient.invalidateQueries({ queryKey: ["/api/vercel/config"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vercel/projects"] });
      } else {
        toast({
          title: "Connection Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/vercel/token");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Disconnected from Vercel" });
      queryClient.invalidateQueries({ queryKey: ["/api/vercel/config"] });
    },
  });

  const linkProjectMutation = useMutation({
    mutationFn: async (data: { projectId?: string; createNew?: boolean; projectName?: string }) => {
      const response = await apiRequest("POST", "/api/vercel/project/link", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Project Linked",
          description: `Connected to ${data.data.name}`,
        });
        setShowProjectDialog(false);
        queryClient.invalidateQueries({ queryKey: ["/api/vercel/config"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vercel/deployments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vercel/domains"] });
      } else {
        toast({
          title: "Link Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

  const unlinkProjectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/vercel/project/unlink");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Project Unlinked" });
      queryClient.invalidateQueries({ queryKey: ["/api/vercel/config"] });
    },
  });

  const autoLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/vercel/auto-link");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: data.data.isNew ? "Project Created" : "Project Linked",
          description: data.data.message,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/vercel/config"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vercel/deployments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vercel/domains"] });
      } else {
        toast({
          title: "Auto-Link Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

  const triggerDeployMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/vercel/deployments");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Deployment Started",
          description: "Your site is being deployed",
        });
        refetchDeployments();
      } else {
        toast({
          title: "Deployment Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

  const addDomainMutation = useMutation({
    mutationFn: async (data: { domain: string }) => {
      const response = await apiRequest("POST", "/api/vercel/domains", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Domain Added",
          description: `${data.data.name} has been added`,
        });
        setShowDomainDialog(false);
        domainForm.reset();
        refetchDomains();
      } else {
        toast({
          title: "Add Failed",
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

  const removeDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const response = await apiRequest("DELETE", `/api/vercel/domains/${encodeURIComponent(domain)}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Domain Removed" });
      refetchDomains();
    },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const response = await apiRequest("POST", `/api/vercel/domains/${encodeURIComponent(domain)}/verify`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Domain Verified", description: "DNS configuration is valid" });
      } else {
        toast({ 
          title: "Verification Failed", 
          description: data.error || "DNS not properly configured",
          variant: "destructive" 
        });
      }
      refetchDomains();
    },
  });

  // Smart Deploy mutations
  const updateSmartDeploySettingsMutation = useMutation({
    mutationFn: async (settings: Partial<SmartDeploySettings>) => {
      const response = await apiRequest("POST", "/api/smart-deploy/settings", settings);
      return response.json();
    },
    onSuccess: () => {
      refetchSettings();
      toast({ title: "Settings Updated" });
    },
  });

  const removeFromQueueMutation = useMutation({
    mutationFn: async (changeId: string) => {
      const response = await apiRequest("DELETE", `/api/smart-deploy/queue/${changeId}`);
      return response.json();
    },
    onSuccess: () => {
      refetchQueue();
      toast({ title: "Change Removed" });
    },
  });

  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/smart-deploy/queue");
      return response.json();
    },
    onSuccess: () => {
      refetchQueue();
      toast({ title: "Queue Cleared" });
    },
  });

  const deployQueueMutation = useMutation({
    mutationFn: async (commitMessage?: string) => {
      const response = await apiRequest("POST", "/api/smart-deploy/deploy", { commitMessage });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: "Deployed Successfully", 
          description: data.message,
        });
        refetchQueue();
        setDeployCommitMessage("");
        // Refresh deployments if Vercel is connected
        if (configData?.data?.project) {
          refetchDeployments();
        }
      } else {
        toast({ 
          title: "Deploy Failed", 
          description: data.error,
          variant: "destructive",
        });
      }
    },
  });

  const getChangeTypeIcon = (type: string) => {
    switch (type) {
      case "post_create":
        return <FileText className="w-4 h-4 text-green-500" />;
      case "post_update":
        return <Pencil className="w-4 h-4 text-blue-500" />;
      case "post_delete":
        return <Trash2 className="w-4 h-4 text-red-500" />;
      case "image_upload":
        return <ImageIcon className="w-4 h-4 text-purple-500" />;
      case "theme_update":
        return <Palette className="w-4 h-4 text-orange-500" />;
      case "settings_update":
        return <Settings className="w-4 h-4 text-gray-500" />;
      default:
        return <File className="w-4 h-4 text-gray-500" />;
    }
  };

  const getChangeTypeLabel = (type: string) => {
    switch (type) {
      case "post_create": return "New Post";
      case "post_update": return "Edit Post";
      case "post_delete": return "Delete Post";
      case "image_upload": return "Image";
      case "theme_update": return "Theme";
      case "settings_update": return "Settings";
      default: return "File";
    }
  };

  const config = configData?.data;
  const project = config?.project;
  const deployments = deploymentsData?.data || [];
  const domains = domainsData?.data || [];
  const projects = projectsData?.data || [];

  const filteredDomains = domains.filter(d => 
    d.name.toLowerCase().includes(domainSearch.toLowerCase())
  );

  const toggleDomainExpand = (domain: string) => {
    const newSet = new Set(expandedDomains);
    if (newSet.has(domain)) {
      newSet.delete(domain);
    } else {
      newSet.add(domain);
    }
    setExpandedDomains(newSet);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard` });
  };

  const getDeploymentStatusBadge = (state: string) => {
    switch (state) {
      case "READY":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><Check className="w-3 h-3 mr-1" /> Ready</Badge>;
      case "BUILDING":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Building</Badge>;
      case "QUEUED":
      case "INITIALIZING":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Clock className="w-3 h-3 mr-1" /> Queued</Badge>;
      case "ERROR":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20"><X className="w-3 h-3 mr-1" /> Error</Badge>;
      case "CANCELED":
        return <Badge variant="secondary"><X className="w-3 h-3 mr-1" /> Canceled</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  const getDomainStatusBadge = (domain: VercelDomain) => {
    if (domain.verified && domain.configured) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Valid Configuration
        </Badge>
      );
    }
    
    if (!domain.verified) {
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Pending Verification
        </Badge>
      );
    }
    
    return (
      <Badge className="bg-red-500/10 text-red-500 border-red-500/20">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Invalid Configuration
      </Badge>
    );
  };

  const getDeploymentStats = () => {
    const ready = deployments.filter(d => d.state === "READY").length;
    const building = deployments.filter(d => d.state === "BUILDING").length;
    const errors = deployments.filter(d => d.state === "ERROR").length;
    return { ready, building, errors, total: deployments.length };
  };

  if (!repoData?.data) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SiVercel className="w-5 h-5" />
              Vercel Deployments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No Repository Connected</h3>
              <p className="text-sm">Connect a repository first to use Vercel deployments</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-foreground flex items-center justify-center">
              <SiVercel className="w-6 h-6 text-background" />
            </div>
            Vercel
          </h1>
          <p className="text-muted-foreground mt-1">Deploy and manage your site on Vercel</p>
        </div>
        {project && (
          <Button
            onClick={() => triggerDeployMutation.mutate()}
            disabled={triggerDeployMutation.isPending}
            data-testid="button-trigger-deploy-header"
          >
            {triggerDeployMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Rocket className="w-4 h-4 mr-2" />
            )}
            Deploy
          </Button>
        )}
      </div>

      {!config?.hasToken ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <SiVercel className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-medium mb-2">Connect to Vercel</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Deploy your site globally with Vercel's edge network. Connect your account to get started.
              </p>
              <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
                <DialogTrigger asChild>
                  <Button size="lg" data-testid="button-connect-vercel">
                    <SiVercel className="w-4 h-4 mr-2" />
                    Connect Vercel Account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Connect to Vercel</DialogTitle>
                    <DialogDescription>
                      Enter your Vercel API token to connect. Get one at{" "}
                      <a
                        href="https://vercel.com/account/tokens"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        vercel.com/account/tokens
                      </a>
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...tokenForm}>
                    <form onSubmit={tokenForm.handleSubmit((data) => saveTokenMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={tokenForm.control}
                        name="token"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Token</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="Enter your Vercel token"
                                data-testid="input-vercel-token"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={tokenForm.control}
                        name="teamId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team ID (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Leave empty for personal account"
                                data-testid="input-vercel-team"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Only needed if deploying to a team
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button type="submit" disabled={saveTokenMutation.isPending} data-testid="button-save-vercel-token">
                          {saveTokenMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                          Connect
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <SiVercel className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium">{config.username}</p>
                      <p className="text-xs text-muted-foreground">Connected Account</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-disconnect-vercel"
                  >
                    <Unlink className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {project && (
              <>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <Rocket className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {project.framework || "Project"} • {getDeploymentStats().total} deployments
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="font-medium">{domains.length} Domain{domains.length !== 1 ? 's' : ''}</p>
                        <p className="text-xs text-muted-foreground">
                          {domains.filter(d => d.verified).length} verified
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {!project && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="w-5 h-5" />
                  Link Project
                </CardTitle>
                <CardDescription>
                  Automatically link your repository to a Vercel project
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Auto-Link</p>
                      <p className="text-sm text-muted-foreground">
                        Automatically find or create a Vercel project for {repoData?.data?.fullName}
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => autoLinkMutation.mutate()}
                    disabled={autoLinkMutation.isPending}
                    className="w-full"
                    data-testid="button-auto-link"
                  >
                    {autoLinkMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Finding or creating project...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Auto-Link Project
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or choose manually</span>
                  </div>
                </div>

                <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full" data-testid="button-link-project-manual">
                      <Settings className="w-4 h-4 mr-2" />
                      Manual Selection
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Link Vercel Project</DialogTitle>
                      <DialogDescription>
                        Choose an existing project or create a new one for {repoData?.data?.fullName}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Select Existing Project</label>
                        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                          <SelectTrigger data-testid="select-project">
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                          <SelectContent>
                            {projectsLoading ? (
                              <SelectItem value="_loading" disabled>Loading...</SelectItem>
                            ) : projects.length === 0 ? (
                              <SelectItem value="_empty" disabled>No projects found</SelectItem>
                            ) : (
                              projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => linkProjectMutation.mutate({ projectId: selectedProjectId })}
                          disabled={!selectedProjectId || linkProjectMutation.isPending}
                          data-testid="button-link-existing"
                        >
                          {linkProjectMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                          Link Selected
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => linkProjectMutation.mutate({ createNew: true })}
                          disabled={linkProjectMutation.isPending}
                          data-testid="button-create-new-project"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create New
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          )}

          {project && (
            <>
              <Tabs defaultValue="deployments" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="deployments" className="flex items-center gap-2">
                    <Rocket className="w-4 h-4" />
                    Deployments
                  </TabsTrigger>
                  <TabsTrigger value="domains" className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Domains
                  </TabsTrigger>
                  <TabsTrigger value="smart-deploy" className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Smart Deploy
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Settings
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="deployments" className="space-y-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
                      <div>
                        <CardTitle>Deployments</CardTitle>
                        <CardDescription>Recent deployments for {project.name}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => refetchDeployments()}
                          disabled={deploymentsLoading}
                          data-testid="button-refresh-deployments"
                        >
                          <RefreshCw className={`w-4 h-4 ${deploymentsLoading ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          onClick={() => triggerDeployMutation.mutate()}
                          disabled={triggerDeployMutation.isPending}
                          data-testid="button-trigger-deploy"
                        >
                          {triggerDeployMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Zap className="w-4 h-4 mr-2" />
                          )}
                          Deploy Now
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {deploymentsLoading && deployments.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                          <p>Loading deployments...</p>
                        </div>
                      ) : deployments.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Rocket className="w-16 h-16 mx-auto mb-4 opacity-30" />
                          <h3 className="font-medium mb-1">No deployments yet</h3>
                          <p className="text-sm">Click Deploy Now to create your first deployment</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {deployments.slice(0, 10).map((deployment, index) => (
                            <div
                              key={deployment.id}
                              className={`flex items-center justify-between p-4 rounded-lg border ${index === 0 ? 'bg-muted/30' : ''}`}
                              data-testid={`row-deployment-${deployment.id}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="flex flex-col gap-1">
                                  {getDeploymentStatusBadge(deployment.state)}
                                  {index === 0 && deployment.state === "READY" && (
                                    <Badge variant="outline" className="text-xs">
                                      Production
                                    </Badge>
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    {deployment.url ? (
                                      <a
                                        href={deployment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium hover:text-primary flex items-center gap-1"
                                      >
                                        {new URL(deployment.url).hostname}
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground">Pending...</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                    <span className="flex items-center gap-1">
                                      <GitBranch className="w-3 h-3" />
                                      {deployment.meta?.githubCommitRef || "main"}
                                    </span>
                                    <span>{new Date(deployment.createdAt).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                              {deployment.url && (
                                <Button variant="ghost" size="icon" asChild>
                                  <a href={deployment.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="domains" className="space-y-4">
                  <Card>
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Globe className="w-5 h-5" />
                            Domains
                          </CardTitle>
                          <CardDescription>
                            Domains can be assigned to git branches, custom environments, and production.
                          </CardDescription>
                        </div>
                        <Dialog open={showDomainDialog} onOpenChange={setShowDomainDialog}>
                          <DialogTrigger asChild>
                            <Button data-testid="button-add-domain">
                              <Plus className="w-4 h-4 mr-2" />
                              Add Domain
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add Domain</DialogTitle>
                              <DialogDescription>
                                Add a custom domain to your Vercel project
                              </DialogDescription>
                            </DialogHeader>
                            <Form {...domainForm}>
                              <form onSubmit={domainForm.handleSubmit((data) => addDomainMutation.mutate(data))} className="space-y-4">
                                <FormField
                                  control={domainForm.control}
                                  name="domain"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Domain</FormLabel>
                                      <FormControl>
                                        <Input
                                          placeholder="example.com"
                                          data-testid="input-domain"
                                          {...field}
                                        />
                                      </FormControl>
                                      <FormDescription>
                                        Enter the domain without http:// or https://
                                      </FormDescription>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <DialogFooter>
                                  <Button type="submit" disabled={addDomainMutation.isPending} data-testid="button-confirm-add-domain">
                                    {addDomainMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                                    Add Domain
                                  </Button>
                                </DialogFooter>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Search..."
                            value={domainSearch}
                            onChange={(e) => setDomainSearch(e.target.value)}
                            className="pl-9"
                            data-testid="input-search-domains"
                          />
                        </div>
                        <Button variant="outline" size="icon">
                          <Filter className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => refetchDomains()}
                          disabled={domainsLoading}
                          data-testid="button-refresh-domains"
                        >
                          <RefreshCw className={`w-4 h-4 ${domainsLoading ? "animate-spin" : ""}`} />
                        </Button>
                      </div>

                      {domainsLoading && domains.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                          <p>Loading domains...</p>
                        </div>
                      ) : filteredDomains.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <Globe className="w-16 h-16 mx-auto mb-4 opacity-30" />
                          <h3 className="font-medium mb-1">No custom domains</h3>
                          <p className="text-sm">Add a domain to use your own URL</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {filteredDomains.map((domain) => (
                            <Collapsible
                              key={domain.name}
                              open={expandedDomains.has(domain.name)}
                              onOpenChange={() => toggleDomainExpand(domain.name)}
                            >
                              <div
                                className="border rounded-lg overflow-hidden"
                                data-testid={`domain-${domain.name}`}
                              >
                                <div className="flex items-center justify-between p-4">
                                  <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                      domain.verified 
                                        ? 'bg-emerald-500/10' 
                                        : 'bg-red-500/10'
                                    }`}>
                                      {domain.verified ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                      ) : (
                                        <AlertTriangle className="w-4 h-4 text-red-500" />
                                      )}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <a
                                          href={`https://${domain.name}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-medium hover:text-primary"
                                        >
                                          {domain.name}
                                        </a>
                                        <a
                                          href={`https://${domain.name}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                        </a>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        {getDomainStatusBadge(domain)}
                                        <CollapsibleTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary">
                                            {!domain.configured ? "Configure DNS" : "View Details"}
                                            {expandedDomains.has(domain.name) ? (
                                              <ChevronUp className="w-3 h-3 ml-1" />
                                            ) : (
                                              <ChevronDown className="w-3 h-3 ml-1" />
                                            )}
                                          </Button>
                                        </CollapsibleTrigger>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      <Rocket className="w-3 h-3 mr-1" />
                                      Production
                                    </Badge>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => verifyDomainMutation.mutate(domain.name)}
                                      disabled={verifyDomainMutation.isPending}
                                      data-testid={`button-refresh-domain-${domain.name}`}
                                    >
                                      Refresh
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeDomainMutation.mutate(domain.name)}
                                      disabled={removeDomainMutation.isPending}
                                      data-testid={`button-remove-domain-${domain.name}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                    </Button>
                                  </div>
                                </div>

                                <CollapsibleContent>
                                  <div className="border-t bg-muted/30 p-4 space-y-4">
                                    <Tabs defaultValue="dns" className="w-full">
                                      <TabsList className="mb-4">
                                        <TabsTrigger value="dns">DNS Records</TabsTrigger>
                                        {domain.txtVerification && (
                                          <TabsTrigger value="verification">TXT Verification</TabsTrigger>
                                        )}
                                        <TabsTrigger value="vercel-dns">Vercel DNS</TabsTrigger>
                                      </TabsList>
                                      <TabsContent value="dns">
                                        <div className="space-y-4">
                                          {!domain.configured && (
                                            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                              <div>
                                                <p className="font-medium text-amber-600 dark:text-amber-400">DNS Configuration Required</p>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                  Add these DNS records at your domain registrar (Cloudflare, Namecheap, etc.) to connect your domain to Vercel.
                                                </p>
                                              </div>
                                            </div>
                                          )}
                                          <div className="border rounded-lg overflow-hidden">
                                            <table className="w-full text-sm">
                                              <thead className="bg-muted/50">
                                                <tr>
                                                  <th className="text-left p-3 font-medium">Type</th>
                                                  <th className="text-left p-3 font-medium">Name</th>
                                                  <th className="text-left p-3 font-medium">Value</th>
                                                  <th className="text-left p-3 font-medium">Status</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {domain.dnsRecords && domain.dnsRecords.length > 0 ? (
                                                  domain.dnsRecords.map((record: any, idx: number) => (
                                                    <tr key={idx} className="border-t">
                                                      <td className="p-3">
                                                        <Badge variant="outline" className="text-xs font-mono">
                                                          {record.type}
                                                        </Badge>
                                                      </td>
                                                      <td className="p-3">
                                                        <div className="flex items-center gap-2">
                                                          <code className="bg-muted px-2 py-1 rounded text-xs">{record.name}</code>
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6"
                                                                onClick={() => copyToClipboard(record.name, 'Name')}
                                                              >
                                                                <Copy className="w-3 h-3" />
                                                              </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Copy</TooltipContent>
                                                          </Tooltip>
                                                        </div>
                                                      </td>
                                                      <td className="p-3">
                                                        <div className="flex items-center gap-2">
                                                          <code className="bg-muted px-2 py-1 rounded text-xs max-w-[200px] truncate">{record.value}</code>
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6"
                                                                onClick={() => copyToClipboard(record.value, 'Value')}
                                                              >
                                                                <Copy className="w-3 h-3" />
                                                              </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>Copy</TooltipContent>
                                                          </Tooltip>
                                                        </div>
                                                      </td>
                                                      <td className="p-3">
                                                        {record.status === "configured" ? (
                                                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                                            Valid
                                                          </Badge>
                                                        ) : (
                                                          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                                                            <Clock className="w-3 h-3 mr-1" />
                                                            Pending
                                                          </Badge>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  ))
                                                ) : (
                                                  <tr className="border-t">
                                                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                                      No DNS records available. Click Refresh to update domain status.
                                                    </td>
                                                  </tr>
                                                )}
                                              </tbody>
                                            </table>
                                          </div>
                                          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                                            <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                            <p>
                                              DNS changes can take up to 48 hours to propagate globally.{" "}
                                              <a href="https://vercel.com/docs/projects/domains" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                                Learn More
                                              </a>
                                            </p>
                                          </div>
                                        </div>
                                      </TabsContent>
                                      {domain.txtVerification && (
                                        <TabsContent value="verification">
                                          <div className="space-y-4">
                                            <p className="text-sm text-muted-foreground">
                                              Add this TXT record to verify domain ownership:
                                            </p>
                                            <div className="border rounded-lg overflow-hidden">
                                              <table className="w-full text-sm">
                                                <thead className="bg-muted/50">
                                                  <tr>
                                                    <th className="text-left p-3 font-medium">Type</th>
                                                    <th className="text-left p-3 font-medium">Name</th>
                                                    <th className="text-left p-3 font-medium">Value</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  <tr className="border-t">
                                                    <td className="p-3">
                                                      <Badge variant="outline" className="text-xs font-mono">TXT</Badge>
                                                    </td>
                                                    <td className="p-3">
                                                      <div className="flex items-center gap-2">
                                                        <code className="bg-muted px-2 py-1 rounded text-xs">{domain.txtVerification.name}</code>
                                                        <Tooltip>
                                                          <TooltipTrigger asChild>
                                                            <Button
                                                              variant="ghost"
                                                              size="icon"
                                                              className="h-6 w-6"
                                                              onClick={() => copyToClipboard(domain.txtVerification!.name, 'Name')}
                                                            >
                                                              <Copy className="w-3 h-3" />
                                                            </Button>
                                                          </TooltipTrigger>
                                                          <TooltipContent>Copy</TooltipContent>
                                                        </Tooltip>
                                                      </div>
                                                    </td>
                                                    <td className="p-3">
                                                      <div className="flex items-center gap-2">
                                                        <code className="bg-muted px-2 py-1 rounded text-xs break-all max-w-xs">{domain.txtVerification.value}</code>
                                                        <Tooltip>
                                                          <TooltipTrigger asChild>
                                                            <Button
                                                              variant="ghost"
                                                              size="icon"
                                                              className="h-6 w-6"
                                                              onClick={() => copyToClipboard(domain.txtVerification!.value, 'Value')}
                                                            >
                                                              <Copy className="w-3 h-3" />
                                                            </Button>
                                                          </TooltipTrigger>
                                                          <TooltipContent>Copy</TooltipContent>
                                                        </Tooltip>
                                                      </div>
                                                    </td>
                                                  </tr>
                                                </tbody>
                                              </table>
                                            </div>
                                            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-sm">
                                              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                                              <p className="text-amber-600 dark:text-amber-400">
                                                This TXT record is required for domain verification. Add it to your DNS provider before proceeding.
                                              </p>
                                            </div>
                                          </div>
                                        </TabsContent>
                                      )}
                                      <TabsContent value="vercel-dns">
                                        <div className="text-center py-8 text-muted-foreground">
                                          <p>Transfer your domain to Vercel DNS for automatic configuration</p>
                                          <Button variant="outline" className="mt-4" asChild>
                                            <a href="https://vercel.com/docs/projects/domains/vercel-nameservers" target="_blank" rel="noopener noreferrer">
                                              Learn about Vercel DNS
                                              <ExternalLink className="w-4 h-4 ml-2" />
                                            </a>
                                          </Button>
                                        </div>
                                      </TabsContent>
                                    </Tabs>
                                  </div>
                                </CollapsibleContent>
                              </div>
                            </Collapsible>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="smart-deploy" className="space-y-6">
                  {/* Pending Changes Queue */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            Pending Changes
                            {pendingChangesCount > 0 && (
                              <Badge variant="secondary">{pendingChangesCount}</Badge>
                            )}
                          </CardTitle>
                          <CardDescription>
                            Queue multiple changes and deploy them all at once
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={smartDeploySettings?.enabled ?? true}
                            onCheckedChange={(checked) => 
                              updateSmartDeploySettingsMutation.mutate({ enabled: checked })
                            }
                            data-testid="switch-smart-deploy-enabled"
                          />
                          <span className="text-sm text-muted-foreground">Smart Deploy</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {pendingChangesCount === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p className="font-medium">No pending changes</p>
                          <p className="text-sm mt-1">
                            {smartDeploySettings?.enabled 
                              ? "Use 'Save & Queue' when editing posts to queue changes here"
                              : "Enable Smart Deploy to start queuing changes"}
                          </p>
                        </div>
                      ) : (
                        <>
                          <ScrollArea className="h-[300px] pr-4">
                            <div className="space-y-2">
                              {draftQueue?.changes.map((change) => (
                                <div 
                                  key={change.id}
                                  className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-muted/30"
                                  data-testid={`queue-item-${change.id}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {getChangeTypeIcon(change.type)}
                                    <div className="min-w-0">
                                      <p className="font-medium text-sm truncate">{change.title}</p>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Badge variant="outline" className="text-xs">
                                          {getChangeTypeLabel(change.type)}
                                        </Badge>
                                        <span className="truncate">{change.path}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeFromQueueMutation.mutate(change.id)}
                                    disabled={removeFromQueueMutation.isPending}
                                    data-testid={`button-remove-change-${change.id}`}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>

                          <Separator />

                          <div className="space-y-3">
                            <div>
                              <label className="text-sm font-medium">Commit Message</label>
                              <Textarea
                                placeholder={`Batch update: ${pendingChangesCount} change${pendingChangesCount > 1 ? 's' : ''}`}
                                value={deployCommitMessage}
                                onChange={(e) => setDeployCommitMessage(e.target.value)}
                                className="mt-1.5"
                                data-testid="input-commit-message"
                              />
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <Button
                                variant="outline"
                                onClick={() => clearQueueMutation.mutate()}
                                disabled={clearQueueMutation.isPending}
                                data-testid="button-clear-queue"
                              >
                                {clearQueueMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                  <Trash2 className="w-4 h-4 mr-2" />
                                )}
                                Clear All
                              </Button>
                              <Button
                                onClick={() => deployQueueMutation.mutate(deployCommitMessage || undefined)}
                                disabled={deployQueueMutation.isPending}
                                data-testid="button-deploy-queue"
                              >
                                {deployQueueMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                  <Rocket className="w-4 h-4 mr-2" />
                                )}
                                Deploy {pendingChangesCount} Change{pendingChangesCount > 1 ? 's' : ''}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* How It Works */}
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Info className="w-5 h-5" />
                          How Smart Deploy Works
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <Badge variant="secondary" className="shrink-0">1</Badge>
                            <div>
                              <p className="font-medium text-sm">Create Content</p>
                              <p className="text-xs text-muted-foreground">
                                When editing posts, use "Save & Queue" instead of regular save
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Badge variant="secondary" className="shrink-0">2</Badge>
                            <div>
                              <p className="font-medium text-sm">Queue Changes</p>
                              <p className="text-xs text-muted-foreground">
                                All changes are stored locally until you're ready to deploy
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Badge variant="secondary" className="shrink-0">3</Badge>
                            <div>
                              <p className="font-medium text-sm">Single Deploy</p>
                              <p className="text-xs text-muted-foreground">
                                Deploy all changes in one commit, triggering only one Vercel build
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                          <div className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-green-700 dark:text-green-400">
                              Save on Vercel build minutes by batching multiple changes into one deployment
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Settings className="w-5 h-5" />
                          Vercel Auto-Deploy Control
                        </CardTitle>
                        <CardDescription>
                          Configure Vercel to avoid unwanted auto-deploys
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-start gap-2">
                            <span className="text-primary font-medium shrink-0">1.</span>
                            <span>Go to Vercel Dashboard, select your project</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-primary font-medium shrink-0">2.</span>
                            <span>Settings and Git and Build & Development</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-primary font-medium shrink-0">3.</span>
                            <span>Turn off "Automatically deploy on push"</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-primary font-medium shrink-0">4.</span>
                            <span>Use the Deploy button here when ready</span>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-muted/50 border">
                          <p className="text-xs text-muted-foreground">
                            Or add this Ignored Build Step command to skip deploys:
                          </p>
                          <code className="block mt-2 p-2 rounded bg-background text-xs font-mono overflow-x-auto">
                            git diff HEAD^ HEAD --quiet -- src/content/blog/
                          </code>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="settings">
                  <Card>
                    <CardHeader>
                      <CardTitle>Project Settings</CardTitle>
                      <CardDescription>Manage your Vercel project configuration</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-lg border">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                            <Rocket className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-medium">{project.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {project.framework || "Unknown framework"}
                              {project.productionUrl && (
                                <>
                                  {" • "}
                                  <a
                                    href={`https://${project.productionUrl}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    {project.productionUrl}
                                  </a>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => unlinkProjectMutation.mutate()}
                          disabled={unlinkProjectMutation.isPending}
                          data-testid="button-unlink-project"
                        >
                          {unlinkProjectMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Unlink className="w-4 h-4 mr-2" />
                          )}
                          Unlink Project
                        </Button>
                      </div>

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-3">Quick Links</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Button variant="outline" className="justify-start" asChild>
                            <a href={`https://vercel.com/${config.username}/${project.name}`} target="_blank" rel="noopener noreferrer">
                              <SiVercel className="w-4 h-4 mr-2" />
                              View on Vercel
                              <ExternalLink className="w-3 h-3 ml-auto" />
                            </a>
                          </Button>
                          <Button variant="outline" className="justify-start" asChild>
                            <a href={`https://vercel.com/${config.username}/${project.name}/settings`} target="_blank" rel="noopener noreferrer">
                              <Settings className="w-4 h-4 mr-2" />
                              Project Settings
                              <ExternalLink className="w-3 h-3 ml-auto" />
                            </a>
                          </Button>
                          <Button variant="outline" className="justify-start" asChild>
                            <a href={`https://vercel.com/${config.username}/${project.name}/analytics`} target="_blank" rel="noopener noreferrer">
                              <Zap className="w-4 h-4 mr-2" />
                              Analytics
                              <ExternalLink className="w-3 h-3 ml-auto" />
                            </a>
                          </Button>
                          <Button variant="outline" className="justify-start" asChild>
                            <a href={`https://vercel.com/${config.username}/${project.name}/logs`} target="_blank" rel="noopener noreferrer">
                              <Settings className="w-4 h-4 mr-2" />
                              Logs
                              <ExternalLink className="w-3 h-3 ml-auto" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </>
      )}
    </div>
  );
}
