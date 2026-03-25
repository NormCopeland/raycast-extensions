import { AI, getPreferenceValues, showToast, Toast, environment } from "@raycast/api";
import { createClient } from "webdav";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface Preferences {
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavDestFolder: string;
  namingInstructions: string;
}

export function getPrefs(): Preferences {
  return getPreferenceValues<Preferences>();
}

export async function extractPdfText(filePath: string): Promise<string> {
  const swift = `
import PDFKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let doc = PDFDocument(url: url) else { exit(1) }
var text = ""
for i in 0..<doc.pageCount {
  if let page = doc.page(at: i), let s = page.string { text += s + "\\n" }
}
print(text)
`;

  const { stdout } = await execFileAsync("/usr/bin/swift", ["-e", swift, filePath], {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
  });
  return stdout;
}

export async function generateFilename(pdfText: string): Promise<string> {
  const prefs = getPrefs();

  const truncatedText = pdfText.slice(0, 3000);

  let prompt = `Here is the text content extracted from a PDF document. Generate a clean, descriptive filename for this document (without the .pdf extension). Return ONLY the filename string, nothing else.\n\n`;

  if (prefs.namingInstructions && prefs.namingInstructions.trim().length > 0) {
    prompt += `IMPORTANT — Follow this naming format: ${prefs.namingInstructions}\n\n`;
  }

  prompt += `PDF Content:\n${truncatedText}`;

  if (!environment.canAccess(AI)) {
    throw new Error("Raycast AI is not available. A Raycast Pro subscription is required.");
  }

  const filename = await AI.ask(prompt, { creativity: "low" });
  return filename.trim().replace(/[/\\:*?"<>|]/g, "_");
}

interface WebDavItem {
  basename: string;
  type: string;
}

async function resolveWebDavPath(
  client: ReturnType<typeof createClient>,
  folderPath: string,
): Promise<string> {
  const segments = folderPath.split("/").filter(Boolean);
  let resolved = "/";

  for (const segment of segments) {
    const result = await client.getDirectoryContents(resolved, { deep: false });
    const listing = (Array.isArray(result) ? result : (result as { data: WebDavItem[] }).data) as WebDavItem[];

    const match = listing.find(
      (item) => item.type === "directory" && item.basename.toLowerCase() === segment.toLowerCase(),
    );

    if (!match) {
      throw new Error(
        `Folder "${segment}" not found in "${resolved}" on the WebDAV server. Check spelling and path in extension preferences.`,
      );
    }

    resolved = resolved === "/" ? `/${match.basename}` : `${resolved}/${match.basename}`;
  }

  return resolved.endsWith("/") ? resolved : resolved + "/";
}

export async function uploadToWebDav(filePath: string, newFilename: string): Promise<string> {
  const prefs = getPrefs();

  const client = createClient(prefs.webdavUrl, {
    username: prefs.webdavUsername,
    password: prefs.webdavPassword,
  });

  let destFolder = prefs.webdavDestFolder.trim();
  if (!destFolder.startsWith("/")) destFolder = "/" + destFolder;

  // Resolve each path segment case-insensitively against the actual server contents
  const resolvedFolder = await resolveWebDavPath(client, destFolder);
  const remotePath = `${resolvedFolder}${newFilename}.pdf`;

  const fileBuffer = fs.readFileSync(filePath);
  await client.putFileContents(remotePath, fileBuffer, { overwrite: true });

  return remotePath;
}

export async function processAndFilePdf(filePath: string): Promise<void> {
  const originalName = path.basename(filePath);

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Reading PDF…",
    message: originalName,
  });

  try {
    const pdfText = await extractPdfText(filePath);

    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error("Could not extract any text from the PDF. The file may be image-based.");
    }

    toast.title = "Generating filename with AI…";
    const newFilename = await generateFilename(pdfText);

    toast.title = "Uploading to WebDAV…";
    toast.message = `${newFilename}.pdf`;
    const remotePath = await uploadToWebDav(filePath, newFilename);

    toast.style = Toast.Style.Success;
    toast.title = "PDF filed successfully";
    toast.message = `${newFilename}.pdf → ${remotePath}`;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Failed to file PDF";
    toast.message = error instanceof Error ? error.message : String(error);
  }
}
