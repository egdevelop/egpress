import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Palette, Globe, Save, RefreshCw, Link2, Type } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository } from "@shared/schema";
import { useEffect } from "react";

const brandingFormSchema = z.object({
  siteName: z.string().min(1, "Site name is required"),
  logoLetter: z.string().max(2, "Max 2 characters"),
  description: z.string(),
  socialLinks: z.object({
    twitter: z.string().optional(),
    linkedin: z.string().optional(),
    facebook: z.string().optional(),
  }),
});

type BrandingFormValues = z.infer<typeof brandingFormSchema>;

interface BrandingData {
  siteName: string;
  logoLetter: string;
  description: string;
  socialLinks: {
    twitter: string;
    linkedin: string;
    facebook: string;
  };
  headerContent: string;
  footerContent: string;
}

export default function Branding() {
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: brandingData, isLoading } = useQuery<{ success: boolean; data: BrandingData | null }>({
    queryKey: ["/api/branding"],
    enabled: !!repoData?.data,
  });

  const form = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingFormSchema),
    defaultValues: {
      siteName: "",
      logoLetter: "",
      description: "",
      socialLinks: {
        twitter: "",
        linkedin: "",
        facebook: "",
      },
    },
  });

  useEffect(() => {
    if (brandingData?.data) {
      form.reset({
        siteName: brandingData.data.siteName || "",
        logoLetter: brandingData.data.logoLetter || "",
        description: brandingData.data.description || "",
        socialLinks: {
          twitter: brandingData.data.socialLinks?.twitter || "",
          linkedin: brandingData.data.socialLinks?.linkedin || "",
          facebook: brandingData.data.socialLinks?.facebook || "",
        },
      });
    }
  }, [brandingData, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: BrandingFormValues) => {
      const response = await apiRequest("PUT", "/api/branding", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Branding Saved",
          description: "Header.astro and Footer.astro have been updated",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save branding",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "An error occurred while saving",
        variant: "destructive",
      });
    },
  });

  const repository = repoData?.data;

  if (!repository) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-8">
          <div className="text-center">
            <Palette className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository to configure branding.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Branding</h1>
        <p className="text-muted-foreground mt-1">
          Edit Header.astro and Footer.astro directly
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Site Identity
              </CardTitle>
              <CardDescription>
                Updates Header.astro and Footer.astro
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="siteName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="My Blog"
                          {...field}
                          data-testid="input-site-name"
                        />
                      </FormControl>
                      <FormDescription>
                        Appears in header, footer, and copyright
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="logoLetter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Logo Letter</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="R"
                          maxLength={2}
                          {...field}
                          data-testid="input-logo-letter"
                        />
                      </FormControl>
                      <FormDescription>
                        Letter shown in the logo box (1-2 chars)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Footer Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="A short description about your site..."
                        rows={3}
                        {...field}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormDescription>
                      Shown in the footer below the logo
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5" />
                Social Links
              </CardTitle>
              <CardDescription>
                Social media links in footer
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="socialLinks.twitter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Twitter/X</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://twitter.com/username"
                        {...field}
                        data-testid="input-social-twitter"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="socialLinks.linkedin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://linkedin.com/in/username"
                        {...field}
                        data-testid="input-social-linkedin"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="socialLinks.facebook"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Facebook</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://facebook.com/page"
                        {...field}
                        data-testid="input-social-facebook"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {brandingData?.data?.headerContent && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="w-5 h-5" />
                  Current Files
                </CardTitle>
                <CardDescription>
                  Preview of your component files
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Header.astro</p>
                  <div className="bg-muted p-3 rounded-md max-h-32 overflow-auto">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {brandingData.data.headerContent.slice(0, 500)}...
                    </pre>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Footer.astro</p>
                  <div className="bg-muted p-3 rounded-md max-h-32 overflow-auto">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {brandingData.data.footerContent.slice(0, 500)}...
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save-branding"
            >
              {saveMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save to GitHub
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
