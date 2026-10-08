// Fork-only diagnostic: collect every native workflow failure rather than
// stopping at the first one. This is not a replacement for the npm test gate.
import process from "node:process";

process.env.NODE_ENV = "test";
process.env.LLM_FOR_ZOTERO_WORKFLOW_TESTS = "1";
process.env.LLM_FOR_ZOTERO_AGENT_LIVE = "0";
process.env.LLM_FOR_ZOTERO_WEBCHAT_LIVE = "0";

const { Config, Test } = await import("zotero-plugin-scaffold");
const context = await Config.loadConfig({
  test: { abortOnFail: false, watch: false },
});
const runner = new Test(context);
process.on("SIGINT", runner.exit.bind(runner));
await runner.run();
