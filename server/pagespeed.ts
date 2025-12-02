export interface CoreWebVitals {
  lcp: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  fid: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  cls: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  inp: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  fcp: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
  ttfb: { value: number; score: "good" | "needs-improvement" | "poor"; displayValue: string };
}

export interface PageSpeedCategory {
  score: number;
  title: string;
}

export interface PageSpeedAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  details?: {
    type: string;
    items?: any[];
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
  };
}

export interface PageSpeedOpportunity {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue: string;
  savings: {
    ms?: number;
    bytes?: number;
  };
  items: any[];
  autoFixable: boolean;
  fixType?: "lazy-loading" | "image-optimization" | "preload" | "minify" | "cache" | "compress";
}

export interface PageSpeedDiagnostic {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
  score: number | null;
}

export interface PageSpeedResult {
  url: string;
  fetchTime: string;
  strategy: "mobile" | "desktop";
  categories: {
    performance: PageSpeedCategory;
    accessibility: PageSpeedCategory;
    bestPractices: PageSpeedCategory;
    seo: PageSpeedCategory;
  };
  coreWebVitals: CoreWebVitals;
  opportunities: PageSpeedOpportunity[];
  diagnostics: PageSpeedDiagnostic[];
  screenshots?: {
    final: string;
    thumbnails: string[];
  };
}

const PAGESPEED_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

function getScoreRating(score: number): "good" | "needs-improvement" | "poor" {
  if (score >= 0.9) return "good";
  if (score >= 0.5) return "needs-improvement";
  return "poor";
}

function getCWVRating(metric: string, value: number): "good" | "needs-improvement" | "poor" {
  const thresholds: Record<string, { good: number; poor: number }> = {
    lcp: { good: 2500, poor: 4000 },
    fid: { good: 100, poor: 300 },
    cls: { good: 0.1, poor: 0.25 },
    inp: { good: 200, poor: 500 },
    fcp: { good: 1800, poor: 3000 },
    ttfb: { good: 800, poor: 1800 },
  };

  const threshold = thresholds[metric];
  if (!threshold) return "needs-improvement";

  if (value <= threshold.good) return "good";
  if (value >= threshold.poor) return "poor";
  return "needs-improvement";
}

