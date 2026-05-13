import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  logLevel: "error",
});

try {
  const module = await server.ssrLoadModule("/src/intake/runFixtureCheck.ts");
  const result = module.runIntakeFixtureCheck();
  if (!result.ok) {
    console.error(result.failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`Intake fixture check passed (${result.checked} fixtures).`);
  }
} finally {
  await server.close();
}
