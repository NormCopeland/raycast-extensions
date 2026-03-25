import { CronJobOrgClient } from "./api";
import { getPrefs } from "./prefs";

export function getClient(): CronJobOrgClient {
  const { apiKey } = getPrefs();
  return new CronJobOrgClient({ apiKey });
}
