import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DollarSign, Monitor, FileText, LayoutTemplate, Save, RefreshCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Repository, AdsenseConfig } from "@shared/schema";

const adsenseFormSchema = z.object({
  enabled: z.boolean(),
  publisherId: z.string(),
  autoAdsEnabled: z.boolean(),
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
      slots: {
        header: "",
        sidebar: "",
        inArticle: "",
        footer: "",
      },
    },
    values: adsenseData?.data ? {
      enabled: adsenseData.data.enabled,
      publisherId: adsenseData.data.publisherId,
      autoAdsEnabled: adsenseData.data.autoAdsEnabled,
      slots: adsenseData.data.slots || {},
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5" />
                Ad Slots
              </CardTitle>
              <CardDescription>
                Configure specific ad unit IDs for different placements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="slots.header"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Header Ad Slot</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ad unit ID for header"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-slot-header"
                      />
                    </FormControl>
                    <FormDescription>
                      Displayed at the top of the page
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slots.sidebar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sidebar Ad Slot</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ad unit ID for sidebar"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-slot-sidebar"
                      />
                    </FormControl>
                    <FormDescription>
                      Displayed in the sidebar area
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slots.inArticle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>In-Article Ad Slot</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ad unit ID for in-article ads"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-slot-in-article"
                      />
                    </FormControl>
                    <FormDescription>
                      Displayed within blog post content
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slots.footer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Footer Ad Slot</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ad unit ID for footer"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-slot-footer"
                      />
                    </FormControl>
                    <FormDescription>
                      Displayed at the bottom of the page
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

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
