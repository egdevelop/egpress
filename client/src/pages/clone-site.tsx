import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GitBranch, Plus, RefreshCw, CheckCircle, Globe, ArrowRightLeft, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, BranchInfo } from "@shared/schema";

const createSiteFormSchema = z.object({
  domain: z.string()
    .min(1, "Domain name is required")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z0-9]$/, "Invalid domain format"),
});

type CreateSiteFormValues = z.infer<typeof createSiteFormSchema>;

export default function CloneSite() {
  const [createdBranch, setCreatedBranch] = useState<{ name: string; domain: string } | null>(null);
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: branchesData, isLoading: branchesLoading } = useQuery<{ success: boolean; data: BranchInfo[] }>({
    queryKey: ["/api/branches"],
    enabled: !!repoData?.data,
  });

  const form = useForm<CreateSiteFormValues>({
    resolver: zodResolver(createSiteFormSchema),
    defaultValues: {
      domain: "",
    },
  });

  const createBranchMutation = useMutation({
    mutationFn: async (data: CreateSiteFormValues) => {
      const response = await apiRequest("POST", "/api/branches", {
        domain: data.domain,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setCreatedBranch(data.data);
        queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
        toast({
          title: "Site Created",
          description: `Branch ${data.data.name} created and activated`,
        });
      } else {
        toast({
          title: "Creation Failed",
          description: data.error || "Failed to create site branch",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "An error occurred while creating the branch",
        variant: "destructive",
      });
    },
  });

  const switchBranchMutation = useMutation({
    mutationFn: async (branch: string) => {
      const response = await apiRequest("POST", "/api/branches/switch", { branch });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        queryClient.invalidateQueries({ queryKey: ["/api/site-config"] });
        queryClient.invalidateQueries({ queryKey: ["/api/adsense"] });
        queryClient.invalidateQueries({ queryKey: ["/api/theme"] });
        queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
        toast({
          title: "Branch Switched",
          description: `Now editing: ${data.data.activeBranch}`,
        });
      } else {
        toast({
          title: "Switch Failed",
          description: data.error || "Failed to switch branch",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Switch Failed",
        description: "An error occurred while switching branches",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;
  const branches = branchesData?.data || [];
  const siteBranches = branches.filter(b => !b.isTemplate);
  const templateBranch = branches.find(b => b.isTemplate);

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No Repository Connected</h3>
              <p className="text-muted-foreground mt-1">
                Connect a repository in Settings to create site branches
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Sites & Branches</h1>
        <p className="text-muted-foreground mt-1">
          Create and manage site branches from your template
        </p>
      </div>

      {createdBranch && (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <AlertTitle className="text-green-800 dark:text-green-200">Site Branch Created!</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            Branch <strong>{createdBranch.name}</strong> is now active. 
            Start customizing your site's content and branding.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create New Site
            </CardTitle>
            <CardDescription>
              Create a new branch from the template for a new site
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createBranchMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="domain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Domain Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="my-blog.com"
                          {...field}
                          data-testid="input-domain-name"
                        />
                      </FormControl>
                      <FormDescription>
                        Branch will be named: site-{field.value?.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() || "..."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createBranchMutation.isPending}
                  data-testid="button-create-site"
                >
                  {createBranchMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <GitBranch className="w-4 h-4 mr-2" />
                  )}
                  Create Site Branch
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Current Branch
            </CardTitle>
            <CardDescription>
              Switch between template and site branches
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg bg-muted">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary" />
                  <span className="font-medium">{repository.activeBranch}</span>
                </div>
                {repository.activeBranch === repository.defaultBranch ? (
                  <Badge>Template</Badge>
                ) : (
                  <Badge variant="secondary">Site</Badge>
                )}
              </div>
            </div>

            {branches.length > 1 && (
              <Select
                value={repository.activeBranch}
                onValueChange={(value) => switchBranchMutation.mutate(value)}
                disabled={switchBranchMutation.isPending}
              >
                <SelectTrigger data-testid="select-branch">
                  <SelectValue placeholder="Switch branch..." />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      <div className="flex items-center gap-2">
                        {branch.isTemplate ? (
                          <GitBranch className="w-3 h-3" />
                        ) : (
                          <Globe className="w-3 h-3" />
                        )}
                        {branch.name}
                        {branch.isTemplate && " (template)"}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Site Branches
          </CardTitle>
          <CardDescription>
            All site branches created from the template ({repository.defaultBranch})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {branchesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : siteBranches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No site branches yet</p>
              <p className="text-sm">Create your first site using the form above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {siteBranches.map((branch) => (
                <div
                  key={branch.name}
                  className={`p-3 rounded-lg border flex items-center justify-between hover-elevate cursor-pointer ${
                    repository.activeBranch === branch.name 
                      ? "border-primary bg-primary/5" 
                      : "border-border"
                  }`}
                  onClick={() => {
                    if (repository.activeBranch !== branch.name) {
                      switchBranchMutation.mutate(branch.name);
                    }
                  }}
                  data-testid={`branch-item-${branch.name}`}
                >
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{branch.name}</p>
                      {branch.domain && (
                        <p className="text-sm text-muted-foreground">{branch.domain}</p>
                      )}
                    </div>
                  </div>
                  {repository.activeBranch === branch.name && (
                    <Badge variant="default">Active</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
