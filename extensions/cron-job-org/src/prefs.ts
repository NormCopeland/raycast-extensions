import { getPreferenceValues } from "@raycast/api";

export type Preferences = {
  apiKey: string;
};

export function getPrefs(): Preferences {
  return getPreferenceValues<Preferences>();
}
