import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Icon,
  Toast,
  confirmAlert,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { CronJobOrgJob } from "./api";
import { getClient } from "./client";

function parseIntList(input: string): number[] | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(/[ ,]+/).filter(Boolean);
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n))) throw new Error(`Invalid number list: ${input}`);
  return nums;
}

function parseJsonObject(input: string): Record<string, string> | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Headers must be a JSON object");
  const rec: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    rec[k] = String(v);
  }
  return rec;
}

export type JobFormValues = {
  title: string;
  url: string;
  enabled: boolean;
  saveResponses: boolean;
  requestTimeout: string;
  redirectSuccess: boolean;
  requestMethod: string;

  timezone: string;
  expiresAt: string;
  minutes: string;
  hours: string;
  mdays: string;
  months: string;
  wdays: string;

  authEnable: boolean;
  authUser: string;
  authPassword: string;

  notifyOnFailure: boolean;
  notifyOnFailureCount: string;
  notifyOnSuccess: boolean;
  notifyOnDisable: boolean;

  headersJson: string;
  body: string;
};

export function jobToDefaultValues(job?: CronJobOrgJob): JobFormValues {
  return {
    title: job?.title ?? "",
    url: job?.url ?? "",
    enabled: job?.enabled ?? true,
    saveResponses: job?.saveResponses ?? false,
    requestTimeout: String(job?.requestTimeout ?? 300),
    redirectSuccess: job?.redirectSuccess ?? false,
    requestMethod: String(job?.requestMethod ?? 0),

    timezone: job?.schedule?.timezone ?? "America/Toronto",
    expiresAt: String(job?.schedule?.expiresAt ?? 0),
    minutes: job?.schedule?.minutes ? job.schedule.minutes.join(",") : "-1",
    hours: job?.schedule?.hours ? job.schedule.hours.join(",") : "-1",
    mdays: job?.schedule?.mdays ? job.schedule.mdays.join(",") : "-1",
    months: job?.schedule?.months ? job.schedule.months.join(",") : "-1",
    wdays: job?.schedule?.wdays ? job.schedule.wdays.join(",") : "-1",

    authEnable: job?.auth?.enable ?? false,
    authUser: job?.auth?.user ?? "",
    authPassword: job?.auth?.password ?? "",

    notifyOnFailure: job?.notification?.onFailure ?? false,
    notifyOnFailureCount: String(job?.notification?.onFailureCount ?? 1),
    notifyOnSuccess: job?.notification?.onSuccess ?? false,
    notifyOnDisable: job?.notification?.onDisable ?? false,

    headersJson: job?.extendedData?.headers ? JSON.stringify(job.extendedData.headers, null, 2) : "",
    body: job?.extendedData?.body ?? "",
  };
}

