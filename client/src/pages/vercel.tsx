import { useState, useEffect } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Settings,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { SiVercel } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, VercelProject, VercelDeployment, VercelDomain } from "@shared/schema";

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

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: configData, isLoading: configLoading } = useQuery<{ success: boolean; data: VercelConfig }>({
    queryKey: ["/api/vercel/config"],
  });

  const { data: projectsData, isLoading: projectsLoading, refetch: refetchProjects } = useQuery<{ success: boolean; data: VercelProject[] }>({
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

  const config = configData?.data;
  const project = config?.project;
  const deployments = deploymentsData?.data || [];
  const domains = domainsData?.data || [];
  const projects = projectsData?.data || [];

  const getDeploymentStatusBadge = (state: string) => {
    switch (state) {
      case "READY":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><Check className="w-3 h-3 mr-1" /> Ready</Badge>;
      case "BUILDING":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Building</Badge>;
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
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Connect a repository first to use Vercel deployments</p>
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SiVercel className="w-6 h-6" />
            Vercel Deployments
          </h1>
          <p className="text-muted-foreground">Deploy and manage your site on Vercel</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Vercel Account
          </CardTitle>
          <CardDescription>
            Connect your Vercel account to deploy your site
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : config?.hasToken ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <SiVercel className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium">{config.username}</p>
                  <p className="text-sm text-muted-foreground">Connected to Vercel</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect-vercel"
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Unlink className="w-4 h-4 mr-2" />
                    Disconnect
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Not connected to Vercel</p>
              <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
                <DialogTrigger asChild>
                  <Button data-testid="button-connect-vercel">
                    <SiVercel className="w-4 h-4 mr-2" />
                    Connect Vercel
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
                          {saveTokenMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : null}
                          Connect
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>

      {config?.hasToken && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Project Link
            </CardTitle>
            <CardDescription>
              Link your repository to a Vercel project
            </CardDescription>
          </CardHeader>
          <CardContent>
            {project ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Rocket className="w-5 h-5" />
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
                    size="sm"
                    onClick={() => unlinkProjectMutation.mutate()}
                    disabled={unlinkProjectMutation.isPending}
                    data-testid="button-unlink-project"
                  >
                    {unlinkProjectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Unlink className="w-4 h-4 mr-2" />
                        Unlink
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">No project linked</p>
                <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-link-project">
                      <Link2 className="w-4 h-4 mr-2" />
                      Link Project
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
                          {linkProjectMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : null}
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
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {project && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="w-5 h-5" />
                  Deployments
                </CardTitle>
                <CardDescription>
                  Recent deployments for your project
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchDeployments()}
                  disabled={deploymentsLoading}
                  data-testid="button-refresh-deployments"
                >
                  <RefreshCw className={`w-4 h-4 ${deploymentsLoading ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  size="sm"
                  onClick={() => triggerDeployMutation.mutate()}
                  disabled={triggerDeployMutation.isPending}
                  data-testid="button-trigger-deploy"
                >
                  {triggerDeployMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Rocket className="w-4 h-4 mr-2" />
                  )}
                  Deploy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {deploymentsLoading && deployments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                  <p>Loading deployments...</p>
                </div>
              ) : deployments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Rocket className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No deployments yet</p>
                  <p className="text-sm">Click Deploy to create your first deployment</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deployments.slice(0, 10).map((deployment) => (
                      <TableRow key={deployment.id} data-testid={`row-deployment-${deployment.id}`}>
                        <TableCell>{getDeploymentStatusBadge(deployment.state)}</TableCell>
                        <TableCell>
                          {deployment.url ? (
                            <a
                              href={deployment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {new URL(deployment.url).hostname}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {deployment.meta?.githubCommitRef || "main"}
                          </code>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(deployment.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {deployment.url && (
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                            >
                              <a
                                href={deployment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Domains
                </CardTitle>
                <CardDescription>
                  Custom domains for your project
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchDomains()}
                  disabled={domainsLoading}
                  data-testid="button-refresh-domains"
                >
                  <RefreshCw className={`w-4 h-4 ${domainsLoading ? "animate-spin" : ""}`} />
                </Button>
                <Dialog open={showDomainDialog} onOpenChange={setShowDomainDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-domain">
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
                            {addDomainMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : null}
                            Add Domain
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {domainsLoading && domains.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                  <p>Loading domains...</p>
                </div>
              ) : domains.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No custom domains</p>
                  <p className="text-sm">Add a domain to use your own URL</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {domains.map((domain) => (
                    <div
                      key={domain.name}
                      className="flex items-center justify-between p-3 rounded-lg border"
                      data-testid={`domain-${domain.name}`}
                    >
                      <div className="flex items-center gap-3">
                        <Globe className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <a
                            href={`https://${domain.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium hover:text-primary flex items-center gap-1"
                          >
                            {domain.name}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <div className="flex items-center gap-2 mt-1">
                            {domain.verified ? (
                              <Badge variant="outline" className="text-green-500 border-green-500/30">
                                <Check className="w-3 h-3 mr-1" />
                                Verified
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                                <Clock className="w-3 h-3 mr-1" />
                                Pending verification
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
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
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
