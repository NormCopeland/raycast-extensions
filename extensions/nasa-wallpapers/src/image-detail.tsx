import { useState, useEffect } from "react";
import { Detail, ActionPanel, Action, Icon, showToast, Toast, Color, environment } from "@raycast/api";
import { writeFile } from "fs/promises";
import { execSync } from "child_process";
import { NASAImage } from "./types";
import { isImageStarred, toggleStarImage } from "./storage";

interface ImageDetailProps {
  image: NASAImage;
}

export default function ImageDetail({ image }: ImageDetailProps) {
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    isImageStarred(image.date).then(setStarred);
  }, [image.date]);

  const handleToggleStar = async () => {
    const isStarred = await toggleStarImage({
      date: image.date,
      title: image.title,
      url: image.url,
      hdurl: image.hdurl,
    });

    setStarred(isStarred);

    await showToast({
      style: Toast.Style.Success,
      title: isStarred ? "Starred" : "Unstarred",
      message: image.title,
    });
  };

  const imageUrl = image.hdurl || image.url;

  const markdown = `
# ${image.title}

![${image.title}](${imageUrl})

${image.explanation}
`;

  return (
    <Detail
      markdown={markdown}
      navigationTitle={image.title}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Date" text={image.date} />
          <Detail.Metadata.Label title="Media Type" text={image.media_type} />
          {image.copyright && <Detail.Metadata.Label title="Copyright" text={image.copyright} />}
          <Detail.Metadata.Separator />
          {starred && (
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Starred" color={Color.Yellow} icon={Icon.Star} />
            </Detail.Metadata.TagList>
          )}
          {image.hdurl && (
            <>
              <Detail.Metadata.Separator />
              <Detail.Metadata.Link title="HD Image" target={image.hdurl} text="View HD Version" />
            </>
          )}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Link
            title="APOD Page"
            target={`https://apod.nasa.gov/apod/ap${image.date.replace(/-/g, "").slice(2)}.html`}
            text="View on NASA APOD"
          />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
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
            title={starred ? "Unstar" : "Star"}
            icon={starred ? Icon.StarDisabled : Icon.Star}
            onAction={handleToggleStar}
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
          <Action.CopyToClipboard
            title="Copy Title"
            content={image.title}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}
