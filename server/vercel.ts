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

  /**
   * Find a Vercel project by GitHub repository
   * Returns the project if found, null otherwise
   */
  async findProjectByRepo(owner: string, repo: string): Promise<VercelProject | null> {
    try {
      // Query Vercel API for projects linked to this GitHub repo
      const repoFullName = `${owner}/${repo}`;
      const data = await this.request<{ projects: any[] }>(`/v9/projects?repoUrl=https://github.com/${repoFullName}`);
      
      if (data.projects && data.projects.length > 0) {
        const p = data.projects[0];
        return {
          id: p.id,
          name: p.name,
          framework: p.framework,
          productionUrl: p.alias?.[0]?.domain || p.targets?.production?.alias?.[0],
          createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
          gitRepository: {
            type: "github",
            repo: repoFullName,
          },
        };
      }
      
      // Fallback: search through all projects to find matching repo
      const allProjects = await this.listProjects(100);
      const matchingProject = allProjects.find(p => 
        p.gitRepository?.repo?.toLowerCase() === repoFullName.toLowerCase()
      );
      
      return matchingProject || null;
    } catch (err) {
      console.error('Error finding project by repo:', err);
      return null;
    }
  }

  /**
   * Auto-link or create a Vercel project for a GitHub repository
   * Returns the project (existing or newly created)
   */
  async autoLinkProject(owner: string, repo: string): Promise<{
    project: VercelProject;
    isNew: boolean;
    message: string;
  }> {
    // First, try to find an existing project linked to this repo
    const existingProject = await this.findProjectByRepo(owner, repo);
    
    if (existingProject) {
      return {
        project: existingProject,
        isNew: false,
        message: `Found existing project "${existingProject.name}" linked to ${owner}/${repo}`,
      };
    }
    
    // No existing project found, create a new one
    // Use repo name as project name, sanitized for Vercel
    const projectName = repo.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    try {
      const newProject = await this.createProject(projectName, { owner, repo });
      return {
        project: newProject,
        isNew: true,
        message: `Created new project "${projectName}" and linked to ${owner}/${repo}`,
      };
    } catch (err: any) {
      // If project name already exists but not linked to this repo, try with suffix
      if (err.message?.includes('already exists')) {
        const uniqueName = `${projectName}-${Date.now().toString(36)}`;
        const newProject = await this.createProject(uniqueName, { owner, repo });
        return {
          project: newProject,
          isNew: true,
          message: `Created new project "${uniqueName}" and linked to ${owner}/${repo}`,
        };
      }
      throw err;
    }
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

  // Upload a single file to Vercel and return its SHA
  async uploadFile(content: Buffer, sha: string): Promise<void> {
    const url = new URL(`${VERCEL_API_BASE}/v2/files`);
    if (this.teamId) {
      url.searchParams.set("teamId", this.teamId);
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/octet-stream",
        "x-vercel-digest": sha,
      },
      body: content,
    });

    if (!response.ok && response.status !== 409) {
      // 409 means file already exists, which is fine
      const errorText = await response.text();
      throw new Error(`Failed to upload file: ${response.status} - ${errorText}`);
    }
  }

  // Deploy using direct file upload (no GitHub integration needed)
  async deployWithFiles(
    projectName: string,
    files: Array<{ path: string; content: Buffer }>,
    framework: string = "astro"
  ): Promise<VercelDeployment> {
    const crypto = await import("crypto");
    
    // Calculate SHA and upload each file
    const fileList: Array<{ file: string; sha: string; size: number }> = [];
    
    // Upload files in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (f) => {
        const sha = crypto.createHash("sha1").update(f.content).digest("hex");
        await this.uploadFile(f.content, sha);
        fileList.push({
          file: f.path,
          sha,
          size: f.content.length,
        });
      }));
    }

    // Create deployment with uploaded files
    const body = {
      name: projectName,
      files: fileList,
      projectSettings: {
        framework,
      },
      target: "production",
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
      target: d.target || "production",
      source: "upload",
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
      // Map aValues to aRecords - API returns aValues not aRecords
      const aRecords = (data.aValues || []).map((value: string) => ({
        value,
        configuredBy: data.configuredBy,
        nameType: "A",
      }));
      
      return {
        misconfigured: data.misconfigured ?? true,
        configuredBy: data.configuredBy || null,
        recommendedIPv4: data.recommendedIPv4 || [],
        recommendedCNAME: data.recommendedCNAME || [],
        aRecords,
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
          // Use actual configured A records if they exist
          if (config.aRecords && config.aRecords.length > 0) {
            for (const aRecord of config.aRecords) {
              dnsRecords.push({
                type: "A",
                name: "@",
                value: aRecord.value,
                status: "configured",
              });
            }
          } else {
            // If no A records configured yet, show new recommended IP
            // Vercel has expanded their IP range - use new IP instead of legacy 76.76.21.21
            // See: https://vercel.com/docs/domains/working-with-dns
            const NEW_VERCEL_IP = "216.198.79.1";
            dnsRecords.push({
              type: "A",
              name: "@",
              value: NEW_VERCEL_IP,
              status: "pending",
            });
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
      // Use actual configured A records if they exist
      if (config.aRecords && config.aRecords.length > 0) {
        for (const aRecord of config.aRecords) {
          dnsRecords.push({
            type: "A",
            name: "@",
            value: aRecord.value,
            status: "configured",
          });
        }
      } else {
        // If no A records configured yet, show new recommended IP
        const NEW_VERCEL_IP = "216.198.79.1";
        dnsRecords.push({
          type: "A",
          name: "@",
          value: NEW_VERCEL_IP,
          status: "pending",
        });
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

  async deleteProject(projectId: string): Promise<void> {
    await this.request(
      `/v9/projects/${encodeURIComponent(projectId)}`,
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
      // Use actual configured A records if they exist
      if (config.aRecords && config.aRecords.length > 0) {
        for (const aRecord of config.aRecords) {
          dnsRecords.push({
            type: "A",
            name: "@",
            value: aRecord.value,
            status: "configured",
          });
        }
      } else {
        // If no A records configured yet, show new recommended IP
        const NEW_VERCEL_IP = "216.198.79.1";
        dnsRecords.push({
          type: "A",
          name: "@",
          value: NEW_VERCEL_IP,
          status: "pending",
        });
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
