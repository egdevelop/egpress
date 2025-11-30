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
import { Sparkles, Key, FileText, RefreshCw, Eye, Edit, X, Check, AlertCircle, ChevronsUpDown, Image, Download } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
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
  { value: "armenian", label: "Armenian", native: "Հайеreн" },
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
  heroImage?: string;
  heroImageAlt?: string;
}

export default function AIGenerator() {
  const [, navigate] = useLocation();
  const [generatedPost, setGeneratedPost] = useState<GeneratedPost | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [keySaved, setKeySaved] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
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

  useEffect(() => {
    if (generatedPost?.heroImage) {
      setImagePrompt(generatedPost.heroImage);
    }
  }, [generatedPost?.heroImage]);

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

  const generateMutation = useMutation({
    mutationFn: async (data: AIFormValues) => {
      const keywords = data.keywords.split(",").map(k => k.trim()).filter(k => k);
      const response = await apiRequest("POST", "/api/ai/generate", {
        apiKey: data.apiKey || undefined,
        useSavedKey: keySaved && !data.apiKey,
        topic: data.topic,
        keywords,
        tone: data.tone,
        length: data.length,
        language: data.language,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setGeneratedPost(data.data);
        setGeneratedImageUrl(null);
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

  const generateImageMutation = useMutation({
    mutationFn: async (prompt: string) => {
      setIsGeneratingImage(true);
      const response = await apiRequest("POST", "/api/ai/generate-image", {
        prompt,
        useSavedKey: keySaved,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setIsGeneratingImage(false);
      if (data.success && data.data?.imageUrl) {
        setGeneratedImageUrl(data.data.imageUrl);
        toast({
          title: "Image Generated",
          description: "Your hero image has been created successfully",
        });
      } else {
        toast({
          title: "Image Generation Failed",
          description: data.error || "Failed to generate image",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      setIsGeneratingImage(false);
      toast({
        title: "Image Generation Failed",
        description: "An error occurred while generating the image",
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
      
      // Upload generated image if available
      if (generatedImageUrl) {
        try {
          const uploadResponse = await apiRequest("POST", "/api/upload-image-base64", {
            imageData: generatedImageUrl,
            mimeType: "image/png",
            filename: slug,
          });
          const uploadResult = await uploadResponse.json();
          if (uploadResult.success) {
            heroImagePath = uploadResult.path;
          }
        } catch (err) {
          console.error("Failed to upload hero image:", err);
        }
      }
      
      // Get author from GitHub user
      const authorName = authData?.data?.user?.name || authData?.data?.user?.login || "Author";
      
      const response = await apiRequest("POST", "/api/posts", {
        slug,
        title: generatedPost.title,
        description: generatedPost.description,
        pubDate: new Date().toISOString(),
        tags: generatedPost.tags,
        draft: true,
        content: generatedPost.content,
        heroImage: heroImagePath,
        author: authorName,
        commitMessage: `Add AI-generated post: ${generatedPost.title}`,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Post Saved",
          description: "The post has been saved as a draft with hero image and author",
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

  const handleDownloadImage = () => {
    if (generatedImageUrl) {
      const link = document.createElement("a");
      link.href = generatedImageUrl;
      link.download = "hero-image.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const repository = repoData?.data;
  const selectedLanguage = LANGUAGES.find(lang => lang.value === form.watch("language"));

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
                  {keySaved ? (
                    <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                      <Check className="w-4 h-4 text-green-600" />
                      <AlertTitle className="text-green-700 dark:text-green-400">API Key Saved</AlertTitle>
                      <AlertDescription className="text-green-600 dark:text-green-500">
                        Your Gemini API key is securely saved. You can generate content without re-entering it.
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
                            ? "Enter a new key to override the saved one, or leave empty to use saved key."
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

                  <div className="flex flex-col gap-3 pt-4 border-t">
                    <div className="flex gap-3">
                      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-generated">
                        {saveMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4 mr-2" />
                        )}
                        {saveMutation.isPending 
                          ? (generatedImageUrl ? "Uploading image & saving..." : "Saving...")
                          : "Save as Draft"
                        }
                      </Button>
                      <Button variant="outline" onClick={() => {
                        setGeneratedPost(null);
                        setGeneratedImageUrl(null);
                        setImagePrompt("");
                      }}>
                        <X className="w-4 h-4 mr-2" />
                        Discard
                      </Button>
                    </div>
                    {generatedImageUrl && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="w-3 h-3 text-green-500" />
                        Hero image ready - will be uploaded automatically when saving
                      </p>
                    )}
                    {authData?.data?.user && (
                      <p className="text-xs text-muted-foreground">
                        Author: {authData.data.user.name || authData.data.user.login}
                      </p>
                    )}
                  </div>

                  {generatedPost.heroImage && (
                    <div className="border rounded-md p-3 bg-muted/50">
                      <p className="text-sm font-medium mb-1">Suggested Hero Image:</p>
                      <p className="text-sm text-muted-foreground">{generatedPost.heroImage}</p>
                      {generatedPost.heroImageAlt && (
                        <p className="text-xs text-muted-foreground mt-1">Alt: {generatedPost.heroImageAlt}</p>
                      )}
                    </div>
                  )}
                  
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
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {generatedPost && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Generate Hero Image
                </CardTitle>
                <CardDescription>
                  Create an AI-generated hero image for your post
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Image Prompt</label>
                  <Textarea
                    placeholder="Describe the image you want to generate..."
                    rows={3}
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    data-testid="input-image-prompt"
                  />
                  <p className="text-xs text-muted-foreground">
                    Customize the prompt or use the suggested one based on your content
                  </p>
                </div>

                <Button
                  onClick={() => generateImageMutation.mutate(imagePrompt)}
                  disabled={isGeneratingImage || !imagePrompt.trim()}
                  className="w-full"
                  data-testid="button-generate-image"
                >
                  {isGeneratingImage ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Image className="w-4 h-4 mr-2" />
                  )}
                  {isGeneratingImage ? "Generating..." : "Generate Image"}
                </Button>

                {generatedImageUrl && (
                  <div className="space-y-3">
                    <div className="border rounded-md overflow-hidden">
                      <img
                        src={generatedImageUrl}
                        alt="Generated hero image"
                        className="w-full h-auto"
                        data-testid="img-generated-hero"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleDownloadImage}
                      className="w-full"
                      data-testid="button-download-image"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Image
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
