import { spawn } from "node:child_process";
import { createWorkflowTestCommand } from "./workflow-command.mjs";

const { command, args, env } = createWorkflowTestCommand();

const child = spawn(command, args, {
  stdio: "inherit",
  env,
});

// Wait for the child process and its inherited stdio streams to close before
// allowing this wrapper to finish. Exiting on the earlier "exit" event can
// tear down the scaffold's esbuild service pipe while it is still draining,
// which intermittently prints a post-test Go deadlock despite a successful run.
child.on("close", (code, signal) => {
  if (signal) {
    console.error(`Workflow tests terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
