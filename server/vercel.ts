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

  async getDomains(projectId: string): Promise<VercelDomain[]> {
    const data = await this.request<{ domains: any[] }>(
      `/v9/projects/${encodeURIComponent(projectId)}/domains`
    );

    return (data.domains || []).map((d: any) => {
      const dnsRecords: { type: string; name: string; value: string }[] = [];
      
      if (d.apexName) {
        dnsRecords.push({
          type: "A",
          name: "@",
          value: "76.76.21.21",
        });
        dnsRecords.push({
          type: "AAAA",
          name: "@", 
          value: "2606:4700:7::1",
        });
      }
      
      if (d.name && !d.name.startsWith("www.") && d.name.includes(".")) {
        const parts = d.name.split(".");
        if (parts.length === 2) {
          dnsRecords.push({
            type: "CNAME",
            name: "www",
            value: "cname.vercel-dns.com",
          });
        } else {
          const subdomain = parts.slice(0, -2).join(".");
          dnsRecords.push({
            type: "CNAME",
            name: subdomain,
            value: "cname.vercel-dns.com",
          });
        }
      }

      return {
        name: d.name,
        verified: d.verified || false,
        configured: d.configuredBy !== undefined && d.configuredBy !== null,
        createdAt: d.createdAt,
        verification: d.verification?.map((v: any) => ({
          type: v.type,
          domain: v.domain,
          value: v.value,
          reason: v.reason,
        })),
        verificationRecord: d.verification?.[0] ? {
          type: d.verification[0].type,
          name: "_vercel",
          value: d.verification[0].value,
        } : undefined,
        txtVerification: d.verification?.find((v: any) => v.type === "TXT") ? {
          name: "_vercel",
          value: d.verification.find((v: any) => v.type === "TXT").value,
        } : undefined,
        configuredBy: d.configuredBy,
        apexName: d.apexName,
        gitBranch: d.gitBranch,
        redirect: d.redirect,
        redirectStatusCode: d.redirectStatusCode,
        dnsRecords,
      };
    });
  }

  async addDomain(projectId: string, domain: string): Promise<VercelDomain> {
    const d = await this.request<any>(
      `/v10/projects/${encodeURIComponent(projectId)}/domains`,
      {
        method: "POST",
        body: JSON.stringify({ name: domain }),
      }
    );

    const dnsRecords: { type: string; name: string; value: string }[] = [];
    
    const parts = domain.split(".");
    if (parts.length === 2) {
      dnsRecords.push({
        type: "A",
        name: "@",
        value: "76.76.21.21",
      });
      dnsRecords.push({
        type: "AAAA",
        name: "@",
        value: "2606:4700:7::1",
      });
      dnsRecords.push({
        type: "CNAME",
        name: "www",
        value: "cname.vercel-dns.com",
      });
    } else {
      const subdomain = parts.slice(0, -2).join(".");
      dnsRecords.push({
        type: "CNAME",
        name: subdomain,
        value: "cname.vercel-dns.com",
      });
    }

    return {
      name: d.name,
      verified: d.verified || false,
      configured: false,
      createdAt: d.createdAt,
      verification: d.verification?.map((v: any) => ({
        type: v.type,
        domain: v.domain,
        value: v.value,
        reason: v.reason,
      })),
      txtVerification: d.verification?.find((v: any) => v.type === "TXT") ? {
        name: "_vercel",
        value: d.verification.find((v: any) => v.type === "TXT").value,
      } : undefined,
      configuredBy: d.configuredBy,
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

    const dnsRecords: { type: string; name: string; value: string }[] = [];
    
    const parts = domain.split(".");
    if (parts.length === 2) {
      dnsRecords.push({
        type: "A",
        name: "@",
        value: "76.76.21.21",
      });
      dnsRecords.push({
        type: "AAAA",
        name: "@",
        value: "2606:4700:7::1",
      });
      dnsRecords.push({
        type: "CNAME",
        name: "www",
        value: "cname.vercel-dns.com",
      });
    } else {
      const subdomain = parts.slice(0, -2).join(".");
      dnsRecords.push({
        type: "CNAME",
        name: subdomain,
        value: "cname.vercel-dns.com",
      });
    }

    return {
      name: d.name,
      verified: d.verified || false,
      configured: d.configuredBy !== undefined && d.configuredBy !== null,
      createdAt: d.createdAt,
      verification: d.verification?.map((v: any) => ({
        type: v.type,
        domain: v.domain,
        value: v.value,
        reason: v.reason,
      })),
      txtVerification: d.verification?.find((v: any) => v.type === "TXT") ? {
        name: "_vercel",
        value: d.verification.find((v: any) => v.type === "TXT").value,
      } : undefined,
      configuredBy: d.configuredBy,
      apexName: d.apexName,
      dnsRecords,
    };
  }
}
