import { writeFileSync } from "node:fs";
import { createServer } from "vite";

const outPath = process.argv[2] ?? "intake-run-payloads.json";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule("/src/intake/fixtures/exportRunReadyPayloads.ts");
  const payloads = module.exportRunReadyPayloads();
  writeFileSync(outPath, JSON.stringify(payloads, null, 2));
  const ready = payloads.filter((item) => item.ready).length;
  console.log(`Exported ${payloads.length} intake walks (${ready} run_ready) to ${outPath}`);
} finally {
  await server.close();
}
