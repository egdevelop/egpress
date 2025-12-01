import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Sparkles, Key, FileText, RefreshCw, Eye, Edit, X, Check, AlertCircle, ChevronsUpDown, Image, Zap, FolderOpen, Plus, Trash2, Layers, Play, Pause, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { base64ToOptimizedBase64, formatBytes } from "@/lib/image-utils";
import type { Repository } from "@shared/schema";

const LANGUAGES = [
  { value: "english", label: "English", native: "English" },
  { value: "indonesian", label: "Indonesian", native: "Bahasa Indonesia" },
  { value: "spanish", label: "Spanish", native: "Español" },
  { value: "french", label: "French", native: "Français" },
  { value: "german", label: "German", native: "Deutsch" },
  { value: "chinese", label: "Chinese (Simplified)", native: "简体中文" },
  { value: "chinese-traditional", label: "Chinese (Traditional)", native: "繁體中文" },
  { value: "japanese", label: "Japanese", native: "日本語" },
  { value: "korean", label: "Korean", native: "한국어" },
  { value: "arabic", label: "Arabic", native: "العربية" },
  { value: "hindi", label: "Hindi", native: "हिन्दी" },
  { value: "portuguese", label: "Portuguese", native: "Português" },
  { value: "portuguese-br", label: "Portuguese (Brazil)", native: "Português (Brasil)" },
  { value: "russian", label: "Russian", native: "Русский" },
  { value: "italian", label: "Italian", native: "Italiano" },
  { value: "dutch", label: "Dutch", native: "Nederlands" },
  { value: "turkish", label: "Turkish", native: "Türkçe" },
  { value: "vietnamese", label: "Vietnamese", native: "Tiếng Việt" },
  { value: "thai", label: "Thai", native: "ไทย" },
  { value: "polish", label: "Polish", native: "Polski" },
  { value: "swedish", label: "Swedish", native: "Svenska" },
  { value: "greek", label: "Greek", native: "Ελληνικά" },
  { value: "hebrew", label: "Hebrew", native: "עברית" },
  { value: "czech", label: "Czech", native: "Čeština" },
  { value: "danish", label: "Danish", native: "Dansk" },
  { value: "finnish", label: "Finnish", native: "Suomi" },
  { value: "norwegian", label: "Norwegian", native: "Norsk" },
  { value: "hungarian", label: "Hungarian", native: "Magyar" },
  { value: "romanian", label: "Romanian", native: "Română" },
  { value: "ukrainian", label: "Ukrainian", native: "Українська" },
  { value: "bengali", label: "Bengali", native: "বাংলা" },
  { value: "tamil", label: "Tamil", native: "தமிழ்" },
  { value: "telugu", label: "Telugu", native: "తెలుగు" },
  { value: "marathi", label: "Marathi", native: "मराठी" },
  { value: "gujarati", label: "Gujarati", native: "ગુજરાતી" },
  { value: "kannada", label: "Kannada", native: "ಕನ್ನಡ" },
  { value: "malayalam", label: "Malayalam", native: "മലയാളം" },
  { value: "punjabi", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { value: "urdu", label: "Urdu", native: "اردو" },
  { value: "persian", label: "Persian", native: "فارسی" },
  { value: "malay", label: "Malay", native: "Bahasa Melayu" },
  { value: "tagalog", label: "Tagalog", native: "Tagalog" },
  { value: "swahili", label: "Swahili", native: "Kiswahili" },
  { value: "afrikaans", label: "Afrikaans", native: "Afrikaans" },
  { value: "catalan", label: "Catalan", native: "Català" },
  { value: "croatian", label: "Croatian", native: "Hrvatski" },
  { value: "serbian", label: "Serbian", native: "Српски" },
  { value: "slovak", label: "Slovak", native: "Slovenčina" },
  { value: "slovenian", label: "Slovenian", native: "Slovenščina" },
  { value: "bulgarian", label: "Bulgarian", native: "Български" },
  { value: "lithuanian", label: "Lithuanian", native: "Lietuvių" },
  { value: "latvian", label: "Latvian", native: "Latviešu" },
  { value: "estonian", label: "Estonian", native: "Eesti" },
  { value: "icelandic", label: "Icelandic", native: "Íslenska" },
  { value: "irish", label: "Irish", native: "Gaeilge" },
  { value: "welsh", label: "Welsh", native: "Cymraeg" },
  { value: "basque", label: "Basque", native: "Euskara" },
  { value: "galician", label: "Galician", native: "Galego" },
  { value: "albanian", label: "Albanian", native: "Shqip" },
  { value: "macedonian", label: "Macedonian", native: "Македонски" },
  { value: "bosnian", label: "Bosnian", native: "Bosanski" },
  { value: "azerbaijani", label: "Azerbaijani", native: "Azərbaycan" },
  { value: "kazakh", label: "Kazakh", native: "Қазақша" },
  { value: "uzbek", label: "Uzbek", native: "O'zbek" },
  { value: "georgian", label: "Georgian", native: "ქართული" },
  { value: "armenian", label: "Armenian", native: "Hayeren" },
  { value: "mongolian", label: "Mongolian", native: "Монгол" },
  { value: "nepali", label: "Nepali", native: "नेपाली" },
  { value: "sinhala", label: "Sinhala", native: "සිංහල" },
  { value: "khmer", label: "Khmer", native: "ភាសាខ្មែរ" },
  { value: "lao", label: "Lao", native: "ລາວ" },
  { value: "burmese", label: "Burmese", native: "မြန်မာ" },
  { value: "amharic", label: "Amharic", native: "አማርኛ" },
  { value: "yoruba", label: "Yoruba", native: "Yorùbá" },
  { value: "zulu", label: "Zulu", native: "isiZulu" },
  { value: "hausa", label: "Hausa", native: "Hausa" },
];

const aiFormSchema = z.object({
  apiKey: z.string(),
  topic: z.string().min(1, "Topic is required"),
  keywords: z.string(),
  tone: z.enum(["professional", "casual", "technical", "creative"]),
  length: z.enum(["short", "medium", "long"]),
  language: z.string().default("english"),
});

type AIFormValues = z.infer<typeof aiFormSchema>;

interface GeneratedPost {
  title: string;
  description: string;
  content: string;
  tags: string[];
  category?: string;
  heroImage?: string;
  heroImageAlt?: string;
}

type GenerationStep = "idle" | "generating-post" | "generating-image" | "optimizing-image" | "complete" | "error";

interface GenerationState {
  step: GenerationStep;
  progress: number;
  message: string;
}

interface OptimizedImageData {
  base64: string;
  mimeType: string;
  dataUrl: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
}

interface BulkQueueItem {
  id: string;
  topic: string;
  keywords: string;
  status: "pending" | "generating" | "completed" | "error";
  error?: string;
  postSlug?: string;
}

interface BulkGenerationState {
  isRunning: boolean;
  currentIndex: number;
  totalItems: number;
  completedCount: number;
  errorCount: number;
}

export default function AIGenerator() {
  const [, navigate] = useLocation();
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [keySaved, setKeySaved] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [optimizedImage, setOptimizedImage] = useState<OptimizedImageData | null>(null);
  const [generateWithImage, setGenerateWithImage] = useState(true);
  const [generationState, setGenerationState] = useState<GenerationState>({
    step: "idle",
    progress: 0,
    message: "",
  });
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [bulkQueue, setBulkQueue] = useState<BulkQueueItem[]>([]);
  const [bulkNewTopic, setBulkNewTopic] = useState("");
  const [bulkNewKeywords, setBulkNewKeywords] = useState("");
  const [bulkTone, setBulkTone] = useState<"professional" | "casual" | "technical" | "creative">("professional");
  const [bulkLength, setBulkLength] = useState<"short" | "medium" | "long">("medium");
  const [bulkLanguage, setBulkLanguage] = useState("indonesian");
  const [bulkLanguageOpen, setBulkLanguageOpen] = useState(false);
  const [bulkWithImage, setBulkWithImage] = useState(true);
  const [bulkState, setBulkState] = useState<BulkGenerationState>({
    isRunning: false,
    currentIndex: 0,
    totalItems: 0,
    completedCount: 0,
    errorCount: 0,
  });
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: keyData } = useQuery<{ success: boolean; data: { hasKey: boolean } }>({
    queryKey: ["/api/ai/key"],
  });

  const { data: authData } = useQuery<{ success: boolean; data: { authenticated: boolean; user?: { login: string; name?: string } } }>({
    queryKey: ["/api/auth/status"],
  });

  const form = useForm<AIFormValues>({
    resolver: zodResolver(aiFormSchema),
    defaultValues: {
      apiKey: "",
      topic: "",
      keywords: "",
      tone: "professional",
      length: "medium",
      language: "english",
    },
  });

  useEffect(() => {
    if (keyData?.data?.hasKey) {
      setKeySaved(true);
    }
  }, [keyData?.data?.hasKey]);

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

  const generateCompleteMutation = useMutation({
    mutationFn: async (data: AIFormValues) => {
      setGenerationState({ step: "generating-post", progress: 10, message: "Creating blog post content..." });
      
      const keywords = data.keywords.split(",").map(k => k.trim()).filter(k => k);
      const postResponse = await apiRequest("POST", "/api/ai/generate", {
        apiKey: data.apiKey || undefined,
        useSavedKey: keySaved && !data.apiKey,
        topic: data.topic,
        keywords,
        tone: data.tone,
        length: data.length,
        language: data.language,
      });
      const postResult = await postResponse.json();
      
      if (!postResult.success) {
        throw new Error(postResult.error || "Failed to generate post");
      }
      
      const generatedPostData = postResult.data as GeneratedPost;
      setGeneratedPost(generatedPostData);
      
      if (!generateWithImage || !generatedPostData.heroImage) {
        setGenerationState({ step: "complete", progress: 100, message: "Post generated successfully!" });
        return { post: generatedPostData, image: null };
      }
      
      setGenerationState({ step: "generating-image", progress: 40, message: "Creating hero image..." });
      
      try {
        const imageResponse = await apiRequest("POST", "/api/ai/generate-image", {
          prompt: generatedPostData.heroImage,
          useSavedKey: keySaved,
        });
        const imageResult = await imageResponse.json();
        
        if (!imageResult.success || !imageResult.data?.imageUrl) {
          setGenerationState({ step: "complete", progress: 100, message: "Post generated (image generation failed)" });
          return { post: generatedPostData, image: null };
        }
        
        setGenerationState({ step: "optimizing-image", progress: 70, message: "Optimizing image for web..." });
        
        const imageDataUrl = imageResult.data.imageUrl;
        const optimized = await base64ToOptimizedBase64(imageDataUrl, "image/png", {
          maxWidth: 1200,
          maxHeight: 800,
          quality: 0.85,
        });
        
        const optimizedData: OptimizedImageData = {
          base64: optimized.base64,
          mimeType: optimized.mimeType,
          dataUrl: optimized.dataUrl,
          ...optimized.stats,
        };
        
        setOptimizedImage(optimizedData);
        setGenerationState({ step: "complete", progress: 100, message: "Everything ready!" });
        
        return { post: generatedPostData, image: optimizedData };
      } catch (imageError) {
        console.error("Image generation/optimization failed:", imageError);
        setGenerationState({ step: "complete", progress: 100, message: "Post generated (image failed)" });
        return { post: generatedPostData, image: null };
      }
    },
    onSuccess: () => {
      toast({
        title: "Generation Complete",
        description: generateWithImage 
          ? "Blog post and hero image are ready!"
          : "Blog post content is ready!",
      });
    },
    onError: (error: Error) => {
      setGenerationState({ step: "error", progress: 0, message: error.message });
      setGeneratedPost(null);
      setOptimizedImage(null);
      toast({
        title: "Generation Failed",
        description: error.message,
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
      
      let heroImagePath: string | undefined;
      
      if (optimizedImage && optimizedImage.dataUrl) {
        console.log("Uploading optimized image...", {
          hasDataUrl: !!optimizedImage.dataUrl,
          mimeType: optimizedImage.mimeType,
          dataUrlLength: optimizedImage.dataUrl?.length,
        });
        
        try {
          const uploadResponse = await apiRequest("POST", "/api/upload-image-base64", {
            imageData: optimizedImage.dataUrl,
            mimeType: optimizedImage.mimeType,
            filename: slug,
          });
          const uploadResult = await uploadResponse.json();
          console.log("Upload result:", uploadResult);
          
          if (uploadResult.success && uploadResult.path) {
            heroImagePath = uploadResult.path;
            console.log("Hero image path set to:", heroImagePath);
          } else {
            console.error("Upload response not successful:", uploadResult);
            throw new Error(uploadResult.error || "Image upload failed");
          }
        } catch (err: any) {
          console.error("Failed to upload hero image:", err);
          toast({
            title: "Image Upload Failed",
            description: err.message || "Could not upload hero image, but post will still be saved",
            variant: "destructive",
          });
        }
      } else {
        console.log("No optimized image to upload", { optimizedImage });
      }
      
      const authorName = authData?.data?.user?.name || authData?.data?.user?.login || "Author";
      
      const response = await apiRequest("POST", "/api/posts", {
        slug,
        title: generatedPost.title,
        description: generatedPost.description,
        pubDate: new Date().toISOString(),
        tags: generatedPost.tags,
        category: generatedPost.category,
        draft: true,
        content: generatedPost.content,
        heroImage: heroImagePath,
        author: authorName,
        commitMessage: `Add AI-generated post: ${generatedPost.title}`,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast({
          title: "Post Saved",
          description: "The post has been saved as a draft with all fields populated",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
        navigate(`/posts/${data.data.slug}`);
      } else {
        toast({
          title: "Save Failed",
          description: data?.error || "Failed to save post",
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

  const handleGenerate = (data: AIFormValues) => {
    setGeneratedPost(null);
    setOptimizedImage(null);
    setGenerationState({ step: "idle", progress: 0, message: "" });
    generateCompleteMutation.mutate(data);
  };

  const handleDiscard = () => {
    setGeneratedPost(null);
    setOptimizedImage(null);
    setGenerationState({ step: "idle", progress: 0, message: "" });
  };

  const addToBulkQueue = () => {
    if (!bulkNewTopic.trim()) {
      toast({
        title: "Topic Required",
        description: "Please enter a topic for the post",
        variant: "destructive",
      });
      return;
    }
    const newItem: BulkQueueItem = {
      id: Date.now().toString(),
      topic: bulkNewTopic.trim(),
      keywords: bulkNewKeywords.trim(),
      status: "pending",
    };
    setBulkQueue(prev => [...prev, newItem]);
    setBulkNewTopic("");
    setBulkNewKeywords("");
  };

  const removeFromBulkQueue = (id: string) => {
    setBulkQueue(prev => prev.filter(item => item.id !== id));
  };

  const clearBulkQueue = () => {
    setBulkQueue([]);
    setBulkState({
      isRunning: false,
      currentIndex: 0,
      totalItems: 0,
      completedCount: 0,
      errorCount: 0,
    });
  };

  const generateSingleBulkPost = async (item: BulkQueueItem): Promise<{ success: boolean; slug?: string; error?: string }> => {
    const authorName = authData?.data?.user?.name || authData?.data?.user?.login || "Author";
    const keywords = item.keywords.split(",").map(k => k.trim()).filter(k => k);
    
    try {
      const postResponse = await apiRequest("POST", "/api/ai/generate", {
        useSavedKey: keySaved,
        topic: item.topic,
        keywords,
        tone: bulkTone,
        length: bulkLength,
        language: bulkLanguage,
      });
      const postResult = await postResponse.json();
      
      if (!postResult.success) {
        return { success: false, error: postResult.error || "Failed to generate post" };
      }
      
      const generatedPostData = postResult.data as GeneratedPost;
      
      const slug = generatedPostData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      
      let heroImagePath: string | undefined;
      
      if (bulkWithImage && generatedPostData.heroImage) {
        try {
          const imageResponse = await apiRequest("POST", "/api/ai/generate-image", {
            prompt: generatedPostData.heroImage,
            useSavedKey: keySaved,
          });
          const imageResult = await imageResponse.json();
          
          if (imageResult.success && imageResult.data?.imageUrl) {
            const optimized = await base64ToOptimizedBase64(imageResult.data.imageUrl, "image/png", {
              maxWidth: 1200,
              maxHeight: 800,
              quality: 0.85,
              format: "webp",
            });
            
            const uploadResponse = await apiRequest("POST", "/api/upload-image-base64", {
              imageData: optimized.dataUrl,
              mimeType: optimized.mimeType,
              filename: slug,
              queueOnly: true,
            });
            const uploadResult = await uploadResponse.json();
            
            if (uploadResult.success && uploadResult.path) {
              heroImagePath = uploadResult.path;
            }
          }
        } catch (imgErr) {
          console.error("Image generation/upload failed for bulk post:", imgErr);
        }
      }
      
      const response = await apiRequest("POST", "/api/posts", {
        slug,
        title: generatedPostData.title,
        description: generatedPostData.description,
        pubDate: new Date().toISOString(),
        tags: generatedPostData.tags,
        category: generatedPostData.category,
        draft: false,
        featured: true,
        content: generatedPostData.content,
        heroImage: heroImagePath,
        author: authorName,
        commitMessage: `Add AI-generated post: ${generatedPostData.title}`,
        queueOnly: true,
      });
      const saveResult = await response.json();
      
      if (saveResult.success) {
        return { success: true, slug: saveResult.data?.slug || slug };
      } else {
        return { success: false, error: saveResult.error || "Failed to save post" };
      }
    } catch (err: any) {
      return { success: false, error: err.message || "Unknown error" };
    }
  };

  const startBulkGeneration = async () => {
    if (bulkQueue.length === 0) {
      toast({
        title: "Queue Empty",
        description: "Add topics to the queue first",
        variant: "destructive",
      });
      return;
    }
    
    if (!keySaved) {
      toast({
        title: "API Key Required",
        description: "Please save your Gemini API key first",
        variant: "destructive",
      });
      return;
    }
    
    setBulkState({
      isRunning: true,
      currentIndex: 0,
      totalItems: bulkQueue.length,
      completedCount: 0,
      errorCount: 0,
    });
    
    setBulkQueue(prev => prev.map(item => ({ ...item, status: "pending" as const, error: undefined, postSlug: undefined })));
    
    for (let i = 0; i < bulkQueue.length; i++) {
      const item = bulkQueue[i];
      
      setBulkQueue(prev => prev.map((q, idx) => 
        idx === i ? { ...q, status: "generating" as const } : q
      ));
      
      setBulkState(prev => ({ ...prev, currentIndex: i }));
      
      const result = await generateSingleBulkPost(item);
      
      if (result.success) {
        setBulkQueue(prev => prev.map((q, idx) => 
          idx === i ? { ...q, status: "completed" as const, postSlug: result.slug } : q
        ));
        setBulkState(prev => ({ ...prev, completedCount: prev.completedCount + 1 }));
      } else {
        setBulkQueue(prev => prev.map((q, idx) => 
          idx === i ? { ...q, status: "error" as const, error: result.error } : q
        ));
        setBulkState(prev => ({ ...prev, errorCount: prev.errorCount + 1 }));
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setBulkState(prev => ({ ...prev, isRunning: false }));
    queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/smart-deploy/queue"] });
    
    toast({
      title: "Bulk Generation Complete",
      description: `Generated ${bulkState.completedCount + 1} posts - queued for deployment`,
    });
  };

  const repository = repoData?.data;
  const selectedLanguage = LANGUAGES.find(lang => lang.value === form.watch("language"));
  const selectedBulkLanguage = LANGUAGES.find(lang => lang.value === bulkLanguage);
  const isGenerating = generationState.step !== "idle" && generationState.step !== "complete" && generationState.step !== "error";

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
            Generate complete blog posts with AI
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "single" | "bulk")}>
        <TabsList className="mb-4">
          <TabsTrigger value="single" className="gap-2" data-testid="tab-single">
            <FileText className="w-4 h-4" />
            Single Post
          </TabsTrigger>
          <TabsTrigger value="bulk" className="gap-2" data-testid="tab-bulk">
            <Layers className="w-4 h-4" />
            Bulk Generate
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Form {...form}>
            <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-6">
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
                  {keySaved ? (
                    <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                      <Check className="w-4 h-4 text-green-600" />
                      <AlertTitle className="text-green-700 dark:text-green-400">API Key Saved</AlertTitle>
                      <AlertDescription className="text-green-600 dark:text-green-500">
                        Your Gemini API key is securely saved.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{keySaved ? "New API Key (optional)" : "Gemini API Key"}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder={keySaved ? "Leave empty to use saved key" : "AIzaSy..."}
                            {...field}
                            data-testid="input-gemini-api-key"
                          />
                        </FormControl>
                        <FormDescription>
                          {keySaved 
                            ? "Enter a new key to override the saved one."
                            : <>Get your API key from{" "}
                              <a 
                                href="https://aistudio.google.com/app/apikey" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary underline"
                              >
                                Google AI Studio
                              </a>
                            </>
                          }
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {keySaved ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => clearKeyMutation.mutate()}
                        disabled={clearKeyMutation.isPending}
                        data-testid="button-clear-key"
                      >
                        <X className="w-4 h-4 mr-1" />
                        {clearKeyMutation.isPending ? "Clearing..." : "Clear Saved Key"}
                      </Button>
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
                        {saveKeyMutation.isPending ? "Saving..." : "Save Key"}
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

                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Language</FormLabel>
                        <Popover open={languageOpen} onOpenChange={setLanguageOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={languageOpen}
                                className={cn(
                                  "w-full justify-between",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="select-language"
                              >
                                {selectedLanguage ? (
                                  <span className="flex items-center gap-2">
                                    <span>{selectedLanguage.label}</span>
                                    <span className="text-muted-foreground">({selectedLanguage.native})</span>
                                  </span>
                                ) : (
                                  "Select language..."
                                )}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search language..." data-testid="input-language-search" />
                              <CommandList>
                                <CommandEmpty>No language found.</CommandEmpty>
                                <CommandGroup>
                                  {LANGUAGES.map((language) => (
                                    <CommandItem
                                      key={language.value}
                                      value={`${language.label} ${language.native}`}
                                      onSelect={() => {
                                        form.setValue("language", language.value);
                                        setLanguageOpen(false);
                                      }}
                                      data-testid={`language-option-${language.value}`}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value === language.value ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      <span className="flex-1">{language.label}</span>
                                      <span className="text-muted-foreground text-sm">{language.native}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          Choose the language for your generated content
                        </FormDescription>
                        <FormMessage />
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

                  <div className="flex items-center justify-between border rounded-md p-3 bg-muted/30">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Auto-generate Hero Image
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Automatically create and optimize a hero image
                      </p>
                    </div>
                    <Switch
                      checked={generateWithImage}
                      onCheckedChange={setGenerateWithImage}
                      data-testid="switch-auto-image"
                    />
                  </div>
                </CardContent>
              </Card>

              <Button
                type="submit"
                className="w-full"
                disabled={isGenerating}
                data-testid="button-generate"
              >
                {isGenerating ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                {isGenerating ? generationState.message : "Generate Complete Post"}
              </Button>

              {isGenerating && (
                <div className="space-y-2">
                  <Progress value={generationState.progress} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{generationState.message}</span>
                    <span>{generationState.progress}%</span>
                  </div>
                </div>
              )}
            </form>
          </Form>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Preview</h2>
            {generatedPost && (
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
            )}
          </div>

          <Card className="min-h-[400px]">
            <CardContent className="p-6">
              {generatedPost ? (
                <div className="space-y-4">
                  {optimizedImage && (
                    <div className="border rounded-md overflow-hidden">
                      <img
                        src={optimizedImage.dataUrl}
                        alt="Generated hero"
                        className="w-full h-auto"
                        data-testid="img-generated-hero"
                      />
                      <div className="p-2 bg-muted/50 text-xs text-muted-foreground flex items-center justify-between gap-2 flex-wrap">
                        <span>Optimized: {formatBytes(optimizedImage.originalSize)} → {formatBytes(optimizedImage.optimizedSize)}</span>
                        <Badge variant="secondary">{optimizedImage.compressionRatio}% smaller</Badge>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-xl font-bold">{generatedPost.title}</h3>
                    <p className="text-muted-foreground mt-1">{generatedPost.description}</p>
                  </div>

                  <div className="flex gap-2 flex-wrap items-center">
                    {generatedPost.category && (
                      <Badge variant="default" className="flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        {generatedPost.category}
                      </Badge>
                    )}
                    {generatedPost.tags.map(tag => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 pt-4 border-t">
                    <div className="flex gap-3 flex-wrap">
                      <Button 
                        onClick={() => saveMutation.mutate()} 
                        disabled={saveMutation.isPending} 
                        data-testid="button-save-generated"
                      >
                        {saveMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 mr-2" />
                        )}
                        {saveMutation.isPending ? "Saving..." : "Save as Draft"}
                      </Button>
                      <Button variant="outline" onClick={handleDiscard}>
                        <X className="w-4 h-4 mr-2" />
                        Discard
                      </Button>
                    </div>
                    
                    <div className="text-xs text-muted-foreground space-y-1">
                      {optimizedImage && (
                        <p className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-green-500" />
                          Hero image ready (optimized)
                        </p>
                      )}
                      {generatedPost.category && (
                        <p className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-green-500" />
                          Category: {generatedPost.category}
                        </p>
                      )}
                      {authData?.data?.user && (
                        <p className="flex items-center gap-1">
                          <Check className="w-3 h-3 text-green-500" />
                          Author: {authData.data.user.name || authData.data.user.login}
                        </p>
                      )}
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
                </div>
              ) : (
                <div className="flex items-center justify-center h-[350px]">
                  <div className="text-center text-muted-foreground">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Generated content will appear here</p>
                    <p className="text-sm mt-2">
                      {generateWithImage 
                        ? "Post + optimized hero image in one click"
                        : "Post content only"
                      }
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Alert>
            <Zap className="w-4 h-4" />
            <AlertTitle>Seamless Generation</AlertTitle>
            <AlertDescription>
              One click generates everything: title, content, description, tags, category, author, and {generateWithImage ? "optimized hero image" : "suggested hero image description"}.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </TabsContent>

    <TabsContent value="bulk">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    API Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {keySaved ? (
                    <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                      <Check className="w-4 h-4 text-green-600" />
                      <AlertTitle className="text-green-700 dark:text-green-400">API Key Ready</AlertTitle>
                      <AlertDescription className="text-green-600 dark:text-green-500">
                        Your Gemini API key is saved and ready for bulk generation.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="w-4 h-4" />
                      <AlertTitle>API Key Required</AlertTitle>
                      <AlertDescription>
                        Please save your Gemini API key in the Single Post tab first.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Bulk Settings
                  </CardTitle>
                  <CardDescription>
                    Settings apply to all posts in the queue
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col space-y-2">
                    <label className="text-sm font-medium">Language</label>
                    <Popover open={bulkLanguageOpen} onOpenChange={setBulkLanguageOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={bulkLanguageOpen}
                          className="w-full justify-between"
                          data-testid="select-bulk-language"
                        >
                          {selectedBulkLanguage ? (
                            <span className="flex items-center gap-2">
                              <span>{selectedBulkLanguage.label}</span>
                              <span className="text-muted-foreground">({selectedBulkLanguage.native})</span>
                            </span>
                          ) : (
                            "Select language..."
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search language..." />
                          <CommandList>
                            <CommandEmpty>No language found.</CommandEmpty>
                            <CommandGroup>
                              {LANGUAGES.map((language) => (
                                <CommandItem
                                  key={language.value}
                                  value={`${language.label} ${language.native}`}
                                  onSelect={() => {
                                    setBulkLanguage(language.value);
                                    setBulkLanguageOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      bulkLanguage === language.value ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="flex-1">{language.label}</span>
                                  <span className="text-muted-foreground text-sm">{language.native}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col space-y-2">
                      <label className="text-sm font-medium">Tone</label>
                      <Select value={bulkTone} onValueChange={(v) => setBulkTone(v as typeof bulkTone)}>
                        <SelectTrigger data-testid="select-bulk-tone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="technical">Technical</SelectItem>
                          <SelectItem value="creative">Creative</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col space-y-2">
                      <label className="text-sm font-medium">Length</label>
                      <Select value={bulkLength} onValueChange={(v) => setBulkLength(v as typeof bulkLength)}>
                        <SelectTrigger data-testid="select-bulk-length">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short">Short</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="long">Long</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border rounded-md p-3 bg-muted/30">
                    <div className="space-y-0.5">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Image className="w-4 h-4" />
                        Auto-generate Hero Images
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Generate and optimize hero image for each post
                      </p>
                    </div>
                    <Switch
                      checked={bulkWithImage}
                      onCheckedChange={setBulkWithImage}
                      data-testid="switch-bulk-image"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Add to Queue
                  </CardTitle>
                  <CardDescription>
                    Add topics to generate multiple posts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Topic</label>
                    <Textarea
                      placeholder="e.g., How to build a REST API with Node.js"
                      value={bulkNewTopic}
                      onChange={(e) => setBulkNewTopic(e.target.value)}
                      rows={2}
                      data-testid="input-bulk-topic"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Keywords (Optional)</label>
                    <Input
                      placeholder="nodejs, api, backend"
                      value={bulkNewKeywords}
                      onChange={(e) => setBulkNewKeywords(e.target.value)}
                      data-testid="input-bulk-keywords"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={addToBulkQueue}
                    className="w-full"
                    disabled={bulkState.isRunning}
                    data-testid="button-add-to-queue"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add to Queue
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Queue ({bulkQueue.length} items)
                </h2>
                {bulkQueue.length > 0 && !bulkState.isRunning && (
                  <Button variant="outline" size="sm" onClick={clearBulkQueue} data-testid="button-clear-queue">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear All
                  </Button>
                )}
              </div>

              <Card className="min-h-[400px]">
                <CardContent className="p-4">
                  {bulkQueue.length > 0 ? (
                    <ScrollArea className="h-[350px]">
                      <div className="space-y-3">
                        {bulkQueue.map((item, index) => (
                          <div
                            key={item.id}
                            className={cn(
                              "p-3 rounded-md border",
                              item.status === "generating" && "border-primary bg-primary/5",
                              item.status === "completed" && "border-green-500/50 bg-green-50 dark:bg-green-950/20",
                              item.status === "error" && "border-red-500/50 bg-red-50 dark:bg-red-950/20",
                              item.status === "pending" && "border-border"
                            )}
                            data-testid={`queue-item-${index}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs">
                                    #{index + 1}
                                  </Badge>
                                  {item.status === "generating" && (
                                    <Badge variant="default" className="text-xs gap-1">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      Generating
                                    </Badge>
                                  )}
                                  {item.status === "completed" && (
                                    <Badge variant="default" className="text-xs gap-1 bg-green-600">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Published
                                    </Badge>
                                  )}
                                  {item.status === "error" && (
                                    <Badge variant="destructive" className="text-xs gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      Failed
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-medium truncate">{item.topic}</p>
                                {item.keywords && (
                                  <p className="text-xs text-muted-foreground truncate mt-1">
                                    Keywords: {item.keywords}
                                  </p>
                                )}
                                {item.error && (
                                  <p className="text-xs text-red-500 mt-1">{item.error}</p>
                                )}
                                {item.postSlug && (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto p-0 text-xs mt-1"
                                    onClick={() => navigate(`/posts/${item.postSlug}`)}
                                  >
                                    View Post
                                  </Button>
                                )}
                              </div>
                              {item.status === "pending" && !bulkState.isRunning && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeFromBulkQueue(item.id)}
                                  data-testid={`button-remove-${index}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex items-center justify-center h-[350px]">
                      <div className="text-center text-muted-foreground">
                        <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Queue is empty</p>
                        <p className="text-sm mt-2">Add topics to start bulk generation</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {bulkState.isRunning && (
                <div className="space-y-2">
                  <Progress value={(bulkState.currentIndex / bulkState.totalItems) * 100} className="h-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Processing {bulkState.currentIndex + 1} of {bulkState.totalItems}</span>
                    <span>{Math.round((bulkState.currentIndex / bulkState.totalItems) * 100)}%</span>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={startBulkGeneration}
                disabled={bulkQueue.length === 0 || bulkState.isRunning || !keySaved}
                data-testid="button-start-bulk"
              >
                {bulkState.isRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating... ({bulkState.completedCount}/{bulkState.totalItems})
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Generate All ({bulkQueue.length} posts)
                  </>
                )}
              </Button>

              <Alert>
                <Zap className="w-4 h-4" />
                <AlertTitle>Bulk Generation</AlertTitle>
                <AlertDescription>
                  All posts will be automatically published and marked as featured.
                  {bulkWithImage ? " Each post will include an optimized hero image." : ""}
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
