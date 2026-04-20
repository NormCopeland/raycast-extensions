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
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useEffect, useMemo, useState } from "react";

type LaunchContext = {
    config?: string;
};

type DateFormat = "iso-utc" | "iso-local" | "ymd-hm" | "dd-mmm-yyyy-hm";

type Preferences = {
    pdfPages?: string;
    pdfTitle?: string;
    pdfParagraph?: string;
    pdfDateFormat?: DateFormat;
    pdfFileNameTemplate?: string;
};

type PdfFormValues = {
    pages: string;
    title: string;
    paragraph: string;
    dateFormat: DateFormat;
    fileNameTemplate: string;
};

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

function timestampForFilename(date = new Date()): string {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(
        date.getMinutes(),
    )}${pad(date.getSeconds())}`;
}

function parsePageCount(input?: string): number {
    const n = Number((input ?? "1").trim());
    if (!Number.isFinite(n)) return 1;
    const i = Math.floor(n);
    if (i < 1) return 1;
    if (i > 100) return 100;
    return i;
}

function tzOffset(date: Date): string {
    const mins = -date.getTimezoneOffset();
    const sign = mins >= 0 ? "+" : "-";
    const abs = Math.abs(mins);
    const hh = pad(Math.floor(abs / 60));
    const mm = pad(abs % 60);
    return `${sign}${hh}:${mm}`;
}

function formatDate(date: Date, format: DateFormat): string {
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());

    if (format === "iso-local") {
        return `${yyyy}-${mm}-${dd}T${hh}:${min}:${pad(date.getSeconds())}${tzOffset(date)}`;
    }

    if (format === "ymd-hm") {
        return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    }

    if (format === "dd-mmm-yyyy-hm") {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${dd} ${months[date.getMonth()]} ${yyyy} ${hh}:${min}`;
    }

    return date.toISOString();
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
    const words = text.replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= maxCharsPerLine) {
            current = candidate;
        } else {
            if (current) lines.push(current);
            current = word;
            if (lines.length >= maxLines) break;
        }
    }

    if (current && lines.length < maxLines) lines.push(current);

    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[. ]+$/, "")}…`;
    }

    return lines;
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

function normalizePdfBaseName(name: string): string {
    return name.replace(/\.pdf$/i, "").trim();
}

function applyTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => vars[key] ?? "");
}

const WORD_BANK = [
    "lorem",
    "ipsum",
    "dolor",
    "sit",
    "amet",
    "consectetur",
    "adipiscing",
    "elit",
    "integer",
    "vitae",
    "justo",
    "gravida",
    "placerat",
    "nunc",
    "faucibus",
    "massa",
    "mattis",
    "viverra",
    "aliquam",
    "ultricies",
    "ligula",
    "varius",
    "mauris",
    "tempor",
    "tristique",
    "fringilla",
    "turpis",
    "vehicula",
    "accumsan",
    "pharetra",
    "semper",
    "curabitur",
    "sollicitudin",
    "condimentum",
    "porttitor",
    "fermentum",
    "efficitur",
    "sapien",
    "pulvinar",
    "hendrerit",
    "ornare",
    "rhoncus",
    "maximus",
    "dapibus",
    "nulla",
    "sodales",
    "mi",
    "urna",
    "metus",
    "erat",
];

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
    return arr[randomInt(0, arr.length - 1)];
}

function buildSentence(minWords = 6, maxWords = 11): string {
    const wordCount = randomInt(minWords, maxWords);
    const words: string[] = [];

    for (let i = 0; i < wordCount; i++) words.push(pick(WORD_BANK));
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);

    return `${words.join(" ")}.`;
}

function generateRandomParagraph(minSentences = 2, maxSentences = 3): string {
    const count = randomInt(minSentences, maxSentences);
    const sentences: string[] = [];
    for (let i = 0; i < count; i++) sentences.push(buildSentence());
    return sentences.join(" ");
}

async function getRandomImageBytes(): Promise<Uint8Array | null> {
    try {
        const res = await fetch("https://picsum.photos/800/600");
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
    } catch {
        return null;
    }
}

function encodeConfig(values: PdfFormValues): string {
    return Buffer.from(JSON.stringify(values), "utf8").toString("base64url");
}

function decodeConfig(config?: string): Partial<PdfFormValues> {
    if (!config) return {};
    try {
        const parsed = JSON.parse(Buffer.from(config, "base64url").toString("utf8")) as Partial<PdfFormValues>;
        return parsed ?? {};
    } catch {
        return {};
    }
}

function makeQuicklink(commandName: string, values: PdfFormValues) {
    const encoded = encodeConfig(values);

    return {
        name: `Dummy PDF: ${values.title}`,
        link: `raycast://extensions/${environment.ownerOrAuthorName}/${environment.extensionName}/${commandName}`,
        context: { config: encoded },
    };
}

