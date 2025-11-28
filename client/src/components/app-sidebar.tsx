import { 
  LayoutDashboard, 
  FileText, 
  Palette, 
  Settings,
  FolderTree,
  Github,
  RefreshCw,
  Check,
  AlertCircle
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
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Posts",
    url: "/posts",
    icon: FileText,
  },
  {
    title: "File Browser",
    url: "/files",
    icon: FolderTree,
  },
  {
    title: "Theme",
    url: "/theme",
    icon: Palette,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [repoUrl, setRepoUrl] = useState("");
  const { toast } = useToast();

  const { data: repoData, isLoading: repoLoading } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const repository = repoData?.data;

  const connectMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/repository/connect", { url });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Repository Connected",
          description: `Successfully connected to ${data.data.fullName}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        setRepoUrl("");
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

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (repoUrl.trim()) {
      connectMutation.mutate(repoUrl.trim());
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">A</span>
          </div>
          <div>
            <h1 className="font-semibold text-sm">Astro CMS</h1>
            <p className="text-xs text-muted-foreground">Content Manager</p>
          </div>
        </div>

        {repository ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 rounded-md bg-sidebar-accent/50">
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
            </div>
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
          <form onSubmit={handleConnect} className="space-y-2">
            <div className="flex items-center gap-2">
              <Github className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Connect Repository</span>
            </div>
            <Input
              placeholder="owner/repository"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-repo-url"
            />
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={connectMutation.isPending || !repoUrl.trim()}
              data-testid="button-connect-repo"
            >
              {connectMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </form>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url));
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
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {repository?.lastSynced && (
          <p className="text-xs text-muted-foreground text-center">
            Last synced: {new Date(repository.lastSynced).toLocaleString()}
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
