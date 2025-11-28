import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Settings as SettingsIcon, 
  Github, 
  RefreshCw, 
  Unlink,
  Check,
  ExternalLink,
  GitBranch,
  Clock,
  AlertCircle,
  User
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

export default function Settings() {
  const [newRepoUrl, setNewRepoUrl] = useState("");
  const { toast } = useToast();

  const { data: repoData, isLoading: repoLoading } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: userInfo } = useQuery<{ success: boolean; data: { login: string; name: string; avatar_url: string } }>({
    queryKey: ["/api/github/user"],
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
        setNewRepoUrl("");
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
            <div>
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
              <div>
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
                <div className="flex gap-2">
                  <Input
                    placeholder="owner/repository"
                    value={newRepoUrl}
                    onChange={(e) => setNewRepoUrl(e.target.value)}
                    className="flex-1"
                    data-testid="input-change-repo"
                  />
                  <Button
                    onClick={() => newRepoUrl && connectMutation.mutate(newRepoUrl)}
                    disabled={connectMutation.isPending || !newRepoUrl.trim()}
                    data-testid="button-change-repo"
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
                  Enter your Astro blog repository to get started
                </p>
              </div>
              
              <div className="flex gap-2">
                <Input
                  placeholder="owner/repository (e.g., egdevelop/blog-astro)"
                  value={newRepoUrl}
                  onChange={(e) => setNewRepoUrl(e.target.value)}
                  className="flex-1"
                  data-testid="input-connect-repo"
                />
                <Button
                  onClick={() => newRepoUrl && connectMutation.mutate(newRepoUrl)}
                  disabled={connectMutation.isPending || !newRepoUrl.trim()}
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
