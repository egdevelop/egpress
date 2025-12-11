import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DollarSign, Monitor, Code, LayoutTemplate, Save, RefreshCw, FileCode, Columns } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, AdsenseConfig } from "@shared/schema";

const adsenseFormSchema = z.object({
  enabled: z.boolean(),
  publisherId: z.string(),
  autoAdsEnabled: z.boolean(),
  headerScript: z.string().optional(),
  adCodes: z.object({
    header: z.string().optional(),
    sidebar: z.string().optional(),
    inArticle: z.string().optional(),
    footer: z.string().optional(),
    beforeContent: z.string().optional(),
    afterContent: z.string().optional(),
  }),
  slots: z.object({
    header: z.string().optional(),
    sidebar: z.string().optional(),
    inArticle: z.string().optional(),
    footer: z.string().optional(),
  }),
});

type AdsenseFormValues = z.infer<typeof adsenseFormSchema>;

export default function Adsense() {
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: adsenseData, isLoading } = useQuery<{ success: boolean; data: AdsenseConfig }>({
    queryKey: ["/api/adsense"],
    enabled: !!repoData?.data,
  });

  const form = useForm<AdsenseFormValues>({
    resolver: zodResolver(adsenseFormSchema),
    defaultValues: {
      enabled: false,
      publisherId: "",
      autoAdsEnabled: false,
      headerScript: "",
      adCodes: {
        header: "",
        sidebar: "",
        inArticle: "",
        footer: "",
        beforeContent: "",
        afterContent: "",
      },
      slots: {
        header: "",
        sidebar: "",
        inArticle: "",
        footer: "",
      },
    },
    values: adsenseData?.data ? {
      enabled: adsenseData.data.enabled ?? false,
      publisherId: adsenseData.data.publisherId ?? "",
      autoAdsEnabled: adsenseData.data.autoAdsEnabled ?? false,
      headerScript: adsenseData.data.headerScript ?? "",
      adCodes: {
        header: adsenseData.data.adCodes?.header ?? "",
        sidebar: adsenseData.data.adCodes?.sidebar ?? "",
        inArticle: adsenseData.data.adCodes?.inArticle ?? "",
        footer: adsenseData.data.adCodes?.footer ?? "",
        beforeContent: adsenseData.data.adCodes?.beforeContent ?? "",
        afterContent: adsenseData.data.adCodes?.afterContent ?? "",
      },
      slots: {
        header: adsenseData.data.slots?.header ?? "",
        sidebar: adsenseData.data.slots?.sidebar ?? "",
        inArticle: adsenseData.data.slots?.inArticle ?? "",
        footer: adsenseData.data.slots?.footer ?? "",
      },
    } : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: AdsenseFormValues) => {
      const response = await apiRequest("PUT", "/api/adsense", data);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "AdSense Saved",
          description: "Configuration has been committed to the repository",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/adsense"] });
      } else {
        toast({
          title: "Save Failed",
          description: data.error || "Failed to save configuration",
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
            <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Repository Connected</h2>
            <p className="text-muted-foreground">
              Connect a repository to configure AdSense.
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">AdSense Manager</h1>
          <p className="text-muted-foreground mt-1">
            Configure Google AdSense for your blog
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <DollarSign className="w-3 h-3" />
          Monetization
        </Badge>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general" data-testid="tab-general">
                <Monitor className="w-4 h-4 mr-2" />
                General
              </TabsTrigger>
              <TabsTrigger value="scripts" data-testid="tab-scripts">
                <Code className="w-4 h-4 mr-2" />
                Scripts
              </TabsTrigger>
              <TabsTrigger value="placements" data-testid="tab-placements">
                <Columns className="w-4 h-4 mr-2" />
                Placements
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="w-5 h-5" />
                    General Settings
                  </CardTitle>
                  <CardDescription>
                    Configure your AdSense publisher ID and auto ads
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Enable AdSense</FormLabel>
                          <FormDescription>
                            Turn on AdSense ads on your blog
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-adsense-enabled"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="publisherId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Publisher ID</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="ca-pub-XXXXXXXXXX"
                            {...field}
                            data-testid="input-publisher-id"
                          />
                        </FormControl>
                        <FormDescription>
                          Your Google AdSense publisher ID (starts with ca-pub-)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="autoAdsEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Auto Ads</FormLabel>
                          <FormDescription>
                            Let Google automatically place ads on your site
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-auto-ads"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="scripts" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCode className="w-5 h-5" />
                    Header Script
                  </CardTitle>
                  <CardDescription>
                    Paste the AdSense script code to be inserted in the {"<head>"} section of your site
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="headerScript"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>AdSense Header Script</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXX" crossorigin="anonymous"></script>`}
                            className="font-mono text-sm min-h-[120px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-header-script"
                          />
                        </FormControl>
                        <FormDescription>
                          This script will be inserted into the {"<head>"} tag of every page. Get this code from your AdSense dashboard.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="placements" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutTemplate className="w-5 h-5" />
                    Ad Placements
                  </CardTitle>
                  <CardDescription>
                    Paste the full ad code for each placement. These codes will be inserted into your template.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="adCodes.header"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Header Ad</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={`<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-XXXXXXXX"
     data-ad-slot="XXXXXXXX"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script>`}
                            className="font-mono text-sm min-h-[150px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-ad-header"
                          />
                        </FormControl>
                        <FormDescription>
                          Ad displayed at the top of pages, below the header navigation
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="adCodes.beforeContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Before Content Ad</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste your ad code here..."
                            className="font-mono text-sm min-h-[150px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-ad-before-content"
                          />
                        </FormControl>
                        <FormDescription>
                          Ad displayed before blog post content
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="adCodes.inArticle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>In-Article Ad</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste your ad code here..."
                            className="font-mono text-sm min-h-[150px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-ad-in-article"
                          />
                        </FormControl>
                        <FormDescription>
                          Ad displayed within blog post content (between paragraphs)
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="adCodes.afterContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>After Content Ad</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste your ad code here..."
                            className="font-mono text-sm min-h-[150px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-ad-after-content"
                          />
                        </FormControl>
                        <FormDescription>
                          Ad displayed after blog post content
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="adCodes.sidebar"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sidebar Ad</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste your ad code here..."
                            className="font-mono text-sm min-h-[150px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-ad-sidebar"
                          />
                        </FormControl>
                        <FormDescription>
                          Ad displayed in the sidebar area
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="adCodes.footer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Footer Ad</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste your ad code here..."
                            className="font-mono text-sm min-h-[150px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-ad-footer"
                          />
                        </FormControl>
                        <FormDescription>
                          Ad displayed at the bottom of pages, above the footer
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save-adsense"
            >
              {saveMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Configuration
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
