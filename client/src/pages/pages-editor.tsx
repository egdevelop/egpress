import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { 
  FileText, 
  Save, 
  X, 
  RefreshCw,
  Home,
  Mail,
  Info,
  Shield,
  FileCheck,
  File,
  Code,
  Type
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme-context";
import type { Repository, StaticPage, PageContent } from "@shared/schema";

interface ParsedContent {
  title: string;
  description: string;
  sections: Array<{
    id: string;
    type: "heading" | "paragraph" | "list";
    content: string;
    originalMatch: string;
  }>;
}

function parseAstroContent(content: string): ParsedContent {
  const result: ParsedContent = {
    title: "",
    description: "",
    sections: [],
  };

  const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ||
                    content.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  const h1Pattern = /<h1[^>]*>([^<]*)<\/h1>/gi;
  let h1Match;
  while ((h1Match = h1Pattern.exec(content)) !== null) {
    result.sections.push({
      id: `h1-${result.sections.length}`,
      type: "heading",
      content: h1Match[1].trim(),
      originalMatch: h1Match[0],
    });
  }

  const h2Pattern = /<h2[^>]*>([^<]*)<\/h2>/gi;
  let h2Match;
  while ((h2Match = h2Pattern.exec(content)) !== null) {
    result.sections.push({
      id: `h2-${result.sections.length}`,
      type: "heading",
      content: h2Match[1].trim(),
      originalMatch: h2Match[0],
    });
  }

  const pPattern = /<p[^>]*>([^<]+)<\/p>/gi;
  let pMatch;
  while ((pMatch = pPattern.exec(content)) !== null) {
    const text = pMatch[1].trim();
    if (text.length > 10 && !text.includes("{")) {
      result.sections.push({
        id: `p-${result.sections.length}`,
        type: "paragraph",
        content: text,
        originalMatch: pMatch[0],
      });
    }
  }

  return result;
}

function rebuildContent(originalContent: string, parsed: ParsedContent, updates: Record<string, string>): string {
  let newContent = originalContent;

  if (updates.title && parsed.title) {
    newContent = newContent.replace(
      /<title[^>]*>[^<]*<\/title>/i,
      `<title>${updates.title}</title>`
    );
  }

  if (updates.description !== undefined) {
    const descPattern1 = /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i;
    const descPattern2 = /<meta\s+content=["'][^"']*["']\s+name=["']description["']\s*\/?>/i;
    if (descPattern1.test(newContent)) {
      newContent = newContent.replace(descPattern1, `<meta name="description" content="${updates.description}" />`);
    } else if (descPattern2.test(newContent)) {
      newContent = newContent.replace(descPattern2, `<meta content="${updates.description}" name="description" />`);
    }
  }

  for (const section of parsed.sections) {
    if (updates[section.id] !== undefined) {
      const tagMatch = section.originalMatch.match(/^<(\w+)([^>]*)>/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const attrs = tagMatch[2];
        const newTag = `<${tag}${attrs}>${updates[section.id]}</${tag}>`;
        newContent = newContent.replace(section.originalMatch, newTag);
      }
    }
  }

  return newContent;
}

function getPageIcon(name: string) {
  switch (name.toLowerCase()) {
    case "index":
      return <Home className="w-4 h-4 text-primary" />;
    case "about":
      return <Info className="w-4 h-4 text-blue-500" />;
    case "contact":
      return <Mail className="w-4 h-4 text-green-500" />;
    case "privacy":
      return <Shield className="w-4 h-4 text-purple-500" />;
    case "terms":
    case "disclaimer":
      return <FileCheck className="w-4 h-4 text-orange-500" />;
    default:
      return <File className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function PagesEditor() {
  const [selectedPage, setSelectedPage] = useState<StaticPage | null>(null);
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [contentUpdates, setContentUpdates] = useState<Record<string, string>>({});
  const [commitMessage, setCommitMessage] = useState("");
  const [editorMode, setEditorMode] = useState<"content" | "code">("content");
  const [editorKey, setEditorKey] = useState(0);
  const { toast } = useToast();
  const { theme } = useTheme();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: pagesData, isLoading: pagesLoading } = useQuery<{ success: boolean; data: StaticPage[] }>({
    queryKey: ["/api/pages"],
    enabled: !!repoData?.data,
  });

  const { data: pageContentData, isLoading: contentLoading, refetch: refetchContent } = useQuery<{ success: boolean; data: PageContent }>({
    queryKey: ["/api/files/content", selectedPage?.path],
    queryFn: async () => {
      const response = await fetch(`/api/files/content?path=${encodeURIComponent(selectedPage!.path)}`);
      return response.json();
    },
    enabled: !!selectedPage?.path,
  });

  const parsedContent = useMemo(() => {
    if (!pageContentData?.data?.content) return null;
    return parseAstroContent(pageContentData.data.content);
  }, [pageContentData?.data?.content]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPage) return;
      
      let finalContent: string;
      
      if (editorMode === "code" && editedContent !== null) {
        finalContent = editedContent;
      } else if (editorMode === "content" && Object.keys(contentUpdates).length > 0 && parsedContent) {
        finalContent = rebuildContent(pageContentData!.data.content, parsedContent, contentUpdates);
      } else {
        return;
      }

      const response = await apiRequest("PUT", "/api/files/content", {
        path: selectedPage.path,
        content: finalContent,
        commitMessage: commitMessage || `Update ${selectedPage.name} page`,
      });
      return response.json();
    },
    onSuccess: async (data) => {
      if (data?.success) {
        toast({
          title: "Page Saved",
          description: "Changes have been committed to the repository",
        });
        setCommitMessage("");
        setContentUpdates({});
        queryClient.invalidateQueries({ queryKey: ["/api/pages"] });
        queryClient.invalidateQueries({ queryKey: ["/api/files"] });
        await refetchContent();
        setEditedContent(null);
        setEditorKey(k => k + 1);
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save page",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;
  const pages = pagesData?.data || [];
  const pageContent = pageContentData?.data;

  const hasCodeChanges = editedContent !== null && editedContent !== pageContent?.content;
  const hasContentChanges = Object.keys(contentUpdates).length > 0;
  const hasChanges = editorMode === "code" ? hasCodeChanges : hasContentChanges;

  const updateContentField = (id: string, value: string) => {
    setContentUpdates(prev => ({ ...prev, [id]: value }));
  };

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <div className="text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository to edit pages.
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
          <h1 className="text-xl font-semibold">Pages</h1>
          <p className="text-sm text-muted-foreground">Edit static pages content</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Unsaved Changes
            </Badge>
          )}
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <div className="h-full flex flex-col border-r border-border">
            <div className="p-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Static Pages
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {pagesLoading ? (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : pages.length > 0 ? (
                  pages.map(page => (
                    <div
                      key={page.path}
                      className={`flex items-center gap-2 p-3 rounded-md cursor-pointer ${
                        selectedPage?.path === page.path 
                          ? "bg-primary/10 text-primary border-l-2 border-primary" 
                          : "hover-elevate"
                      }`}
                      onClick={() => {
                        setSelectedPage(page);
                        setEditedContent(null);
                        setContentUpdates({});
                      }}
                      data-testid={`page-item-${page.name}`}
                    >
                      {getPageIcon(page.name)}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{page.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{page.path}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No pages found
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={75}>
          <div className="h-full flex flex-col">
            {selectedPage ? (
              <>
                <div className="p-3 border-b border-border flex items-center justify-between gap-4 bg-card">
                  <div className="flex items-center gap-2 min-w-0">
                    {getPageIcon(selectedPage.name)}
                    <span className="font-medium truncate" data-testid="text-selected-page">
                      {selectedPage.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as "content" | "code")}>
                      <TabsList className="h-8">
                        <TabsTrigger value="content" className="text-xs px-3" data-testid="tab-content-mode">
                          <Type className="w-3 h-3 mr-1" />
                          Content
                        </TabsTrigger>
                        <TabsTrigger value="code" className="text-xs px-3" data-testid="tab-code-mode">
                          <Code className="w-3 h-3 mr-1" />
                          Code
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    {hasChanges && (
                      <>
                        <Input
                          placeholder="Commit message..."
                          value={commitMessage}
                          onChange={(e) => setCommitMessage(e.target.value)}
                          className="w-48 h-8 text-sm"
                          data-testid="input-page-commit-message"
                        />
                        <Button
                          size="sm"
                          onClick={() => saveMutation.mutate()}
                          disabled={saveMutation.isPending}
                          data-testid="button-save-page"
                        >
                          {saveMutation.isPending ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-2" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditedContent(null);
                            setContentUpdates({});
                          }}
                          data-testid="button-discard-page-changes"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  {contentLoading ? (
                    <div className="p-6 space-y-4">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : pageContent ? (
                    editorMode === "content" ? (
                      <ScrollArea className="h-full">
                        <div className="p-6 space-y-6 max-w-3xl">
                          {parsedContent && (
                            <>
                              {parsedContent.title && (
                                <div className="space-y-2">
                                  <Label>Page Title</Label>
                                  <Input
                                    value={contentUpdates.title ?? parsedContent.title}
                                    onChange={(e) => updateContentField("title", e.target.value)}
                                    className="text-lg font-medium"
                                    data-testid="input-page-title"
                                  />
                                </div>
                              )}

                              {parsedContent.description && (
                                <div className="space-y-2">
                                  <Label>Meta Description</Label>
                                  <Textarea
                                    value={contentUpdates.description ?? parsedContent.description}
                                    onChange={(e) => updateContentField("description", e.target.value)}
                                    rows={2}
                                    data-testid="input-page-description"
                                  />
                                </div>
                              )}

                              {parsedContent.sections.length > 0 && (
                                <div className="space-y-4">
                                  <Label className="text-muted-foreground">Content Sections</Label>
                                  {parsedContent.sections.map((section) => (
                                    <Card key={section.id} className="p-4">
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className="text-xs">
                                            {section.type}
                                          </Badge>
                                        </div>
                                        {section.type === "heading" ? (
                                          <Input
                                            value={contentUpdates[section.id] ?? section.content}
                                            onChange={(e) => updateContentField(section.id, e.target.value)}
                                            className="font-medium"
                                            data-testid={`input-section-${section.id}`}
                                          />
                                        ) : (
                                          <Textarea
                                            value={contentUpdates[section.id] ?? section.content}
                                            onChange={(e) => updateContentField(section.id, e.target.value)}
                                            rows={3}
                                            data-testid={`input-section-${section.id}`}
                                          />
                                        )}
                                      </div>
                                    </Card>
                                  ))}
                                </div>
                              )}

                              {!parsedContent.title && !parsedContent.description && parsedContent.sections.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground">
                                  <Type className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                  <p>No editable content found</p>
                                  <p className="text-sm mt-1">Switch to Code mode to edit the raw file</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    ) : (
                      <Editor
                        key={editorKey}
                        height="100%"
                        language="html"
                        value={editedContent ?? pageContent.content}
                        onChange={(value) => setEditedContent(value || "")}
                        theme={theme === "dark" ? "vs-dark" : "light"}
                        options={{
                          minimap: { enabled: true },
                          fontSize: 13,
                          lineNumbers: "on",
                          wordWrap: "on",
                          scrollBeyondLastLine: false,
                          padding: { top: 16, bottom: 16 },
                          fontFamily: "JetBrains Mono, monospace",
                          renderLineHighlight: "all",
                        }}
                        data-testid="editor-page-content"
                      />
                    )
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Failed to load page content
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground">Select a page to edit</p>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
