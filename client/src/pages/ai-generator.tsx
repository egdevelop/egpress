import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Sparkles, Key, FileText, RefreshCw, Eye, Edit, X, Check, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import type { Repository } from "@shared/schema";

const aiFormSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  topic: z.string().min(1, "Topic is required"),
  keywords: z.string(),
  tone: z.enum(["professional", "casual", "technical", "creative"]),
  length: z.enum(["short", "medium", "long"]),
});

type AIFormValues = z.infer<typeof aiFormSchema>;

interface GeneratedPost {
  title: string;
  description: string;
  content: string;
  tags: string[];
}

export default function AIGenerator() {
  const [, navigate] = useLocation();
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [keySaved, setKeySaved] = useState(false);
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  // Load saved API key
  const { data: keyData } = useQuery<{ success: boolean; data: { hasKey: boolean; key: string | null } }>({
    queryKey: ["/api/ai/key"],
  });

  const form = useForm<AIFormValues>({
    resolver: zodResolver(aiFormSchema),
    defaultValues: {
      apiKey: "",
      topic: "",
      keywords: "",
      tone: "professional",
      length: "medium",
    },
  });

  // Populate form with saved API key when data loads
  if (keyData?.data?.key && form.getValues("apiKey") !== keyData.data.key) {
    form.setValue("apiKey", keyData.data.key);
    if (!keySaved) setKeySaved(true);
  }

  // Mutation to save API key
  const saveKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await apiRequest("POST", "/api/ai/key", { apiKey });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setKeySaved(true);
        queryClient.invalidateQueries({ queryKey: ["/api/ai/key"] });
        toast({
          title: "API Key Saved",
          description: "Your Gemini API key has been saved for future sessions",
        });
      }
    },
  });

  // Mutation to clear API key
  const clearKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/ai/key");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setKeySaved(false);
        form.setValue("apiKey", "");
        queryClient.invalidateQueries({ queryKey: ["/api/ai/key"] });
        toast({
          title: "API Key Cleared",
          description: "Your Gemini API key has been removed",
        });
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: AIFormValues) => {
      const keywords = data.keywords.split(",").map(k => k.trim()).filter(k => k);
      const response = await apiRequest("POST", "/api/ai/generate", {
        apiKey: data.apiKey,
        topic: data.topic,
        keywords,
        tone: data.tone,
        length: data.length,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setGeneratedPost(data.data);
        toast({
          title: "Content Generated",
          description: "AI has created a blog post draft for you",
        });
      } else {
        toast({
          title: "Generation Failed",
          description: data.error || "Failed to generate content",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "An error occurred while generating content",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generatedPost) return;
      
      const slug = generatedPost.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      
      const response = await apiRequest("POST", "/api/posts", {
        slug,
        title: generatedPost.title,
        description: generatedPost.description,
        pubDate: new Date().toISOString(),
        tags: generatedPost.tags,
        draft: true,
        content: generatedPost.content,
        commitMessage: `Add AI-generated post: ${generatedPost.title}`,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Post Saved",
          description: "The post has been saved as a draft",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        navigate(`/posts/${data.data.slug}`);
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save post",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "An error occurred while saving",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <div className="text-center">
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository to generate AI posts.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            AI Post Generator
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate blog posts using Google Gemini AI
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => generateMutation.mutate(data))} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    API Configuration
                  </CardTitle>
                  <CardDescription>
                    Enter your Google Gemini API key
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gemini API Key</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="AIzaSy..."
                            {...field}
                            data-testid="input-gemini-api-key"
                          />
                        </FormControl>
                        <FormDescription>
                          Get your API key from{" "}
                          <a 
                            href="https://aistudio.google.com/app/apikey" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
                            Google AI Studio
                          </a>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center gap-2">
                    {keySaved ? (
                      <>
                        <Badge variant="secondary" className="gap-1">
                          <Check className="w-3 h-3" />
                          Key Saved
                        </Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => clearKeyMutation.mutate()}
                          disabled={clearKeyMutation.isPending}
                          data-testid="button-clear-key"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Clear
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const apiKey = form.getValues("apiKey");
                          if (apiKey) {
                            saveKeyMutation.mutate(apiKey);
                          } else {
                            toast({
                              title: "No API Key",
                              description: "Enter an API key first",
                              variant: "destructive",
                            });
                          }
                        }}
                        disabled={saveKeyMutation.isPending || !form.getValues("apiKey")}
                        data-testid="button-save-key"
                      >
                        <Key className="w-4 h-4 mr-1" />
                        {saveKeyMutation.isPending ? "Saving..." : "Save for Future Sessions"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Content Settings
                  </CardTitle>
                  <CardDescription>
                    Describe what you want to write about
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="topic"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Topic</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g., How to build a REST API with Node.js"
                            rows={3}
                            {...field}
                            data-testid="input-topic"
                          />
                        </FormControl>
                        <FormDescription>
                          Describe the topic or title of your blog post
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="keywords"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Keywords (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="nodejs, api, backend, express"
                            {...field}
                            data-testid="input-keywords"
                          />
                        </FormControl>
                        <FormDescription>
                          Comma-separated list of keywords to include
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="tone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tone</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-tone">
                                <SelectValue placeholder="Select tone" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="professional">Professional</SelectItem>
                              <SelectItem value="casual">Casual</SelectItem>
                              <SelectItem value="technical">Technical</SelectItem>
                              <SelectItem value="creative">Creative</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="length"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Length</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-length">
                                <SelectValue placeholder="Select length" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="short">Short (300-500 words)</SelectItem>
                              <SelectItem value="medium">Medium (800-1200 words)</SelectItem>
                              <SelectItem value="long">Long (1500-2000 words)</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                type="submit"
                className="w-full"
                disabled={generateMutation.isPending}
                data-testid="button-generate"
              >
                {generateMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Generate Blog Post
              </Button>
            </form>
          </Form>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Preview</h2>
            {generatedPost && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  {showPreview ? (
                    <>
                      <Edit className="w-4 h-4 mr-2" />
                      View Raw
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <Card className="min-h-[400px]">
            <CardContent className="p-6">
              {generatedPost ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold">{generatedPost.title}</h3>
                    <p className="text-muted-foreground mt-1">{generatedPost.description}</p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {generatedPost.tags.map(tag => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    {showPreview ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{generatedPost.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="text-sm font-mono bg-muted p-4 rounded-md overflow-auto max-h-[400px] whitespace-pre-wrap">
                        {generatedPost.content}
                      </pre>
                    )}
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-generated">
                      {saveMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Save as Draft
                    </Button>
                    <Button variant="outline" onClick={() => setGeneratedPost(null)}>
                      <X className="w-4 h-4 mr-2" />
                      Discard
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[350px]">
                  <div className="text-center text-muted-foreground">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Generated content will appear here</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertTitle>Note</AlertTitle>
            <AlertDescription>
              Generated content is saved as a draft. You can review and edit it before publishing.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
