// Fork-only diagnostic: collect every native workflow failure rather than
// stopping at the first one. This is not a replacement for the npm test gate.
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { runWorkflowTestProcess } from "./workflow-process.mjs";
import { GENERATED_WORKFLOW_REPORTER_PATH } from "./workflow-test-reporter.mjs";

if (process.argv.includes("--child")) {
  const { Config, Test } = await import("zotero-plugin-scaffold");
  const context = await Config.loadConfig({
    test: { abortOnFail: false, watch: false },
  });
  context.hooks.hook("test:bundleTests", async () => {
    const source = await readFile(GENERATED_WORKFLOW_REPORTER_PATH, "utf8");
    const anchor = '  runner.on("start", async function () {';
    if (source.split(anchor).length !== 2) {
      throw new Error("Expected exactly one reporter start anchor");
    }
    const instrumentation = ["test", "hook", "hook end"]
      .map(
        (event) => `  runner.on(${JSON.stringify(event)}, function (test) {
    send({ type: "debug", data: { event: ${JSON.stringify(event)}, title: test.fullTitle() } });
  });`,
      )
      .join("\n");
    await writeFile(
      GENERATED_WORKFLOW_REPORTER_PATH,
      source.replace(anchor, `${instrumentation}\n${anchor}`),
      "utf8",
    );
  });
  const runner = new Test(context);
  process.on("SIGINT", runner.exit.bind(runner));
  await runner.run();
  runner.zotero.zotero.prependListener("close", (code, signal) => {
    console.error(
      `Diagnostic native exit: ${JSON.stringify({ code, signal })}`,
    );
  });
} else {
  // Scaffold calls process.exit itself, so completion must be checked in a
  // separate parent process, just like the normal workflow gate.
  process.exitCode = await runWorkflowTestProcess({
    command: process.execPath,
    args: [fileURLToPath(import.meta.url), "--child"],
    env: {
      ...process.env,
      NODE_ENV: "test",
      LLM_FOR_ZOTERO_WORKFLOW_TESTS: "1",
      LLM_FOR_ZOTERO_AGENT_LIVE: "0",
      LLM_FOR_ZOTERO_WEBCHAT_LIVE: "0",
    },
  });
}
