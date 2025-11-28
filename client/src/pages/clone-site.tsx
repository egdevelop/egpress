import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Copy, GitBranch, ExternalLink, RefreshCw, CheckCircle, Rocket } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

const cloneFormSchema = z.object({
  newRepoName: z.string().min(1, "Repository name is required").regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens allowed"),
  description: z.string().optional(),
  useCurrentAsSource: z.boolean(),
});

type CloneFormValues = z.infer<typeof cloneFormSchema>;

export default function CloneSite() {
  const [clonedRepo, setClonedRepo] = useState<{ name: string; fullName: string; url: string } | null>(null);
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: userData } = useQuery<{ success: boolean; data: { login: string; name: string } }>({
    queryKey: ["/api/github/user"],
  });

  const form = useForm<CloneFormValues>({
    resolver: zodResolver(cloneFormSchema),
    defaultValues: {
      newRepoName: "",
      description: "",
      useCurrentAsSource: true,
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (data: CloneFormValues) => {
      const sourceRepo = data.useCurrentAsSource && repoData?.data 
        ? repoData.data.fullName 
        : null;
      
      const response = await apiRequest("POST", "/api/clone-repo", {
        sourceRepo,
        newRepoName: data.newRepoName,
        description: data.description,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setClonedRepo(data.data);
        toast({
          title: "Repository Created",
          description: `Successfully created ${data.data.fullName}`,
        });
      } else {
        toast({
          title: "Clone Failed",
          description: data.error || "Failed to create repository",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Clone Failed",
        description: "An error occurred while cloning",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;
  const user = userData?.data;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Clone to New Site</h1>
        <p className="text-muted-foreground mt-1">
          Create a new Astro blog from your current template
        </p>
      </div>

      {clonedRepo ? (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <CheckCircle className="w-8 h-8 text-green-600 shrink-0" />
              <div className="space-y-4 flex-1">
                <div>
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                    Repository Created Successfully!
                  </h3>
                  <p className="text-green-700 dark:text-green-300">
                    Your new blog is ready at <strong>{clonedRepo.fullName}</strong>
                  </p>
                </div>
                
                <div className="flex gap-3 flex-wrap">
                  <Button asChild>
                    <a href={clonedRepo.url} target="_blank" rel="noopener noreferrer">
                      <GitBranch className="w-4 h-4 mr-2" />
                      View on GitHub
                      <ExternalLink className="w-3 h-3 ml-2" />
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setClonedRepo(null);
                      form.reset();
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Create Another
                  </Button>
                </div>

                <Alert>
                  <Rocket className="w-4 h-4" />
                  <AlertTitle>Next Steps</AlertTitle>
                  <AlertDescription>
                    <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
                      <li>Connect to the new repository using Settings</li>
                      <li>Customize your branding and theme</li>
                      <li>Deploy to Vercel, Netlify, or your preferred host</li>
                    </ol>
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => cloneMutation.mutate(data))} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5" />
                  New Repository
                </CardTitle>
                <CardDescription>
                  Create a new GitHub repository with your blog template
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {repository && (
                  <Alert>
                    <Copy className="w-4 h-4" />
                    <AlertTitle>Source Template</AlertTitle>
                    <AlertDescription>
                      Cloning from: <strong>{repository.fullName}</strong>
                    </AlertDescription>
                  </Alert>
                )}

                <FormField
                  control={form.control}
                  name="newRepoName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repository Name</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{user?.login}/</span>
                          <Input
                            placeholder="my-new-blog"
                            {...field}
                            data-testid="input-new-repo-name"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Only lowercase letters, numbers, and hyphens allowed
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="My awesome Astro blog..."
                          rows={2}
                          {...field}
                          data-testid="input-repo-description"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={cloneMutation.isPending}
                data-testid="button-clone-site"
              >
                {cloneMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                Create New Site
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
