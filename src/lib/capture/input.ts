import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { CaptureError } from "./errors";
export type CaptureSource =
  | { kind: "text"; text: string }
  | { kind: "image"; data: Buffer; mime: "image/jpeg" }
  | { kind: "pdf"; data: Buffer; mime: "application/pdf"; pages: number };
export async function validateSource(form: FormData): Promise<CaptureSource> {
  const text = form.get("text"),
    file = form.get("file");
  if (
    form.getAll("text").length > 1 ||
    form.getAll("file").length > 1 ||
    Object.keys(Object.fromEntries(form)).some(
      (k) => !["text", "file", "timezone"].includes(k),
    )
  )
    throw new CaptureError(
      "input",
      "Use one text, image, or PDF source per capture.",
    );
  if (typeof text === "string" && text.trim()) {
    if (file instanceof File && file.size)
      throw new CaptureError("input", "Use only one input source at a time.");
    if (text.length > 20000)
      throw new CaptureError("size", "Keep text within 20,000 characters.");
    return { kind: "text", text: text.trim() };
  }
  if (!(file instanceof File) || !file.size)
    throw new CaptureError(
      "empty",
      "Paste some text or choose an image or PDF.",
    );
  const ext = file.name.split(".").pop()?.toLowerCase();
  const pdf = ext === "pdf" && file.type === "application/pdf";
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  if (!pdf && (!ext || types[ext] !== file.type))
    throw new CaptureError(
      "type",
      "Choose a PNG, JPG, WebP, or PDF file with the correct file type.",
    );
  if (file.size > (pdf ? 10 : 5) * 1024 * 1024)
    throw new CaptureError(
      "size",
      pdf
        ? "PDFs must be 10 MB or smaller."
        : "Images must be 5 MB or smaller.",
    );
  const data = Buffer.from(await file.arrayBuffer());
  if (pdf) {
    if (data.subarray(0, 5).toString() !== "%PDF-")
      throw new CaptureError("pdf", "This isn’t a readable PDF.");
    try {
      const doc = await PDFDocument.load(data, {
        ignoreEncryption: false,
        throwOnInvalidObject: true,
        updateMetadata: false,
      });
      const pages = doc.getPageCount();
      if (!pages || pages > 20)
        throw new CaptureError("pages", "Choose a PDF with 1–20 pages.");
      return { kind: "pdf", data, mime: "application/pdf", pages };
    } catch (e) {
      if (e instanceof CaptureError) throw e;
      throw new CaptureError(
        "pdf",
        "This PDF is damaged, encrypted, or unreadable. Export an unlocked copy and try again.",
      );
    }
  }
  try {
    const image = sharp(data, { limitInputPixels: 25000000, failOn: "error" });
    const metadata = await image.metadata();
    const format = ext === "jpg" ? "jpeg" : ext;
    if (
      metadata.format !== format ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error();
    return {
      kind: "image",
      data: await image
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer(),
      mime: "image/jpeg",
    };
  } catch {
    throw new CaptureError(
      "image",
      "This image is damaged, too large in resolution, or unreadable. Try a different image.",
    );
  }
}
export async function boundedFormData(request: Request) {
  const max = 10 * 1024 * 1024 + 128 * 1024;
  if (Number(request.headers.get("content-length")) > max)
    throw new CaptureError("size", "This upload is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CaptureError("empty", "Choose a source to analyze.");
  let total = 0;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => void reader.cancel().catch(() => {}), 15000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        throw new CaptureError("size", "This upload is too large.", 413);
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    return await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") || "" },
    }).formData();
  } catch (e) {
    if (e instanceof CaptureError) throw e;
    throw new CaptureError(
      "input",
      "We couldn’t read this upload. Please choose the file again.",
    );
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
