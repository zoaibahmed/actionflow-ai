// Manual paid smoke test. Never invoked by npm test; uses synthetic source data.
import nextEnv from "@next/env";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractActions } from "../src/lib/capture/openai";
import { validateSource, type CaptureSource } from "../src/lib/capture/input";
import { normalizeError } from "../src/lib/capture/errors";
import { writeFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.OPENAI_API_KEY) {
  console.log(JSON.stringify({ ok: false, code: "setup" }));
  process.exit(0);
}
const sourceText = "Submit the design review on October 23, 2026 at 2 PM.";
const sources: CaptureSource[] = [];
if (process.argv.includes("--media")) {
  const png = await sharp(
    Buffer.from(
      '<svg width="800" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="200" fill="white"/><text x="30" y="65" fill="black" font-family="Arial" font-size="27">Submit the design review</text><text x="30" y="115" fill="black" font-family="Arial" font-size="27">October 23, 2026 at 2 PM.</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  const imageForm = new FormData();
  imageForm.set(
    "file",
    new File([new Uint8Array(png)], "smoke.png", { type: "image/png" }),
  );
  sources.push(await validateSource(imageForm));
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(sourceText, { x: 40, y: 730, size: 15, font });
  const pdfForm = new FormData();
  pdfForm.set(
    "file",
    new File([new Uint8Array(await pdf.save())], "smoke.pdf", {
      type: "application/pdf",
    }),
  );
  sources.push(await validateSource(pdfForm));
} else sources.push({ kind: "text", text: sourceText });
const results = [];
for (const source of sources) {
  try {
    const result = await extractActions(
      source,
      "Asia/Karachi",
      new Date("2026-10-20T10:00:00Z"),
    );
    results.push({
      source: source.kind,
      ok: result.actions.length === 1,
      actions: result.actions.length,
      hasDueDate: result.actions[0]?.due_date === "2026-10-23",
      hasDueTime: result.actions[0]?.due_time === "14:00",
    });
  } catch (error) {
    const e = normalizeError(error);
    results.push({
      source: source.kind,
      ok: false,
      code: e.code,
      status: e.status,
    });
    process.exitCode = 1;
  }
}
console.log(JSON.stringify(results));
await writeFile(
  `docs/phase-3/real-${process.argv.includes("--media") ? "media" : "text"}-smoke.json`,
  JSON.stringify(
    { syntheticSources: true, noDatabaseWrites: true, results },
    null,
    2,
  ),
);
