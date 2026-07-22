import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule("/src/v2/fixtures/minsimResultFixture.ts");
  const result = module.runMinsimResultFixtureCheck();
  if (!result.ok) {
    console.error(result.failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Minsim result fixture check passed (${result.checked} fixtures).`);
  }
} finally {
  await server.close();
}
