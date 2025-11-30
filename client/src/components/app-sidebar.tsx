import { 
  LayoutDashboard, 
  FileText, 
  Palette, 
  Settings,
  FolderTree,
  Github,
  RefreshCw,
  Check,
  DollarSign,
  Image,
  FileCode,
  Sparkles,
  Copy,
  Search,
  Rocket,
  LogOut,
  User,
  ChevronsUpDown,
  Lock,
  Unplug,
  ArrowRightLeft
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import type { Repository, GitHubRepo } from "@shared/schema";

const contentItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    description: "Overview & quick actions",
  },
  {
    title: "Posts",
    url: "/posts",
    icon: FileText,
    description: "Manage blog posts",
  },
  {
    title: "Pages",
    url: "/pages",
    icon: FileCode,
    description: "Edit static pages",
  },
  {
    title: "File Browser",
    url: "/files",
    icon: FolderTree,
    description: "Browse repository files",
  },
];

const appearanceItems = [
  {
    title: "Theme",
    url: "/theme",
    icon: Palette,
    description: "Customize colors",
  },
  {
    title: "Branding",
    url: "/branding",
    icon: Image,
    description: "Logo, name & social",
  },
];

const integrationsItems = [
  {
    title: "Vercel",
    url: "/vercel",
    icon: Rocket,
    description: "Deploy & domains",
    configKey: "vercel",
  },
  {
    title: "Search Console",
    url: "/search-console",
    icon: Search,
    description: "SEO & indexing",
    configKey: "gsc",
  },
  {
    title: "AdSense",
    url: "/adsense",
    icon: DollarSign,
    description: "Ad monetization",
    configKey: "adsense",
  },
  {
    title: "AI Generator",
    url: "/ai",
    icon: Sparkles,
    description: "Generate posts with AI",
    configKey: "gemini",
  },
];

