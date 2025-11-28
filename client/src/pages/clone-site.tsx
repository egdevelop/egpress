import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Copy, Plus, RefreshCw, CheckCircle, ExternalLink, Github, ChevronsUpDown, Lock, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, GitHubRepo } from "@shared/schema";

const cloneFormSchema = z.object({
  newRepoName: z.string()
    .min(1, "Repository name is required")
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Invalid repository name format"),
  description: z.string().optional(),
  sourceRepo: z.string().optional(),
});

type CloneFormValues = z.infer<typeof cloneFormSchema>;

export default function CloneSite() {
  const [clonedRepo, setClonedRepo] = useState<{ name: string; fullName: string; url: string } | null>(null);
  const [sourceSelectOpen, setSourceSelectOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: reposData, isLoading: reposLoading } = useQuery<{ success: boolean; data: GitHubRepo[] }>({
    queryKey: ["/api/github/repos"],
  });

  const form = useForm<CloneFormValues>({
    resolver: zodResolver(cloneFormSchema),
    defaultValues: {
      newRepoName: "",
      description: "",
      sourceRepo: "",
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (data: CloneFormValues) => {
      const sourceRepo = data.sourceRepo || repoData?.data?.fullName;
      const response = await apiRequest("POST", "/api/clone-repo", {
        sourceRepo: sourceRepo,
        newRepoName: data.newRepoName,
        description: data.description,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setClonedRepo(data.data);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ["/api/github/repos"] });
        toast({
          title: "Repository Created",
          description: `${data.data.fullName} has been created successfully`,
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
        description: "An error occurred while creating the repository",
        variant: "destructive",
      });
    },
  });

  const connectToClonedMutation = useMutation({
    mutationFn: async (fullName: string) => {
      const response = await apiRequest("POST", "/api/repository/connect", { url: fullName });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Connected",
          description: `Now editing ${data.data.fullName}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/repository"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        setClonedRepo(null);
      }
    },
    onError: () => {
      toast({
        title: "Connection Failed",
        description: "Failed to connect to the new repository",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;
  const repos = reposData?.data || [];
  const selectedSource = form.watch("sourceRepo") || repository?.fullName || "";

  const filteredRepos = repos.filter(repo =>
    repo.fullName.toLowerCase().includes(sourceSearch.toLowerCase()) ||
    (repo.description && repo.description.toLowerCase().includes(sourceSearch.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Clone Site</h1>
        <p className="text-muted-foreground mt-1">
          Create a new repository by cloning from an existing template
        </p>
      </div>

      {clonedRepo && (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <AlertTitle className="text-green-800 dark:text-green-200">Repository Created!</AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            <p className="mb-3">
              <strong>{clonedRepo.fullName}</strong> has been created successfully.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(clonedRepo.url, "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View on GitHub
              </Button>
              <Button
                size="sm"
                onClick={() => connectToClonedMutation.mutate(clonedRepo.fullName)}
                disabled={connectToClonedMutation.isPending}
              >
                {connectToClonedMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Github className="w-4 h-4 mr-2" />
                )}
                Connect & Edit
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5" />
              Clone to New Repository
            </CardTitle>
            <CardDescription>
              Create a copy of a template as a new GitHub repository
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => cloneMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="sourceRepo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Template</FormLabel>
                      <Popover open={sourceSelectOpen} onOpenChange={setSourceSelectOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between"
                              data-testid="button-select-source"
                            >
                              <span className={selectedSource ? "" : "text-muted-foreground"}>
                                {selectedSource || "Select source repository..."}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[350px] p-0" align="start">
                          <Command>
                            <CommandInput 
                              placeholder="Search repositories..." 
                              value={sourceSearch}
                              onValueChange={setSourceSearch}
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
                                <ScrollArea className="h-64">
                                  {filteredRepos.map((repo) => (
                                    <CommandItem
                                      key={repo.id}
                                      value={repo.fullName}
                                      onSelect={() => {
                                        field.onChange(repo.fullName);
                                        setSourceSelectOpen(false);
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <Github className="w-4 h-4 shrink-0" />
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium truncate">{repo.fullName}</span>
                                            {repo.isPrivate && <Lock className="w-3 h-3" />}
                                          </div>
                                        </div>
                                      </div>
                                      {selectedSource === repo.fullName && (
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
                      <FormDescription>
                        {repository ? `Default: ${repository.fullName}` : "Select a repository to clone from"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="newRepoName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Repository Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="my-new-blog"
                          {...field}
                          data-testid="input-new-repo-name"
                        />
                      </FormControl>
                      <FormDescription>
                        Will be created in your GitHub account
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
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="My awesome Astro blog"
                          rows={2}
                          {...field}
                          data-testid="input-repo-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button
                  type="submit"
                  className="w-full"
                  disabled={cloneMutation.isPending || !selectedSource}
                  data-testid="button-clone-repo"
                >
                  {cloneMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Create Repository
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Github className="w-5 h-5" />
              What Gets Cloned
            </CardTitle>
            <CardDescription>
              The new repository will contain all files from the source
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedSource ? (
              <div className="p-4 rounded-lg bg-muted">
                <div className="flex items-center gap-3">
                  <Github className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium" data-testid="text-source-repo">{selectedSource}</p>
                    <p className="text-sm text-muted-foreground">Source template</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-dashed border-border text-center">
                <Github className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Select a source repository to clone
                </p>
              </div>
            )}

            <div className="space-y-2 text-sm">
              <h4 className="font-medium">Includes:</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  All files and folder structure
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Blog posts and content
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Theme and configuration
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Astro setup and dependencies
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <Badge variant="outline" className="text-xs">
                Tip: After cloning, connect to the new repo and customize it
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
