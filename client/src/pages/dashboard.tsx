import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  GitCommit, 
  Clock, 
  TrendingUp,
  Plus,
  ArrowRight,
  FolderOpen,
  Palette,
  Check,
  Circle,
  Rocket,
  Search,
  Sparkles,
  ExternalLink,
  Github
} from "lucide-react";
import { Link } from "wouter";
import { getGitHubImageUrl } from "@/lib/utils";
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

function RecentPostCard({ post, repoFullName, branch }: { post: Post; repoFullName?: string; branch?: string }) {
  const imageUrl = getGitHubImageUrl(post.heroImage, repoFullName, branch || "main");
  
  return (
    <Link href={`/posts/${post.slug}`}>
      <div className="flex items-start gap-4 p-4 rounded-lg hover-elevate cursor-pointer border border-border/50">
        {imageUrl ? (
          <img 
            src={imageUrl} 
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

  const { data: vercelData } = useQuery<{ success: boolean; data: { hasToken: boolean; project?: { id: string; name: string } } }>({
    queryKey: ["/api/vercel/config"],
    enabled: !!repoData?.data,
  });

  const { data: gscData } = useQuery<{ success: boolean; data: { hasCredentials: boolean; siteUrl?: string } | null }>({
    queryKey: ["/api/search-console/config"],
    enabled: !!repoData?.data,
  });

  const { data: geminiData } = useQuery<{ success: boolean; data: { hasKey: boolean } }>({
    queryKey: ["/api/ai/key"],
    enabled: !!repoData?.data,
  });

  const repository = repoData?.data;
  const posts = postsData?.data || [];
  const publishedPosts = posts.filter(p => !p.draft);
  const draftPosts = posts.filter(p => p.draft);
  const recentPosts = [...posts].sort((a, b) => 
    new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  ).slice(0, 5);

  const vercelConnected = vercelData?.data?.hasToken && vercelData?.data?.project;
  const gscConnected = gscData?.data?.hasCredentials && gscData?.data?.siteUrl;
  const geminiConnected = geminiData?.data?.hasKey;
  const hasContent = posts.length > 0;

  const setupSteps = [
    { id: 'repo', title: 'Connect Repository', done: !!repository, href: '/' },
    { id: 'content', title: 'Create First Post', done: hasContent, href: '/posts/new' },
    { id: 'vercel', title: 'Setup Vercel Deploy', done: vercelConnected, href: '/vercel' },
    { id: 'gsc', title: 'Add Search Console', done: gscConnected, href: '/search-console', optional: true },
    { id: 'ai', title: 'Enable AI Generator', done: geminiConnected, href: '/ai', optional: true },
  ];
  
  const completedSteps = setupSteps.filter(s => s.done).length;
  const totalRequired = setupSteps.filter(s => !s.optional).length;
  const requiredCompleted = setupSteps.filter(s => !s.optional && s.done).length;

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
        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shrink-0">
                  <Github className="w-8 h-8 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2">Welcome to EG Press!</h2>
                  <p className="text-muted-foreground mb-4">
                    Let's get your blog set up. Select a repository from the sidebar to connect your Astro blog template.
                  </p>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="gap-1">
                      <Circle className="w-2 h-2 fill-amber-500 text-amber-500" />
                      Step 1 of 3
                    </Badge>
                    <span className="text-sm text-muted-foreground">Connect Repository</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">1</span>
                  </div>
                  <CardTitle className="text-base">Connect Repository</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Select your Astro blog repository from the dropdown in the sidebar.
                </p>
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <Circle className="w-2 h-2 fill-current mr-1" />
                  Current Step
                </Badge>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-bold text-muted-foreground">2</span>
                  </div>
                  <CardTitle className="text-base">Create Content</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Write blog posts, customize theme colors, and configure your site branding.
                </p>
                <Badge variant="secondary">
                  Upcoming
                </Badge>
              </CardContent>
            </Card>

            <Card className="opacity-60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-bold text-muted-foreground">3</span>
                  </div>
                  <CardTitle className="text-base">Deploy & Go Live</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Connect Vercel to deploy your site and make it accessible to the world.
                </p>
                <Badge variant="secondary">
                  Upcoming
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Getting Started Guide</CardTitle>
              <CardDescription>Quick tips to help you set up EG Press</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Github className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Need a blog template?</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    EG Press works best with Astro blog templates. You can fork a starter template to get started.
                  </p>
                  <a
                    href="https://github.com/topics/astro-blog"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Browse Astro Blog Templates
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">AI Content Generation</p>
                    <p className="text-xs text-muted-foreground">Generate posts with Gemini AI</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                  <Rocket className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">One-Click Deploy</p>
                    <p className="text-xs text-muted-foreground">Deploy to Vercel instantly</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                  <Search className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">SEO Tools</p>
                    <p className="text-xs text-muted-foreground">Google Search Console integration</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50">
                  <Palette className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Theme Customization</p>
                    <p className="text-xs text-muted-foreground">Personalize colors and branding</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
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
                      <RecentPostCard 
                        key={post.path} 
                        post={post} 
                        repoFullName={repository?.fullName}
                        branch={repository?.activeBranch}
                      />
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

            <div className="space-y-4">
              {requiredCompleted < totalRequired && (
                <Card className="border-primary/20">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Setup Progress</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {completedSteps}/{setupSteps.length}
                      </Badge>
                    </div>
                    <Progress value={(completedSteps / setupSteps.length) * 100} className="h-1.5 mt-2" />
                  </CardHeader>
                  <CardContent className="pt-2 space-y-2">
                    {setupSteps.map((step) => (
                      <Link key={step.id} href={step.href}>
                        <div className={`flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer ${step.done ? 'opacity-60' : ''}`}>
                          {step.done ? (
                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                              <Circle className="w-2 h-2 fill-primary text-primary" />
                            </div>
                          )}
                          <span className={`text-sm flex-1 ${step.done ? 'line-through text-muted-foreground' : 'font-medium'}`}>
                            {step.title}
                          </span>
                          {step.optional && !step.done && (
                            <Badge variant="outline" className="text-xs">Optional</Badge>
                          )}
                          {!step.done && (
                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}

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
          </div>
        </>
      )}
    </div>
  );
}
