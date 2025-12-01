import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  ArrowLeft, 
  Save, 
  Eye, 
  EyeOff,
  Calendar,
  Tag,
  User,
  Image as ImageIcon,
  X,
  Plus,
  FileText,
  GitCommit,
  Zap,
  HardDrive,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Clock,
  ChevronDown,
} from "lucide-react";
import type { SmartDeploySettings } from "@shared/schema";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme-context";
import { ImageUpload } from "@/components/image-upload";
import { getGitHubImageUrl, formatBytes, getImageSeoStatus, type ImageSeoStatus } from "@/lib/utils";
import type { Post, Repository } from "@shared/schema";

const postFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  description: z.string().optional(),
  pubDate: z.string().min(1, "Publication date is required"),
  heroImage: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().optional(),
  featured: z.boolean().optional(),
  content: z.string().min(1, "Content is required"),
});

type PostFormValues = z.infer<typeof postFormSchema>;

interface ImageSizeDisplayProps {
  imageUrl: string | null;
  repoFullName?: string;
  branch?: string;
}

function ImageSizeDisplay({ imageUrl, repoFullName, branch }: ImageSizeDisplayProps) {
  const [imageSize, setImageSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      setImageSize(null);
      return;
    }

    const fullUrl = getGitHubImageUrl(imageUrl, repoFullName, branch);
    if (!fullUrl) {
      setImageSize(null);
      return;
    }

    setLoading(true);
    fetch(fullUrl, { method: 'HEAD' })
      .then(res => {
        const contentLength = res.headers.get('content-length');
        if (contentLength) {
          setImageSize(parseInt(contentLength, 10));
          setLoading(false);
        } else {
          return fetch(fullUrl).then(r => r.blob()).then(blob => {
            setImageSize(blob.size);
            setLoading(false);
          });
        }
      })
      .catch(() => {
        setImageSize(null);
        setLoading(false);
      });
  }, [imageUrl, repoFullName, branch]);

  if (!imageUrl) return null;

  const seoStatus = imageSize ? getImageSeoStatus(imageSize) : null;
  
  const getStatusIcon = () => {
    if (!seoStatus) return <HardDrive className="w-4 h-4 text-muted-foreground" />;
    switch (seoStatus.status) {
      case 'good':
        return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />;
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
      default:
        return <HardDrive className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getBadgeClass = () => {
    if (!seoStatus) return '';
    switch (seoStatus.status) {
      case 'good':
        return 'bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400';
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30 dark:text-yellow-400';
      case 'critical':
        return 'bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400';
      default:
        return '';
    }
  };

  return (
    <div className="mt-2">
      {loading ? (
        <Badge variant="outline" className="text-xs gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Checking size...
        </Badge>
      ) : imageSize ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={`text-xs gap-1 cursor-help ${getBadgeClass()}`}
              data-testid="badge-hero-image-size"
            >
              {getStatusIcon()}
              {formatBytes(imageSize)}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{seoStatus?.message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Target: under 200KB for best performance
            </p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function TagInput({ 
  value = [], 
  onChange 
}: { 
  value?: string[]; 
  onChange: (tags: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");

  const addTag = () => {
    const tag = inputValue.trim().toLowerCase();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
      setInputValue("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Add a tag..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          className="flex-1"
          data-testid="input-tag"
        />
        <Button 
          type="button" 
          variant="outline" 
          size="icon"
          onClick={addTag}
          data-testid="button-add-tag"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(tag => (
            <Badge key={tag} variant="secondary" className="pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-1 hover:text-destructive"
                data-testid={`button-remove-tag-${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PostEditor() {
  const [, params] = useRoute("/posts/:slug");
  const [, navigate] = useLocation();
  const [showPreview, setShowPreview] = useState(true);
  const [commitMessage, setCommitMessage] = useState("");
  const [originalPubDate, setOriginalPubDate] = useState<string | null>(null);
  const [showOptimizeDialog, setShowOptimizeDialog] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeQuality, setOptimizeQuality] = useState(70);
  const [optimizeFormat, setOptimizeFormat] = useState<'webp' | 'jpeg'>('webp');
  const { toast } = useToast();
  const { theme } = useTheme();

  const isNew = params?.slug === "new";
  const slug = isNew ? undefined : params?.slug;

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: postData, isLoading } = useQuery<{ success: boolean; data: Post }>({
    queryKey: ["/api/posts", slug],
    enabled: !!slug && !!repoData?.data,
  });

  const { data: smartDeployData } = useQuery<{ success: boolean; settings: SmartDeploySettings }>({
    queryKey: ["/api/smart-deploy/settings"],
  });

  const smartDeployEnabled = smartDeployData?.settings?.enabled ?? false;

  const [defaultPubDate] = useState(() => new Date().toISOString());
  
  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: {
      title: "",
      slug: "",
      description: "",
      pubDate: defaultPubDate.split("T")[0],
      heroImage: "",
      author: "",
      category: "",
      tags: [],
      draft: true,
      featured: false,
      content: "# Hello World\n\nStart writing your blog post here...",
    },
  });
  
  useEffect(() => {
    if (isNew && !originalPubDate) {
      setOriginalPubDate(defaultPubDate);
    }
  }, [isNew, defaultPubDate, originalPubDate]);

  useEffect(() => {
    if (postData?.data) {
      const post = postData.data;
      const authorName = post.author 
        ? (typeof post.author === 'string' ? post.author : post.author.name) 
        : "";
      setOriginalPubDate(post.pubDate);
      form.reset({
        title: post.title,
        slug: post.slug,
        description: post.description || "",
        pubDate: post.pubDate.split("T")[0],
        heroImage: post.heroImage || "",
        author: authorName,
        category: post.category || "",
        tags: post.tags || [],
        draft: post.draft ?? false,
        featured: post.featured ?? false,
        content: post.content,
      });
      setCommitMessage(`Update post: ${post.title}`);
    }
  }, [postData, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: PostFormValues) => {
      const url = isNew ? "/api/posts" : `/api/posts/${slug}`;
      const method = isNew ? "POST" : "PUT";
      
      let finalPubDate: string;
      const currentTime = new Date().toISOString().split("T")[1];
      
      const hasValidTime = (dateStr: string): boolean => {
        if (!dateStr.includes("T")) return false;
        const timePart = dateStr.split("T")[1];
        return timePart && !timePart.startsWith("00:00:00");
      };
      
      if (originalPubDate && hasValidTime(originalPubDate)) {
        const originalDatePart = originalPubDate.split("T")[0];
        if (data.pubDate === originalDatePart) {
          finalPubDate = originalPubDate;
        } else {
          finalPubDate = new Date(data.pubDate + "T" + currentTime).toISOString();
        }
      } else {
        finalPubDate = new Date(data.pubDate + "T" + currentTime).toISOString();
      }
      
      const response = await apiRequest(method, url, {
        ...data,
        pubDate: finalPubDate,
        commitMessage: commitMessage || `${isNew ? "Create" : "Update"} post: ${data.title}`,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: isNew ? "Post Created" : "Post Updated",
          description: "Your changes have been committed to the repository",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        if (isNew && data.data?.slug) {
          navigate(`/posts/${data.data.slug}`);
        }
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

  const queueMutation = useMutation({
    mutationFn: async (data: PostFormValues) => {
      const url = isNew ? "/api/posts" : `/api/posts/${slug}`;
      const method = isNew ? "POST" : "PUT";
      
      let finalPubDate: string;
      const currentTime = new Date().toISOString().split("T")[1];
      
      const hasValidTime = (dateStr: string): boolean => {
        if (!dateStr.includes("T")) return false;
        const timePart = dateStr.split("T")[1];
        return timePart && !timePart.startsWith("00:00:00");
      };
      
      if (originalPubDate && hasValidTime(originalPubDate)) {
        const originalDatePart = originalPubDate.split("T")[0];
        if (data.pubDate === originalDatePart) {
          finalPubDate = originalPubDate;
        } else {
          finalPubDate = new Date(data.pubDate + "T" + currentTime).toISOString();
        }
      } else {
        finalPubDate = new Date(data.pubDate + "T" + currentTime).toISOString();
      }
      
      const response = await apiRequest(method, url, {
        ...data,
        pubDate: finalPubDate,
        commitMessage: commitMessage || `${isNew ? "Create" : "Update"} post: ${data.title}`,
        queueOnly: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Added to Queue",
          description: `${data.queueCount} pending change${data.queueCount > 1 ? 's' : ''} - go to Vercel page to deploy`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/smart-deploy/queue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      } else {
        toast({
          title: "Queue Failed",
          description: data.error || "Failed to queue change",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Queue Failed",
        description: "An error occurred while queuing",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PostFormValues) => {
    saveMutation.mutate(data);
  };

  const onQueue = (data: PostFormValues) => {
    queueMutation.mutate(data);
  };

  const handleOptimizeImage = useCallback(async () => {
    const heroImage = form.getValues("heroImage");
    if (!heroImage || !repoData?.data) return;

    const fullUrl = getGitHubImageUrl(heroImage, repoData.data.fullName, repoData.data.activeBranch);
    if (!fullUrl) return;

    setOptimizing(true);
    try {
      const response = await fetch(fullUrl);
      const blob = await response.blob();
      const originalSize = blob.size;
      
      const img = new Image();
      const loadPromise = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
      });
      img.src = URL.createObjectURL(blob);
      await loadPromise;

      const canvas = document.createElement('canvas');
      const maxDimension = 1200;
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height / width) * maxDimension;
          width = maxDimension;
        } else {
          width = (width / height) * maxDimension;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Failed to get canvas context");
      
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = optimizeFormat === 'webp' ? 'image/webp' : 'image/jpeg';
      const optimizedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create blob"));
          },
          mimeType,
          optimizeQuality / 100
        );
      });

      URL.revokeObjectURL(img.src);

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(optimizedBlob);
      });

      const originalName = heroImage.split('/').pop()?.replace(/\.[^.]+$/, '') || 'optimized';
      const extension = optimizeFormat === 'webp' ? 'webp' : 'jpg';
      const newFilename = `${originalName}-optimized.${extension}`;

      const uploadResponse = await fetch('/api/upload-image-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: base64,
          filename: newFilename,
          mimeType,
        }),
        credentials: 'include',
      });

      const result = await uploadResponse.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      form.setValue("heroImage", result.path);
      setShowOptimizeDialog(false);
      
      const savings = Math.round((1 - optimizedBlob.size / originalSize) * 100);
      toast({
        title: "Image Optimized",
        description: `Saved ${savings}% (${formatBytes(originalSize)} to ${formatBytes(optimizedBlob.size)})`,
      });
    } catch (error: any) {
      toast({
        title: "Optimization Failed",
        description: error.message || "Failed to optimize image",
        variant: "destructive",
      });
    } finally {
      setOptimizing(false);
    }
  }, [form, repoData?.data, optimizeQuality, optimizeFormat, toast]);

  // Auto-generate slug from title
  const watchTitle = form.watch("title");
  useEffect(() => {
    if (isNew && watchTitle) {
      const generatedSlug = watchTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setValue("slug", generatedSlug, { shouldValidate: true });
    }
  }, [watchTitle, isNew, form]);

  const repository = repoData?.data;

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <div className="text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository from the sidebar to create posts.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!isNew && isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  const contentValue = form.watch("content");

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 p-4 border-b border-border flex items-center justify-between gap-4 bg-background sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/posts">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-semibold">
              {isNew ? "New Post" : form.watch("title") || "Edit Post"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {repository.fullName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
            data-testid="button-toggle-preview"
          >
            {showPreview ? (
              <>
                <EyeOff className="w-4 h-4 mr-2" />
                Hide Preview
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Show Preview
              </>
            )}
          </Button>

          {form.watch("heroImage") && (
            <Dialog open={showOptimizeDialog} onOpenChange={setShowOptimizeDialog}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1"
                  data-testid="button-optimize-header"
                >
                  <Zap className="w-4 h-4" />
                  Optimize
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Optimize Hero Image
                  </DialogTitle>
                  <DialogDescription>
                    Reduce image file size for better SEO and faster page loads.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Quality</span>
                      <span className="font-medium">{optimizeQuality}%</span>
                    </div>
                    <Slider
                      value={[optimizeQuality]}
                      onValueChange={([v]) => setOptimizeQuality(v)}
                      min={30}
                      max={100}
                      step={5}
                      className="w-full"
                      data-testid="slider-optimize-quality"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower quality = smaller file size. 70% is recommended for web.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Format</label>
                    <Select value={optimizeFormat} onValueChange={(v) => setOptimizeFormat(v as 'webp' | 'jpeg')}>
                      <SelectTrigger data-testid="select-optimize-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="webp">WebP (Recommended)</SelectItem>
                        <SelectItem value="jpeg">JPEG</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      WebP offers better compression and is supported by all modern browsers.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowOptimizeDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleOptimizeImage}
                    disabled={optimizing}
                    data-testid="button-confirm-optimize"
                  >
                    {optimizing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Optimizing...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Optimize & Replace
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {smartDeployEnabled ? (
            <div className="flex">
              <Button
                onClick={form.handleSubmit(onSubmit)}
                disabled={saveMutation.isPending || queueMutation.isPending}
                className="rounded-r-none"
                data-testid="button-save-post"
              >
                {saveMutation.isPending ? (
                  <>
                    <GitCommit className="w-4 h-4 mr-2 animate-pulse" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {isNew ? "Create" : "Save"} & Commit
                  </>
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className="rounded-l-none border-l border-l-primary-foreground/20"
                    disabled={saveMutation.isPending || queueMutation.isPending}
                    data-testid="button-save-dropdown"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={form.handleSubmit(onSubmit)}
                    disabled={saveMutation.isPending}
                    data-testid="menu-save-commit"
                  >
                    <GitCommit className="w-4 h-4 mr-2" />
                    {isNew ? "Create" : "Save"} & Commit Now
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={form.handleSubmit(onQueue)}
                    disabled={queueMutation.isPending}
                    data-testid="menu-save-queue"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    {queueMutation.isPending ? "Queuing..." : "Save & Queue for Batch Deploy"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={saveMutation.isPending}
              data-testid="button-save-post"
            >
              {saveMutation.isPending ? (
                <>
                  <GitCommit className="w-4 h-4 mr-2 animate-pulse" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {isNew ? "Create" : "Save"} & Commit
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={showPreview ? 50 : 100} minSize={30}>
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Post Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter post title" 
                                {...field} 
                                data-testid="input-title"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="slug"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Slug</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="post-url-slug" 
                                {...field}
                                disabled={!isNew}
                                data-testid="input-slug"
                              />
                            </FormControl>
                            <FormDescription>
                              URL-friendly identifier for this post
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
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Brief description of your post"
                                className="resize-none"
                                rows={3}
                                {...field}
                                data-testid="input-description"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="pubDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Publication Date
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  type="date" 
                                  {...field}
                                  data-testid="input-date"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="author"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Author
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Author name"
                                  {...field}
                                  data-testid="input-author"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g. Technology, Tutorial, News"
                                {...field}
                                data-testid="input-category"
                              />
                            </FormControl>
                            <FormDescription>
                              Category for organizing posts
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="heroImage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <ImageIcon className="w-4 h-4" />
                              Hero Image
                            </FormLabel>
                            <FormControl>
                              <ImageUpload
                                value={field.value || ""}
                                onChange={field.onChange}
                                data-testid="input-hero-image"
                              />
                            </FormControl>
                            <FormDescription>
                              Upload a featured image for your post
                            </FormDescription>
                            <FormMessage />
                            <ImageSizeDisplay
                              imageUrl={field.value || null}
                              repoFullName={repository?.fullName}
                              branch={repository?.activeBranch}
                            />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="tags"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <Tag className="w-4 h-4" />
                              Tags
                            </FormLabel>
                            <FormControl>
                              <TagInput 
                                value={field.value} 
                                onChange={field.onChange}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="draft"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel>Draft Mode</FormLabel>
                              <FormDescription>
                                Draft posts won't appear on your published blog
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-draft"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="featured"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel>Featured Post</FormLabel>
                              <FormDescription>
                                Display this post in the featured section on homepage
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-featured"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Content</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FormField
                        control={form.control}
                        name="content"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <div className="border rounded-md overflow-hidden">
                                <Editor
                                  height="400px"
                                  defaultLanguage="markdown"
                                  value={field.value}
                                  onChange={(value) => field.onChange(value || "")}
                                  theme={theme === "dark" ? "vs-dark" : "light"}
                                  options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    lineNumbers: "on",
                                    wordWrap: "on",
                                    scrollBeyondLastLine: false,
                                    padding: { top: 16, bottom: 16 },
                                    fontFamily: "JetBrains Mono, monospace",
                                  }}
                                  data-testid="editor-content"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <GitCommit className="w-4 h-4" />
                        Commit Message
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Input
                        placeholder={`${isNew ? "Create" : "Update"} post: ${form.watch("title") || "..."}`}
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        data-testid="input-commit-message"
                      />
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </ResizablePanel>

            {showPreview && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50} minSize={30}>
                  <div className="h-full flex flex-col bg-card">
                    <div className="p-4 border-b border-border flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Preview</span>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-6">
                        <article className="prose dark:prose-invert max-w-none">
                          {form.watch("heroImage") && (
                            <img 
                              src={form.watch("heroImage")} 
                              alt={form.watch("title")}
                              className="w-full h-48 object-cover rounded-lg mb-6"
                            />
                          )}
                          <h1>{form.watch("title") || "Untitled Post"}</h1>
                          {form.watch("description") && (
                            <p className="lead text-muted-foreground">
                              {form.watch("description")}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground not-prose mb-6">
                            {form.watch("pubDate") && (
                              <span>{new Date(form.watch("pubDate")).toLocaleDateString()}</span>
                            )}
                            {form.watch("author") && (
                              <span>by {form.watch("author")}</span>
                            )}
                          </div>
                          <Separator className="my-6" />
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || "");
                                const isInline = !match;
                                return isInline ? (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                ) : (
                                  <SyntaxHighlighter
                                    style={theme === "dark" ? oneDark : oneLight}
                                    language={match[1]}
                                    PreTag="div"
                                  >
                                    {String(children).replace(/\n$/, "")}
                                  </SyntaxHighlighter>
                                );
                              },
                            }}
                          >
                            {contentValue}
                          </ReactMarkdown>
                        </article>
                      </div>
                    </ScrollArea>
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </form>
      </Form>
    </div>
  );
}