async function generatePdf(values: PdfFormValues) {
    const finalPages = parsePageCount(values.pages);
    const finalTitle = values.title.trim() || "Random Lorem Ipsum Document";
    const finalParagraph = values.paragraph.trim();
    const finalDateFormat = values.dateFormat;

    const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Generating dummy PDF...",
    });

    try {
        const outputDir = path.join(homedir(), "Downloads");
        await mkdir(outputDir, { recursive: true });

        const now = new Date();
        const timestamp = timestampForFilename(now);
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        const rawBaseName = applyTemplate(values.fileNameTemplate.trim() || "dummy_document_{timestamp}", {
            timestamp,
            date,
            title: finalTitle,
            pages: String(finalPages),
        });

        const baseName = sanitizeBaseName(normalizePdfBaseName(rawBaseName), `dummy_document_${timestamp}`);
        const outputPath = path.join(outputDir, `${baseName}.pdf`);

        const imageBytesByPage = await Promise.all(
            Array.from({ length: finalPages }, async () => {
                return await getRandomImageBytes();
            }),
        );

        const pdf = await PDFDocument.create();
        const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);

        for (let pageIndex = 0; pageIndex < finalPages; pageIndex++) {
            const page = pdf.addPage([612, 792]);
            const width = page.getWidth();
            const height = page.getHeight();

            const titleSize = 28;
            const titleY = height - 108;
            const ruleY = height - 148;
            const paragraphStartY = ruleY - 24;
            const imageX = 56;
            const imageY = 140;
            const imageW = 500;
            const imageH = 350;

            page.drawRectangle({
                x: 0,
                y: 0,
                width,
                height,
                color: rgb(1, 1, 1),
            });

            const dateText = formatDate(new Date(), finalDateFormat);
            page.drawText(dateText, {
                x: 430,
                y: height - 55,
                size: 10,
                font: helvetica,
                color: rgb(0.2, 0.2, 0.2),
            });

            const titleWidth = helveticaBold.widthOfTextAtSize(finalTitle, titleSize);
            const titleX = Math.max(24, (width - titleWidth) / 2);

            page.drawText(finalTitle, {
                x: titleX,
                y: titleY,
                size: titleSize,
                font: helveticaBold,
                color: rgb(0.1, 0.1, 0.1),
            });

            page.drawLine({
                start: { x: 46, y: ruleY },
                end: { x: 566, y: ruleY },
                thickness: 1,
                color: rgb(0.8, 0.8, 0.8),
            });

            const paragraphText = finalParagraph.length > 0 ? finalParagraph : generateRandomParagraph();
            const lines = wrapText(paragraphText, 92, 4);

            let y = paragraphStartY;
            for (const line of lines) {
                page.drawText(line, {
                    x: 50,
                    y,
                    size: 11,
                    font: helvetica,
                    color: rgb(0.27, 0.27, 0.27),
                });
                y -= 14;
            }

            const pageImageBytes = imageBytesByPage[pageIndex];
            let embeddedImage: Awaited<ReturnType<typeof pdf.embedJpg>> | null = null;

            if (pageImageBytes) {
                try {
                    embeddedImage = await pdf.embedJpg(pageImageBytes);
                } catch {
                    try {
                        embeddedImage = await pdf.embedPng(pageImageBytes);
                    } catch {
                        embeddedImage = null;
                    }
                }
            }

            if (embeddedImage) {
                const dims = embeddedImage.scaleToFit(imageW, imageH);
                const centeredX = imageX + (imageW - dims.width) / 2;
                const centeredY = imageY + (imageH - dims.height) / 2;

                page.drawImage(embeddedImage, {
                    x: centeredX,
                    y: centeredY,
                    width: dims.width,
                    height: dims.height,
                });
            } else {
                page.drawRectangle({
                    x: imageX,
                    y: imageY,
                    width: imageW,
                    height: imageH,
                    color: rgb(0.68, 0.85, 0.9),
                });

                const fallbackText = "Image unavailable";
                const fs = 18;
                const tw = helveticaBold.widthOfTextAtSize(fallbackText, fs);

                page.drawText(fallbackText, {
                    x: imageX + (imageW - tw) / 2,
                    y: imageY + imageH / 2 - fs / 2,
                    size: fs,
                    font: helveticaBold,
                    color: rgb(0.3, 0.3, 0.3),
                });
            }

            const pageLabel = `Page ${pageIndex + 1} of ${finalPages}`;
            const pageLabelSize = 10;
            const pageLabelWidth = helvetica.widthOfTextAtSize(pageLabel, pageLabelSize);

            page.drawText(pageLabel, {
                x: width - 46 - pageLabelWidth,
                y: 28,
                size: pageLabelSize,
                font: helvetica,
                color: rgb(0.35, 0.35, 0.35),
            });
        }

        const pdfBytes = await pdf.save();
        await writeFile(outputPath, pdfBytes);

        toast.style = Toast.Style.Success;
        toast.title = "Dummy PDF created";
        toast.message = outputPath;
        await open(outputPath);
    } catch (error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to create PDF";
        toast.message = error instanceof Error ? error.message : String(error);
        throw error;
    }
}

