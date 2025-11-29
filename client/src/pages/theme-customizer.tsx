import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { 
  Palette, 
  RotateCcw, 
  Save, 
  Eye,
  FileText,
  Calendar,
  User,
  Tag,
  GitCommit,
  RefreshCw,
  AlertCircle
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ThemeSettings, Repository } from "@shared/schema";

// Legacy theme structure (old templates)
const defaultTheme: ThemeSettings = {
  primary: "#FF5D01",
  secondary: "#0C0C0C",
  background: "#FAFAFA",
  text: "#1E293B",
  accent: "#8B5CF6",
  success: "#10B981",
};

// New template (egpress-v1) design tokens structure
interface DesignTokensColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
  border: string;
  success: string;
  warning: string;
  error: string;
}

const defaultDesignTokens: DesignTokensColors = {
  primary: "#E11D48",
  primaryHover: "#BE123C",
  primaryLight: "#FFF1F2",
  secondary: "#1F2937",
  accent: "#F43F5E",
  background: "#F9FAFB",
  surface: "#FFFFFF",
  text: {
    primary: "#111827",
    secondary: "#4B5563",
    muted: "#9CA3AF",
    inverse: "#FFFFFF",
  },
  border: "#E5E7EB",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
};

const legacyColorLabels: Record<keyof ThemeSettings, { label: string; description: string }> = {
  primary: { label: "Primary", description: "Main brand color, used for CTAs and links" },
  secondary: { label: "Secondary", description: "Dark background color for headers" },
  background: { label: "Background", description: "Main page background color" },
  text: { label: "Text", description: "Primary text color for content" },
  accent: { label: "Accent", description: "Highlight color for special elements" },
  success: { label: "Success", description: "Color for success states and badges" },
};

const designTokenColorLabels: Record<string, { label: string; description: string; category: string }> = {
  primary: { label: "Primary", description: "Main brand color for buttons and links", category: "brand" },
  primaryHover: { label: "Primary Hover", description: "Hover state for primary elements", category: "brand" },
  primaryLight: { label: "Primary Light", description: "Light variant for backgrounds", category: "brand" },
  secondary: { label: "Secondary", description: "Secondary brand color", category: "brand" },
  accent: { label: "Accent", description: "Accent color for highlights", category: "brand" },
  background: { label: "Background", description: "Main page background", category: "surface" },
  surface: { label: "Surface", description: "Card and elevated surfaces", category: "surface" },
  border: { label: "Border", description: "Border and divider color", category: "surface" },
  "text.primary": { label: "Text Primary", description: "Main text color", category: "text" },
  "text.secondary": { label: "Text Secondary", description: "Secondary text color", category: "text" },
  "text.muted": { label: "Text Muted", description: "Muted/subtle text", category: "text" },
  "text.inverse": { label: "Text Inverse", description: "Text on dark backgrounds", category: "text" },
  success: { label: "Success", description: "Success states and messages", category: "status" },
  warning: { label: "Warning", description: "Warning states and alerts", category: "status" },
  error: { label: "Error", description: "Error states and messages", category: "status" },
};

