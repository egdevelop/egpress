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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DollarSign, Monitor, Code, LayoutTemplate, Save, RefreshCw, FileCode, FileText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, AdsenseConfig } from "@shared/schema";

const adSlotSchema = z.object({
  slot: z.string(),
  format: z.string(),
  layout: z.string().optional(),
  responsive: z.boolean(),
});

const adsenseFormSchema = z.object({
  enabled: z.boolean(),
  publisherId: z.string(),
  autoAdsEnabled: z.boolean(),
  headerScript: z.string().optional(),
  adsTxt: z.string().optional(),
  adCodes: z.object({
    header: adSlotSchema,
    sidebar: adSlotSchema,
    inArticle: adSlotSchema,
    footer: adSlotSchema,
    beforeContent: adSlotSchema,
    afterContent: adSlotSchema,
  }),
});

type AdsenseFormValues = z.infer<typeof adsenseFormSchema>;

const defaultSlot = { slot: "", format: "auto", layout: "", responsive: true };

function AdSlotFields({ 
  name, 
  label, 
  description, 
  form,
  showLayout = false 
}: { 
  name: string; 
  label: string; 
  description: string;
  form: ReturnType<typeof useForm<AdsenseFormValues>>;
  showLayout?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription className="text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name={`adCodes.${name}.slot` as any}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slot ID</FormLabel>
              <FormControl>
                <Input
                  placeholder="1234567890"
                  {...field}
                  value={field.value || ""}
                  data-testid={`input-slot-${name}`}
                />
              </FormControl>
              <FormDescription>
                Ad unit slot ID from AdSense (data-ad-slot)
              </FormDescription>
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name={`adCodes.${name}.format` as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Format</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || "auto"}>
                  <FormControl>
                    <SelectTrigger data-testid={`select-format-${name}`}>
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="vertical">Vertical</SelectItem>
                    <SelectItem value="rectangle">Rectangle</SelectItem>
                    <SelectItem value="fluid">Fluid</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`adCodes.${name}.responsive` as any}
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <FormLabel className="text-sm">Responsive</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    data-testid={`switch-responsive-${name}`}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {showLayout && (
          <FormField
            control={form.control}
            name={`adCodes.${name}.layout` as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Layout</FormLabel>
                <Select 
                  onValueChange={(val) => field.onChange(val === "none" ? "" : val)} 
                  value={field.value || "none"}
                >
                  <FormControl>
                    <SelectTrigger data-testid={`select-layout-${name}`}>
                      <SelectValue placeholder="Select layout (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="in-article">In-Article</SelectItem>
                    <SelectItem value="in-feed">In-Feed</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Special layout for in-content ads
                </FormDescription>
              </FormItem>
            )}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function Adsense() {
  const { toast } = useToast();

  const { data: repoData } = useQuery<{ success: boolean; data: Repository | null }>({
    queryKey: ["/api/repository"],
  });

  const { data: adsenseData, isLoading } = useQuery<{ success: boolean; data: AdsenseConfig }>({
    queryKey: ["/api/adsense"],
    enabled: !!repoData?.data,
  });

  const getSlotValue = (data: AdsenseConfig | undefined, slotName: string) => {
    if (!data?.adCodes) return defaultSlot;
    const slotData = (data.adCodes as any)[slotName];
    if (!slotData) return defaultSlot;
    return {
      slot: slotData.slot ?? "",
      format: slotData.format ?? "auto",
      layout: slotData.layout ?? "",
      responsive: slotData.responsive ?? true,
    };
  };

  const form = useForm<AdsenseFormValues>({
    resolver: zodResolver(adsenseFormSchema),
    defaultValues: {
      enabled: false,
      publisherId: "",
      autoAdsEnabled: false,
      headerScript: "",
      adsTxt: "",
      adCodes: {
        header: defaultSlot,
        sidebar: defaultSlot,
        inArticle: { ...defaultSlot, format: "fluid", layout: "in-article" },
        footer: { ...defaultSlot, format: "horizontal" },
        beforeContent: defaultSlot,
        afterContent: defaultSlot,
      },
    },
    values: adsenseData?.data ? {
      enabled: adsenseData.data.enabled ?? false,
      publisherId: adsenseData.data.publisherId ?? "",
      autoAdsEnabled: adsenseData.data.autoAdsEnabled ?? false,
      headerScript: adsenseData.data.headerScript ?? "",
      adsTxt: adsenseData.data.adsTxt ?? "",
      adCodes: {
        header: getSlotValue(adsenseData.data, "header"),
        sidebar: getSlotValue(adsenseData.data, "sidebar"),
        inArticle: getSlotValue(adsenseData.data, "inArticle"),
        footer: getSlotValue(adsenseData.data, "footer"),
        beforeContent: getSlotValue(adsenseData.data, "beforeContent"),
        afterContent: getSlotValue(adsenseData.data, "afterContent"),
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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general" data-testid="tab-general">
                <Monitor className="w-4 h-4 mr-2" />
                General
              </TabsTrigger>
              <TabsTrigger value="scripts" data-testid="tab-scripts">
                <Code className="w-4 h-4 mr-2" />
                Scripts
              </TabsTrigger>
              <TabsTrigger value="placements" data-testid="tab-placements">
                <LayoutTemplate className="w-4 h-4 mr-2" />
                Placements
              </TabsTrigger>
              <TabsTrigger value="adstxt" data-testid="tab-adstxt">
                <FileText className="w-4 h-4 mr-2" />
                ads.txt
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
                    Paste the AdSense script code to be inserted in the {"<head>"} section
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
                          This script will be inserted into the {"<head>"} tag of every page
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="placements" className="space-y-6 mt-6">
              <div className="grid gap-6">
                <AdSlotFields 
                  name="header" 
                  label="Header Ad" 
                  description="Displayed at the top of pages, below the header navigation"
                  form={form}
                />
                
                <AdSlotFields 
                  name="beforeContent" 
                  label="Before Content Ad" 
                  description="Displayed before blog post content"
                  form={form}
                />
                
                <AdSlotFields 
                  name="inArticle" 
                  label="In-Article Ad" 
                  description="Displayed within blog post content"
                  form={form}
                  showLayout={true}
                />
                
                <AdSlotFields 
                  name="afterContent" 
                  label="After Content Ad" 
                  description="Displayed after blog post content"
                  form={form}
                />
                
                <AdSlotFields 
                  name="sidebar" 
                  label="Sidebar Ad" 
                  description="Displayed in the sidebar area"
                  form={form}
                />
                
                <AdSlotFields 
                  name="footer" 
                  label="Footer Ad" 
                  description="Displayed at the bottom of pages"
                  form={form}
                />
              </div>
            </TabsContent>

            <TabsContent value="adstxt" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    ads.txt File
                  </CardTitle>
                  <CardDescription>
                    Configure your ads.txt file for ad verification. This file will be saved to /public/ads.txt
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="adsTxt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ads.txt Content</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`}
                            className="font-mono text-sm min-h-[200px]"
                            {...field}
                            value={field.value || ""}
                            data-testid="textarea-ads-txt"
                          />
                        </FormControl>
                        <FormDescription>
                          Enter the content for your ads.txt file. Get this from your AdSense account under Sites {">"} Ads.txt.
                          <br />
                          Example: google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
                        </FormDescription>
                        <FormMessage />
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
