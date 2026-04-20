import {
    Action,
    ActionPanel,
    environment,
    Form,
    getPreferenceValues,
    LaunchProps,
    open,
    popToRoot,
    showToast,
    Toast,
} from "@raycast/api";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { useEffect, useMemo, useState } from "react";

type LaunchContext = {
    config?: string;
};

type Preferences = {
    defaultSize?: string;
    defaultBgColor?: string;
    defaultFgColor?: string;
    defaultText?: string;
    defaultFont?: string;
    imageFileNameTemplate?: string;
};

type ParsedSize = {
    width: number;
    height: number;
    normalized: string;
};

type ImageFormValues = {
    size: string;
    text: string;
    font: string;
    bg: string;
    fg: string;
    fileNameTemplate: string;
};

const ALLOWED_FONTS = [
    "lato",
    "montserrat",
    "opensans",
    "oswald",
    "playfairdisplay",
    "poppins",
    "ptserif",
    "raleway",
    "roboto",
] as const;

function parseSize(input: string): ParsedSize | null {
    const cleaned = input.trim().toLowerCase().replace(/[×*]/g, "x").replace(/\s+/g, "");
    const match = cleaned.match(/^(\d{1,5})x(\d{1,5})$/);
    if (!match) return null;

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    if (width <= 0 || height <= 0) return null;
    if (width > 10000 || height > 10000) return null;

    return { width, height, normalized: `${width}x${height}` };
}