const systemItems = [
  {
    title: "Clone Site",
    url: "/clone",
    icon: Copy,
    description: "Create new site from template",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    description: "App configuration",
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [repoSelectOpen, setRepoSelectOpen] = useState(false);
  const [repoManageOpen, setRepoManageOpen] = useState(false);
  const [showChangeRepo, setShowChangeRepo] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [connectingRepoId, setConnectingRepoId] = useState<number | null>(null);
  const { toast } = useToast();
  const { githubUsername, logout } = useAuth();
  const [, setLocationNav] = useLocation();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: reposData, isLoading: reposLoading } = useQuery<{ success: boolean; data: GitHubRepo[] }>({
    queryKey: ["/api/github/repos"],
  });

  const repository = repoData?.data;
  const repos = reposData?.data || [];
  
  const filteredRepos = repos.filter(repo => 
    repo.fullName.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (repo.description?.toLowerCase().includes(repoSearch.toLowerCase()))
  );

  const connectMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/repository/connect", { url });
      return response.json();
    },
    onSuccess: (data) => {
      setConnectingRepoId(null);
      if (data.success) {
        toast({
          title: "Repository Connected",
          description: `Successfully connected to ${data.data.fullName}`,
        });
        
        // Show Vercel auto-link result if applicable
        if (data.vercelAutoLink) {
          const { project, isNew, message } = data.vercelAutoLink;
          toast({
            title: isNew ? "Vercel Project Created" : "Vercel Project Linked",
            description: message,
          });
          // Invalidate Vercel queries
          queryClient.invalidateQueries({ queryKey: ["/api/vercel/config"] });
          queryClient.invalidateQueries({ queryKey: ["/api/vercel/projects"] });
        }
        
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        queryClient.invalidateQueries({ queryKey: ["/api/search-console/config"] });
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
      setConnectingRepoId(null);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to repository",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/repository/sync");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Synced Successfully",
          description: "Repository content has been refreshed",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
      }
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/repository/disconnect");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Repository Disconnected",
          description: "You can now connect a different repository",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        setDisconnectDialogOpen(false);
        setRepoManageOpen(false);
      }
    },
    onError: () => {
      toast({
        title: "Disconnect Failed",
        description: "Failed to disconnect repository",
        variant: "destructive",
      });
    },
  });

  const handleSelectRepo = (repo: GitHubRepo) => {
    setConnectingRepoId(repo.id);
    connectMutation.mutate(repo.fullName);
    setShowChangeRepo(false);
    setRepoManageOpen(false);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">EG</span>
          </div>
          <div>
            <h1 className="font-semibold text-sm">EG Press</h1>
            <p className="text-xs text-muted-foreground">Content Manager</p>
          </div>
        </div>

        {repository ? (
          <div className="space-y-2">
            <Popover open={repoManageOpen} onOpenChange={(open) => {
              setRepoManageOpen(open);
              if (!open) setShowChangeRepo(false);
            }}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-2 p-2 rounded-md bg-sidebar-accent/50 w-full text-left hover-elevate cursor-pointer"
                  data-testid="button-repo-manage"
                >
                  <Github className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" data-testid="text-repo-name">
                      {repository.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {repository.defaultBranch}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    <Check className="w-3 h-3 mr-1" />
                    <span className="text-xs">Connected</span>
                  </Badge>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start" side="bottom">
                {showChangeRepo ? (
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
                            Loading...
                          </div>
                        ) : (
                          "No repository found."
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        <ScrollArea className="h-48">
                          {filteredRepos.map((repo) => {
                            const isConnecting = connectingRepoId === repo.id;
                            return (
                              <CommandItem
                                key={repo.id}
                                value={repo.fullName}
                                onSelect={() => handleSelectRepo(repo)}
                                className="cursor-pointer"
                                disabled={connectMutation.isPending}
                                data-testid={`repo-change-option-${repo.name}`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {isConnecting ? (
                                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-primary" />
                                  ) : (
                                    <Github className="w-4 h-4 shrink-0" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-sm font-medium truncate">{repo.name}</span>
                                      {repo.isPrivate && <Lock className="w-3 h-3 text-muted-foreground" />}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {isConnecting ? "Connecting..." : repo.owner}
                                    </p>
                                  </div>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </ScrollArea>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                ) : (
                  <div className="p-1">
                    <button
                      className="flex items-center gap-2 w-full p-2 text-sm rounded-md hover-elevate"
                      onClick={() => setShowChangeRepo(true)}
                      data-testid="button-change-repo"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      Change Repository
                    </button>
                    <button
                      className="flex items-center gap-2 w-full p-2 text-sm rounded-md hover-elevate text-destructive"
                      onClick={() => {
                        setRepoManageOpen(false);
                        setDisconnectDialogOpen(true);
                      }}
                      data-testid="button-disconnect-repo"
                    >
                      <Unplug className="w-4 h-4" />
                      Disconnect
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect Repository?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will disconnect <strong>{repository.fullName}</strong> from EG Press. 
                    Your repository content will not be affected, but you'll need to reconnect to manage it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-disconnect">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => disconnectMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={disconnectMutation.isPending}
                    data-testid="button-confirm-disconnect"
                  >
                    {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-repo"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Sync Repository
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Github className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Connect Repository</span>
            </div>
            
            <Popover open={repoSelectOpen} onOpenChange={setRepoSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={repoSelectOpen}
                  className="w-full justify-between h-9 text-sm"
                  data-testid="button-select-repo"
                >
                  <span className="text-muted-foreground truncate">Select repository...</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start" side="bottom">
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
                          Loading...
                        </div>
                      ) : (
                        "No repository found."
                      )}
                    </CommandEmpty>
                    <CommandGroup>
                      <ScrollArea className="h-48">
                        {filteredRepos.map((repo) => {
                          const isConnecting = connectingRepoId === repo.id;
                          return (
                            <CommandItem
                              key={repo.id}
                              value={repo.fullName}
                              onSelect={() => handleSelectRepo(repo)}
                              className="cursor-pointer"
                              disabled={connectMutation.isPending}
                              data-testid={`repo-option-${repo.name}`}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {isConnecting ? (
                                  <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-primary" />
                                ) : (
                                  <Github className="w-4 h-4 shrink-0" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm font-medium truncate">{repo.name}</span>
                                    {repo.isPrivate && <Lock className="w-3 h-3 text-muted-foreground" />}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {isConnecting ? "Connecting..." : repo.owner}
                                  </p>
                                </div>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </ScrollArea>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Content</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {contentItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Appearance</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {appearanceItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase()}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Integrations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {integrationsItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="space-y-3">
          {repository?.lastSynced && (
            <p className="text-xs text-muted-foreground text-center">
              Last synced: {new Date(repository.lastSynced).toLocaleString()}
            </p>
          )}
          
          {githubUsername && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-sidebar-accent/30">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium truncate" data-testid="text-username">
                  {githubUsername}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-7 w-7"
                onClick={() => {
                  logout();
                  setLocationNav("/login");
                }}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
