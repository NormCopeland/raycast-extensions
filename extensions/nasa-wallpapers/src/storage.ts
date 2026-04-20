import { LocalStorage } from "@raycast/api";
import { StarredImage } from "./types";

const STARRED_KEY = "starred-images";

export async function getStarredImages(): Promise<StarredImage[]> {
  const stored = await LocalStorage.getItem<string>(STARRED_KEY);
  if (!stored) {
    return [];
  }
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export async function isImageStarred(date: string): Promise<boolean> {
  const starred = await getStarredImages();
  return starred.some((img) => img.date === date);
}

export async function toggleStarImage(image: StarredImage): Promise<boolean> {
  const starred = await getStarredImages();
  const index = starred.findIndex((img) => img.date === image.date);

  if (index >= 0) {
    starred.splice(index, 1);
    await LocalStorage.setItem(STARRED_KEY, JSON.stringify(starred));
    return false;
  } else {
    starred.push(image);
    await LocalStorage.setItem(STARRED_KEY, JSON.stringify(starred));
    return true;
  }
}

export async function clearStarredImages(): Promise<void> {
  await LocalStorage.removeItem(STARRED_KEY);
}
