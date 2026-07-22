import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const landingPagePath = resolve(scriptDir, "../src/LandingPage.tsx");
const source = readFileSync(landingPagePath, "utf8");

const demoPdfUrl =
  "https://drive.google.com/file/d/1cm-ydOpcMi6rslJOnmBaGoRp-eGarOgW/view?usp=sharing";

const requiredSnippets = [
  `const DEMO_PDF_PREVIEW_URL = '${demoPdfUrl}'`,
  "데모 pdf 미리보기",
  'href={DEMO_PDF_PREVIEW_URL}',
  'target="_blank"',
  'rel="noreferrer"',
];

for (const snippet of requiredSnippets) {
  if (!source.includes(snippet)) {
    throw new Error(`Landing page demo PDF CTA is missing: ${snippet}`);
  }
}

const legacySalesLabels = ["영업팀 문의", "영업팀에 문의하기"];

for (const label of legacySalesLabels) {
  if (source.includes(label)) {
    throw new Error(`Landing page still contains legacy sales CTA label: ${label}`);
  }
}

