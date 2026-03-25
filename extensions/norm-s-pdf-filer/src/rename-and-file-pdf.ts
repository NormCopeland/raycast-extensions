import { getSelectedFinderItems, showToast, Toast, showHUD } from "@raycast/api";
import path from "path";
import { processAndFilePdf } from "./utils";

export default async function Command() {
  try {
    const selectedItems = await getSelectedFinderItems();

    const pdfFiles = selectedItems.filter((item) => path.extname(item.path).toLowerCase() === ".pdf");

    if (pdfFiles.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No PDF selected",
        message: "Select a PDF file in Finder, or use 'Pick and File PDF' instead.",
      });
      return;
    }

    for (const file of pdfFiles) {
      await processAndFilePdf(file.path);
    }

    if (pdfFiles.length > 1) {
      await showHUD(`Filed ${pdfFiles.length} PDFs`);
    }
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not get Finder selection",
      message: "Make sure Finder is the frontmost app with a PDF selected, or use 'Pick and File PDF'.",
    });
  }
}