function ColorSwatch({
  colorKey,
  value,
  label,
  description,
  onChange,
}: {
  colorKey: string;
  value: string;
  label: string;
  description: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border border-border">
      <div className="relative">
        <div
          className="w-14 h-14 rounded-md border border-border shadow-sm"
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(colorKey, e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          data-testid={`color-picker-${colorKey.replace('.', '-')}`}
        />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Label className="font-medium text-sm">{label}</Label>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <Input
          value={value}
          onChange={(e) => onChange(colorKey, e.target.value)}
          className="font-mono text-sm h-8"
          data-testid={`input-color-${colorKey.replace('.', '-')}`}
        />
      </div>
    </div>
  );
}

function PreviewPane({ colors, templateType }: { colors: DesignTokensColors | ThemeSettings; templateType: string }) {
  const isNewTemplate = templateType === "egpress-v1";
  const c = isNewTemplate 
    ? colors as DesignTokensColors 
    : {
        ...defaultDesignTokens,
        primary: (colors as ThemeSettings).primary,
        secondary: (colors as ThemeSettings).secondary,
        background: (colors as ThemeSettings).background,
        accent: (colors as ThemeSettings).accent,
        success: (colors as ThemeSettings).success,
        text: {
          ...defaultDesignTokens.text,
          primary: (colors as ThemeSettings).text,
        }
      };

  return (
    <div 
      className="h-full overflow-auto"
      style={{ 
        backgroundColor: c.background,
        color: c.text.primary,
      }}
    >
      {/* Header Preview */}
      <div 
        className="p-6"
        style={{ backgroundColor: c.secondary }}
      >
        <div className="max-w-4xl mx-auto">
          <h1 
            className="text-2xl font-bold mb-2"
            style={{ color: c.text.inverse }}
          >
            My Astro Blog
          </h1>
          <p style={{ color: `${c.text.inverse}99` }}>
            A beautiful blog built with Astro
          </p>
        </div>
      </div>

      {/* Nav Preview */}
      <div className="border-b" style={{ borderColor: c.border }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex gap-6">
          {["Home", "Blog", "About"].map(item => (
            <a 
              key={item} 
              href="#"
              className="text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: item === "Blog" ? c.primary : c.text.primary }}
            >
              {item}
            </a>
          ))}
        </div>
      </div>

      {/* Content Preview */}
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Featured Post */}
        <div 
          className="rounded-lg overflow-hidden border"
          style={{ borderColor: c.border, backgroundColor: c.surface }}
        >
          <div 
            className="h-48 flex items-center justify-center"
            style={{ backgroundColor: isNewTemplate ? c.primaryLight : `${c.primary}15` }}
          >
            <FileText style={{ color: c.primary }} className="w-16 h-16" />
          </div>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Badge 
                style={{ 
                  backgroundColor: `${c.success}20`, 
                  color: c.success,
                  border: `1px solid ${c.success}40`
                }}
              >
                Featured
              </Badge>
              <Badge 
                variant="outline"
                style={{ 
                  borderColor: `${c.accent}40`,
                  color: c.accent 
                }}
              >
                Tutorial
              </Badge>
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: c.text.primary }}>
              Getting Started with Astro
            </h2>
            <p className="mb-4" style={{ color: c.text.secondary }}>
              Learn how to build blazing-fast websites with the Astro framework. 
              This comprehensive guide covers everything you need to know.
            </p>
            <div className="flex items-center gap-4 text-sm" style={{ color: c.text.muted }}>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>Nov 28, 2025</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="w-4 h-4" />
                <span>John Doe</span>
              </div>
            </div>
          </div>
        </div>

        {/* Post List */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold" style={{ color: c.text.primary }}>
            Recent Posts
          </h3>
          {[1, 2, 3].map(i => (
            <div 
              key={i} 
              className="p-4 rounded-lg border flex gap-4"
              style={{ borderColor: c.border, backgroundColor: c.surface }}
            >
              <div 
                className="w-20 h-20 rounded shrink-0 flex items-center justify-center"
                style={{ backgroundColor: `${c.accent}15` }}
              >
                <FileText style={{ color: c.accent }} className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium mb-1" style={{ color: c.text.primary }}>
                  Blog Post Title {i}
                </h4>
                <p className="text-sm mb-2 line-clamp-2" style={{ color: c.text.secondary }}>
                  A brief description of the blog post content that gives readers 
                  an idea of what to expect.
                </p>
                <div className="flex items-center gap-2">
                  <Tag className="w-3 h-3" style={{ color: c.primary }} />
                  <span className="text-xs" style={{ color: c.primary }}>
                    astro, web
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Status Colors Preview */}
        {isNewTemplate && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold" style={{ color: c.text.primary }}>
              Status Colors
            </h3>
            <div className="flex gap-3 flex-wrap">
              <Badge style={{ backgroundColor: c.success, color: "#fff" }}>Success</Badge>
              <Badge style={{ backgroundColor: c.warning, color: "#fff" }}>Warning</Badge>
              <Badge style={{ backgroundColor: c.error, color: "#fff" }}>Error</Badge>
            </div>
          </div>
        )}

        {/* Button Preview */}
        <div className="flex items-center gap-3 flex-wrap">
          <button 
            className="px-4 py-2 rounded-md font-medium text-sm transition-colors"
            style={{ 
              backgroundColor: c.primary, 
              color: c.text.inverse 
            }}
          >
            Primary Button
          </button>
          <button 
            className="px-4 py-2 rounded-md font-medium text-sm border transition-colors"
            style={{ 
              borderColor: c.primary, 
              color: c.primary 
            }}
          >
            Outline Button
          </button>
          <button 
            className="px-4 py-2 rounded-md font-medium text-sm transition-colors"
            style={{ 
              backgroundColor: c.accent, 
              color: c.text.inverse 
            }}
          >
            Accent Button
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ThemeCustomizer() {
  const [legacyTheme, setLegacyTheme] = useState<ThemeSettings>(defaultTheme);
  const [designTokens, setDesignTokens] = useState<DesignTokensColors>(defaultDesignTokens);
  const [commitMessage, setCommitMessage] = useState("Update theme configuration");
  const [activeTab, setActiveTab] = useState("brand");
  const { toast } = useToast();

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
    data?: { designTokens?: { colors?: DesignTokensColors } };
    error?: string;
  }>({
    queryKey: ["/api/site-settings"],
    enabled: !!repoData?.data && isNewTemplate,
  });

  // Fetch legacy theme
  const { data: legacyThemeData, isLoading: legacyLoading } = useQuery<{ success: boolean; data: ThemeSettings }>({
    queryKey: ["/api/theme"],
    enabled: !!repoData?.data && !isNewTemplate,
  });

  const isLoading = isNewTemplate ? siteSettingsLoading : legacyLoading;

  // Update local state when data is fetched
  useEffect(() => {
    if (isNewTemplate && siteSettingsData?.data?.designTokens?.colors) {
      setDesignTokens(siteSettingsData.data.designTokens.colors);
    }
  }, [siteSettingsData, isNewTemplate]);

  useEffect(() => {
    if (!isNewTemplate && legacyThemeData?.data) {
      setLegacyTheme(legacyThemeData.data);
    }
  }, [legacyThemeData, isNewTemplate]);

  // Save mutation for new template
  const saveNewTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/site-settings", {
        designTokens: { colors: designTokens },
        commitMessage,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast({
          title: "Theme Saved",
          description: `Colors updated in siteSettings.ts`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      } else {
        toast({
          title: "Save Failed",
          description: data?.error || "Failed to save theme settings",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save theme settings",
        variant: "destructive",
      });
    },
  });

  // Save mutation for legacy template
  const saveLegacyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/theme", {
        theme: legacyTheme,
        commitMessage,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast({
          title: "Theme Saved",
          description: data.cssUpdated 
            ? `Colors updated in ${data.cssPath}`
            : "Theme saved to config (no CSS variables found to update)",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/theme"] });
      } else {
        toast({
          title: "Save Failed",
          description: data?.error || "Failed to save theme settings",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save theme settings",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (isNewTemplate) {
      saveNewTemplateMutation.mutate();
    } else {
      saveLegacyMutation.mutate();
    }
  };

  const isPending = isNewTemplate ? saveNewTemplateMutation.isPending : saveLegacyMutation.isPending;

  const handleDesignTokenChange = (key: string, value: string) => {
    if (key.startsWith("text.")) {
      const textKey = key.replace("text.", "") as keyof DesignTokensColors["text"];
      setDesignTokens(prev => ({
        ...prev,
        text: { ...prev.text, [textKey]: value }
      }));
    } else {
      setDesignTokens(prev => ({ ...prev, [key]: value }));
    }
  };

  const handleLegacyColorChange = (key: keyof ThemeSettings, value: string) => {
    setLegacyTheme(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    if (isNewTemplate) {
      setDesignTokens(defaultDesignTokens);
    } else {
      setLegacyTheme(defaultTheme);
    }
    toast({
      title: "Theme Reset",
      description: "Colors have been reset to defaults",
    });
  };

  const getColorValue = (key: string): string => {
    if (key.startsWith("text.")) {
      const textKey = key.replace("text.", "") as keyof DesignTokensColors["text"];
      return designTokens.text[textKey];
    }
    return (designTokens as any)[key] || "";
  };

  const hasChanges = isNewTemplate
    ? JSON.stringify(designTokens) !== JSON.stringify(siteSettingsData?.data?.designTokens?.colors || defaultDesignTokens)
    : JSON.stringify(legacyTheme) !== JSON.stringify(legacyThemeData?.data || defaultTheme);

  const repository = repoData?.data;

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <div className="text-center">
            <Palette className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository from the sidebar to customize your theme.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Group colors by category for new template
  const colorsByCategory = Object.entries(designTokenColorLabels).reduce((acc, [key, info]) => {
    if (!acc[info.category]) acc[info.category] = [];
    acc[info.category].push({ key, ...info });
    return acc;
  }, {} as Record<string, Array<{ key: string; label: string; description: string }>>);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 p-4 border-b border-border flex items-center justify-between gap-4 bg-background">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Theme Customizer
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              Customize your blog's color scheme
            </p>
            {isNewTemplate && (
              <Badge variant="secondary" className="text-xs">egpress-v1</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Unsaved Changes
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            data-testid="button-reset-theme"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending || !hasChanges}
            data-testid="button-save-theme"
          >
            {isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Theme
              </>
            )}
          </Button>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={40} minSize={30} maxSize={50}>
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {isNewTemplate ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Design Tokens</CardTitle>
                      <CardDescription>
                        Full color palette from siteSettings.ts
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid w-full grid-cols-4">
                          <TabsTrigger value="brand">Brand</TabsTrigger>
                          <TabsTrigger value="surface">Surface</TabsTrigger>
                          <TabsTrigger value="text">Text</TabsTrigger>
                          <TabsTrigger value="status">Status</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="brand" className="space-y-4 mt-4">
                          {colorsByCategory.brand?.map(({ key, label, description }) => (
                            <ColorSwatch
                              key={key}
                              colorKey={key}
                              value={getColorValue(key)}
                              label={label}
                              description={description}
                              onChange={handleDesignTokenChange}
                            />
                          ))}
                        </TabsContent>
                        
                        <TabsContent value="surface" className="space-y-4 mt-4">
                          {colorsByCategory.surface?.map(({ key, label, description }) => (
                            <ColorSwatch
                              key={key}
                              colorKey={key}
                              value={getColorValue(key)}
                              label={label}
                              description={description}
                              onChange={handleDesignTokenChange}
                            />
                          ))}
                        </TabsContent>
                        
                        <TabsContent value="text" className="space-y-4 mt-4">
                          {colorsByCategory.text?.map(({ key, label, description }) => (
                            <ColorSwatch
                              key={key}
                              colorKey={key}
                              value={getColorValue(key)}
                              label={label}
                              description={description}
                              onChange={handleDesignTokenChange}
                            />
                          ))}
                        </TabsContent>
                        
                        <TabsContent value="status" className="space-y-4 mt-4">
                          {colorsByCategory.status?.map(({ key, label, description }) => (
                            <ColorSwatch
                              key={key}
                              colorKey={key}
                              value={getColorValue(key)}
                              label={label}
                              description={description}
                              onChange={handleDesignTokenChange}
                            />
                          ))}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Color Palette</CardTitle>
                    <CardDescription>
                      Click color swatches or enter hex values to customize
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(Object.keys(legacyColorLabels) as Array<keyof ThemeSettings>).map(key => (
                      <ColorSwatch
                        key={key}
                        colorKey={key}
                        value={legacyTheme[key]}
                        label={legacyColorLabels[key].label}
                        description={legacyColorLabels[key].description}
                        onChange={(k, v) => handleLegacyColorChange(k as keyof ThemeSettings, v)}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitCommit className="w-4 h-4" />
                    Commit Settings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="commit-message">Commit Message</Label>
                  <Input
                    id="commit-message"
                    placeholder="Update theme configuration"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="mt-2"
                    data-testid="input-theme-commit-message"
                  />
                </CardContent>
              </Card>

              {!isNewTemplate && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Eye className="w-4 h-4" />
                      CSS Debug
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={async () => {
                        try {
                          const response = await fetch("/api/theme/analyze");
                          const data = await response.json();
                          if (data.success) {
                            const found = data.data.filter((f: any) => f.found);
                            if (found.length > 0) {
                              const info = found.map((f: any) => 
                                `${f.file}: ${f.colorVariables?.length || 0} color vars, HSL: ${f.hasHslFormat}`
                              ).join("\n");
                              toast({
                                title: "CSS Analysis",
                                description: info || "No color variables found",
                              });
                              console.log("CSS Analysis:", data.data);
                            } else {
                              toast({
                                title: "No CSS Files Found",
                                description: "Could not find global.css or similar files",
                                variant: "destructive",
                              });
                            }
                          }
                        } catch (err) {
                          toast({ title: "Error", description: "Failed to analyze CSS", variant: "destructive" });
                        }
                      }}
                      data-testid="button-analyze-css"
                    >
                      Analyze CSS Structure
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Check which CSS files and variables exist in your repo
                    </p>
                  </CardContent>
                </Card>
              )}

              {templateType === "unknown" && (
                <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                  <CardContent className="pt-6">
                    <div className="flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          Unknown Template Type
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          Could not detect template type. Using legacy theme editor.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={60}>
          <div className="h-full flex flex-col">
            <div className="p-3 border-b border-border flex items-center gap-2 bg-card">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Live Preview</span>
            </div>
            <div className="flex-1">
              <PreviewPane 
                colors={isNewTemplate ? designTokens : legacyTheme} 
                templateType={templateType}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
