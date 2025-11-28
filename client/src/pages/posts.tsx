import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Eye,
  Calendar,
  Tag,
  FileText,
  ArrowUpDown
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Post, Repository } from "@shared/schema";

type SortOption = "date-desc" | "date-asc" | "title-asc" | "title-desc";
type FilterOption = "all" | "published" | "draft";

function PostCard({ 
  post, 
  onDelete 
}: { 
  post: Post; 
  onDelete: (slug: string) => void;
}) {
  return (
    <Card className="group hover-elevate">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {post.heroImage ? (
            <img 
              src={post.heroImage} 
              alt={post.title}
              className="w-24 h-24 rounded-md object-cover shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-md bg-muted flex items-center justify-center shrink-0">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-medium truncate" data-testid={`text-post-title-${post.slug}`}>
                    {post.title}
                  </h3>
                  {post.draft ? (
                    <Badge variant="secondary">Draft</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800">
                      Published
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {post.description || "No description provided"}
                </p>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="opacity-0 group-hover:opacity-100 shrink-0"
                    data-testid={`button-post-menu-${post.slug}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/posts/${post.slug}`} className="flex items-center">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/posts/${post.slug}/preview`} className="flex items-center">
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(post.slug)}
                    data-testid={`button-delete-post-${post.slug}`}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>{new Date(post.pubDate).toLocaleDateString()}</span>
              </div>
              {post.author && (
                <div className="flex items-center gap-1">
                  <span>by {typeof post.author === 'string' ? post.author : post.author.name}</span>
                </div>
              )}
              {post.tags && post.tags.length > 0 && (
                <div className="flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  <span>{post.tags.slice(0, 3).join(", ")}</span>
                  {post.tags.length > 3 && <span>+{post.tags.length - 3}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PostsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map(i => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Skeleton className="w-24 h-24 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/4 mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Posts() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("date-desc");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: postsData, isLoading } = useQuery<{ success: boolean; data: Post[] }>({
    queryKey: ["/api/posts"],
    enabled: !!repoData?.data,
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const response = await apiRequest("DELETE", `/api/posts/${slug}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Post Deleted",
        description: "The post has been removed from your repository",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setDeleteSlug(null);
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete the post",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;
  const posts = postsData?.data || [];

  // Filter posts
  let filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(search.toLowerCase()) ||
      post.description?.toLowerCase().includes(search.toLowerCase()) ||
      post.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
    
    const matchesFilter = filter === "all" || 
      (filter === "draft" && post.draft) ||
      (filter === "published" && !post.draft);

    return matchesSearch && matchesFilter;
  });

  // Sort posts
  filteredPosts = [...filteredPosts].sort((a, b) => {
    switch (sort) {
      case "date-desc":
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
      case "date-asc":
        return new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime();
      case "title-asc":
        return a.title.localeCompare(b.title);
      case "title-desc":
        return b.title.localeCompare(a.title);
      default:
        return 0;
    }
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Posts</h1>
          <p className="text-muted-foreground mt-1">
            Manage your blog posts
          </p>
        </div>
        <Link href="/posts/new">
          <Button data-testid="button-new-post">
            <Plus className="w-4 h-4 mr-2" />
            New Post
          </Button>
        </Link>
      </div>

      {!repository ? (
        <Card className="p-8">
          <div className="text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository from the sidebar to manage your posts.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search posts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-posts"
              />
            </div>
            
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterOption)}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Posts</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
              <SelectTrigger className="w-[160px]" data-testid="select-sort">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Newest First</SelectItem>
                <SelectItem value="date-asc">Oldest First</SelectItem>
                <SelectItem value="title-asc">Title A-Z</SelectItem>
                <SelectItem value="title-desc">Title Z-A</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <PostsSkeleton />
          ) : filteredPosts.length > 0 ? (
            <div className="space-y-4">
              {filteredPosts.map(post => (
                <PostCard 
                  key={post.path} 
                  post={post} 
                  onDelete={setDeleteSlug}
                />
              ))}
            </div>
          ) : (
            <Card className="p-8">
              <div className="text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-lg font-medium mb-2">
                  {search || filter !== "all" ? "No Matching Posts" : "No Posts Yet"}
                </h2>
                <p className="text-muted-foreground mb-4">
                  {search || filter !== "all" 
                    ? "Try adjusting your search or filters"
                    : "Create your first blog post to get started"}
                </p>
                {!search && filter === "all" && (
                  <Link href="/posts/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Post
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          )}

          <div className="text-sm text-muted-foreground text-center">
            Showing {filteredPosts.length} of {posts.length} posts
          </div>
        </>
      )}

      <AlertDialog open={!!deleteSlug} onOpenChange={() => setDeleteSlug(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action will commit
              the deletion to your repository and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSlug && deleteMutation.mutate(deleteSlug)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
