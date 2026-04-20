import { getPreferenceValues, showHUD, showToast, Toast, environment } from "@raycast/api";
import { writeFile } from "fs/promises";
import { execSync } from "child_process";
import { fetchRandomNASAImage } from "./api";
import { getStarredImages } from "./storage";

interface Preferences {
  apiKey: string;
  starredOnly: boolean;
}

export default async function Command() {
  const { apiKey, starredOnly } = getPreferenceValues<Preferences>();

  try {
    await showToast({
      style: Toast.Style.Animated,
      title: "Setting wallpaper...",
    });

    let imageUrl: string;
    let title: string;

    if (starredOnly) {
      const starred = await getStarredImages();

      if (starred.length === 0) {
        await showHUD("❌ No starred images found. Star some images first!");
        return;
      }

      const randomIndex = Math.floor(Math.random() * starred.length);
      const randomStarred = starred[randomIndex];
      imageUrl = randomStarred.hdurl || randomStarred.url;
      title = randomStarred.title;
    } else {
      const image = await fetchRandomNASAImage(apiKey);

      if (image.media_type !== "image") {
        await showHUD("❌ Random selection was a video. Try again!");
        return;
      }

      imageUrl = image.hdurl || image.url;
      title = image.title;
    }

    const response = await globalThis.fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tmpPath = `${environment.supportPath}/wallpaper-random.jpg`;
    await writeFile(tmpPath, buffer);
    execSync(`osascript -e 'tell application "System Events" to tell every desktop to set picture to "${tmpPath}"'`);

    await showHUD(`✅ Wallpaper set: ${title}`);
  } catch (error) {
    await showHUD(`❌ Failed to set wallpaper: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
