import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  RefreshCw
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ThemeSettings, Repository } from "@shared/schema";

const defaultTheme: ThemeSettings = {
  primary: "#FF5D01",
  secondary: "#0C0C0C",
  background: "#FAFAFA",
  text: "#1E293B",
  accent: "#8B5CF6",
  success: "#10B981",
};

const colorLabels: Record<keyof ThemeSettings, { label: string; description: string }> = {
  primary: { label: "Primary", description: "Main brand color, used for CTAs and links" },
  secondary: { label: "Secondary", description: "Dark background color for headers" },
  background: { label: "Background", description: "Main page background color" },
  text: { label: "Text", description: "Primary text color for content" },
  accent: { label: "Accent", description: "Highlight color for special elements" },
  success: { label: "Success", description: "Color for success states and badges" },
};

function ColorSwatch({
  colorKey,
  value,
  onChange,
}: {
  colorKey: keyof ThemeSettings;
  value: string;
  onChange: (key: keyof ThemeSettings, value: string) => void;
}) {
  const { label, description } = colorLabels[colorKey];

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border border-border">
      <div className="relative">
        <div
          className="w-16 h-16 rounded-md border border-border shadow-sm"
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(colorKey, e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          data-testid={`color-picker-${colorKey}`}
        />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Label className="font-medium">{label}</Label>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <Input
          value={value}
          onChange={(e) => onChange(colorKey, e.target.value)}
          className="font-mono text-sm h-8"
          data-testid={`input-color-${colorKey}`}
        />
      </div>
    </div>
  );
}

function PreviewPane({ theme }: { theme: ThemeSettings }) {
  return (
    <div 
      className="h-full overflow-auto"
      style={{ 
        backgroundColor: theme.background,
        color: theme.text,
      }}
    >
      {/* Header Preview */}
      <div 
        className="p-6"
        style={{ backgroundColor: theme.secondary }}
      >
        <div className="max-w-4xl mx-auto">
          <h1 
            className="text-2xl font-bold mb-2"
            style={{ color: "#fff" }}
          >
            My Astro Blog
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>
            A beautiful blog built with Astro
          </p>
        </div>
      </div>

      {/* Nav Preview */}
      <div className="border-b" style={{ borderColor: `${theme.text}20` }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex gap-6">
          {["Home", "Blog", "About"].map(item => (
            <a 
              key={item} 
              href="#"
              className="text-sm font-medium hover:opacity-80 transition-opacity"
              style={{ color: item === "Blog" ? theme.primary : theme.text }}
            >
              {item}
            </a>
          ))}
        </div>
      </div>

      {/* Content Preview */}
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Featured Post */}
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: `${theme.text}20` }}>
          <div 
            className="h-48 flex items-center justify-center"
            style={{ backgroundColor: `${theme.primary}15` }}
          >
            <FileText style={{ color: theme.primary }} className="w-16 h-16" />
          </div>
          <div className="p-6" style={{ backgroundColor: theme.background }}>
            <div className="flex items-center gap-2 mb-3">
              <Badge 
                style={{ 
                  backgroundColor: `${theme.success}20`, 
                  color: theme.success,
                  border: `1px solid ${theme.success}40`
                }}
              >
                Featured
              </Badge>
              <Badge 
                variant="outline"
                style={{ 
                  borderColor: `${theme.accent}40`,
                  color: theme.accent 
                }}
              >
                Tutorial
              </Badge>
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: theme.text }}>
              Getting Started with Astro
            </h2>
            <p className="mb-4" style={{ color: `${theme.text}99` }}>
              Learn how to build blazing-fast websites with the Astro framework. 
              This comprehensive guide covers everything you need to know.
            </p>
            <div className="flex items-center gap-4 text-sm" style={{ color: `${theme.text}70` }}>
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
          <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
            Recent Posts
          </h3>
          {[1, 2, 3].map(i => (
            <div 
              key={i} 
              className="p-4 rounded-lg border flex gap-4"
              style={{ borderColor: `${theme.text}20` }}
            >
              <div 
                className="w-20 h-20 rounded shrink-0 flex items-center justify-center"
                style={{ backgroundColor: `${theme.accent}15` }}
              >
                <FileText style={{ color: theme.accent }} className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium mb-1" style={{ color: theme.text }}>
                  Blog Post Title {i}
                </h4>
                <p className="text-sm mb-2 line-clamp-2" style={{ color: `${theme.text}70` }}>
                  A brief description of the blog post content that gives readers 
                  an idea of what to expect.
                </p>
                <div className="flex items-center gap-2">
                  <Tag className="w-3 h-3" style={{ color: theme.primary }} />
                  <span className="text-xs" style={{ color: theme.primary }}>
                    astro, web
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Button Preview */}
        <div className="flex items-center gap-3 flex-wrap">
          <button 
            className="px-4 py-2 rounded-md font-medium text-sm"
            style={{ 
              backgroundColor: theme.primary, 
              color: "#fff" 
            }}
          >
            Primary Button
          </button>
          <button 
            className="px-4 py-2 rounded-md font-medium text-sm border"
            style={{ 
              borderColor: theme.primary, 
              color: theme.primary 
            }}
          >
            Outline Button
          </button>
          <button 
            className="px-4 py-2 rounded-md font-medium text-sm"
            style={{ 
              backgroundColor: theme.accent, 
              color: "#fff" 
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
  const [theme, setTheme] = useState<ThemeSettings>(defaultTheme);
  const [commitMessage, setCommitMessage] = useState("Update theme configuration");
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: themeData, isLoading } = useQuery<{ success: boolean; data: ThemeSettings }>({
    queryKey: ["/api/theme"],
    enabled: !!repoData?.data,
  });

  useEffect(() => {
    if (themeData?.data) {
      setTheme(themeData.data);
    }
  }, [themeData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/theme", {
        theme,
        commitMessage,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast({
          title: "Theme Saved",
          description: "Your theme changes have been committed to the repository",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/theme"] });
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

  const handleColorChange = (key: keyof ThemeSettings, value: string) => {
    setTheme(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setTheme(defaultTheme);
    toast({
      title: "Theme Reset",
      description: "Colors have been reset to defaults",
    });
  };

  const repository = repoData?.data;
  const hasChanges = JSON.stringify(theme) !== JSON.stringify(themeData?.data || defaultTheme);

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

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 p-4 border-b border-border flex items-center justify-between gap-4 bg-background">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Theme Customizer
          </h1>
          <p className="text-sm text-muted-foreground">
            Customize your blog's color scheme
          </p>
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
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasChanges}
            data-testid="button-save-theme"
          >
            {saveMutation.isPending ? (
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
              <Card>
                <CardHeader>
                  <CardTitle>Color Palette</CardTitle>
                  <CardDescription>
                    Click color swatches or enter hex values to customize
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(Object.keys(colorLabels) as Array<keyof ThemeSettings>).map(key => (
                    <ColorSwatch
                      key={key}
                      colorKey={key}
                      value={theme[key]}
                      onChange={handleColorChange}
                    />
                  ))}
                </CardContent>
              </Card>

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
              <PreviewPane theme={theme} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
