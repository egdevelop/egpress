import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ImageUpload } from "@/components/image-upload";
import { 
  Palette, 
  Globe, 
  Save, 
  RefreshCw, 
  Link2, 
  Type, 
  Search, 
  Mail,
  Settings2,
  Share2,
  Image as ImageIcon
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

const legacyBrandingFormSchema = z.object({
  siteName: z.string().min(1, "Site name is required"),
  logoLetter: z.string().max(2, "Max 2 characters"),
  description: z.string(),
  socialLinks: z.object({
    twitter: z.string().optional(),
    linkedin: z.string().optional(),
    facebook: z.string().optional(),
  }),
});

const newBrandingFormSchema = z.object({
  siteName: z.string().min(1, "Site name is required"),
  siteTagline: z.string(),
  siteDescription: z.string(),
  siteUrl: z.string().url("Must be a valid URL").or(z.string().length(0)),
  logo: z.object({
    text: z.string(),
    showIcon: z.boolean(),
    iconText: z.string(),
  }),
  seo: z.object({
    defaultTitle: z.string(),
    titleTemplate: z.string(),
    defaultDescription: z.string(),
    defaultImage: z.string(),
    keywords: z.string(),
    language: z.string(),
    locale: z.string(),
    themeColor: z.string(),
    robots: z.string(),
    twitterHandle: z.string(),
    twitterCardType: z.enum(['summary', 'summary_large_image', 'app', 'player']),
    facebookAppId: z.string(),
    googleSiteVerification: z.string(),
    bingSiteVerification: z.string(),
    googleAnalyticsId: z.string(),
    author: z.string(),
    publisher: z.string(),
    copyrightYear: z.string(),
  }),
  social: z.object({
    twitter: z.string(),
    linkedin: z.string(),
    facebook: z.string(),
    instagram: z.string(),
    github: z.string(),
    youtube: z.string(),
  }),
  contact: z.object({
    email: z.string().email().or(z.string().length(0)),
    phone: z.string(),
    address: z.string(),
  }),
  features: z.object({
    enableSearch: z.boolean(),
    enableCategories: z.boolean(),
    enableTags: z.boolean(),
    enableComments: z.boolean(),
    enableNewsletter: z.boolean(),
    enableRss: z.boolean(),
    postsPerPage: z.number().min(1).max(100),
    relatedPostsCount: z.number().min(0).max(20),
  }),
});

type LegacyBrandingFormValues = z.infer<typeof legacyBrandingFormSchema>;
type NewBrandingFormValues = z.infer<typeof newBrandingFormSchema>;

interface LegacyBrandingData {
  siteName: string;
  logoLetter: string;
  description: string;
  socialLinks: {
    twitter: string;
    linkedin: string;
    facebook: string;
  };
  headerContent: string;
  footerContent: string;
}

export default function Branding() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("general");

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: templateTypeData } = useQuery<{ success: boolean; templateType: string; configFile: string | null }>({
    queryKey: ["/api/template-type"],
    enabled: !!repoData?.data,
  });

  const templateType = templateTypeData?.templateType || "unknown";
  const isNewTemplate = templateType === "egpress-v1";

  const { data: siteSettingsData, isLoading: siteSettingsLoading } = useQuery<{ 
    success: boolean; 
    data?: { siteSettings?: Record<string, any> };
    error?: string;
  }>({
    queryKey: ["/api/site-settings"],
    enabled: !!repoData?.data && isNewTemplate,
  });

  const { data: legacyBrandingData, isLoading: legacyLoading } = useQuery<{ success: boolean; data: LegacyBrandingData | null }>({
    queryKey: ["/api/branding"],
    enabled: !!repoData?.data && !isNewTemplate,
  });

  const isLoading = isNewTemplate ? siteSettingsLoading : legacyLoading;

  const legacyForm = useForm<LegacyBrandingFormValues>({
    resolver: zodResolver(legacyBrandingFormSchema),
    defaultValues: {
      siteName: "",
      logoLetter: "",
      description: "",
      socialLinks: {
        twitter: "",
        linkedin: "",
        facebook: "",
      },
    },
  });

  const newForm = useForm<NewBrandingFormValues>({
    resolver: zodResolver(newBrandingFormSchema),
    defaultValues: {
      siteName: "",
      siteTagline: "",
      siteDescription: "",
      siteUrl: "",
      logo: { text: "", showIcon: false, iconText: "" },
      seo: { 
        defaultTitle: "", 
        titleTemplate: "%s | Site Name",
        defaultDescription: "", 
        defaultImage: "", 
        keywords: "",
        language: "en",
        locale: "en_US",
        themeColor: "#000000",
        robots: "index, follow",
        twitterHandle: "",
        twitterCardType: "summary_large_image",
        facebookAppId: "",
        googleSiteVerification: "",
        bingSiteVerification: "",
        googleAnalyticsId: "",
        author: "",
        publisher: "",
        copyrightYear: new Date().getFullYear().toString(),
      },
      social: { twitter: "", linkedin: "", facebook: "", instagram: "", github: "", youtube: "" },
      contact: { email: "", phone: "", address: "" },
      features: { 
        enableSearch: true, 
        enableCategories: true,
        enableTags: true, 
        enableComments: false,
        enableNewsletter: false,
        enableRss: true,
        postsPerPage: 10,
        relatedPostsCount: 3,
      },
    },
  });

  useEffect(() => {
    if (legacyBrandingData?.data && !isNewTemplate) {
      legacyForm.reset({
        siteName: legacyBrandingData.data.siteName || "",
        logoLetter: legacyBrandingData.data.logoLetter || "",
        description: legacyBrandingData.data.description || "",
        socialLinks: {
          twitter: legacyBrandingData.data.socialLinks?.twitter || "",
          linkedin: legacyBrandingData.data.socialLinks?.linkedin || "",
          facebook: legacyBrandingData.data.socialLinks?.facebook || "",
        },
      });
    }
  }, [legacyBrandingData, legacyForm, isNewTemplate]);

  useEffect(() => {
    if (siteSettingsData?.data?.siteSettings && isNewTemplate) {
      const s = siteSettingsData.data.siteSettings;
      const keywords = Array.isArray(s.seo?.keywords) ? s.seo.keywords.join(", ") : (s.seo?.keywords || "");
      newForm.reset({
        siteName: s.siteName || "",
        siteTagline: s.siteTagline || "",
        siteDescription: s.siteDescription || "",
        siteUrl: s.siteUrl || "",
        logo: { 
          text: s.logo?.text || "", 
          showIcon: s.logo?.showIcon ?? false,
          iconText: s.logo?.iconText || "",
        },
        seo: {
          defaultTitle: s.seo?.defaultTitle || "",
          titleTemplate: s.seo?.titleTemplate || "%s | Site Name",
          defaultDescription: s.seo?.defaultDescription || "",
          defaultImage: s.seo?.defaultImage || "",
          keywords: keywords,
          language: s.seo?.language || "en",
          locale: s.seo?.locale || "en_US",
          themeColor: s.seo?.themeColor || "#000000",
          robots: s.seo?.robots || "index, follow",
          twitterHandle: s.seo?.twitterHandle || "",
          twitterCardType: s.seo?.twitterCardType || "summary_large_image",
          facebookAppId: s.seo?.facebookAppId || "",
          googleSiteVerification: s.seo?.googleSiteVerification || "",
          bingSiteVerification: s.seo?.bingSiteVerification || "",
          googleAnalyticsId: s.seo?.googleAnalyticsId || "",
          author: s.seo?.author || "",
          publisher: s.seo?.publisher || "",
          copyrightYear: s.seo?.copyrightYear || new Date().getFullYear().toString(),
        },
        social: {
          twitter: s.social?.twitter || "",
          linkedin: s.social?.linkedin || "",
          facebook: s.social?.facebook || "",
          instagram: s.social?.instagram || "",
          github: s.social?.github || "",
          youtube: s.social?.youtube || "",
        },
        contact: {
          email: s.contact?.email || "",
          phone: s.contact?.phone || "",
          address: s.contact?.address || "",
        },
        features: {
          enableSearch: s.features?.enableSearch ?? true,
          enableCategories: s.features?.enableCategories ?? true,
          enableTags: s.features?.enableTags ?? true,
          enableComments: s.features?.enableComments ?? false,
          enableNewsletter: s.features?.enableNewsletter ?? false,
          enableRss: s.features?.enableRss ?? true,
          postsPerPage: s.features?.postsPerPage ?? 10,
          relatedPostsCount: s.features?.relatedPostsCount ?? 3,
        },
      });
    }
  }, [siteSettingsData, newForm, isNewTemplate]);

  const saveLegacyMutation = useMutation({
    mutationFn: async (data: LegacyBrandingFormValues) => {
      const response = await apiRequest("PUT", "/api/branding", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Branding Saved",
          description: "Header.astro and Footer.astro have been updated",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save branding",
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

  const saveNewMutation = useMutation({
    mutationFn: async (data: NewBrandingFormValues) => {
      const keywordsArray = data.seo.keywords
        .split(",")
        .map(k => k.trim())
        .filter(k => k.length > 0);
      
      const transformedData = {
        ...data,
        seo: {
          ...data.seo,
          keywords: keywordsArray,
        },
      };
      
      const response = await apiRequest("PUT", "/api/site-settings", {
        siteSettings: transformedData,
        commitMessage: "Update site branding and settings",
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Site Settings Saved",
          description: "siteSettings.ts has been updated",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save settings",
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
            <Palette className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2" data-testid="text-no-repo">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository to configure branding.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" data-testid="skeleton-title" />
        <Skeleton className="h-64 w-full" data-testid="skeleton-content" />
      </div>
    );
  }

  if (isNewTemplate) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold" data-testid="text-page-title">Site Settings</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-muted-foreground">
                Configure siteSettings.ts for your blog
              </p>
              <Badge variant="secondary" className="text-xs" data-testid="badge-template-type">egpress-v1</Badge>
            </div>
          </div>
          <Button
            onClick={newForm.handleSubmit((data) => saveNewMutation.mutate(data))}
            disabled={saveNewMutation.isPending}
            data-testid="button-save-site-settings"
          >
            {saveNewMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save to GitHub
          </Button>
        </div>

        <Form {...newForm}>
          <form className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="general" data-testid="tab-general">
                  <Globe className="w-4 h-4 mr-2" />
                  General
                </TabsTrigger>
                <TabsTrigger value="logo" data-testid="tab-logo">
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Logo
                </TabsTrigger>
                <TabsTrigger value="seo" data-testid="tab-seo">
                  <Search className="w-4 h-4 mr-2" />
                  SEO
                </TabsTrigger>
                <TabsTrigger value="social" data-testid="tab-social">
                  <Share2 className="w-4 h-4 mr-2" />
                  Social
                </TabsTrigger>
                <TabsTrigger value="contact" data-testid="tab-contact">
                  <Mail className="w-4 h-4 mr-2" />
                  Contact
                </TabsTrigger>
                <TabsTrigger value="features" data-testid="tab-features">
                  <Settings2 className="w-4 h-4 mr-2" />
                  Features
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>General Settings</CardTitle>
                    <CardDescription>
                      Basic information about your site
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={newForm.control}
                      name="siteName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="My Awesome Blog"
                              {...field}
                              data-testid="input-site-name"
                            />
                          </FormControl>
                          <FormDescription>
                            The name of your site, shown in header and metadata
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="siteTagline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site Tagline</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="A blog about technology and innovation"
                              {...field}
                              data-testid="input-site-tagline"
                            />
                          </FormControl>
                          <FormDescription>
                            A short tagline or slogan for your site
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="siteDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="A blog about technology and design..."
                              rows={3}
                              {...field}
                              data-testid="input-site-description"
                            />
                          </FormControl>
                          <FormDescription>
                            A brief description of what your site is about
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="siteUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Site URL</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://example.com"
                              {...field}
                              data-testid="input-site-url"
                            />
                          </FormControl>
                          <FormDescription>
                            The production URL of your site
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="logo" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Logo Settings</CardTitle>
                    <CardDescription>
                      Configure how your logo appears
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={newForm.control}
                      name="logo.text"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Logo Text</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="MyBlog"
                              {...field}
                              data-testid="input-logo-text"
                            />
                          </FormControl>
                          <FormDescription>
                            Text displayed in the logo area
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="logo.showIcon"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Show Icon</FormLabel>
                            <FormDescription>
                              Display an icon next to the logo text
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-logo-show-icon"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="logo.iconText"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Icon Text</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="MB"
                              maxLength={2}
                              {...field}
                              data-testid="input-logo-icon-text"
                            />
                          </FormControl>
                          <FormDescription>
                            1-2 characters displayed as logo icon (when icon is enabled)
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="seo" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>SEO Settings</CardTitle>
                    <CardDescription>
                      Search engine optimization and social sharing
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={newForm.control}
                        name="seo.defaultTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Default Title</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="My Blog"
                                {...field}
                                data-testid="input-seo-default-title"
                              />
                            </FormControl>
                            <FormDescription>
                              Default page title
                            </FormDescription>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="seo.titleTemplate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title Template</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="%s | My Blog"
                                {...field}
                                data-testid="input-seo-title-template"
                              />
                            </FormControl>
                            <FormDescription>
                              Template for page titles (%s = page title)
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={newForm.control}
                      name="seo.defaultDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Discover the latest in technology and design..."
                              rows={3}
                              {...field}
                              data-testid="input-seo-default-description"
                            />
                          </FormControl>
                          <FormDescription>
                            Meta description for search engine results
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="seo.defaultImage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default OG Image</FormLabel>
                          <FormControl>
                            <ImageUpload
                              value={field.value}
                              onChange={field.onChange}
                              description="Image shown when sharing on social media (recommended: 1200x630px)"
                              data-testid="image-upload-default-image"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="seo.keywords"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Keywords</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="blog, technology, design, programming"
                              {...field}
                              data-testid="input-seo-keywords"
                            />
                          </FormControl>
                          <FormDescription>
                            Comma-separated list of keywords
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField
                        control={newForm.control}
                        name="seo.language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Language</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="en"
                                {...field}
                                data-testid="input-seo-language"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="seo.locale"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Locale</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="en_US"
                                {...field}
                                data-testid="input-seo-locale"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="seo.themeColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Theme Color</FormLabel>
                            <FormControl>
                              <div className="flex gap-2">
                                <Input
                                  type="color"
                                  className="w-12 h-9 p-1 cursor-pointer"
                                  value={field.value}
                                  onChange={field.onChange}
                                  data-testid="input-seo-theme-color"
                                />
                                <Input
                                  placeholder="#000000"
                                  value={field.value}
                                  onChange={field.onChange}
                                  className="flex-1"
                                  data-testid="input-seo-theme-color-text"
                                />
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={newForm.control}
                      name="seo.robots"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Robots</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="index, follow"
                              {...field}
                              data-testid="input-seo-robots"
                            />
                          </FormControl>
                          <FormDescription>
                            Robots meta tag directives
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={newForm.control}
                        name="seo.twitterHandle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Twitter Handle</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="@username"
                                {...field}
                                data-testid="input-seo-twitter-handle"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="seo.twitterCardType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Twitter Card Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-twitter-card-type">
                                  <SelectValue placeholder="Select card type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="summary" data-testid="select-item-summary">Summary</SelectItem>
                                <SelectItem value="summary_large_image" data-testid="select-item-summary-large">Summary Large Image</SelectItem>
                                <SelectItem value="app" data-testid="select-item-app">App</SelectItem>
                                <SelectItem value="player" data-testid="select-item-player">Player</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={newForm.control}
                        name="seo.facebookAppId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Facebook App ID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="123456789"
                                {...field}
                                data-testid="input-seo-facebook-app-id"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="seo.googleAnalyticsId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Google Analytics ID</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="G-XXXXXXXXXX"
                                {...field}
                                data-testid="input-seo-google-analytics-id"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={newForm.control}
                        name="seo.googleSiteVerification"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Google Site Verification</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="verification-code"
                                {...field}
                                data-testid="input-seo-google-verification"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="seo.bingSiteVerification"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bing Site Verification</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="verification-code"
                                {...field}
                                data-testid="input-seo-bing-verification"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField
                        control={newForm.control}
                        name="seo.author"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Author</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="John Doe"
                                {...field}
                                data-testid="input-seo-author"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="seo.publisher"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Publisher</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="My Company"
                                {...field}
                                data-testid="input-seo-publisher"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="seo.copyrightYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Copyright Year</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="2025"
                                {...field}
                                data-testid="input-seo-copyright-year"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="social" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Social Links</CardTitle>
                    <CardDescription>
                      Links to your social media profiles
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={newForm.control}
                      name="social.twitter"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Twitter/X</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://twitter.com/username"
                              {...field}
                              data-testid="input-social-twitter"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="social.linkedin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>LinkedIn</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://linkedin.com/in/username"
                              {...field}
                              data-testid="input-social-linkedin"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="social.facebook"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Facebook</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://facebook.com/page"
                              {...field}
                              data-testid="input-social-facebook"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="social.instagram"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instagram</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://instagram.com/username"
                              {...field}
                              data-testid="input-social-instagram"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="social.github"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GitHub</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://github.com/username"
                              {...field}
                              data-testid="input-social-github"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="social.youtube"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>YouTube</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://youtube.com/@channel"
                              {...field}
                              data-testid="input-social-youtube"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="contact" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                    <CardDescription>
                      How visitors can reach you
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={newForm.control}
                      name="contact.email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="hello@example.com"
                              {...field}
                              data-testid="input-contact-email"
                            />
                          </FormControl>
                          <FormDescription>
                            Public email for contact purposes
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="contact.phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="+1 234 567 8900"
                              {...field}
                              data-testid="input-contact-phone"
                            />
                          </FormControl>
                          <FormDescription>
                            Public phone number (optional)
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="contact.address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="123 Main St, City, Country"
                              rows={2}
                              {...field}
                              data-testid="input-contact-address"
                            />
                          </FormControl>
                          <FormDescription>
                            Physical address if applicable
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="features" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Site Features</CardTitle>
                    <CardDescription>
                      Enable or disable site functionality
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <FormField
                      control={newForm.control}
                      name="features.enableSearch"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Search</FormLabel>
                            <FormDescription>
                              Allow visitors to search your content
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-enable-search"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="features.enableCategories"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Categories</FormLabel>
                            <FormDescription>
                              Show category organization for posts
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-enable-categories"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="features.enableTags"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Tags</FormLabel>
                            <FormDescription>
                              Display post tags on your blog
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-enable-tags"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="features.enableComments"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Comments</FormLabel>
                            <FormDescription>
                              Allow visitors to comment on posts
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-enable-comments"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="features.enableNewsletter"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Newsletter</FormLabel>
                            <FormDescription>
                              Show newsletter subscription form
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-enable-newsletter"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="features.enableRss"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable RSS Feed</FormLabel>
                            <FormDescription>
                              Generate an RSS feed for subscribers
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-enable-rss"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={newForm.control}
                        name="features.postsPerPage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Posts Per Page</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={100}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                                data-testid="input-posts-per-page"
                              />
                            </FormControl>
                            <FormDescription>
                              Number of posts to show per page (1-100)
                            </FormDescription>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={newForm.control}
                        name="features.relatedPostsCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Related Posts Count</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                max={20}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 3)}
                                data-testid="input-related-posts-count"
                              />
                            </FormControl>
                            <FormDescription>
                              Number of related posts to show (0-20)
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </form>
        </Form>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold" data-testid="text-legacy-page-title">Branding</h1>
        <p className="text-muted-foreground mt-1">
          Edit Header.astro and Footer.astro directly
        </p>
      </div>

      <Form {...legacyForm}>
        <form onSubmit={legacyForm.handleSubmit((data) => saveLegacyMutation.mutate(data))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Site Identity
              </CardTitle>
              <CardDescription>
                Updates Header.astro and Footer.astro
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={legacyForm.control}
                  name="siteName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="My Blog"
                          {...field}
                          data-testid="input-legacy-site-name"
                        />
                      </FormControl>
                      <FormDescription>
                        Appears in header, footer, and copyright
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={legacyForm.control}
                  name="logoLetter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo Letter</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="R"
                          maxLength={2}
                          {...field}
                          data-testid="input-legacy-logo-letter"
                        />
                      </FormControl>
                      <FormDescription>
                        Letter shown in the logo box (1-2 chars)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={legacyForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Footer Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="A short description about your site..."
                        rows={3}
                        {...field}
                        data-testid="input-legacy-description"
                      />
                    </FormControl>
                    <FormDescription>
                      Shown in the footer below the logo
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5" />
                Social Links
              </CardTitle>
              <CardDescription>
                Social media links in footer
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <FormField
                control={legacyForm.control}
                name="socialLinks.twitter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Twitter/X</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://twitter.com/username"
                        {...field}
                        data-testid="input-legacy-social-twitter"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={legacyForm.control}
                name="socialLinks.linkedin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://linkedin.com/in/username"
                        {...field}
                        data-testid="input-legacy-social-linkedin"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={legacyForm.control}
                name="socialLinks.facebook"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Facebook</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://facebook.com/page"
                        {...field}
                        data-testid="input-legacy-social-facebook"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {legacyBrandingData?.data?.headerContent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="w-5 h-5" />
                  Current Files
                </CardTitle>
                <CardDescription>
                  Preview of your component files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Header.astro</p>
                  <div className="bg-muted p-3 rounded-md max-h-32 overflow-auto">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap" data-testid="text-header-preview">
                      {legacyBrandingData.data.headerContent.slice(0, 500)}...
                    </pre>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Footer.astro</p>
                  <div className="bg-muted p-3 rounded-md max-h-32 overflow-auto">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap" data-testid="text-footer-preview">
                      {legacyBrandingData.data.footerContent.slice(0, 500)}...
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saveLegacyMutation.isPending}
              data-testid="button-save-legacy-branding"
            >
              {saveLegacyMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save to GitHub
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
