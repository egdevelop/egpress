import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  File
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme-context";
import type { Repository, StaticPage, PageContent } from "@shared/schema";

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
  const [commitMessage, setCommitMessage] = useState("");
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPage || editedContent === null) return;
      const response = await apiRequest("PUT", "/api/files/content", {
        path: selectedPage.path,
        content: editedContent,
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

  const [editorKey, setEditorKey] = useState(0);

  const hasChanges = editedContent !== null && editedContent !== pageContent?.content;

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
          <p className="text-sm text-muted-foreground">Edit static pages like About, Contact, Privacy</p>
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
                    <Badge variant="outline" className="font-mono text-xs">
                      .astro
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasChanges && (
                      <>
                        <Input
                          placeholder="Commit message..."
                          value={commitMessage}
                          onChange={(e) => setCommitMessage(e.target.value)}
                          className="w-64 h-8 text-sm"
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
                          onClick={() => setEditedContent(null)}
                          data-testid="button-discard-page-changes"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Discard
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  {contentLoading ? (
                    <div className="p-6 space-y-4">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  ) : pageContent ? (
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
