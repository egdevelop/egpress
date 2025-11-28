import type { VercelProject, VercelDeployment, VercelDomain } from "@shared/schema";

const VERCEL_API_BASE = "https://api.vercel.com";

export interface VercelUser {
  id: string;
  username: string;
  email: string;
  name: string | null;
}

export interface VercelTeam {
  id: string;
  slug: string;
  name: string;
}

export class VercelService {
  private token: string;
  private teamId?: string;

  constructor(token: string, teamId?: string) {
    this.token = token;
    this.teamId = teamId;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = new URL(`${VERCEL_API_BASE}${endpoint}`);
    
    if (this.teamId) {
      url.searchParams.set("teamId", this.teamId);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      ...options.headers as Record<string, string>,
    };

    if (options.body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url.toString(), {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `Vercel API error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // Response was not JSON, use status code
      }
      throw new Error(errorMessage);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    }
    
    return {} as T;
  }

  async validateToken(): Promise<VercelUser> {
    return this.request<VercelUser>("/v2/user");
  }

  async getTeams(): Promise<VercelTeam[]> {
    const data = await this.request<{ teams: VercelTeam[] }>("/v2/teams");
    return data.teams || [];
  }

  async listProjects(limit = 20): Promise<VercelProject[]> {
    const data = await this.request<{ projects: any[] }>(`/v9/projects?limit=${limit}`);
    return (data.projects || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      framework: p.framework,
      productionUrl: p.alias?.[0]?.domain || p.targets?.production?.alias?.[0],
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      gitRepository: p.link ? {
        type: p.link.type || "github",
        repo: p.link.repo,
      } : undefined,
    }));
  }

  async getProject(projectIdOrName: string): Promise<VercelProject | null> {
    try {
      const p = await this.request<any>(`/v9/projects/${encodeURIComponent(projectIdOrName)}`);
      return {
        id: p.id,
        name: p.name,
        framework: p.framework,
        productionUrl: p.alias?.[0]?.domain || p.targets?.production?.alias?.[0],
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
        gitRepository: p.link ? {
          type: p.link.type || "github",
          repo: p.link.repo,
        } : undefined,
      };
    } catch {
      return null;
    }
  }

  async createProject(
    name: string,
    gitRepo: { owner: string; repo: string; type?: string }
  ): Promise<VercelProject> {
    const body = {
      name,
      framework: "astro",
      gitRepository: {
        type: gitRepo.type || "github",
        repo: `${gitRepo.owner}/${gitRepo.repo}`,
      },
    };

    const p = await this.request<any>("/v10/projects", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      id: p.id,
      name: p.name,
      framework: p.framework,
      productionUrl: p.alias?.[0]?.domain,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      gitRepository: {
        type: "github",
        repo: `${gitRepo.owner}/${gitRepo.repo}`,
      },
    };
  }

  async linkProjectToRepo(
    projectId: string,
    gitRepo: { owner: string; repo: string }
  ): Promise<void> {
    await this.request(`/v9/projects/${encodeURIComponent(projectId)}/link`, {
      method: "POST",
      body: JSON.stringify({
        type: "github",
        repo: `${gitRepo.owner}/${gitRepo.repo}`,
        sourceless: true,
        productionBranch: "main",
      }),
    });
  }

  async getDeployments(projectId: string, limit = 10): Promise<VercelDeployment[]> {
    const data = await this.request<{ deployments: any[] }>(
      `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=${limit}`
    );

    return (data.deployments || []).map((d: any) => ({
      id: d.uid,
      url: d.url ? `https://${d.url}` : "",
      state: d.state || d.readyState || "QUEUED",
      createdAt: d.createdAt || d.created,
      buildingAt: d.buildingAt,
      readyAt: d.readyAt || d.ready,
      target: d.target,
      source: d.source,
      meta: {
        githubCommitRef: d.meta?.githubCommitRef,
        githubCommitMessage: d.meta?.githubCommitMessage,
      },
    }));
  }

  async triggerDeployment(
    projectName: string,
    gitRepo: { owner: string; repo: string; branch?: string }
  ): Promise<VercelDeployment> {
    const body = {
      name: projectName,
      gitSource: {
        type: "github",
        ref: gitRepo.branch || "main",
        repoId: `${gitRepo.owner}/${gitRepo.repo}`,
      },
    };

    const d = await this.request<any>("/v13/deployments", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      id: d.id,
      url: d.url ? `https://${d.url}` : "",
      state: d.readyState || "QUEUED",
      createdAt: d.createdAt || Date.now(),
      target: d.target,
      source: "manual",
    };
  }

  async getDomainConfig(domain: string): Promise<{
    misconfigured: boolean;
    configuredBy: string | null;
    recommendedIPv4: { rank: number; value: string[] }[];
    recommendedCNAME: { rank: number; value: string }[];
    aRecords: { configuredBy: string; nameType: string; value: string }[];
    cnameRecord: { host: string; value: string } | null;
  } | null> {
    try {
      const data = await this.request<any>(`/v6/domains/${encodeURIComponent(domain)}/config`);
      console.log(`[Vercel API] getDomainConfig for ${domain}:`, JSON.stringify(data, null, 2));
      return {
        misconfigured: data.misconfigured ?? true,
        configuredBy: data.configuredBy || null,
        recommendedIPv4: data.recommendedIPv4 || [],
        recommendedCNAME: data.recommendedCNAME || [],
        aRecords: data.aRecords || [],
        cnameRecord: data.cnameRecord || null,
      };
    } catch (error) {
      console.error(`[Vercel API] getDomainConfig error for ${domain}:`, error);
      return null;
    }
  }

  async getDomains(projectId: string): Promise<VercelDomain[]> {
    const data = await this.request<{ domains: any[] }>(
      `/v9/projects/${encodeURIComponent(projectId)}/domains`
    );

    const domainsWithConfig = await Promise.all(
      (data.domains || []).map(async (d: any) => {
        const config = await this.getDomainConfig(d.name);
        
        const dnsRecords: { type: string; name: string; value: string; status: "configured" | "pending" | "error" }[] = [];
        
        if (config) {
          const preferredIPv4 = config.recommendedIPv4.find(r => r.rank === 1);
          if (preferredIPv4 && preferredIPv4.value.length > 0) {
            for (const ip of preferredIPv4.value) {
              const isConfigured = config.aRecords.some(a => a.value === ip);
              dnsRecords.push({
                type: "A",
                name: "@",
                value: ip,
                status: isConfigured ? "configured" : "pending",
              });
            }
          }
          
          const preferredCNAME = config.recommendedCNAME.find(r => r.rank === 1);
          if (preferredCNAME) {
            const parts = d.name.split(".");
            const isApex = parts.length === 2;
            const cnameConfigured = config.cnameRecord?.value === preferredCNAME.value;
            dnsRecords.push({
              type: "CNAME",
              name: isApex ? "www" : parts[0],
              value: preferredCNAME.value,
              status: cnameConfigured ? "configured" : "pending",
            });
          }
        }
        
        if (d.verification && Array.isArray(d.verification)) {
          for (const v of d.verification) {
            if (v.type === "TXT" && v.value) {
              dnsRecords.push({
                type: "TXT",
                name: v.domain || "_vercel",
                value: v.value,
                status: d.verified ? "configured" : "pending",
              });
            }
          }
        }
        
        const txtRecord = d.verification?.find((v: any) => v.type === "TXT");
        const isMisconfigured = config?.misconfigured ?? true;

        return {
          name: d.name,
          verified: d.verified || false,
          configured: !isMisconfigured,
          createdAt: d.createdAt,
          verification: d.verification?.map((v: any) => ({
            type: v.type,
            domain: v.domain,
            value: v.value,
            reason: v.reason,
          })),
          verificationRecord: d.verification?.[0] ? {
            type: d.verification[0].type,
            name: d.verification[0].domain || "_vercel",
            value: d.verification[0].value,
          } : undefined,
          txtVerification: txtRecord ? {
            name: txtRecord.domain || "_vercel",
            value: txtRecord.value,
          } : undefined,
          configuredBy: config?.configuredBy || d.configuredBy,
          apexName: d.apexName,
          gitBranch: d.gitBranch,
          redirect: d.redirect,
          redirectStatusCode: d.redirectStatusCode,
          dnsRecords,
        };
      })
    );

    return domainsWithConfig;
  }

  async addDomain(projectId: string, domain: string): Promise<VercelDomain> {
    const d = await this.request<any>(
      `/v10/projects/${encodeURIComponent(projectId)}/domains`,
      {
        method: "POST",
        body: JSON.stringify({ name: domain }),
      }
    );

    const config = await this.getDomainConfig(domain);
    const dnsRecords: { type: string; name: string; value: string; status: "configured" | "pending" | "error" }[] = [];
    
    if (config) {
      const preferredIPv4 = config.recommendedIPv4.find(r => r.rank === 1);
      if (preferredIPv4 && preferredIPv4.value.length > 0) {
        for (const ip of preferredIPv4.value) {
          const isConfigured = config.aRecords.some(a => a.value === ip);
          dnsRecords.push({
            type: "A",
            name: "@",
            value: ip,
            status: isConfigured ? "configured" : "pending",
          });
        }
      }
      
      const preferredCNAME = config.recommendedCNAME.find(r => r.rank === 1);
      if (preferredCNAME) {
        const parts = domain.split(".");
        const isApex = parts.length === 2;
        const cnameConfigured = config.cnameRecord?.value === preferredCNAME.value;
        dnsRecords.push({
          type: "CNAME",
          name: isApex ? "www" : parts[0],
          value: preferredCNAME.value,
          status: cnameConfigured ? "configured" : "pending",
        });
      }
    }
    
    if (d.verification && Array.isArray(d.verification)) {
      for (const v of d.verification) {
        if (v.type === "TXT" && v.value) {
          dnsRecords.push({
            type: "TXT",
            name: v.domain || "_vercel",
            value: v.value,
            status: d.verified ? "configured" : "pending",
          });
        }
      }
    }
    
    const txtRecord = d.verification?.find((v: any) => v.type === "TXT");
    const isMisconfigured = config?.misconfigured ?? true;

    return {
      name: d.name,
      verified: d.verified || false,
      configured: !isMisconfigured,
      createdAt: d.createdAt,
      verification: d.verification?.map((v: any) => ({
        type: v.type,
        domain: v.domain,
        value: v.value,
        reason: v.reason,
      })),
      txtVerification: txtRecord ? {
        name: txtRecord.domain || "_vercel",
        value: txtRecord.value,
      } : undefined,
      configuredBy: config?.configuredBy || d.configuredBy,
      apexName: d.apexName,
      dnsRecords,
    };
  }

  async removeDomain(projectId: string, domain: string): Promise<void> {
    await this.request(
      `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`,
      { method: "DELETE" }
    );
  }

  async verifyDomain(projectId: string, domain: string): Promise<VercelDomain> {
    const d = await this.request<any>(
      `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify`,
      { method: "POST" }
    );

    const config = await this.getDomainConfig(domain);
    const dnsRecords: { type: string; name: string; value: string; status: "configured" | "pending" | "error" }[] = [];
    
    if (config) {
      const preferredIPv4 = config.recommendedIPv4.find(r => r.rank === 1);
      if (preferredIPv4 && preferredIPv4.value.length > 0) {
        for (const ip of preferredIPv4.value) {
          const isConfigured = config.aRecords.some(a => a.value === ip);
          dnsRecords.push({
            type: "A",
            name: "@",
            value: ip,
            status: isConfigured ? "configured" : "pending",
          });
        }
      }
      
      const preferredCNAME = config.recommendedCNAME.find(r => r.rank === 1);
      if (preferredCNAME) {
        const parts = domain.split(".");
        const isApex = parts.length === 2;
        const cnameConfigured = config.cnameRecord?.value === preferredCNAME.value;
        dnsRecords.push({
          type: "CNAME",
          name: isApex ? "www" : parts[0],
          value: preferredCNAME.value,
          status: cnameConfigured ? "configured" : "pending",
        });
      }
    }
    
    if (d.verification && Array.isArray(d.verification)) {
      for (const v of d.verification) {
        if (v.type === "TXT" && v.value) {
          dnsRecords.push({
            type: "TXT",
            name: v.domain || "_vercel",
            value: v.value,
            status: d.verified ? "configured" : "pending",
          });
        }
      }
    }
    
    const txtRecord = d.verification?.find((v: any) => v.type === "TXT");
    const isMisconfigured = config?.misconfigured ?? true;

    return {
      name: d.name,
      verified: d.verified || false,
      configured: !isMisconfigured,
      createdAt: d.createdAt,
      verification: d.verification?.map((v: any) => ({
        type: v.type,
        domain: v.domain,
        value: v.value,
        reason: v.reason,
      })),
      txtVerification: txtRecord ? {
        name: txtRecord.domain || "_vercel",
        value: txtRecord.value,
      } : undefined,
      configuredBy: config?.configuredBy || d.configuredBy,
      apexName: d.apexName,
      dnsRecords,
    };
  }
}
