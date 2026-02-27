import mammoth from "mammoth";

/**
 * Extract text from a PDF buffer using pdfjs-dist (server-side, no canvas).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Disable worker for server-side Node.js usage
  pdfjsLib.GlobalWorkerOptions.workerSrc = "";

  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 50); i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n\n");
}

/**
 * Extract text from a DOCX buffer using mammoth.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extract text from a paper stored in the DB.
 */
export async function extractPaperText(
  content: Buffer | { buffer: ArrayBuffer },
  mimeType: string
): Promise<string> {
  const buf =
    content && "buffer" in content && content.buffer
      ? Buffer.from(content.buffer)
      : Buffer.from(content as Buffer);

  if (mimeType === "application/pdf") {
    return extractPdfText(buf);
  } else if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractDocxText(buf);
  }

  throw new Error("Unsupported file type");
}
