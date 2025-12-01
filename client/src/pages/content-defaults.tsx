import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Navigation, 
  Home, 
  FileText, 
  Tags, 
  Save, 
  Plus, 
  Trash2,
  GripVertical,
  ExternalLink,
  Link2,
  ChevronDown,
  Clock,
  GitCommit,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, SmartDeploySettings } from "@shared/schema";

interface NavItem {
  href: string;
  label: string;
  external?: boolean;
}

interface FooterLinkGroup {
  title: string;
  links: NavItem[];
}

interface SocialLink {
  platform: string;
  url: string;
  label: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

interface ContentDefaults {
  navigation: {
    header: NavItem[];
    footer: FooterLinkGroup[];
  };
  socialLinks: SocialLink[];
  homepage: {
    heroTitle: string;
    heroSubtitle: string;
    featuredSectionTitle: string;
    latestSectionTitle: string;
  };
  blog: {
    title: string;
    description: string;
    emptyStateMessage: string;
  };
  categories: Category[];
}

const defaultContentDefaults: ContentDefaults = {
  navigation: {
    header: [],
    footer: []
  },
  socialLinks: [],
  homepage: {
    heroTitle: "",
    heroSubtitle: "",
    featuredSectionTitle: "",
    latestSectionTitle: ""
  },
  blog: {
    title: "",
    description: "",
    emptyStateMessage: ""
  },
  categories: []
};

export default function ContentDefaultsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("navigation");
  const [formData, setFormData] = useState<ContentDefaults>(defaultContentDefaults);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: templateTypeData } = useQuery<{ success: boolean; templateType: string; configFile: string | null }>({
    queryKey: ["/api/template-type"],
    enabled: !!repoData?.data,
  });

  const templateType = templateTypeData?.templateType || "unknown";
  const isNewTemplate = templateType === "egpress-v1";

  const { data: contentDefaultsData, isLoading } = useQuery<{ 
    success: boolean; 
    data?: ContentDefaults;
    error?: string;
  }>({
    queryKey: ["/api/content-defaults"],
    enabled: !!repoData?.data && isNewTemplate,
  });

  const { data: smartDeployData } = useQuery<{ success: boolean; settings: SmartDeploySettings }>({
    queryKey: ["/api/smart-deploy/settings"],
  });

  const smartDeployEnabled = smartDeployData?.settings?.enabled ?? false;

  useEffect(() => {
    if (contentDefaultsData?.data && isNewTemplate) {
      const data = contentDefaultsData.data;
      setFormData({
        navigation: {
          header: data.navigation?.header || [],
          footer: data.navigation?.footer || []
        },
        socialLinks: data.socialLinks || [],
        homepage: {
          heroTitle: data.homepage?.heroTitle || "",
          heroSubtitle: data.homepage?.heroSubtitle || "",
          featuredSectionTitle: data.homepage?.featuredSectionTitle || "",
          latestSectionTitle: data.homepage?.latestSectionTitle || ""
        },
        blog: {
          title: data.blog?.title || "",
          description: data.blog?.description || "",
          emptyStateMessage: data.blog?.emptyStateMessage || ""
        },
        categories: data.categories || []
      });
      setHasChanges(false);
    }
  }, [contentDefaultsData, isNewTemplate]);

  const saveMutation = useMutation({
    mutationFn: async (data: ContentDefaults) => {
      const response = await apiRequest("PUT", "/api/content-defaults", {
        contentDefaults: data,
        commitMessage: "Update content defaults"
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Content Defaults Saved",
          description: "siteSettings.ts has been updated",
        });
        setHasChanges(false);
        queryClient.invalidateQueries({ queryKey: ["/api/content-defaults"] });
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save content defaults",
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
    mutationFn: async (data: ContentDefaults) => {
      const response = await apiRequest("PUT", "/api/content-defaults", {
        contentDefaults: data,
        commitMessage: "Update content defaults",
        queueOnly: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Added to Queue",
          description: "Changes queued for batch deploy - go to Vercel page to deploy",
        });
        setHasChanges(false);
        queryClient.invalidateQueries({ queryKey: ["/api/smart-deploy/queue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/content-defaults"] });
      } else {
        toast({
          title: "Queue Failed",
          description: data.error || "Failed to queue changes",
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

  const updateFormData = (updates: Partial<ContentDefaults>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleQueue = () => {
    queueMutation.mutate(formData);
  };

  if (!repoData?.data) {
    return (
      <div className="p-6" data-testid="container-content-defaults">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">No repository connected. Please connect a repository first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isNewTemplate) {
    return (
      <div className="p-6" data-testid="container-content-defaults">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Content Defaults is only available for egpress-v1 templates. 
              Your current template type is: {templateType}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6" data-testid="container-content-defaults">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="container-content-defaults">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Content Defaults</h1>
          <p className="text-muted-foreground">Manage navigation, homepage, blog settings, and categories</p>
        </div>
        {smartDeployEnabled ? (
          <div className="flex">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || queueMutation.isPending || !hasChanges}
              className="rounded-r-none"
              data-testid="button-save"
            >
              {saveMutation.isPending ? (
                <>
                  <GitCommit className="w-4 h-4 mr-2 animate-pulse" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save & Commit
                </>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="icon"
                  className="rounded-l-none border-l border-l-primary-foreground/20"
                  disabled={saveMutation.isPending || queueMutation.isPending || !hasChanges}
                  data-testid="button-save-dropdown"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  data-testid="menu-save-commit"
                >
                  <GitCommit className="w-4 h-4 mr-2" />
                  Save & Commit Now
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleQueue}
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
            onClick={handleSave} 
            disabled={saveMutation.isPending || !hasChanges}
            data-testid="button-save"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1" data-testid="tabs-content-defaults">
          <TabsTrigger value="navigation" data-testid="tab-navigation">
            <Navigation className="w-4 h-4 mr-2" />
            Navigation
          </TabsTrigger>
          <TabsTrigger value="homepage" data-testid="tab-homepage">
            <Home className="w-4 h-4 mr-2" />
            Homepage
          </TabsTrigger>
          <TabsTrigger value="blog" data-testid="tab-blog">
            <FileText className="w-4 h-4 mr-2" />
            Blog
          </TabsTrigger>
          <TabsTrigger value="categories" data-testid="tab-categories">
            <Tags className="w-4 h-4 mr-2" />
            Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="navigation" className="space-y-6">
          <NavigationTab 
            navigation={formData.navigation} 
            socialLinks={formData.socialLinks}
            onChange={(navigation, socialLinks) => updateFormData({ navigation, socialLinks })}
          />
        </TabsContent>

        <TabsContent value="homepage">
          <HomepageTab 
            homepage={formData.homepage} 
            onChange={(homepage) => updateFormData({ homepage })}
          />
        </TabsContent>

        <TabsContent value="blog">
          <BlogTab 
            blog={formData.blog} 
            onChange={(blog) => updateFormData({ blog })}
          />
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesTab 
            categories={formData.categories} 
            onChange={(categories) => updateFormData({ categories })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface NavigationTabProps {
  navigation: ContentDefaults['navigation'];
  socialLinks: SocialLink[];
  onChange: (navigation: ContentDefaults['navigation'], socialLinks: SocialLink[]) => void;
}

function NavigationTab({ navigation, socialLinks, onChange }: NavigationTabProps) {
  const addHeaderItem = () => {
    const newItem: NavItem = { href: "/", label: "New Link", external: false };
    onChange(
      { ...navigation, header: [...navigation.header, newItem] },
      socialLinks
    );
  };

  const updateHeaderItem = (index: number, updates: Partial<NavItem>) => {
    const newHeader = [...navigation.header];
    newHeader[index] = { ...newHeader[index], ...updates };
    onChange({ ...navigation, header: newHeader }, socialLinks);
  };

  const removeHeaderItem = (index: number) => {
    const newHeader = navigation.header.filter((_, i) => i !== index);
    onChange({ ...navigation, header: newHeader }, socialLinks);
  };

  const addFooterGroup = () => {
    const newGroup: FooterLinkGroup = { title: "New Group", links: [] };
    onChange(
      { ...navigation, footer: [...navigation.footer, newGroup] },
      socialLinks
    );
  };

  const updateFooterGroup = (index: number, updates: Partial<FooterLinkGroup>) => {
    const newFooter = [...navigation.footer];
    newFooter[index] = { ...newFooter[index], ...updates };
    onChange({ ...navigation, footer: newFooter }, socialLinks);
  };

  const removeFooterGroup = (index: number) => {
    const newFooter = navigation.footer.filter((_, i) => i !== index);
    onChange({ ...navigation, footer: newFooter }, socialLinks);
  };

  const addFooterLink = (groupIndex: number) => {
    const newLink: NavItem = { href: "/", label: "New Link", external: false };
    const newFooter = [...navigation.footer];
    newFooter[groupIndex] = {
      ...newFooter[groupIndex],
      links: [...newFooter[groupIndex].links, newLink]
    };
    onChange({ ...navigation, footer: newFooter }, socialLinks);
  };

  const updateFooterLink = (groupIndex: number, linkIndex: number, updates: Partial<NavItem>) => {
    const newFooter = [...navigation.footer];
    const newLinks = [...newFooter[groupIndex].links];
    newLinks[linkIndex] = { ...newLinks[linkIndex], ...updates };
    newFooter[groupIndex] = { ...newFooter[groupIndex], links: newLinks };
    onChange({ ...navigation, footer: newFooter }, socialLinks);
  };

  const removeFooterLink = (groupIndex: number, linkIndex: number) => {
    const newFooter = [...navigation.footer];
    newFooter[groupIndex] = {
      ...newFooter[groupIndex],
      links: newFooter[groupIndex].links.filter((_, i) => i !== linkIndex)
    };
    onChange({ ...navigation, footer: newFooter }, socialLinks);
  };

  const addSocialLink = () => {
    const newLink: SocialLink = { platform: "twitter", url: "", label: "" };
    onChange(navigation, [...socialLinks, newLink]);
  };

  const updateSocialLink = (index: number, updates: Partial<SocialLink>) => {
    const newLinks = [...socialLinks];
    newLinks[index] = { ...newLinks[index], ...updates };
    onChange(navigation, newLinks);
  };

  const removeSocialLink = (index: number) => {
    const newLinks = socialLinks.filter((_, i) => i !== index);
    onChange(navigation, newLinks);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5" />
                Header Navigation
              </CardTitle>
              <CardDescription>Links shown in the main header navigation</CardDescription>
            </div>
            <Button onClick={addHeaderItem} size="sm" data-testid="button-add-header-item">
              <Plus className="w-4 h-4 mr-1" />
              Add Link
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {navigation.header.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No header navigation items. Click "Add Link" to create one.</p>
          ) : (
            navigation.header.map((item, index) => (
              <div key={index} className="flex items-center gap-3 flex-wrap p-3 border rounded-md" data-testid={`header-item-${index}`}>
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-[120px]">
                  <Input
                    placeholder="Label"
                    value={item.label}
                    onChange={(e) => updateHeaderItem(index, { label: e.target.value })}
                    data-testid={`input-header-label-${index}`}
                  />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Input
                    placeholder="URL (e.g., /about)"
                    value={item.href}
                    onChange={(e) => updateHeaderItem(index, { href: e.target.value })}
                    data-testid={`input-header-href-${index}`}
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={item.external || false}
                    onCheckedChange={(checked) => updateHeaderItem(index, { external: checked })}
                    data-testid={`switch-header-external-${index}`}
                  />
                  <Label className="text-sm whitespace-nowrap">
                    <ExternalLink className="w-3 h-3 inline mr-1" />
                    External
                  </Label>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeHeaderItem(index)}
                  data-testid={`button-remove-header-item-${index}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Navigation className="w-5 h-5" />
                Footer Navigation
              </CardTitle>
              <CardDescription>Link groups shown in the footer</CardDescription>
            </div>
            <Button onClick={addFooterGroup} size="sm" data-testid="button-add-footer-group">
              <Plus className="w-4 h-4 mr-1" />
              Add Group
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {navigation.footer.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No footer groups. Click "Add Group" to create one.</p>
          ) : (
            navigation.footer.map((group, groupIndex) => (
              <div key={groupIndex} className="border rounded-md p-4 space-y-3" data-testid={`footer-group-${groupIndex}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Input
                    placeholder="Group Title"
                    value={group.title}
                    onChange={(e) => updateFooterGroup(groupIndex, { title: e.target.value })}
                    className="flex-1 min-w-[150px]"
                    data-testid={`input-footer-group-title-${groupIndex}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addFooterLink(groupIndex)}
                    data-testid={`button-add-footer-link-${groupIndex}`}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Link
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFooterGroup(groupIndex)}
                    data-testid={`button-remove-footer-group-${groupIndex}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <div className="pl-8 space-y-2">
                  {group.links.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No links in this group.</p>
                  ) : (
                    group.links.map((link, linkIndex) => (
                      <div key={linkIndex} className="flex items-center gap-2 flex-wrap" data-testid={`footer-link-${groupIndex}-${linkIndex}`}>
                        <Input
                          placeholder="Label"
                          value={link.label}
                          onChange={(e) => updateFooterLink(groupIndex, linkIndex, { label: e.target.value })}
                          className="flex-1 min-w-[100px]"
                          data-testid={`input-footer-link-label-${groupIndex}-${linkIndex}`}
                        />
                        <Input
                          placeholder="URL"
                          value={link.href}
                          onChange={(e) => updateFooterLink(groupIndex, linkIndex, { href: e.target.value })}
                          className="flex-1 min-w-[100px]"
                          data-testid={`input-footer-link-href-${groupIndex}-${linkIndex}`}
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch
                            checked={link.external || false}
                            onCheckedChange={(checked) => updateFooterLink(groupIndex, linkIndex, { external: checked })}
                            data-testid={`switch-footer-link-external-${groupIndex}-${linkIndex}`}
                          />
                          <Label className="text-xs">Ext</Label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFooterLink(groupIndex, linkIndex)}
                          data-testid={`button-remove-footer-link-${groupIndex}-${linkIndex}`}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Social Links</CardTitle>
              <CardDescription>Social media links for your site</CardDescription>
            </div>
            <Button onClick={addSocialLink} size="sm" data-testid="button-add-social-link">
              <Plus className="w-4 h-4 mr-1" />
              Add Social Link
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {socialLinks.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No social links. Click "Add Social Link" to create one.</p>
          ) : (
            socialLinks.map((link, index) => (
              <div key={index} className="flex items-center gap-3 flex-wrap p-3 border rounded-md" data-testid={`social-link-${index}`}>
                <div className="flex-1 min-w-[100px]">
                  <Input
                    placeholder="Platform (e.g., twitter)"
                    value={link.platform}
                    onChange={(e) => updateSocialLink(index, { platform: e.target.value })}
                    data-testid={`input-social-platform-${index}`}
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <Input
                    placeholder="URL"
                    value={link.url}
                    onChange={(e) => updateSocialLink(index, { url: e.target.value })}
                    data-testid={`input-social-url-${index}`}
                  />
                </div>
                <div className="flex-1 min-w-[100px]">
                  <Input
                    placeholder="Label"
                    value={link.label}
                    onChange={(e) => updateSocialLink(index, { label: e.target.value })}
                    data-testid={`input-social-label-${index}`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSocialLink(index)}
                  data-testid={`button-remove-social-link-${index}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface HomepageTabProps {
  homepage: ContentDefaults['homepage'];
  onChange: (homepage: ContentDefaults['homepage']) => void;
}

function HomepageTab({ homepage, onChange }: HomepageTabProps) {
  const updateField = (field: keyof ContentDefaults['homepage'], value: string) => {
    onChange({ ...homepage, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="w-5 h-5" />
          Homepage Settings
        </CardTitle>
        <CardDescription>Configure your homepage content and titles</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="heroTitle">Hero Title</Label>
          <Input
            id="heroTitle"
            placeholder="Welcome to My Blog"
            value={homepage.heroTitle}
            onChange={(e) => updateField("heroTitle", e.target.value)}
            data-testid="input-hero-title"
          />
          <p className="text-xs text-muted-foreground">Main headline displayed on the homepage hero section</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
          <Textarea
            id="heroSubtitle"
            placeholder="A subtitle or tagline for your homepage"
            value={homepage.heroSubtitle}
            onChange={(e) => updateField("heroSubtitle", e.target.value)}
            rows={2}
            data-testid="input-hero-subtitle"
          />
          <p className="text-xs text-muted-foreground">Supporting text displayed below the hero title</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="featuredSectionTitle">Featured Section Title</Label>
          <Input
            id="featuredSectionTitle"
            placeholder="Featured Posts"
            value={homepage.featuredSectionTitle}
            onChange={(e) => updateField("featuredSectionTitle", e.target.value)}
            data-testid="input-featured-section-title"
          />
          <p className="text-xs text-muted-foreground">Title for the featured posts section</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="latestSectionTitle">Latest Section Title</Label>
          <Input
            id="latestSectionTitle"
            placeholder="Latest Posts"
            value={homepage.latestSectionTitle}
            onChange={(e) => updateField("latestSectionTitle", e.target.value)}
            data-testid="input-latest-section-title"
          />
          <p className="text-xs text-muted-foreground">Title for the latest posts section</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface BlogTabProps {
  blog: ContentDefaults['blog'];
  onChange: (blog: ContentDefaults['blog']) => void;
}

function BlogTab({ blog, onChange }: BlogTabProps) {
  const updateField = (field: keyof ContentDefaults['blog'], value: string) => {
    onChange({ ...blog, [field]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Blog Settings
        </CardTitle>
        <CardDescription>Configure your blog page content</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="blogTitle">Blog Page Title</Label>
          <Input
            id="blogTitle"
            placeholder="Blog"
            value={blog.title}
            onChange={(e) => updateField("title", e.target.value)}
            data-testid="input-blog-title"
          />
          <p className="text-xs text-muted-foreground">Main title displayed on the blog listing page</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="blogDescription">Blog Description</Label>
          <Textarea
            id="blogDescription"
            placeholder="Thoughts, stories and ideas"
            value={blog.description}
            onChange={(e) => updateField("description", e.target.value)}
            rows={3}
            data-testid="input-blog-description"
          />
          <p className="text-xs text-muted-foreground">Description shown on the blog page</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="emptyStateMessage">Empty State Message</Label>
          <Input
            id="emptyStateMessage"
            placeholder="No posts yet. Check back later!"
            value={blog.emptyStateMessage}
            onChange={(e) => updateField("emptyStateMessage", e.target.value)}
            data-testid="input-empty-state-message"
          />
          <p className="text-xs text-muted-foreground">Message shown when there are no blog posts</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface CategoriesTabProps {
  categories: Category[];
  onChange: (categories: Category[]) => void;
}

function CategoriesTab({ categories, onChange }: CategoriesTabProps) {
  const addCategory = () => {
    const newCategory: Category = {
      id: `category-${Date.now()}`,
      name: "New Category",
      color: "#6366f1"
    };
    onChange([...categories, newCategory]);
  };

  const updateCategory = (index: number, updates: Partial<Category>) => {
    const newCategories = [...categories];
    newCategories[index] = { ...newCategories[index], ...updates };
    onChange(newCategories);
  };

  const removeCategory = (index: number) => {
    const newCategories = categories.filter((_, i) => i !== index);
    onChange(newCategories);
  };

  const generateIdFromName = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tags className="w-5 h-5" />
              Categories
            </CardTitle>
            <CardDescription>Manage blog post categories</CardDescription>
          </div>
          <Button onClick={addCategory} size="sm" data-testid="button-add-category">
            <Plus className="w-4 h-4 mr-1" />
            Add Category
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">No categories. Click "Add Category" to create one.</p>
        ) : (
          categories.map((category, index) => (
            <div key={index} className="flex items-center gap-3 flex-wrap p-3 border rounded-md" data-testid={`category-${index}`}>
              <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-[120px]">
                <Input
                  placeholder="Category Name"
                  value={category.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    updateCategory(index, { 
                      name: newName,
                      id: generateIdFromName(newName) || category.id
                    });
                  }}
                  data-testid={`input-category-name-${index}`}
                />
              </div>
              <div className="flex-1 min-w-[100px]">
                <Input
                  placeholder="ID (auto-generated)"
                  value={category.id}
                  onChange={(e) => updateCategory(index, { id: e.target.value })}
                  data-testid={`input-category-id-${index}`}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Label className="text-sm">Color:</Label>
                <input
                  type="color"
                  value={category.color}
                  onChange={(e) => updateCategory(index, { color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border"
                  data-testid={`input-category-color-${index}`}
                />
                <div 
                  className="w-16 h-8 rounded border flex items-center justify-center text-xs"
                  style={{ backgroundColor: category.color, color: isLightColor(category.color) ? '#000' : '#fff' }}
                >
                  {category.color}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeCategory(index)}
                data-testid={`button-remove-category-${index}`}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function isLightColor(color: string): boolean {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