export function JobForm(props: {
  mode: "create" | "edit";
  initialJob?: CronJobOrgJob;
  jobId?: number;
  onSaved?: () => void;
}): JSX.Element {
  const { pop } = useNavigation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaults = jobToDefaultValues(props.initialJob);

  async function onSubmit(values: JobFormValues) {
    setIsSubmitting(true);
    try {
      const client = getClient();

      const schedule = {
        timezone: values.timezone || undefined,
        expiresAt: Number.parseInt(values.expiresAt || "0", 10),
        minutes: parseIntList(values.minutes),
        hours: parseIntList(values.hours),
        mdays: parseIntList(values.mdays),
        months: parseIntList(values.months),
        wdays: parseIntList(values.wdays),
      };

      const job: CronJobOrgJob = {
        url: values.url,
        title: values.title || undefined,
        enabled: values.enabled,
        saveResponses: values.saveResponses,
        requestTimeout: Number.parseInt(values.requestTimeout || "300", 10),
        redirectSuccess: values.redirectSuccess,
        requestMethod: Number.parseInt(values.requestMethod || "0", 10),
        schedule,
        auth: {
          enable: values.authEnable,
          user: values.authUser || "",
          password: values.authPassword || "",
        },
        notification: {
          onFailure: values.notifyOnFailure,
          onFailureCount: Number.parseInt(values.notifyOnFailureCount || "1", 10),
          onSuccess: values.notifyOnSuccess,
          onDisable: values.notifyOnDisable,
        },
        extendedData: {
          headers: parseJsonObject(values.headersJson),
          body: values.body || undefined,
        },
      };

      if (props.mode === "create") {
        const toast = await showToast({ style: Toast.Style.Animated, title: "Creating job…" });
        const res = await client.createJob(job);
        toast.style = Toast.Style.Success;
        toast.title = "Job created";
        toast.message = `jobId ${res.jobId}`;
        await Clipboard.copy(String(res.jobId));
        props.onSaved?.();
        pop();
      } else {
        if (!props.jobId) throw new Error("Missing jobId");
        const toast = await showToast({ style: Toast.Style.Animated, title: "Updating job…" });
        await client.updateJob(props.jobId, job);
        toast.style = Toast.Style.Success;
        toast.title = "Job updated";
        props.onSaved?.();
        pop();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={props.mode === "create" ? "Create Job" : "Save Changes"} onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description
        title={props.mode === "create" ? "Create cron-job.org Job" : "Edit cron-job.org Job"}
        text={
          "Lists accept comma/space-separated integers. Use -1 for 'any'.\n" +
          "Common: minutes=-1, hours=-1, mdays=-1, months=-1, wdays=-1 for every minute."
        }
      />

      <Form.Separator />

      <Form.TextField id="title" title="Title" defaultValue={defaults.title} />
      <Form.TextField id="url" title="URL" defaultValue={defaults.url} placeholder="https://example.com/" />
      <Form.Checkbox id="enabled" label="Enabled" defaultValue={defaults.enabled} />
      <Form.Checkbox id="saveResponses" label="Save Responses" defaultValue={defaults.saveResponses} />

      <Form.Dropdown id="requestMethod" title="Request Method" defaultValue={defaults.requestMethod}>
        <Form.Dropdown.Item value="0" title="GET" />
        <Form.Dropdown.Item value="1" title="POST" />
        <Form.Dropdown.Item value="2" title="HEAD" />
      </Form.Dropdown>

      <Form.TextField id="requestTimeout" title="Request Timeout (seconds)" defaultValue={defaults.requestTimeout} />
      <Form.Checkbox id="redirectSuccess" label="Redirects Count As Success" defaultValue={defaults.redirectSuccess} />

      <Form.Separator />

      <Form.TextField id="timezone" title="Timezone" defaultValue={defaults.timezone} />
      <Form.TextField id="expiresAt" title="Expires At (unix seconds, 0 = never)" defaultValue={defaults.expiresAt} />
      <Form.TextField id="minutes" title="Minutes" defaultValue={defaults.minutes} placeholder="-1 or 0,15,30,45" />
      <Form.TextField id="hours" title="Hours" defaultValue={defaults.hours} placeholder="-1 or 0,12" />
      <Form.TextField id="mdays" title="Month Days" defaultValue={defaults.mdays} placeholder="-1 or 1,15,31" />
      <Form.TextField id="months" title="Months" defaultValue={defaults.months} placeholder="-1 or 1,6,12" />
      <Form.TextField id="wdays" title="Week Days" defaultValue={defaults.wdays} placeholder="-1 or 1,2,3,4,5" />

      <Form.Separator />

      <Form.Checkbox id="authEnable" label="HTTP Basic Auth Enabled" defaultValue={defaults.authEnable} />
      <Form.TextField id="authUser" title="Auth User" defaultValue={defaults.authUser} />
      <Form.PasswordField id="authPassword" title="Auth Password" defaultValue={defaults.authPassword} />

      <Form.Separator />

      <Form.Checkbox id="notifyOnFailure" label="Notify On Failure" defaultValue={defaults.notifyOnFailure} />
      <Form.TextField
        id="notifyOnFailureCount"
        title="Notify After N Failures"
        defaultValue={defaults.notifyOnFailureCount}
      />
      <Form.Checkbox
        id="notifyOnSuccess"
        label="Notify On Success After Failure"
        defaultValue={defaults.notifyOnSuccess}
      />
      <Form.Checkbox id="notifyOnDisable" label="Notify On Auto-Disable" defaultValue={defaults.notifyOnDisable} />

      <Form.Separator />

      <Form.TextArea
        id="headersJson"
        title="Request Headers (JSON object)"
        defaultValue={defaults.headersJson}
        placeholder='{
  "Content-Type": "application/json"
}'
      />
      <Form.TextArea id="body" title="Request Body" defaultValue={defaults.body} />

      <Form.Separator />

      <Form.Description
        title="Tip"
        text="If you get 401/403 errors, confirm your API key and any IP allowlist configured in cron-job.org Settings."
      />
    </Form>
  );
}

export async function confirmDelete(title: string): Promise<boolean> {
  return confirmAlert({
    icon: Icon.Trash,
    title: "Delete Job?",
    message: title || "This cannot be undone.",
    primaryAction: { title: "Delete" },
  });
}
