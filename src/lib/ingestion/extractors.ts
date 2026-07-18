import { createHash } from "node:crypto";

/**
 * Supported input types for text extraction.
 */
export type InputType = "pdf" | "docx" | "txt";

/**
 * Extract text from a file buffer based on its MIME type.
 * Returns the extracted text and metadata.
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{
  text: string;
  metadata: {
    extractionMethod: string;
    pageCount?: number;
    wordCount: number;
    fileHash: string;
    fileSize: number;
    inputType: InputType;
  };
}> {
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const fileSize = buffer.length;

  const inputType = detectInputType(filename, mimeType);

  let text = "";
  let extractionMethod = "";
  let pageCount: number | undefined;

  switch (inputType) {
    case "pdf": {
      const result = await extractPdfText(buffer);
      text = result.text;
      pageCount = result.pageCount;
      extractionMethod = "pdf-parse";
      break;
    }
    case "docx": {
      const result = await extractDocxText(buffer);
      text = result.text;
      extractionMethod = "mammoth";
      break;
    }
    case "txt": {
      text = buffer.toString("utf-8");
      extractionMethod = "utf8-decode";
      break;
    }
  }

  // Normalize whitespace
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "") // control chars except \n \t
    .replace(/\t/g, " ")
    .replace(/ {3,}/g, "  ")
    .trim();

  const wordCount = text ? text.split(/\s+/).length : 0;

  return {
    text,
    metadata: {
      extractionMethod,
      pageCount,
      wordCount,
      fileHash,
      fileSize,
      inputType,
    },
  };
}

function detectInputType(filename: string, mimeType: string): InputType {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (
    ext === "docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (ext === "txt" || mimeType === "text/plain") return "txt";

  // Fallback: try to detect by magic bytes
  if (bufferStartsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (bufferStartsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) return "docx"; // PK..

  throw new Error(
    `Unsupported file type: ${mimeType} (file: ${filename}). Supported: PDF, DOCX, TXT.`,
  );
}

function bufferStartsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((b, i) => buffer[i] === b);
}

async function extractPdfText(
  buffer: Buffer,
): Promise<{ text: string; pageCount: number }> {
  // Dynamic import to avoid loading pdf-parse at module init time
  const pdfParse = (await import("pdf-parse")).default;

  const data = await pdfParse(buffer);

  return {
    text: data.text,
    pageCount: data.numpages,
  };
}

async function extractDocxText(
  buffer: Buffer,
): Promise<{ text: string }> {
  const mammoth = await import("mammoth");

  const result = await mammoth.extractRawText({ buffer });

  return { text: result.value };
}
