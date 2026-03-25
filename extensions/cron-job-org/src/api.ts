export type ApiErrorBody = { error?: string; message?: string };

export type CronJobOrgJobSchedule = {
  timezone?: string;
  expiresAt?: number;
  hours?: number[];
  mdays?: number[];
  minutes?: number[];
  months?: number[];
  wdays?: number[];
};

export type CronJobOrgJobAuth = {
  enable?: boolean;
  user?: string;
  password?: string;
};

export type CronJobOrgJobNotification = {
  onFailure?: boolean;
  onFailureCount?: number;
  onSuccess?: boolean;
  onDisable?: boolean;
};

export type CronJobOrgJobExtendedData = {
  headers?: Record<string, string>;
  body?: string;
};

export type CronJobOrgJob = {
  jobId?: number;
  enabled?: boolean;
  title?: string;
  saveResponses?: boolean;
  url: string;
  lastStatus?: number;
  lastDuration?: number;
  lastExecution?: number;
  nextExecution?: number;
  auth?: CronJobOrgJobAuth;
  notification?: CronJobOrgJobNotification;
  extendedData?: CronJobOrgJobExtendedData;
  type?: number;
  requestTimeout?: number;
  redirectSuccess?: boolean;
  folderId?: number;
  schedule?: CronJobOrgJobSchedule;
  requestMethod?: number;
};

export type ListJobsResponse = { jobs: CronJobOrgJob[]; someFailed: boolean };
export type GetJobDetailsResponse = { jobDetails: CronJobOrgJob };
export type CreateJobRequest = { job: CronJobOrgJob };
export type CreateJobResponse = { jobId: number };
export type UpdateJobRequest = { job: Partial<CronJobOrgJob> };

export type HistoryItem = {
  jobLogId: number;
  jobId: number;
  identifier: string;
  date: number;
  datePlanned: number;
  jitter: number;
  url: string;
  duration: number;
  status: number;
  statusText: string;
  httpStatus: number;
  headers: Record<string, string> | null;
  body: string | null;
  stats?: Record<string, number>;
};

export type GetJobHistoryResponse = { history: HistoryItem[]; predictions: number[] };
export type GetHistoryItemResponse = { jobHistoryDetails: HistoryItem };

export class CronJobOrgClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(params: { apiKey: string; baseUrl?: string }) {
    this.apiKey = params.apiKey;
    this.baseUrl = params.baseUrl ?? "https://api.cron-job.org";
  }

  private async request<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!res.ok) {
      let body: ApiErrorBody | undefined;
      try {
        body = (await res.json()) as ApiErrorBody;
      } catch {
        // ignore
      }
      const msg = body?.message || body?.error || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    if (res.status === 204) return {} as T;

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  listJobs(): Promise<ListJobsResponse> {
    return this.request<ListJobsResponse>("/jobs", { method: "GET" });
  }

  getJob(jobId: number): Promise<GetJobDetailsResponse> {
    return this.request<GetJobDetailsResponse>(`/jobs/${jobId}`, { method: "GET" });
  }

  createJob(job: CronJobOrgJob): Promise<CreateJobResponse> {
    const payload: CreateJobRequest = { job };
    return this.request<CreateJobResponse>("/jobs", { method: "PUT", body: payload });
  }

  updateJob(jobId: number, delta: Partial<CronJobOrgJob>): Promise<Record<string, never>> {
    const payload: UpdateJobRequest = { job: delta };
    return this.request<Record<string, never>>(`/jobs/${jobId}`, { method: "PATCH", body: payload });
  }

  deleteJob(jobId: number): Promise<Record<string, never>> {
    return this.request<Record<string, never>>(`/jobs/${jobId}`, { method: "DELETE" });
  }

  getJobHistory(jobId: number): Promise<GetJobHistoryResponse> {
    return this.request<GetJobHistoryResponse>(`/jobs/${jobId}/history`, { method: "GET" });
  }

  getHistoryItem(jobId: number, identifier: string): Promise<GetHistoryItemResponse> {
    return this.request<GetHistoryItemResponse>(`/jobs/${jobId}/history/${encodeURIComponent(identifier)}`, {
      method: "GET",
    });
  }
}
