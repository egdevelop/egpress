import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Rocket, Loader2, Clock } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DraftQueue, SmartDeploySettings } from "@shared/schema";
import { useLocation } from "wouter";

export function SmartDeployStatus() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: settingsData } = useQuery<{ success: boolean; settings: SmartDeploySettings }>({
    queryKey: ["/api/smart-deploy/settings"],
  });

  // Always fetch queue - show deploy button whenever there are pending items
  const { data: queueData } = useQuery<{ success: boolean; data: DraftQueue }>({
    queryKey: ["/api/smart-deploy/queue"],
    refetchInterval: 5000, // Check more frequently
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/smart-deploy/deploy", {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast({
          title: "Deploy Started",
          description: `Deployed ${data.filesCommitted || 0} file${data.filesCommitted !== 1 ? 's' : ''} to GitHub`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/smart-deploy/queue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/images"] });
        setDialogOpen(false);
      } else {
        toast({
          title: "Deploy Failed",
          description: data?.error || "Failed to deploy changes",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Deploy Failed",
        description: "An error occurred while deploying",
        variant: "destructive",
      });
    },
  });

  const pendingCount = queueData?.data?.changes?.length || 0;

  // Show deploy button whenever there are pending items in queue
  if (pendingCount === 0) {
    return null;
  }

  const changeTypes = queueData?.data?.changes?.reduce((acc, change) => {
    const category = change.type.startsWith("post_") ? "posts" : 
                     change.type.startsWith("image_") ? "images" :
                     change.type === "theme_update" ? "theme" :
                     change.type === "seo_update" ? "seo" :
                     "settings";
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const summaryParts: string[] = [];
  if (changeTypes.posts) summaryParts.push(`${changeTypes.posts} post${changeTypes.posts > 1 ? 's' : ''}`);
  if (changeTypes.images) summaryParts.push(`${changeTypes.images} image${changeTypes.images > 1 ? 's' : ''}`);
  if (changeTypes.theme) summaryParts.push(`theme`);
  if (changeTypes.seo) summaryParts.push(`${changeTypes.seo} SEO fix${changeTypes.seo > 1 ? 'es' : ''}`);
  if (changeTypes.settings) summaryParts.push(`${changeTypes.settings} setting${changeTypes.settings > 1 ? 's' : ''}`);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="relative gap-2"
              data-testid="button-smart-deploy-status"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Deploy</span>
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 min-w-5 px-1 text-xs"
              >
                {pendingCount}
              </Badge>
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{pendingCount} pending change{pendingCount !== 1 ? 's' : ''} ready to deploy</p>
        </TooltipContent>
      </Tooltip>

      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="w-5 h-5" />
            Deploy All Changes
          </DialogTitle>
          <DialogDescription>
            You have {pendingCount} pending change{pendingCount !== 1 ? 's' : ''} in the queue.
            {summaryParts.length > 0 && (
              <span className="block mt-1">
                Including: {summaryParts.join(', ')}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            This will commit all queued changes to GitHub in a single commit, 
            triggering one Vercel build instead of multiple.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDialogOpen(false);
              setLocation("/vercel");
            }}
            data-testid="button-view-queue"
          >
            View Queue Details
          </Button>
          <Button
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending}
            data-testid="button-deploy-all"
          >
            {deployMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 mr-2" />
                Deploy {pendingCount} Change{pendingCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