function normalizeHex(input: string, fallback: string): string {
    const value = (input ?? "").trim().replace(/^#/, "").toUpperCase();
    if (/^[0-9A-F]{3}$/.test(value) || /^[0-9A-F]{6}$/.test(value)) return value;
    return fallback;
}

function normalizeFont(input: string, fallback: string): string {
    const value = (input ?? "").trim().toLowerCase().replace(/\s+/g, "");
    if (ALLOWED_FONTS.includes(value as (typeof ALLOWED_FONTS)[number])) return value;
    return fallback;
}

function sanitizeBaseName(input: string, fallback: string): string {
    const cleaned = (input || "")
        .trim()
        .replace(/[/\\?%*:|"<>]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/\.+$/, "")
        .slice(0, 180);

    return cleaned.length > 0 ? cleaned : fallback;
}

function normalizePngBaseName(name: string): string {
    return name.replace(/\.png$/i, "").trim();
}

function applyTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => vars[key] ?? "");
}

function safeFilePart(input: string): string {
    return input.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function currentDateYmd(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function currentTimestamp(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

async function downloadPlaceholderImage(params: {
    size: string;
    text: string;
    font: string;
    bg: string;
    fg: string;
    outputDir: string;
    fileBaseName: string;
}): Promise<string> {
    const { size, text, font, bg, fg, outputDir, fileBaseName } = params;
    const imageUrl = `https://placehold.co/${size}/${bg}/${fg}.png?text=${encodeURIComponent(text)}&font=${encodeURIComponent(font)}`;
    const fileName = `${fileBaseName}.png`;
    const outputPath = path.join(outputDir, fileName);

    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(outputPath, bytes);
    return outputPath;
}

function encodeConfig(values: ImageFormValues): string {
    return Buffer.from(JSON.stringify(values), "utf8").toString("base64url");
}

function decodeConfig(config?: string): Partial<ImageFormValues> {
    if (!config) return {};
    try {
        const parsed = JSON.parse(Buffer.from(config, "base64url").toString("utf8")) as Partial<ImageFormValues>;
        return parsed ?? {};
    } catch {
        return {};
    }
}

function makeQuicklink(commandName: string, values: ImageFormValues) {
    const encoded = encodeConfig(values);

    return {
        name: `Dummy Image: ${values.size} ${values.text}`,
        link: `raycast://extensions/${environment.ownerOrAuthorName}/${environment.extensionName}/${commandName}`,
        context: { config: encoded },
    };
}

async function generateImage(values: ImageFormValues) {
    const parsedSize = parseSize(values.size.trim());
    if (!parsedSize) {
        await showToast({
            style: Toast.Style.Failure,
            title: "Invalid size",
            message: "Use 500x500 (also accepts 500 x 500, 500×500, 500*500)",
        });
        return;
    }

    const finalText = values.text.trim();
    if (!finalText) {
        await showToast({
            style: Toast.Style.Failure,
            title: "Missing text",
            message: "Enter text",
        });
        return;
    }

    const finalFont = normalizeFont(values.font, "lato");
    const finalBg = normalizeHex(values.bg, "8ECF4F");
    const finalFg = normalizeHex(values.fg, "FFFFFF");

    const timestamp = currentTimestamp();
    const date = currentDateYmd();

    const rawBaseName = applyTemplate(values.fileNameTemplate.trim() || "{size}-{text}-{font}", {
        timestamp,
        date,
        size: parsedSize.normalized,
        text: finalText,
        font: finalFont,
        bg: finalBg,
        fg: finalFg,
    });

    const fallbackBaseName = `${parsedSize.normalized}-${safeFilePart(finalText)}-${finalFont}-${timestamp}`;
    const fileBaseName = sanitizeBaseName(normalizePngBaseName(rawBaseName), fallbackBaseName);

    const outputDir = path.join(homedir(), "Downloads");
    await mkdir(outputDir, { recursive: true });

    const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Generating dummy image...",
    });

    try {
        const savedPath = await downloadPlaceholderImage({
            size: parsedSize.normalized,
            text: finalText,
            font: finalFont,
            bg: finalBg,
            fg: finalFg,
            outputDir,
            fileBaseName,
        });

        toast.style = Toast.Style.Success;
        toast.title = "Dummy image created";
        toast.message = savedPath;
        await open(savedPath);
    } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to generate image";
        toast.message = error instanceof Error ? error.message : String(error);
        throw error;
    }
}

export default function Command(props: LaunchProps<{ launchContext?: LaunchContext }>) {
    const prefs = getPreferenceValues<Preferences>();

    const decoded = useMemo(() => decodeConfig(props.launchContext?.config), [props.launchContext?.config]);
    const isQuicklinkLaunch = Boolean(props.launchContext?.config);

    const [size, setSize] = useState(decoded.size ?? prefs.defaultSize ?? "500x500");
    const [text, setText] = useState(decoded.text ?? prefs.defaultText ?? "Dummy");
    const [font, setFont] = useState(decoded.font ?? normalizeFont(prefs.defaultFont ?? "lato", "lato"));
    const [bg, setBg] = useState(decoded.bg ?? normalizeHex(prefs.defaultBgColor ?? "8ECF4F", "8ECF4F"));
    const [fg, setFg] = useState(decoded.fg ?? normalizeHex(prefs.defaultFgColor ?? "FFFFFF", "FFFFFF"));
    const [fileNameTemplate, setFileNameTemplate] = useState(
        decoded.fileNameTemplate ?? prefs.imageFileNameTemplate ?? "{size}-{text}-{font}",
    );

    const currentValues: ImageFormValues = {
        size,
        text,
        font,
        bg,
        fg,
        fileNameTemplate,
    };

    const quicklink = makeQuicklink(environment.commandName, currentValues);

    useEffect(() => {
        if (!isQuicklinkLaunch) return;

        const valuesFromQuicklink: ImageFormValues = {
            size: decoded.size ?? prefs.defaultSize ?? "500x500",
            text: decoded.text ?? prefs.defaultText ?? "Dummy",
            font: decoded.font ?? normalizeFont(prefs.defaultFont ?? "lato", "lato"),
            bg: decoded.bg ?? normalizeHex(prefs.defaultBgColor ?? "8ECF4F", "8ECF4F"),
            fg: decoded.fg ?? normalizeHex(prefs.defaultFgColor ?? "FFFFFF", "FFFFFF"),
            fileNameTemplate: decoded.fileNameTemplate ?? prefs.imageFileNameTemplate ?? "{size}-{text}-{font}",
        };

        void (async () => {
            try {
                await generateImage(valuesFromQuicklink);
            } finally {
                await popToRoot({ clearSearchBar: true });
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isQuicklinkLaunch]);

    async function onSubmit(values: ImageFormValues) {
        await generateImage(values);
    }

    if (isQuicklinkLaunch) {
        return null;
    }

    return (
        <Form
            actions={
                <ActionPanel>
                    <Action.SubmitForm title="Generate Dummy Image" onSubmit={onSubmit} />
                    <Action.CreateQuicklink title="Create Quicklink from Current Settings" quicklink={quicklink} />
                    <Action.CopyToClipboard title="Copy Quicklink URL" content={quicklink.link} />
                </ActionPanel>
            }
        >
            <Form.TextField id="size" title="Dimensions" value={size} onChange={setSize} placeholder="500x500" />
            <Form.TextField id="text" title="Text" value={text} onChange={setText} placeholder="Dummy" />
            <Form.Dropdown id="font" title="Font" value={font} onChange={setFont}>
                <Form.Dropdown.Item value="lato" title="Lato" />
                <Form.Dropdown.Item value="montserrat" title="Montserrat" />
                <Form.Dropdown.Item value="opensans" title="Open Sans" />
                <Form.Dropdown.Item value="oswald" title="Oswald" />
                <Form.Dropdown.Item value="playfairdisplay" title="Playfair Display" />
                <Form.Dropdown.Item value="poppins" title="Poppins" />
                <Form.Dropdown.Item value="ptserif" title="PT Serif" />
                <Form.Dropdown.Item value="raleway" title="Raleway" />
                <Form.Dropdown.Item value="roboto" title="Roboto" />
            </Form.Dropdown>
            <Form.TextField id="bg" title="Background Hex" value={bg} onChange={setBg} placeholder="8ECF4F" />
            <Form.TextField id="fg" title="Foreground Hex" value={fg} onChange={setFg} placeholder="FFFFFF" />
            <Form.TextField
                id="fileNameTemplate"
                title="File Name Template"
                value={fileNameTemplate}
                onChange={setFileNameTemplate}
                placeholder="{size}-{text}-{font}"
            />
        </Form>
    );
}
