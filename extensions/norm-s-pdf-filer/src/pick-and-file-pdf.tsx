import { ActionPanel, Form, Action, showToast, Toast, popToRoot } from "@raycast/api";
import fs from "fs";
import { processAndFilePdf } from "./utils";

export default function Command() {
  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Rename and File PDF"
            onSubmit={async (values: { pdfFile: string[] }) => {
              const filePath = values.pdfFile[0];

              if (!filePath || !fs.existsSync(filePath)) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Invalid file",
                  message: "Please select a valid PDF file.",
                });
                return;
              }

              if (!filePath.toLowerCase().endsWith(".pdf")) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Not a PDF",
                  message: "Please select a PDF file.",
                });
                return;
              }

              await processAndFilePdf(filePath);
              await popToRoot();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="pdfFile"
        title="PDF File"
        allowMultipleSelection={false}
        canChooseDirectories={false}
        canChooseFiles={true}
        allowedFileTypes={["pdf"]}
      />
    </Form>
  );
}