function formatMilliseconds(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAutoFixable(auditId: string): { fixable: boolean; fixType?: PageSpeedOpportunity["fixType"] } {
  const autoFixableAudits: Record<string, PageSpeedOpportunity["fixType"]> = {
    "offscreen-images": "lazy-loading",
    "uses-responsive-images": "image-optimization",
    "uses-optimized-images": "image-optimization",
    "modern-image-formats": "image-optimization",
    "uses-webp-images": "image-optimization",
    "render-blocking-resources": "preload",
    "unminified-css": "minify",
    "unminified-javascript": "minify",
    "uses-text-compression": "compress",
    "uses-long-cache-ttl": "cache",
    "preload-lcp-image": "preload",
    "prioritize-lcp-image": "preload",
  };

  const fixType = autoFixableAudits[auditId];
  return { fixable: !!fixType, fixType };
}

export interface PageSpeedAuthOptions {
  apiKey?: string;
  accessToken?: string;
}

export async function analyzePageSpeed(
  url: string,
  strategy: "mobile" | "desktop" = "mobile",
  auth?: PageSpeedAuthOptions
): Promise<PageSpeedResult> {
  const params = new URLSearchParams({
    url,
    strategy,
    category: "performance",
  });

  params.append("category", "accessibility");
  params.append("category", "best-practices");
  params.append("category", "seo");

  // Use API key if provided
  if (auth?.apiKey) {
    params.set("key", auth.apiKey);
  }

  // Build request headers
  const headers: Record<string, string> = {};
  
  // Use access token from Service Account if provided (takes precedence)
  if (auth?.accessToken) {
    headers["Authorization"] = `Bearer ${auth.accessToken}`;
  }

  const response = await fetch(`${PAGESPEED_API_URL}?${params.toString()}`, {
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `PageSpeed API error: ${response.status}`);
  }

  const data = await response.json();
  const lighthouse = data.lighthouseResult;

  if (!lighthouse) {
    throw new Error("Invalid PageSpeed response: missing lighthouse data");
  }

  const audits = lighthouse.audits || {};
  const categories = lighthouse.categories || {};

  const getCategoryScore = (cat: any) => Math.round((cat?.score || 0) * 100);

  const getMetricValue = (auditId: string) => {
    const audit = audits[auditId];
    if (!audit) return { value: 0, displayValue: "N/A" };
    return {
      value: audit.numericValue || 0,
      displayValue: audit.displayValue || "N/A",
    };
  };

  const lcpData = getMetricValue("largest-contentful-paint");
  const fidData = getMetricValue("max-potential-fid");
  const clsData = getMetricValue("cumulative-layout-shift");
  const inpData = getMetricValue("interaction-to-next-paint");
  const fcpData = getMetricValue("first-contentful-paint");
  const ttfbData = getMetricValue("server-response-time");

  const coreWebVitals: CoreWebVitals = {
    lcp: {
      value: lcpData.value,
      score: getCWVRating("lcp", lcpData.value),
      displayValue: lcpData.displayValue,
    },
    fid: {
      value: fidData.value,
      score: getCWVRating("fid", fidData.value),
      displayValue: fidData.displayValue,
    },
    cls: {
      value: clsData.value,
      score: getCWVRating("cls", clsData.value),
      displayValue: clsData.displayValue,
    },
    inp: {
      value: inpData.value,
      score: getCWVRating("inp", inpData.value),
      displayValue: inpData.displayValue,
    },
    fcp: {
      value: fcpData.value,
      score: getCWVRating("fcp", fcpData.value),
      displayValue: fcpData.displayValue,
    },
    ttfb: {
      value: ttfbData.value,
      score: getCWVRating("ttfb", ttfbData.value),
      displayValue: ttfbData.displayValue,
    },
  };

  const opportunities: PageSpeedOpportunity[] = [];
  const diagnostics: PageSpeedDiagnostic[] = [];

  const opportunityAudits = [
    "render-blocking-resources",
    "uses-responsive-images",
    "offscreen-images",
    "unminified-css",
    "unminified-javascript",
    "unused-css-rules",
    "unused-javascript",
    "uses-optimized-images",
    "modern-image-formats",
    "uses-text-compression",
    "uses-rel-preconnect",
    "server-response-time",
    "redirects",
    "preload-lcp-image",
    "uses-long-cache-ttl",
    "total-byte-weight",
    "dom-size",
    "prioritize-lcp-image",
  ];

  for (const auditId of opportunityAudits) {
    const audit = audits[auditId];
    if (!audit || audit.score === null || audit.score === 1) continue;

    const { fixable, fixType } = isAutoFixable(auditId);
    
    opportunities.push({
      id: auditId,
      title: audit.title,
      description: audit.description?.replace(/<[^>]*>/g, "") || "",
      score: audit.score,
      displayValue: audit.displayValue || "",
      savings: {
        ms: audit.details?.overallSavingsMs,
        bytes: audit.details?.overallSavingsBytes,
      },
      items: audit.details?.items || [],
      autoFixable: fixable,
      fixType,
    });
  }

  opportunities.sort((a, b) => a.score - b.score);

  const diagnosticAudits = [
    "largest-contentful-paint-element",
    "lcp-lazy-loaded",
    "layout-shift-elements",
    "long-tasks",
    "non-composited-animations",
    "unsized-images",
    "viewport",
    "critical-request-chains",
    "user-timings",
    "bootup-time",
    "mainthread-work-breakdown",
    "font-display",
    "third-party-summary",
    "third-party-facades",
    "largest-contentful-paint",
    "first-contentful-paint",
    "speed-index",
    "total-blocking-time",
    "max-potential-fid",
    "cumulative-layout-shift",
    "interactive",
  ];

  for (const auditId of diagnosticAudits) {
    const audit = audits[auditId];
    if (!audit) continue;

    diagnostics.push({
      id: auditId,
      title: audit.title,
      description: audit.description?.replace(/<[^>]*>/g, "") || "",
      displayValue: audit.displayValue,
      score: audit.score,
    });
  }

  let screenshots: PageSpeedResult["screenshots"];
  if (audits["final-screenshot"]?.details?.data) {
    screenshots = {
      final: audits["final-screenshot"].details.data,
      thumbnails: audits["screenshot-thumbnails"]?.details?.items?.map((item: any) => item.data) || [],
    };
  }

  return {
    url,
    fetchTime: new Date().toISOString(),
    strategy,
    categories: {
      performance: {
        score: getCategoryScore(categories.performance),
        title: "Performance",
      },
      accessibility: {
        score: getCategoryScore(categories.accessibility),
        title: "Accessibility",
      },
      bestPractices: {
        score: getCategoryScore(categories["best-practices"]),
        title: "Best Practices",
      },
      seo: {
        score: getCategoryScore(categories.seo),
        title: "SEO",
      },
    },
    coreWebVitals,
    opportunities,
    diagnostics,
    screenshots,
  };
}

export interface OptimizationRecommendation {
  id: string;
  type: "lazy-loading" | "image-optimization" | "preload" | "minify" | "cache" | "compress" | "code";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  estimatedSavings?: string;
  codeChanges?: {
    file: string;
    description: string;
    before?: string;
    after: string;
  }[];
  configChanges?: {
    file: string;
    config: Record<string, any>;
  }[];
}

export function generateOptimizationRecommendations(
  result: PageSpeedResult
): OptimizationRecommendation[] {
  const recommendations: OptimizationRecommendation[] = [];
  const addedTypes = new Set<string>();
  const perfScore = result.categories.performance.score;

  for (const opp of result.opportunities) {
    if (!opp.autoFixable) continue;

    const priority = opp.score < 0.5 ? "high" : opp.score < 0.9 ? "medium" : "low";
    const estimatedSavings = opp.savings.ms
      ? formatMilliseconds(opp.savings.ms)
      : opp.savings.bytes
      ? formatBytes(opp.savings.bytes)
      : undefined;

    const typeKey = `${opp.fixType}-${opp.id}`;
    if (addedTypes.has(typeKey)) continue;
    addedTypes.add(typeKey);

    switch (opp.fixType) {
      case "lazy-loading":
        recommendations.push({
          id: `lazy-${opp.id}`,
          type: "lazy-loading",
          title: "Add Lazy Loading to Images",
          description: "Add loading=\"lazy\" attribute to offscreen images to defer loading until they are needed.",
          priority,
          estimatedSavings,
          codeChanges: opp.items.slice(0, 5).map((item: any) => ({
            file: item.url || "image",
            description: `Add lazy loading to image`,
            before: `<img src="${item.url?.split("/").pop() || "image.jpg"}" />`,
            after: `<img src="${item.url?.split("/").pop() || "image.jpg"}" loading="lazy" decoding="async" />`,
          })),
        });
        break;

      case "image-optimization":
        recommendations.push({
          id: `imgopt-${opp.id}`,
          type: "image-optimization",
          title: "Optimize Images",
          description: "Convert images to modern formats (WebP/AVIF) and resize to appropriate dimensions.",
          priority,
          estimatedSavings,
          configChanges: [{
            file: "astro.config.mjs",
            config: {
              image: {
                service: { entrypoint: "astro/assets/services/sharp" },
                remotePatterns: [{ protocol: "https" }],
              },
              vite: {
                build: {
                  assetsInlineLimit: 4096,
                },
              },
            },
          }],
        });
        break;

      case "preload":
        recommendations.push({
          id: `preload-${opp.id}`,
          type: "preload",
          title: "Preload Critical Resources",
          description: "Add preload hints for LCP images and critical fonts to speed up initial render.",
          priority,
          estimatedSavings,
          codeChanges: [{
            file: "src/layouts/BaseLayout.astro",
            description: "Add preload link in head",
            after: `<link rel="preload" as="image" href="/hero-image.webp" fetchpriority="high" />`,
          }],
        });
        break;

      case "minify":
        recommendations.push({
          id: `minify-${opp.id}`,
          type: "minify",
          title: "Minify CSS and JavaScript",
          description: "Enable minification for CSS and JavaScript to reduce file sizes.",
          priority,
          estimatedSavings,
          configChanges: [{
            file: "astro.config.mjs",
            config: {
              compressHTML: true,
              build: {
                inlineStylesheets: "auto",
              },
              vite: {
                build: {
                  minify: "esbuild",
                  cssMinify: true,
                },
              },
            },
          }],
        });
        break;

      case "compress":
        recommendations.push({
          id: `compress-${opp.id}`,
          type: "compress",
          title: "Enable Text Compression",
          description: "Enable Gzip or Brotli compression for text-based resources.",
          priority,
          estimatedSavings,
          configChanges: [{
            file: "vercel.json",
            config: {
              headers: [
                {
                  source: "/(.*)",
                  headers: [
                    { key: "Content-Encoding", value: "gzip" },
                  ],
                },
              ],
            },
          }],
        });
        break;

      case "cache":
        recommendations.push({
          id: `cache-${opp.id}`,
          type: "cache",
          title: "Improve Cache Policy",
          description: "Set longer cache TTL for static assets to improve repeat visit performance.",
          priority,
          estimatedSavings,
          configChanges: [{
            file: "vercel.json",
            config: {
              headers: [
                {
                  source: "/_astro/(.*)",
                  headers: [
                    { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
                  ],
                },
                {
                  source: "/images/(.*)",
                  headers: [
                    { key: "Cache-Control", value: "public, max-age=604800" },
                  ],
                },
              ],
            },
          }],
        });
        break;
    }
  }


  recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return recommendations;
}

export interface AppliedOptimization {
  id: string;
  type: string;
  success: boolean;
  message: string;
  changes?: string[];
}

export function generateAstroOptimizations(recommendations: OptimizationRecommendation[]): {
  astroConfig: Record<string, any>;
  vercelConfig: Record<string, any>;
  layoutChanges: string[];
} {
  const astroConfig: Record<string, any> = {
    compressHTML: true,
    build: {
      inlineStylesheets: "auto",
    },
    image: {
      service: { entrypoint: "astro/assets/services/sharp" },
    },
    vite: {
      build: {
        minify: "esbuild",
        cssMinify: true,
        rollupOptions: {
          output: {
            manualChunks: {
              vendor: [],
            },
          },
        },
      },
    },
  };

  const vercelConfig: Record<string, any> = {
    headers: [
      {
        source: "/_astro/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/fonts/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/(.*\\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico))",
        headers: [
          { key: "Cache-Control", value: "public, max-age=604800" },
        ],
      },
    ],
  };

  const layoutChanges: string[] = [];

  for (const rec of recommendations) {
    if (rec.type === "preload" && rec.codeChanges) {
      for (const change of rec.codeChanges) {
        if (change.after) {
          layoutChanges.push(change.after);
        }
      }
    }
  }

  return { astroConfig, vercelConfig, layoutChanges };
}
