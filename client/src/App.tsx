import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import Dashboard from "@/pages/dashboard";
import Posts from "@/pages/posts";
import PostEditor from "@/pages/post-editor";
import FileBrowser from "@/pages/file-browser";
import ThemePage from "@/pages/theme";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import Adsense from "@/pages/adsense";
import Branding from "@/pages/branding";
import PagesEditor from "@/pages/pages-editor";
import CloneSite from "@/pages/clone-site";
import AIGenerator from "@/pages/ai-generator";
import SearchConsole from "@/pages/search-console";
import VercelPage from "@/pages/vercel";
import ContentDefaultsPage from "@/pages/content-defaults";
import PerformancePage from "@/pages/performance";
import Login from "@/pages/login";
import { Loader2 } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/posts" component={Posts} />
      <Route path="/posts/:slug" component={PostEditor} />
      <Route path="/files" component={FileBrowser} />
      <Route path="/theme" component={ThemePage} />
      <Route path="/pages" component={PagesEditor} />
      <Route path="/branding" component={Branding} />
      <Route path="/adsense" component={Adsense} />
      <Route path="/ai" component={AIGenerator} />
      <Route path="/search-console" component={SearchConsole} />
      <Route path="/vercel" component={VercelPage} />
      <Route path="/content-defaults" component={ContentDefaultsPage} />
      <Route path="/clone" component={CloneSite} />
      <Route path="/performance" component={PerformancePage} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-2 border-b border-border shrink-0 bg-background sticky top-0 z-20">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
