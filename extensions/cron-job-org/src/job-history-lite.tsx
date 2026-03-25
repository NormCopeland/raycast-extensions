import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { getClient } from "./client";
import { formatUnixSeconds } from "./format";

interface JobHistoryLiteProps {
  jobId: number;
  jobTitle: string;
}

interface HistoryResponse {
  history: Array<{
    identifier: string;
    statusText: string;
    httpStatus: number;
    date: number;
    duration: number;
    url: string;
  }>;
  predictions: number[];
}

interface CachedData {
  data: HistoryResponse;
  timestamp: number;
}

// Cache for history to avoid repeated API calls
const historyCache = new Map<number, CachedData>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedHistory(jobId: number): HistoryResponse | null {
  const cached = historyCache.get(jobId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedHistory(jobId: number, data: HistoryResponse): void {
  historyCache.set(jobId, { data, timestamp: Date.now() });
}

export default function JobHistoryLite({ jobId, jobTitle }: JobHistoryLiteProps): JSX.Element {
  const { data, isLoading, error, revalidate } = useCachedPromise(
    async (jid: number) => {
      // Check cache first
      const cached = getCachedHistory(jid);
      if (cached) {
        return cached;
      }

      const client = getClient();
      try {
        const history = await client.getJobHistory(jid);
        
        // Only keep the last 10 items to save API calls and bandwidth
        const limitedHistory = {
          ...history,
          history: history.history.slice(0, 10)
        };
        
        // Cache the result
        setCachedHistory(jid, limitedHistory);
        
        return limitedHistory;
      } catch (error) {
        console.error(`Failed to fetch history for job ${jid}:`, error);
        throw error;
      }
    },
    [jobId],
    { keepPreviousData: true }
  );

  if (error) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Failed to Load History"
          description={`Could not load history for ${jobTitle}. Try again later.`}
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon={Icon.RotateClockwise}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const historyItems = data?.history ?? [];

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`History: ${jobTitle}`}
      searchBarPlaceholder="Search history…"
    >
      {historyItems.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Clock}
          title="No History"
          description="This job hasn't executed yet or has no saved history."
          actions={
            <ActionPanel>
              <Action
                title="Refresh"
                icon={Icon.RotateClockwise}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      ) : (
        historyItems.map((item: HistoryResponse['history'][0]) => (
          <List.Item
            key={item.identifier}
            title={item.statusText}
            subtitle={`HTTP ${item.httpStatus} • ${formatUnixSeconds(item.date)}`}
            accessories={[
              { text: `${item.duration} ms` },
              ...(item.httpStatus >= 400 ? [{ icon: Icon.Warning, tooltip: "Failed request" }] : [])
            ]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy Identifier" content={item.identifier} />
                <Action.CopyToClipboard title="Copy URL" content={item.url} />
                <Action
                  title="Refresh"
                  icon={Icon.RotateClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={revalidate}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
