import { fileURLToPath, URL } from "node:url";

export function resolveZoteroPluginBin() {
  return fileURLToPath(
    new URL(
      "../node_modules/zotero-plugin-scaffold/bin/zotero-plugin.mjs",
      import.meta.url,
    ),
  );
}

export function createWorkflowTestCommand({
  argv = process.argv,
  env = process.env,
  execPath = process.execPath,
  scaffoldBin = resolveZoteroPluginBin(),
} = {}) {
  const webChatLive = argv.includes("--webchat-live");
  const agentLive = argv.includes("--agent-live");

  return {
    command: execPath,
    args: [scaffoldBin, "test", "--no-watch", "--abort-on-fail"],
    env: {
      ...env,
      NODE_ENV: "test",
      LLM_FOR_ZOTERO_WORKFLOW_TESTS: "1",
      ...(webChatLive ? { LLM_FOR_ZOTERO_WEBCHAT_LIVE: "1" } : {}),
      ...(agentLive ? { LLM_FOR_ZOTERO_AGENT_LIVE: "1" } : {}),
    },
  };
}
