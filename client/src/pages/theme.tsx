import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Palette, 
  RotateCcw, 
  Save, 
  Type,
  Ruler,
  Square,
  Layers,
  RefreshCw,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";

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

interface DesignTokensTypography {
  fontFamily: {
    sans: string;
    serif: string;
    mono: string;
  };
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    "2xl": string;
    "3xl": string;
    "4xl": string;
    "5xl": string;
  };
  fontWeight: {
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
  };
  lineHeight: {
    tight: string;
    normal: string;
    relaxed: string;
  };
}

interface DesignTokensSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
  "3xl": string;
}

interface DesignTokensBorderRadius {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  "2xl": string;
  full: string;
}

interface DesignTokensShadows {
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

interface DesignTokens {
  colors: DesignTokensColors;
  typography: DesignTokensTypography;
  spacing: DesignTokensSpacing;
  borderRadius: DesignTokensBorderRadius;
  shadows: DesignTokensShadows;
}

const defaultDesignTokens: DesignTokens = {
  colors: {
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
  },
  typography: {
    fontFamily: {
      sans: "Inter, system-ui, sans-serif",
      serif: "Georgia, serif",
      mono: "JetBrains Mono, monospace",
    },
    fontSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: "1.25",
      normal: "1.5",
      relaxed: "1.75",
    },
  },
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    "2xl": "3rem",
    "3xl": "4rem",
  },
  borderRadius: {
    none: "0",
    sm: "0.125rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    "2xl": "1rem",
    full: "9999px",
  },
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  },
};

const colorLabels: Record<string, { label: string; description: string }> = {
  primary: { label: "Primary", description: "Main brand color for buttons and links" },
  primaryHover: { label: "Primary Hover", description: "Hover state for primary elements" },
  primaryLight: { label: "Primary Light", description: "Light variant for backgrounds" },
  secondary: { label: "Secondary", description: "Secondary brand color" },
  accent: { label: "Accent", description: "Accent color for highlights" },
  background: { label: "Background", description: "Main page background" },
  surface: { label: "Surface", description: "Card and elevated surfaces" },
  border: { label: "Border", description: "Border and divider color" },
  "text.primary": { label: "Text Primary", description: "Main text color" },
  "text.secondary": { label: "Text Secondary", description: "Secondary text color" },
  "text.muted": { label: "Text Muted", description: "Muted/subtle text" },
  "text.inverse": { label: "Text Inverse", description: "Text on dark backgrounds" },
  success: { label: "Success", description: "Success states and messages" },
  warning: { label: "Warning", description: "Warning states and alerts" },
  error: { label: "Error", description: "Error states and messages" },
};

