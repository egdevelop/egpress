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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  FileText,
  AlertCircle
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

// Legacy branding form schema (for old templates with Header.astro/Footer.astro)
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

// New template branding form schema (for egpress-v1 with siteSettings.ts)
const newBrandingFormSchema = z.object({
  siteName: z.string().min(1, "Site name is required"),
  siteDescription: z.string(),
  siteUrl: z.string().url("Must be a valid URL").or(z.string().length(0)),
  logo: z.object({
    text: z.string(),
    icon: z.string().optional(),
  }),
  seo: z.object({
    title: z.string(),
    description: z.string(),
    ogImage: z.string().optional(),
    twitterHandle: z.string().optional(),
  }),
  social: z.object({
    github: z.string().optional(),
    twitter: z.string().optional(),
    facebook: z.string().optional(),
    instagram: z.string().optional(),
  }),
  contact: z.object({
    email: z.string().email().or(z.string().length(0)),
    address: z.string().optional(),
  }),
  features: z.object({
    enableSearch: z.boolean(),
    showTags: z.boolean(),
    enableRSS: z.boolean(),
    enableSitemap: z.boolean(),
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
  const [activeTab, setActiveTab] = useState("identity");

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  // Detect template type
  const { data: templateTypeData } = useQuery<{ success: boolean; templateType: string; configFile: string | null }>({
    queryKey: ["/api/template-type"],
    enabled: !!repoData?.data,
  });

  const templateType = templateTypeData?.templateType || "unknown";
  const isNewTemplate = templateType === "egpress-v1";

  // Fetch site settings for new template
  const { data: siteSettingsData, isLoading: siteSettingsLoading } = useQuery<{ 
    success: boolean; 
    data?: { siteSettings?: Record<string, any> };
    error?: string;
  }>({
    queryKey: ["/api/site-settings"],
    enabled: !!repoData?.data && isNewTemplate,
  });

  // Fetch legacy branding data
  const { data: legacyBrandingData, isLoading: legacyLoading } = useQuery<{ success: boolean; data: LegacyBrandingData | null }>({
    queryKey: ["/api/branding"],
    enabled: !!repoData?.data && !isNewTemplate,
  });

  const isLoading = isNewTemplate ? siteSettingsLoading : legacyLoading;

  // Legacy form
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

  // New template form
  const newForm = useForm<NewBrandingFormValues>({
    resolver: zodResolver(newBrandingFormSchema),
    defaultValues: {
      siteName: "",
      siteDescription: "",
      siteUrl: "",
      logo: { text: "", icon: "" },
      seo: { title: "", description: "", ogImage: "", twitterHandle: "" },
      social: { github: "", twitter: "", facebook: "", instagram: "" },
      contact: { email: "", address: "" },
      features: { enableSearch: true, showTags: true, enableRSS: true, enableSitemap: true },
    },
  });

  // Update legacy form when data loads
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

  // Update new form when data loads
  useEffect(() => {
    if (siteSettingsData?.data?.siteSettings && isNewTemplate) {
      const s = siteSettingsData.data.siteSettings;
      newForm.reset({
        siteName: s.siteName || "",
        siteDescription: s.siteDescription || "",
        siteUrl: s.siteUrl || "",
        logo: { 
          text: s.logo?.text || s.text || "", 
          icon: s.logo?.icon || s.icon || "" 
        },
        seo: {
          title: s.seo?.title || s.title || "",
          description: s.seo?.description || s.description || "",
          ogImage: s.seo?.ogImage || s.ogImage || "",
          twitterHandle: s.seo?.twitterHandle || s.twitterHandle || "",
        },
        social: {
          github: s.social?.github || s.github || "",
          twitter: s.social?.twitter || s.twitter || "",
          facebook: s.social?.facebook || s.facebook || "",
          instagram: s.social?.instagram || s.instagram || "",
        },
        contact: {
          email: s.contact?.email || s.email || "",
          address: s.contact?.address || s.address || "",
        },
        features: {
          enableSearch: s.features?.enableSearch ?? s.enableSearch ?? true,
          showTags: s.features?.showTags ?? s.showTags ?? true,
          enableRSS: s.features?.enableRSS ?? s.enableRSS ?? true,
          enableSitemap: s.features?.enableSitemap ?? s.enableSitemap ?? true,
        },
      });
    }
  }, [siteSettingsData, newForm, isNewTemplate]);

  // Legacy save mutation
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

  // New template save mutation
  const saveNewMutation = useMutation({
    mutationFn: async (data: NewBrandingFormValues) => {
      const response = await apiRequest("PUT", "/api/site-settings", {
        siteSettings: data,
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
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
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
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // New template UI
  if (isNewTemplate) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Site Settings</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-muted-foreground">
                Configure siteSettings.ts for your blog
              </p>
              <Badge variant="secondary" className="text-xs">egpress-v1</Badge>
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
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="identity" data-testid="tab-identity">
                  <Globe className="w-4 h-4 mr-2" />
                  Identity
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

              <TabsContent value="identity" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Site Identity</CardTitle>
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

                    <div className="grid gap-4 md:grid-cols-2">
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
                        name="logo.icon"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Logo Icon (optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="/favicon.svg"
                                {...field}
                                data-testid="input-logo-icon"
                              />
                            </FormControl>
                            <FormDescription>
                              Path to an icon image
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </div>
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
                    <FormField
                      control={newForm.control}
                      name="seo.title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SEO Title</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="My Blog | Tech & Design"
                              {...field}
                              data-testid="input-seo-title"
                            />
                          </FormControl>
                          <FormDescription>
                            Title shown in search results and browser tabs
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="seo.description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SEO Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Discover the latest in technology and design..."
                              rows={3}
                              {...field}
                              data-testid="input-seo-description"
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
                      name="seo.ogImage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Open Graph Image</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="/og-image.png"
                              {...field}
                              data-testid="input-og-image"
                            />
                          </FormControl>
                          <FormDescription>
                            Image shown when sharing on social media
                          </FormDescription>
                        </FormItem>
                      )}
                    />

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
                              data-testid="input-twitter-handle"
                            />
                          </FormControl>
                          <FormDescription>
                            Your Twitter/X handle for social cards
                          </FormDescription>
                        </FormItem>
                      )}
                    />
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
                      name="contact.address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address (optional)</FormLabel>
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
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
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
                      name="features.showTags"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Show Tags</FormLabel>
                            <FormDescription>
                              Display post tags on your blog
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-show-tags"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={newForm.control}
                      name="features.enableRSS"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
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

                    <FormField
                      control={newForm.control}
                      name="features.enableSitemap"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Sitemap</FormLabel>
                            <FormDescription>
                              Generate a sitemap.xml for search engines
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-enable-sitemap"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </form>
        </Form>
      </div>
    );
  }

  // Legacy template UI
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Branding</h1>
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
                          data-testid="input-site-name"
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
                          data-testid="input-logo-letter"
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
                        data-testid="input-description"
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
                        data-testid="input-social-twitter"
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
                        data-testid="input-social-linkedin"
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
                        data-testid="input-social-facebook"
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
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {legacyBrandingData.data.headerContent.slice(0, 500)}...
                    </pre>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Footer.astro</p>
                  <div className="bg-muted p-3 rounded-md max-h-32 overflow-auto">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
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
              data-testid="button-save-branding"
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
