import { Action, ActionPanel, Icon, List, Toast, showToast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { getClient } from "./client";
import { formatUnixSeconds } from "./format";

export default function JobHistory(): JSX.Element {
  const {
    data: jobsRes,
    isLoading: isLoadingJobs,
    error: jobsError,
  } = useCachedPromise(async () => {
    const client = getClient();
    return await client.listJobs();
  }, []);

  if (jobsError) {
    void showToast({ style: Toast.Style.Failure, title: "Failed to load jobs", message: String(jobsError) });
  }

  const jobs = jobsRes?.jobs ?? [];
  const [jobId, setJobId] = useState<number | undefined>(undefined);

  const selectedJob = useMemo(() => jobs.find((j) => j.jobId === jobId), [jobs, jobId]);

  const {
    data: historyRes,
    isLoading: isLoadingHistory,
    error: historyError,
    revalidate,
  } = useCachedPromise(
    async (jid?: number) => {
      const client = getClient();
      if (!jid) {
        // When "All Jobs" is selected, fetch history for all jobs with rate limiting
        const allJobs = await client.listJobs();
        
        // Add delay between requests to avoid rate limiting
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        
        const allHistory = [];
        let predictions: number[] = [];
        
        for (let i = 0; i < allJobs.jobs.length; i++) {
          const job = allJobs.jobs[i];
          try {
            const history = await client.getJobHistory(job.jobId!);
            allHistory.push(...history.history);
            if (history.predictions.length > 0 && predictions.length === 0) {
              predictions = history.predictions;
            }
            
            // Add delay between requests (except for the last one)
            if (i < allJobs.jobs.length - 1) {
              await delay(500); // 500ms delay between requests
            }
          } catch (error) {
            // Continue with other jobs even if one fails
            console.warn(`Failed to fetch history for job ${job.jobId}:`, error);
          }
        }
        
        // Sort by date (most recent first)
        allHistory.sort((a, b) => b.date - a.date);
        
        return { history: allHistory, predictions };
      } else {
        // When a specific job is selected, fetch that job's history
        return await client.getJobHistory(jid);
      }
    },
    [jobId],
  );

  if (historyError) {
    void showToast({ style: Toast.Style.Failure, title: "Failed to load history", message: String(historyError) });
  }

  return (
    <List
      isLoading={isLoadingJobs || isLoadingHistory}
      isShowingDetail={true}
      searchBarPlaceholder="Search history…"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Job"
          storeValue
          value={jobId ? String(jobId) : "all"}
          onChange={(val) => {
            if (val === "all") {
              setJobId(undefined);
            } else {
              const jid = Number.parseInt(val, 10);
              setJobId(jid);
            }
          }}
        >
          <List.Dropdown.Item key="all" value="all" title="All Jobs" />
          {jobs.map((j) => (
            <List.Dropdown.Item key={j.jobId} value={String(j.jobId)} title={j.title?.trim() || j.url} />
          ))}
        </List.Dropdown>
      }
    >
      <List.Section
        title={selectedJob ? `History: ${selectedJob.title?.trim() || selectedJob.url}` : "History"}
      >
        {(historyRes?.history ?? []).map((h) => (
          <List.Item
            key={h.identifier}
            title={h.statusText}
            subtitle={`HTTP ${h.httpStatus} • ${formatUnixSeconds(h.date)}`}
            accessories={[{ text: `${h.duration} ms` }]}
            detail={<HistoryItemDetail jobId={h.jobId} identifier={h.identifier} predictions={historyRes?.predictions} />}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy Identifier" content={h.identifier} />
                <Action.CopyToClipboard title="Copy URL" content={h.url} />
                <Action
                  title="Refresh"
                  icon={Icon.RotateClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={revalidate}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      {historyRes && (historyRes.history?.length ?? 0) === 0 ? (
        <List.EmptyView
          icon={Icon.Clock}
          title="No history yet"
          description="This job has not executed (or no logs available)."
        />
      ) : null}
    </List>
  );
}

function HistoryItemDetail(props: { jobId: number; identifier: string; predictions?: number[] }): JSX.Element {
  const { data, isLoading, error } = useCachedPromise(async () => {
    const client = getClient();
    return await client.getHistoryItem(props.jobId, props.identifier);
  }, [props.jobId, props.identifier]);

  if (error) {
    return (
      <List.Item.Detail
        markdown={`# Error\n\nFailed to load history item details: ${String(error)}`}
        metadata={
          <List.Item.Detail.Metadata>
            <List.Item.Detail.Metadata.Label title="Identifier" text={props.identifier} />
          </List.Item.Detail.Metadata>
        }
      />
    );
  }

  const item = data?.jobHistoryDetails;

  const markdown = item?.body ? `
## Response Body

\`\`\`
${item.body.slice(0, 3000)}${item.body.length > 3000 ? "\n... (truncated)" : ""}
\`\`\`
` : "## Response Body\n\nNo body available";

  return (
    <List.Item.Detail
      isLoading={isLoading}
      markdown={markdown}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Identifier" text={props.identifier} />
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Status" text={item?.statusText ?? "–"} />
          <List.Item.Detail.Metadata.Label title="HTTP Status" text={item?.httpStatus?.toString() ?? "–"} />
          <List.Item.Detail.Metadata.Label title="Duration" text={item?.duration ? `${item.duration} ms` : "–"} />
          <List.Item.Detail.Metadata.Label title="Date" text={formatUnixSeconds(item?.date) || "–"} />
          <List.Item.Detail.Metadata.Label title="Planned Date" text={formatUnixSeconds(item?.datePlanned) || "–"} />
          {props.predictions && props.predictions.length > 0 && (
            <>
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label 
                title="Next Executions" 
                text={props.predictions.map(formatUnixSeconds).join(", ")} 
              />
            </>
          )}
          {item?.headers && (
            <>
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Headers" text={`${Object.keys(item.headers).length} headers`} />
            </>
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}
