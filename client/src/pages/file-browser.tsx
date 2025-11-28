import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { 
  ChevronRight, 
  ChevronDown, 
  File, 
  Folder, 
  FolderOpen,
  FileText,
  Image as ImageIcon,
  FileCode,
  FileJson,
  Save,
  X,
  GitCommit,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme-context";
import type { FileTreeItem, Repository, PageContent } from "@shared/schema";

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
    case "mdx":
      return <FileText className="w-4 h-4 text-blue-500" />;
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "svg":
    case "webp":
      return <ImageIcon className="w-4 h-4 text-green-500" />;
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
      return <FileCode className="w-4 h-4 text-yellow-500" />;
    case "json":
      return <FileJson className="w-4 h-4 text-orange-500" />;
    case "astro":
      return <FileCode className="w-4 h-4 text-purple-500" />;
    default:
      return <File className="w-4 h-4 text-muted-foreground" />;
  }
}

function getLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
    case "mdx":
      return "markdown";
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "astro":
      return "html";
    case "yaml":
    case "yml":
      return "yaml";
    default:
      return "plaintext";
  }
}

function FileTreeNode({
  item,
  depth = 0,
  selectedPath,
  onSelect,
  expandedPaths,
  onToggleExpand,
}: {
  item: FileTreeItem;
  depth?: number;
  selectedPath: string | null;
  onSelect: (path: string, type: "file" | "dir") => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
}) {
  const isExpanded = expandedPaths.has(item.path);
  const isSelected = selectedPath === item.path;
  const isDirectory = item.type === "dir";

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded-md text-sm ${
          isSelected 
            ? "bg-primary/10 text-primary border-l-2 border-primary" 
            : "hover-elevate"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isDirectory) {
            onToggleExpand(item.path);
          } else {
            onSelect(item.path, item.type);
          }
        }}
        data-testid={`file-tree-item-${item.path.replace(/\//g, '-')}`}
      >
        {isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-amber-500 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            {getFileIcon(item.name)}
          </>
        )}
        <span className="truncate font-mono text-xs">{item.name}</span>
      </div>
      
      {isDirectory && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileBrowser() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(["src", "src/content", "src/content/blog"]));
  const [editedContent, setEditedContent] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const { toast } = useToast();
  const { theme } = useTheme();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: filesData, isLoading: filesLoading } = useQuery<{ success: boolean; data: FileTreeItem[] }>({
    queryKey: ["/api/files"],
    enabled: !!repoData?.data,
  });

  const { data: fileContentData, isLoading: contentLoading } = useQuery<{ success: boolean; data: PageContent }>({
    queryKey: ["/api/files/content", selectedPath],
    queryFn: async () => {
      const response = await fetch(`/api/files/content?path=${encodeURIComponent(selectedPath!)}`);
      return response.json();
    },
    enabled: !!selectedPath,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPath || editedContent === null) return;
      const response = await apiRequest("PUT", "/api/files/content", {
        path: selectedPath,
        content: editedContent,
        commitMessage: commitMessage || `Update ${selectedPath}`,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast({
          title: "File Saved",
          description: "Changes have been committed to the repository",
        });
        setEditedContent(null);
        setCommitMessage("");
        queryClient.invalidateQueries({ queryKey: ["/api/files/content", selectedPath] });
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save file",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;
  const files = filesData?.data || [];
  const fileContent = fileContentData?.data;

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelect = (path: string, type: "file" | "dir") => {
    if (type === "file") {
      setSelectedPath(path);
      setEditedContent(null);
    }
  };

  const hasChanges = editedContent !== null && editedContent !== fileContent?.content;

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <div className="text-center">
            <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository from the sidebar to browse files.
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
          <h1 className="text-xl font-semibold">File Browser</h1>
          <p className="text-sm text-muted-foreground">{repository.fullName}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Unsaved Changes
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/files"] })}
            data-testid="button-refresh-files"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <div className="h-full flex flex-col border-r border-border">
            <div className="p-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Repository Files
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2">
                {filesLoading ? (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : files.length > 0 ? (
                  files.map(item => (
                    <FileTreeNode
                      key={item.path}
                      item={item}
                      selectedPath={selectedPath}
                      onSelect={handleSelect}
                      expandedPaths={expandedPaths}
                      onToggleExpand={toggleExpand}
                    />
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No files found
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={75}>
          <div className="h-full flex flex-col">
            {selectedPath ? (
              <>
                <div className="p-3 border-b border-border flex items-center justify-between gap-4 bg-card">
                  <div className="flex items-center gap-2 min-w-0">
                    {getFileIcon(selectedPath.split("/").pop() || "")}
                    <span className="font-mono text-sm truncate" data-testid="text-selected-file">
                      {selectedPath}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasChanges && (
                      <>
                        <Input
                          placeholder="Commit message..."
                          value={commitMessage}
                          onChange={(e) => setCommitMessage(e.target.value)}
                          className="w-64 h-8 text-sm"
                          data-testid="input-file-commit-message"
                        />
                        <Button
                          size="sm"
                          onClick={() => saveMutation.mutate()}
                          disabled={saveMutation.isPending}
                          data-testid="button-save-file"
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
                          data-testid="button-discard-changes"
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
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ) : fileContent ? (
                    <Editor
                      height="100%"
                      language={getLanguage(selectedPath)}
                      value={editedContent ?? fileContent.content}
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
                      data-testid="editor-file-content"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Failed to load file content
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <File className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                  <p className="text-muted-foreground">Select a file to view or edit</p>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
