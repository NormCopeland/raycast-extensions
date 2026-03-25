import { Action, ActionPanel, Icon, List, Toast, showToast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { CronJobOrgJob } from "./api";
import { getClient } from "./client";
import { formatUnixSeconds, statusToText } from "./format";
import { JobForm, confirmDelete } from "./components";
import JobHistoryLite from "./job-history-lite";

function titleForJob(job: CronJobOrgJob): string {
  return job.title?.trim() || job.url;
}

export default function ListJobs(): JSX.Element {
  const { data, isLoading, error, revalidate } = useCachedPromise(async () => {
    const client = getClient();
    return await client.listJobs();
  }, []);

  if (error) {
    void showToast({ style: Toast.Style.Failure, title: "Failed to load jobs", message: String(error) });
  }

  const jobs = data?.jobs ?? [];

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search jobs by title or URL…">
      {jobs.map((job) => (
        <List.Item
          key={job.jobId}
          title={titleForJob(job)}
          subtitle={job.url}
          accessories={[
            { text: job.enabled ? "Enabled" : "Disabled", icon: job.enabled ? Icon.CheckCircle : Icon.Circle },
            { text: statusToText(job.lastStatus) },
            { text: `Next ${formatUnixSeconds(job.nextExecution)}` },
          ]}
          actions={
            <ActionPanel>
              <Action.Push title="Show History" icon={Icon.Clock} target={<JobHistoryLite jobId={job.jobId!} jobTitle={titleForJob(job)} />} />
              <Action.Push
                title="Edit Job"
                icon={Icon.Pencil}
                target={<JobForm mode="edit" jobId={job.jobId} initialJob={job} onSaved={revalidate} />}
              />

              <Action
                title={job.enabled ? "Disable" : "Enable"}
                icon={job.enabled ? Icon.XMarkCircle : Icon.CheckCircle}
                onAction={async () => {
                  if (!job.jobId) return;
                  const client = getClient();
                  const toast = await showToast({
                    style: Toast.Style.Animated,
                    title: job.enabled ? "Disabling…" : "Enabling…",
                  });
                  await client.updateJob(job.jobId, { enabled: !job.enabled });
                  toast.style = Toast.Style.Success;
                  toast.title = job.enabled ? "Disabled" : "Enabled";
                  await revalidate();
                }}
              />

              <Action
                title="Delete Job"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={async () => {
                  if (!job.jobId) return;
                  const ok = await confirmDelete(titleForJob(job));
                  if (!ok) return;
                  const client = getClient();
                  const toast = await showToast({ style: Toast.Style.Animated, title: "Deleting…" });
                  await client.deleteJob(job.jobId);
                  toast.style = Toast.Style.Success;
                  toast.title = "Deleted";
                  await revalidate();
                }}
              />

              <Action
                title="Refresh"
                icon={Icon.RotateClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={revalidate}
              />

              <ActionPanel.Section>
                <Action.Push
                  title="Create Job"
                  icon={Icon.Plus}
                  target={<JobForm mode="create" onSaved={revalidate} />}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}

      {jobs.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Clock}
          title="No jobs found"
          description="Create your first job with the action panel."
          actions={
            <ActionPanel>
              <Action.Push title="Create Job" icon={Icon.Plus} target={<JobForm mode="create" />} />
            </ActionPanel>
          }
        />
      ) : null}
    </List>
  );
}