export default function Command(props: LaunchProps<{ launchContext?: LaunchContext }>) {
    const prefs = getPreferenceValues<Preferences>();

    const decoded = useMemo(() => decodeConfig(props.launchContext?.config), [props.launchContext?.config]);
    const isQuicklinkLaunch = Boolean(props.launchContext?.config);

    const [pages, setPages] = useState(decoded.pages ?? prefs.pdfPages ?? "1");
    const [title, setTitle] = useState(decoded.title ?? prefs.pdfTitle ?? "Random Lorem Ipsum Document");
    const [paragraph, setParagraph] = useState(decoded.paragraph ?? prefs.pdfParagraph ?? "");
    const [dateFormat, setDateFormat] = useState<DateFormat>(decoded.dateFormat ?? prefs.pdfDateFormat ?? "iso-utc");
    const [fileNameTemplate, setFileNameTemplate] = useState(
        decoded.fileNameTemplate ?? prefs.pdfFileNameTemplate ?? "dummy_document_{timestamp}",
    );

    const currentValues: PdfFormValues = {
        pages,
        title,
        paragraph,
        dateFormat,
        fileNameTemplate,
    };

    const quicklink = makeQuicklink(environment.commandName, currentValues);

    useEffect(() => {
        if (!isQuicklinkLaunch) return;

        const valuesFromQuicklink: PdfFormValues = {
            pages: decoded.pages ?? prefs.pdfPages ?? "1",
            title: decoded.title ?? prefs.pdfTitle ?? "Random Lorem Ipsum Document",
            paragraph: decoded.paragraph ?? prefs.pdfParagraph ?? "",
            dateFormat: (decoded.dateFormat ?? prefs.pdfDateFormat ?? "iso-utc") as DateFormat,
            fileNameTemplate: decoded.fileNameTemplate ?? prefs.pdfFileNameTemplate ?? "dummy_document_{timestamp}",
        };

        void (async () => {
            try {
                await generatePdf(valuesFromQuicklink);
            } finally {
                await popToRoot({ clearSearchBar: true });
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isQuicklinkLaunch]);

    async function onSubmit(values: PdfFormValues) {
        await generatePdf(values);
    }

    if (isQuicklinkLaunch) {
        return null;
    }

    return (
        <Form
            actions={
                <ActionPanel>
                    <Action.SubmitForm title="Generate Dummy PDF" onSubmit={onSubmit} />
                    <Action.CreateQuicklink title="Create Quicklink from Current Settings" quicklink={quicklink} />
                    <Action.CopyToClipboard title="Copy Quicklink URL" content={quicklink.link} />
                </ActionPanel>
            }
        >
            <Form.TextField id="pages" title="Number of Pages" value={pages} onChange={setPages} placeholder="1" />
            <Form.TextField
                id="title"
                title="Title"
                value={title}
                onChange={setTitle}
                placeholder="Random Lorem Ipsum Document"
            />
            <Form.TextArea
                id="paragraph"
                title="Paragraph Text"
                value={paragraph}
                onChange={setParagraph}
                placeholder="Leave blank for random text"
            />
            <Form.Dropdown
                id="dateFormat"
                title="Date Format"
                value={dateFormat}
                onChange={(v) => setDateFormat(v as DateFormat)}
            >
                <Form.Dropdown.Item value="iso-utc" title="ISO 8601 (UTC)" />
                <Form.Dropdown.Item value="iso-local" title="ISO 8601 (Local)" />
                <Form.Dropdown.Item value="ymd-hm" title="YYYY-MM-DD HH:mm" />
                <Form.Dropdown.Item value="dd-mmm-yyyy-hm" title="DD MMM YYYY HH:mm" />
            </Form.Dropdown>
            <Form.TextField
                id="fileNameTemplate"
                title="File Name Template"
                value={fileNameTemplate}
                onChange={setFileNameTemplate}
                placeholder="dummy_document_{timestamp}"
            />
        </Form>
    );
}
