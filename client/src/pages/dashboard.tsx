import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  GitCommit, 
  Clock, 
  TrendingUp,
  Plus,
  ArrowRight,
  FolderOpen,
  Palette
} from "lucide-react";
import { Link } from "wouter";
import type { Post, Repository } from "@shared/schema";

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  loading 
}: { 
  title: string; 
  value: string | number; 
  description: string; 
  icon: React.ElementType; 
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s/g, '-')}`}>
            {value}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function RecentPostCard({ post }: { post: Post }) {
  return (
    <Link href={`/posts/${post.slug}`}>
      <div className="flex items-start gap-4 p-4 rounded-lg hover-elevate cursor-pointer border border-border/50">
        {post.heroImage ? (
          <img 
            src={post.heroImage} 
            alt={post.title}
            className="w-16 h-16 rounded-md object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm truncate" data-testid={`post-title-${post.slug}`}>
              {post.title}
            </h3>
            {post.draft && (
              <Badge variant="secondary" className="text-xs">Draft</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {post.description || "No description"}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {new Date(post.pubDate).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function QuickAction({ 
  title, 
  description, 
  icon: Icon, 
  href 
}: { 
  title: string; 
  description: string; 
  icon: React.ElementType; 
  href: string; 
}) {
  return (
    <Link href={href}>
      <div className="group flex items-center gap-4 p-4 rounded-lg border border-border/50 hover-elevate cursor-pointer">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: postsData, isLoading: postsLoading } = useQuery<{ success: boolean; data: Post[] }>({
    queryKey: ["/api/posts"],
    enabled: !!repoData?.data,
  });

  const repository = repoData?.data;
  const posts = postsData?.data || [];
  const publishedPosts = posts.filter(p => !p.draft);
  const draftPosts = posts.filter(p => p.draft);
  const recentPosts = [...posts].sort((a, b) => 
    new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  ).slice(0, 5);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {repository 
            ? `Managing ${repository.fullName}` 
            : "Connect a repository to get started"}
        </p>
      </div>

      {!repository ? (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <GitCommit className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Connect your Astro blog repository to start managing your content. 
              Enter the repository URL in the sidebar to get started.
            </p>
            <Badge variant="outline">
              Waiting for repository connection...
            </Badge>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Posts"
              value={posts.length}
              description="All blog posts"
              icon={FileText}
              loading={postsLoading}
            />
            <StatCard
              title="Published"
              value={publishedPosts.length}
              description="Live on your blog"
              icon={TrendingUp}
              loading={postsLoading}
            />
            <StatCard
              title="Drafts"
              value={draftPosts.length}
              description="Work in progress"
              icon={Clock}
              loading={postsLoading}
            />
            <StatCard
              title="Repository"
              value={repository.defaultBranch}
              description="Active branch"
              icon={GitCommit}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Recent Posts</CardTitle>
                  <CardDescription>Your latest blog posts</CardDescription>
                </div>
                <Link href="/posts/new">
                  <Button size="sm" data-testid="button-new-post-dashboard">
                    <Plus className="w-4 h-4 mr-2" />
                    New Post
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {postsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : recentPosts.length > 0 ? (
                  <div className="space-y-3">
                    {recentPosts.map(post => (
                      <RecentPostCard key={post.path} post={post} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No posts yet</p>
                    <Link href="/posts/new">
                      <Button variant="outline" className="mt-4">
                        Create Your First Post
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <QuickAction
                  title="New Post"
                  description="Create a new blog post"
                  icon={Plus}
                  href="/posts/new"
                />
                <QuickAction
                  title="Browse Files"
                  description="Explore repository files"
                  icon={FolderOpen}
                  href="/files"
                />
                <QuickAction
                  title="Theme Settings"
                  description="Customize colors and styles"
                  icon={Palette}
                  href="/theme"
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