function ColorInput({
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

function TextInput({
  id,
  value,
  label,
  description,
  placeholder,
  onChange,
}: {
  id: string;
  value: string;
  label: string;
  description?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm"
        data-testid={`input-${id}`}
      />
    </div>
  );
}

function NumberInput({
  id,
  value,
  label,
  description,
  min,
  max,
  onChange,
}: {
  id: string;
  value: number;
  label: string;
  description?: string;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        min={min}
        max={max}
        className="font-mono text-sm"
        data-testid={`input-${id}`}
      />
    </div>
  );
}

export default function ThemePage() {
  const [designTokens, setDesignTokens] = useState<DesignTokens>(defaultDesignTokens);
  const [commitMessage, setCommitMessage] = useState("Update design tokens");
  const [activeTab, setActiveTab] = useState("colors");
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: templateTypeData } = useQuery<{ success: boolean; templateType: string; configFile: string | null }>({
    queryKey: ["/api/template-type"],
    enabled: !!repoData?.data,
  });

  const templateType = templateTypeData?.templateType || "unknown";
  const isNewTemplate = templateType === "egpress-v1";

  const { data: siteSettingsData, isLoading } = useQuery<{ 
    success: boolean; 
    data?: { designTokens?: DesignTokens };
    error?: string;
  }>({
    queryKey: ["/api/site-settings"],
    enabled: !!repoData?.data && isNewTemplate,
  });

  useEffect(() => {
    if (isNewTemplate && siteSettingsData?.data?.designTokens) {
      const tokens = siteSettingsData.data.designTokens;
      setDesignTokens({
        colors: tokens.colors || defaultDesignTokens.colors,
        typography: tokens.typography || defaultDesignTokens.typography,
        spacing: tokens.spacing || defaultDesignTokens.spacing,
        borderRadius: tokens.borderRadius || defaultDesignTokens.borderRadius,
        shadows: tokens.shadows || defaultDesignTokens.shadows,
      });
    }
  }, [siteSettingsData, isNewTemplate]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/site-settings", {
        designTokens,
        commitMessage,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast({
          title: "Design Tokens Saved",
          description: `Settings updated in siteSettings.ts`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      } else {
        toast({
          title: "Save Failed",
          description: data?.error || "Failed to save design tokens",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save design tokens",
        variant: "destructive",
      });
    },
  });

  const handleColorChange = (key: string, value: string) => {
    if (key.startsWith("text.")) {
      const textKey = key.replace("text.", "") as keyof DesignTokensColors["text"];
      setDesignTokens(prev => ({
        ...prev,
        colors: {
          ...prev.colors,
          text: { ...prev.colors.text, [textKey]: value }
        }
      }));
    } else {
      setDesignTokens(prev => ({
        ...prev,
        colors: { ...prev.colors, [key]: value }
      }));
    }
  };

  const getColorValue = (key: string): string => {
    if (key.startsWith("text.")) {
      const textKey = key.replace("text.", "") as keyof DesignTokensColors["text"];
      return designTokens.colors.text[textKey] || "";
    }
    return (designTokens.colors as any)[key] || "";
  };

  const handleTypographyChange = (
    section: keyof DesignTokensTypography,
    key: string,
    value: string | number
  ) => {
    setDesignTokens(prev => ({
      ...prev,
      typography: {
        ...prev.typography,
        [section]: {
          ...prev.typography[section],
          [key]: value
        }
      }
    }));
  };

  const handleSpacingChange = (key: string, value: string) => {
    setDesignTokens(prev => ({
      ...prev,
      spacing: { ...prev.spacing, [key]: value }
    }));
  };

  const handleBorderRadiusChange = (key: string, value: string) => {
    setDesignTokens(prev => ({
      ...prev,
      borderRadius: { ...prev.borderRadius, [key]: value }
    }));
  };

  const handleShadowsChange = (key: string, value: string) => {
    setDesignTokens(prev => ({
      ...prev,
      shadows: { ...prev.shadows, [key]: value }
    }));
  };

  const handleReset = () => {
    setDesignTokens(defaultDesignTokens);
    toast({
      title: "Design Tokens Reset",
      description: "All values have been reset to defaults",
    });
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const hasChanges = JSON.stringify(designTokens) !== JSON.stringify(siteSettingsData?.data?.designTokens || defaultDesignTokens);

  const repository = repoData?.data;

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto" data-testid="container-theme">
        <Card className="p-8">
          <div className="text-center">
            <Palette className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2" data-testid="text-no-repo">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository from the sidebar to customize your theme.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!isNewTemplate) {
    return (
      <div className="p-6 max-w-4xl mx-auto" data-testid="container-theme">
        <Card className="p-8">
          <div className="text-center">
            <Palette className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2" data-testid="text-wrong-template">Template Not Supported</h2>
            <p className="text-muted-foreground">
              The full Design Tokens editor is only available for egpress-v1 templates.
              Your current template type is: {templateType}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="container-theme-loading">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="container-theme">
      <div className="shrink-0 p-4 border-b border-border flex items-center justify-between gap-4 bg-background flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Palette className="w-5 h-5" />
            Design Tokens
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Customize colors, typography, spacing, and more
            </p>
            <Badge variant="secondary" className="text-xs" data-testid="badge-template-type">egpress-v1</Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-300" data-testid="badge-unsaved">
              Unsaved Changes
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            data-testid="button-reset"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending || !hasChanges}
            data-testid="button-save"
          >
            {saveMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save to GitHub
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="shrink-0 px-4 pt-4 border-b border-border bg-background">
            <TabsList className="grid w-full max-w-2xl grid-cols-5" data-testid="tabs-design-tokens">
              <TabsTrigger value="colors" data-testid="tab-colors">
                <Palette className="w-4 h-4 mr-2" />
                Colors
              </TabsTrigger>
              <TabsTrigger value="typography" data-testid="tab-typography">
                <Type className="w-4 h-4 mr-2" />
                Typography
              </TabsTrigger>
              <TabsTrigger value="spacing" data-testid="tab-spacing">
                <Ruler className="w-4 h-4 mr-2" />
                Spacing
              </TabsTrigger>
              <TabsTrigger value="borderRadius" data-testid="tab-border-radius">
                <Square className="w-4 h-4 mr-2" />
                Border Radius
              </TabsTrigger>
              <TabsTrigger value="shadows" data-testid="tab-shadows">
                <Layers className="w-4 h-4 mr-2" />
                Shadows
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 max-w-4xl">
              <TabsContent value="colors" className="mt-0 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Brand Colors</CardTitle>
                    <CardDescription>Primary brand colors and their variants</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {["primary", "primaryHover", "primaryLight", "secondary", "accent"].map(key => (
                      <ColorInput
                        key={key}
                        colorKey={key}
                        value={getColorValue(key)}
                        label={colorLabels[key].label}
                        description={colorLabels[key].description}
                        onChange={handleColorChange}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Surface Colors</CardTitle>
                    <CardDescription>Background and surface colors</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {["background", "surface", "border"].map(key => (
                      <ColorInput
                        key={key}
                        colorKey={key}
                        value={getColorValue(key)}
                        label={colorLabels[key].label}
                        description={colorLabels[key].description}
                        onChange={handleColorChange}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Text Colors</CardTitle>
                    <CardDescription>Text colors for different contexts</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {["text.primary", "text.secondary", "text.muted", "text.inverse"].map(key => (
                      <ColorInput
                        key={key}
                        colorKey={key}
                        value={getColorValue(key)}
                        label={colorLabels[key].label}
                        description={colorLabels[key].description}
                        onChange={handleColorChange}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Status Colors</CardTitle>
                    <CardDescription>Colors for feedback and status</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {["success", "warning", "error"].map(key => (
                      <ColorInput
                        key={key}
                        colorKey={key}
                        value={getColorValue(key)}
                        label={colorLabels[key].label}
                        description={colorLabels[key].description}
                        onChange={handleColorChange}
                      />
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="typography" className="mt-0 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Font Families</CardTitle>
                    <CardDescription>Define the fonts used throughout your site</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <TextInput
                      id="font-family-sans"
                      value={designTokens.typography.fontFamily.sans}
                      label="Sans-serif"
                      description="Primary font for body text and UI elements"
                      placeholder="Inter, system-ui, sans-serif"
                      onChange={(v) => handleTypographyChange("fontFamily", "sans", v)}
                    />
                    <TextInput
                      id="font-family-serif"
                      value={designTokens.typography.fontFamily.serif}
                      label="Serif"
                      description="Font for headings or accent text"
                      placeholder="Georgia, serif"
                      onChange={(v) => handleTypographyChange("fontFamily", "serif", v)}
                    />
                    <TextInput
                      id="font-family-mono"
                      value={designTokens.typography.fontFamily.mono}
                      label="Monospace"
                      description="Font for code and technical content"
                      placeholder="JetBrains Mono, monospace"
                      onChange={(v) => handleTypographyChange("fontFamily", "mono", v)}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Font Sizes</CardTitle>
                    <CardDescription>Text size scale for your typography system</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"] as const).map(key => (
                        <TextInput
                          key={key}
                          id={`font-size-${key}`}
                          value={designTokens.typography.fontSize[key]}
                          label={key.toUpperCase()}
                          placeholder="1rem"
                          onChange={(v) => handleTypographyChange("fontSize", key, v)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Font Weights</CardTitle>
                    <CardDescription>Weight values for text emphasis (100-900)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <NumberInput
                        id="font-weight-normal"
                        value={designTokens.typography.fontWeight.normal}
                        label="Normal"
                        description="Regular body text weight"
                        min={100}
                        max={900}
                        onChange={(v) => handleTypographyChange("fontWeight", "normal", v)}
                      />
                      <NumberInput
                        id="font-weight-medium"
                        value={designTokens.typography.fontWeight.medium}
                        label="Medium"
                        description="Slightly emphasized text"
                        min={100}
                        max={900}
                        onChange={(v) => handleTypographyChange("fontWeight", "medium", v)}
                      />
                      <NumberInput
                        id="font-weight-semibold"
                        value={designTokens.typography.fontWeight.semibold}
                        label="Semibold"
                        description="Emphasized text and subheadings"
                        min={100}
                        max={900}
                        onChange={(v) => handleTypographyChange("fontWeight", "semibold", v)}
                      />
                      <NumberInput
                        id="font-weight-bold"
                        value={designTokens.typography.fontWeight.bold}
                        label="Bold"
                        description="Strong emphasis and headings"
                        min={100}
                        max={900}
                        onChange={(v) => handleTypographyChange("fontWeight", "bold", v)}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Line Heights</CardTitle>
                    <CardDescription>Vertical spacing between lines of text</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <TextInput
                        id="line-height-tight"
                        value={designTokens.typography.lineHeight.tight}
                        label="Tight"
                        description="Compact text (headings)"
                        placeholder="1.25"
                        onChange={(v) => handleTypographyChange("lineHeight", "tight", v)}
                      />
                      <TextInput
                        id="line-height-normal"
                        value={designTokens.typography.lineHeight.normal}
                        label="Normal"
                        description="Standard body text"
                        placeholder="1.5"
                        onChange={(v) => handleTypographyChange("lineHeight", "normal", v)}
                      />
                      <TextInput
                        id="line-height-relaxed"
                        value={designTokens.typography.lineHeight.relaxed}
                        label="Relaxed"
                        description="Comfortable reading"
                        placeholder="1.75"
                        onChange={(v) => handleTypographyChange("lineHeight", "relaxed", v)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="spacing" className="mt-0 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Spacing Scale</CardTitle>
                    <CardDescription>Consistent spacing values for margins, padding, and gaps (use rem units)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const).map(key => (
                        <div key={key} className="flex items-center gap-4 p-4 rounded-lg border border-border">
                          <div 
                            className="shrink-0 bg-primary rounded"
                            style={{ 
                              width: designTokens.spacing[key],
                              height: designTokens.spacing[key],
                              minWidth: "8px",
                              minHeight: "8px",
                              maxWidth: "64px",
                              maxHeight: "64px"
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <TextInput
                              id={`spacing-${key}`}
                              value={designTokens.spacing[key]}
                              label={key.toUpperCase()}
                              placeholder="1rem"
                              onChange={(v) => handleSpacingChange(key, v)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="borderRadius" className="mt-0 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Border Radius</CardTitle>
                    <CardDescription>Corner rounding values for UI elements</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(["none", "sm", "md", "lg", "xl", "2xl", "full"] as const).map(key => (
                        <div key={key} className="flex items-center gap-4 p-4 rounded-lg border border-border">
                          <div 
                            className="shrink-0 w-12 h-12 bg-primary"
                            style={{ 
                              borderRadius: designTokens.borderRadius[key]
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <TextInput
                              id={`border-radius-${key}`}
                              value={designTokens.borderRadius[key]}
                              label={key.toUpperCase()}
                              placeholder={key === "full" ? "9999px" : "0.5rem"}
                              onChange={(v) => handleBorderRadiusChange(key, v)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="shadows" className="mt-0 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Box Shadows</CardTitle>
                    <CardDescription>Shadow values for elevation and depth (CSS box-shadow syntax)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {(["sm", "md", "lg", "xl"] as const).map(key => (
                      <div key={key} className="space-y-4 p-4 rounded-lg border border-border">
                        <div className="flex items-center gap-4">
                          <div 
                            className="shrink-0 w-20 h-20 bg-surface rounded-lg border border-border"
                            style={{ 
                              boxShadow: designTokens.shadows[key]
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <Label className="text-sm font-medium mb-2 block">Shadow {key.toUpperCase()}</Label>
                            <Input
                              id={`shadow-${key}`}
                              value={designTokens.shadows[key]}
                              onChange={(e) => handleShadowsChange(key, e.target.value)}
                              placeholder="0 4px 6px -1px rgb(0 0 0 / 0.1)"
                              className="font-mono text-sm"
                              data-testid={`input-shadow-${key}`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </div>

      <div className="shrink-0 p-4 border-t border-border bg-background">
        <div className="max-w-4xl flex items-center gap-4">
          <div className="flex-1">
            <Label htmlFor="commit-message" className="text-sm font-medium">Commit Message</Label>
            <Input
              id="commit-message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Update design tokens"
              className="mt-1"
              data-testid="input-commit-message"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
