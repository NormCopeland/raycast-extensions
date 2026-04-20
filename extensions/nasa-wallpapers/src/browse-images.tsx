import { useState, useEffect } from "react";
import {
  Grid,
  ActionPanel,
  Action,
  getPreferenceValues,
  showToast,
  Toast,
  Icon,
  Color,
  LocalStorage,
  environment,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { writeFile } from "fs/promises";
import { execSync } from "child_process";
import { fetchNASAImages } from "./api";
import { NASAImage } from "./types";
import { getStarredImages, isImageStarred, toggleStarImage } from "./storage";
import ImageDetail from "./image-detail";

interface Preferences {
  apiKey: string;
}

export default function Command() {
  const { apiKey } = getPreferenceValues<Preferences>();
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [starredDates, setStarredDates] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(10);

  const { data: images, isLoading, revalidate } = useCachedPromise(fetchNASAImages, [apiKey, pageSize]);
  const { data: starred } = useCachedPromise(getStarredImages, []);

  useEffect(() => {
    if (starred) {
      setStarredDates(new Set(starred.map((img) => img.date)));
    }
  }, [starred]);

  const filteredAndSortedImages = () => {
    if (!images) return [];

    let filtered = images.filter((img) => img.media_type === "image");

    if (showStarredOnly) {
      filtered = filtered.filter((img) => starredDates.has(img.date));
    }

    // Always sort by date descending (newest first)
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return filtered;
  };

  const handleToggleStar = async (image: NASAImage) => {
    const isStarred = await toggleStarImage({
      date: image.date,
      title: image.title,
      url: image.url,
      hdurl: image.hdurl,
    });

    if (isStarred) {
      setStarredDates((prev) => new Set(prev).add(image.date));
      await showToast({
        style: Toast.Style.Success,
        title: "Starred",
        message: image.title,
      });
    } else {
      setStarredDates((prev) => {
        const next = new Set(prev);
        next.delete(image.date);
        return next;
      });
      await showToast({
        style: Toast.Style.Success,
        title: "Unstarred",
        message: image.title,
      });
    }

    await revalidate();
  };

  const displayedImages = filteredAndSortedImages();

  const handleLoadMore = () => {
    setPageSize((prev) => prev + 10);
  };

  return (
    <Grid
      columns={5}
      inset={Grid.Inset.Large}
      isLoading={isLoading}
      searchBarPlaceholder="Search NASA wallpapers by title, description, or date..."
      onSelectionChange={(id) => {
        if (id && displayedImages.length > 0) {
          const index = displayedImages.findIndex((img) => img.date === id);
          if (index >= displayedImages.length - 10) {
            handleLoadMore();
          }
        }
      }}
      searchBarAccessory={
        <Grid.Dropdown
          tooltip="Filter Images"
          value={showStarredOnly ? "starred" : "all"}
          onChange={(value) => setShowStarredOnly(value === "starred")}
        >
          <Grid.Dropdown.Item title="All Images" value="all" icon={Icon.Image} />
          <Grid.Dropdown.Item title="Starred Only" value="starred" icon={Icon.Star} />
        </Grid.Dropdown>
      }
    >
      {displayedImages.map((image) => {
        const isStarred = starredDates.has(image.date);

        return (
          <Grid.Item
            key={image.date}
            content={image.url}
            title={image.title}
            subtitle={image.date}
            keywords={[image.title, image.explanation, image.date, image.copyright || ""].filter(Boolean)}
            accessory={isStarred ? { icon: { source: Icon.Star, tintColor: Color.Yellow } } : undefined}
            actions={
              <ActionPanel>
                <Action.Push title="View Details" icon={Icon.Eye} target={<ImageDetail image={image} />} />
                <Action
                  title="Set as Wallpaper"
                  icon={Icon.Desktop}
                  onAction={async () => {
                    try {
                      await showToast({ style: Toast.Style.Animated, title: "Setting wallpaper..." });
                      const imageUrl = image.hdurl || image.url;
                      const response = await globalThis.fetch(imageUrl);
                      const arrayBuffer = await response.arrayBuffer();
                      const buffer = Buffer.from(arrayBuffer);
                      const tmpPath = `${environment.supportPath}/wallpaper-${image.date}.jpg`;
                      await writeFile(tmpPath, buffer);
                      execSync(`osascript -e 'tell application "System Events" to tell every desktop to set picture to "${tmpPath}"'`);
                      await showToast({ style: Toast.Style.Success, title: "Wallpaper set!", message: image.title });
                    } catch (error) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Failed to set wallpaper",
                        message: error instanceof Error ? error.message : "Unknown error",
                      });
                    }
                  }}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "w" }}
                />
                <Action
                  title={isStarred ? "Unstar" : "Star"}
                  icon={isStarred ? Icon.StarDisabled : Icon.Star}
                  onAction={() => handleToggleStar(image)}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                />
                <Action.OpenInBrowser
                  title="Open in Browser"
                  url={image.hdurl || image.url}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                />
                <Action.CopyToClipboard
                  title="Copy Image URL"
                  content={image.hdurl || image.url}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </Grid>
  );
}
