import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Settings as SettingsIcon, 
  Github, 
  RefreshCw, 
  Unlink,
  Check,
  ExternalLink,
  GitBranch,
  Clock,
  AlertCircle,
  ChevronsUpDown,
  Lock,
  LogOut,
  Search
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, GitHubRepo } from "@shared/schema";

export default function Settings() {
  const [manualRepoUrl, setManualRepoUrl] = useState("");
  const [repoSelectOpen, setRepoSelectOpen] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const { toast } = useToast();

  const { data: repoData, isLoading: repoLoading } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: userInfo } = useQuery<{ success: boolean; data: { login: string; name: string; avatar_url: string } }>({
    queryKey: ["/api/github/user"],
  });

  const { data: reposData, isLoading: reposLoading, refetch: refetchRepos } = useQuery<{ success: boolean; data: GitHubRepo[] }>({
    queryKey: ["/api/github/repos"],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/repository/disconnect");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Disconnected",
          description: "Repository has been disconnected",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect repository",
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/repository/connect", { url });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Connected",
          description: `Successfully connected to ${data.data.fullName}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        setManualRepoUrl("");
        setRepoSelectOpen(false);
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || "Failed to connect repository",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Connection Failed",
        description: "Failed to connect to repository",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;
  const user = userInfo?.data;
  const repos = reposData?.data || [];

  const filteredRepos = repos.filter(repo =>
    repo.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (repo.description && repo.description.toLowerCase().includes(repoSearch.toLowerCase()))
  );

  const handleSelectRepo = (fullName: string) => {
    connectMutation.mutate(fullName);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold flex items-center gap-2">
          <SettingsIcon className="w-7 h-7" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your CMS configuration and GitHub connection
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#24292e] flex items-center justify-center">
              <Github className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <CardTitle>GitHub Account</CardTitle>
              <CardDescription>Connected GitHub account information</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {user ? (
            <div className="flex items-center gap-4">
              <img 
                src={user.avatar_url} 
                alt={user.name || user.login}
                className="w-12 h-12 rounded-full"
              />
              <div className="flex-1">
                <p className="font-medium" data-testid="text-github-name">{user.name || user.login}</p>
                <p className="text-sm text-muted-foreground">@{user.login}</p>
              </div>
              <Badge variant="outline" className="ml-auto">
                <Check className="w-3 h-3 mr-1" />
                Authenticated
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="w-4 h-4" />
              <span>Loading user information...</span>
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">
              GitHub account is managed through Replit. To switch accounts, reconfigure the GitHub integration in Replit settings.
            </p>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href="https://replit.com" target="_blank" rel="noopener noreferrer">
                <LogOut className="w-4 h-4 mr-2" />
                Manage in Replit
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Repository Connection</CardTitle>
          <CardDescription>
            Connect to your Astro blog repository on GitHub
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {repository ? (
            <>
              <div className="p-4 rounded-lg border border-border bg-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800">
                        <Check className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    </div>
                    <div>
                      <p className="font-medium text-lg" data-testid="text-connected-repo">
                        {repository.fullName}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <GitBranch className="w-4 h-4" />
                          <span>{repository.defaultBranch}</span>
                        </div>
                        {repository.lastSynced && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            <span>Last synced: {new Date(repository.lastSynced).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    asChild
                  >
                    <a 
                      href={`https://github.com/${repository.fullName}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View on GitHub
                    </a>
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-3">Change Repository</h3>
                <Popover open={repoSelectOpen} onOpenChange={setRepoSelectOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={repoSelectOpen}
                      className="w-full justify-between"
                      data-testid="button-select-repo"
                    >
                      <span className="text-muted-foreground">Select a repository...</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Search repositories..." 
                        value={repoSearch}
                        onValueChange={setRepoSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {reposLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                              Loading repositories...
                            </div>
                          ) : (
                            "No repository found."
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          <ScrollArea className="h-64">
                            {filteredRepos.map((repo) => (
                              <CommandItem
                                key={repo.id}
                                value={repo.fullName}
                                onSelect={() => handleSelectRepo(repo.fullName)}
                                className="cursor-pointer"
                                data-testid={`repo-option-${repo.name}`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Github className="w-4 h-4 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium truncate">{repo.fullName}</span>
                                      {repo.isPrivate && <Lock className="w-3 h-3 text-muted-foreground" />}
                                    </div>
                                    {repo.description && (
                                      <p className="text-xs text-muted-foreground truncate">{repo.description}</p>
                                    )}
                                  </div>
                                </div>
                                {repository?.fullName === repo.fullName && (
                                  <Check className="w-4 h-4 text-primary shrink-0" />
                                )}
                              </CommandItem>
                            ))}
                          </ScrollArea>
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">Or enter manually:</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="owner/repository"
                      value={manualRepoUrl}
                      onChange={(e) => setManualRepoUrl(e.target.value)}
                      className="flex-1"
                      data-testid="input-change-repo"
                    />
                    <Button
                      onClick={() => manualRepoUrl && connectMutation.mutate(manualRepoUrl)}
                      disabled={connectMutation.isPending || !manualRepoUrl.trim()}
                      data-testid="button-change-repo"
                    >
                      {connectMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive hover:text-destructive" data-testid="button-disconnect">
                    <Unlink className="w-4 h-4 mr-2" />
                    Disconnect Repository
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect Repository</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to disconnect from {repository.fullName}? 
                      You can reconnect at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-disconnect"
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-dashed border-border text-center">
                <Github className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium mb-1">No Repository Connected</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Select your Astro blog repository to get started
                </p>
              </div>
              
              <Popover open={repoSelectOpen} onOpenChange={setRepoSelectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={repoSelectOpen}
                    className="w-full justify-between"
                    data-testid="button-select-repo-initial"
                  >
                    <span className="text-muted-foreground">Select a repository...</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="Search repositories..." 
                      value={repoSearch}
                      onValueChange={setRepoSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {reposLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                            Loading repositories...
                          </div>
                        ) : (
                          "No repository found."
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        <ScrollArea className="h-64">
                          {filteredRepos.map((repo) => (
                            <CommandItem
                              key={repo.id}
                              value={repo.fullName}
                              onSelect={() => handleSelectRepo(repo.fullName)}
                              className="cursor-pointer"
                              data-testid={`repo-option-${repo.name}`}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Github className="w-4 h-4 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{repo.fullName}</span>
                                    {repo.isPrivate && <Lock className="w-3 h-3 text-muted-foreground" />}
                                  </div>
                                  {repo.description && (
                                    <p className="text-xs text-muted-foreground truncate">{repo.description}</p>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </ScrollArea>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Or enter manually:</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="owner/repository (e.g., egdevelop/blog-astro)"
                    value={manualRepoUrl}
                    onChange={(e) => setManualRepoUrl(e.target.value)}
                    className="flex-1"
                    data-testid="input-connect-repo"
                  />
                  <Button
                    onClick={() => manualRepoUrl && connectMutation.mutate(manualRepoUrl)}
                    disabled={connectMutation.isPending || !manualRepoUrl.trim()}
                    data-testid="button-connect"
                  >
                    {connectMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect Repository"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About Astro CMS</CardTitle>
          <CardDescription>Content management system for Astro blogs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <p>
              This CMS provides a visual interface for managing your Astro blog content 
              with full GitHub integration.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">CRUD Operations</Badge>
              <Badge variant="secondary">Markdown Editor</Badge>
              <Badge variant="secondary">Theme Customization</Badge>
              <Badge variant="secondary">GitHub Sync</Badge>
              <Badge variant="secondary">Live Preview</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
