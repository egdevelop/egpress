import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Github, Eye, EyeOff, RefreshCw, ExternalLink, Shield, Zap, Database, Key } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function Login() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPATForm, setShowPATForm] = useState(false);
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  // Check if OAuth is configured
  const { data: oauthConfig } = useQuery<{ success: boolean; data: { oauthEnabled: boolean } }>({
    queryKey: ["/api/auth/github/config"],
  });

  const oauthEnabled = oauthConfig?.data?.oauthEnabled ?? false;

  // Check for error from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
      // Clean up URL
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  const handlePATSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setIsLoading(true);
    setError(null);

    const result = await login(token);
    
    if (result.success) {
      setLocation("/");
    } else {
      setError(result.error || "Failed to authenticate");
    }
    
    setIsLoading(false);
  };

  const handleGitHubOAuth = () => {
    window.location.href = '/api/auth/github';
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary/5 flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">EG</span>
            </div>
            <span className="text-2xl font-bold">EG Press</span>
          </div>
        </div>
        
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold leading-tight">
              Manage your blog
              <br />
              <span className="text-primary">with ease.</span>
            </h1>
            <p className="text-muted-foreground mt-4 text-lg max-w-md">
              A powerful CMS for managing your blog content with GitHub integration, 
              AI-powered writing, and seamless deployments.
            </p>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Github className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">GitHub Integration</p>
                <p className="text-sm text-muted-foreground">Direct sync with your repository</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">AI-Powered</p>
                <p className="text-sm text-muted-foreground">Generate content with Gemini AI</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Persistent Settings</p>
                <p className="text-sm text-muted-foreground">Your configs saved securely</p>
              </div>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground">
          Self-hosted Content Management System
        </p>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">EG</span>
              </div>
              <span className="text-2xl font-bold">EG Press</span>
            </div>
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-semibold" data-testid="text-login-title">Welcome</h2>
            <p className="text-muted-foreground">
              Connect your GitHub account to get started
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-login-error">
              {error}
            </div>
          )}

          <Card className="border-0 shadow-none lg:border lg:shadow-sm">
            <CardContent className="p-0 lg:p-6 space-y-4">
              {/* Primary: Login with GitHub OAuth */}
              {oauthEnabled ? (
                <Button
                  onClick={handleGitHubOAuth}
                  className="w-full h-11"
                  data-testid="button-login-github"
                >
                  <Github className="w-4 h-4 mr-2" />
                  Login with GitHub
                </Button>
              ) : (
                <div className="p-3 rounded-md bg-muted text-muted-foreground text-sm text-center">
                  GitHub OAuth not configured. Use Personal Access Token below.
                </div>
              )}

              {/* Divider */}
              {oauthEnabled && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>
              )}

              {/* Secondary: Personal Access Token */}
              <Collapsible open={showPATForm || !oauthEnabled} onOpenChange={setShowPATForm}>
                {oauthEnabled && (
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-10 text-sm"
                      data-testid="button-show-pat-form"
                    >
                      <Key className="w-4 h-4 mr-2" />
                      Use Personal Access Token
                    </Button>
                  </CollapsibleTrigger>
                )}
                
                <CollapsibleContent className="space-y-4 pt-4">
                  <form onSubmit={handlePATSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="token" className="text-sm font-medium flex items-center gap-2">
                        <Shield className="w-4 h-4 text-muted-foreground" />
                        Personal Access Token
                      </label>
                      <div className="relative">
                        <Input
                          id="token"
                          type={showToken ? "text" : "password"}
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          className="pr-11 h-11"
                          data-testid="input-login-token"
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setShowToken(!showToken)}
                          data-testid="button-toggle-token-visibility"
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      variant="secondary"
                      className="w-full h-11"
                      disabled={isLoading || !token.trim()}
                      data-testid="button-login-pat"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Github className="w-4 h-4 mr-2" />
                          Connect with Token
                        </>
                      )}
                    </Button>

                    <div>
                      <a
                        href="https://github.com/settings/tokens/new?scopes=repo&description=EG%20Press%20CMS"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        Create a new token with repo scope
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </form>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            {oauthEnabled 
              ? "You'll be redirected to GitHub to authorize EG Press."
              : "Your token is stored in your session and used only to access your repositories."
            }
          </p>
        </div>
      </div>
    </div>
  );
}
