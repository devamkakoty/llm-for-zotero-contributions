import { assert } from "chai";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import {
  attachNativeExitGuard,
  observeWorkflowNativeProcess,
} from "../scripts/workflow-scaffold.mjs";

describe("workflow native exit guard", function () {
  function fixture() {
    const native = new EventEmitter();
    const abnormal: number[] = [];
    let normalCalls = 0;
    const runner = {
      zotero: { zotero: native },
      onZoteroExit() {
        normalCalls++;
      },
    };
    // Mirror Scaffold's already-installed callback, which looks up the
    // instance handler at close time. The new observer must run before it.
    native.on("close", () => runner.onZoteroExit());
    attachNativeExitGuard(runner, {
      onAbnormalExit: (code: number) => abnormal.push(code),
      report: () => {},
    });
    return { native, runner, abnormal, normalCalls: () => normalCalls };
  }

  it("retains Scaffold's test-result cleanup after a native exit zero", function () {
    const test = fixture();
    test.native.emit("close", 0, null);
    assert.equal(test.normalCalls(), 1);
    assert.isEmpty(test.abnormal);
  });

  for (const [code, signal, expected] of [
    [139, null, 139],
    [7, null, 7],
    [null, "SIGTERM", 1],
    [-1, null, 1],
    [0, "SIGSEGV", 1],
  ]) {
    it(`rejects native status ${code}/${signal} even if assertions passed`, function () {
      const test = fixture();
      test.native.emit("close", code, signal);
      assert.deepEqual(test.abnormal, [expected]);
      assert.equal(test.normalCalls(), 0);
    });
  }

  it("fails closed when the native lifecycle callback lacks an exit record", function () {
    const test = fixture();
    test.runner.onZoteroExit();
    assert.deepEqual(test.abnormal, [1]);
    assert.equal(test.normalCalls(), 0);
  });

  it("fails clearly if a dependency update changes the native lifecycle", function () {
    assert.throws(
      () => attachNativeExitGuard({}, { onAbnormalExit: () => {} }),
      "Scaffold native-process lifecycle is unavailable",
    );
  });

  it("drains native stderr and bounds explicit abnormal-exit diagnostics", function () {
    const native = Object.assign(new EventEmitter(), {
      stderr: new PassThrough(),
    });
    const reports: string[] = [];
    const runner = { zotero: { zotero: native }, onZoteroExit() {} };
    attachNativeExitGuard(runner, {
      onAbnormalExit: () => {},
      diagnostics: true,
      report: (message: string) => reports.push(message),
    });
    native.stderr.write("x".repeat(20000));
    native.stderr.write("shutdown detail");
    native.emit("close", 139, null);
    assert.equal(native.stderr.readableLength, 0);
    assert.lengthOf(reports, 2);
    assert.include(reports[1], "shutdown detail");
    assert.isBelow(reports[1].length, 16500);
  });

  it("does not print native stderr without explicit diagnostics", function () {
    const native = Object.assign(new EventEmitter(), {
      stderr: new PassThrough(),
    });
    const reports: string[] = [];
    const runner = { zotero: { zotero: native }, onZoteroExit() {} };
    attachNativeExitGuard(runner, {
      onAbnormalExit: () => {},
      report: (message: string) => reports.push(message),
    });
    native.stderr.write("private diagnostic");
    native.emit("close", 139, null);
    assert.equal(native.stderr.readableLength, 0);
    assert.lengthOf(reports, 1);
    assert.notInclude(reports[0], "private diagnostic");
  });

  it("observes early native failure and drains stderr before runner startup finishes", async function () {
    const abnormal: number[] = [];
    let normalCalls = 0;
    // No runner.zotero assignment or Scaffold close callback exists yet.
    const runner = {
      onZoteroExit() {
        normalCalls++;
      },
    };
    const observer = observeWorkflowNativeProcess(
      runner,
      {
        onAbnormalExit: (code: number) => abnormal.push(code),
        report: () => {},
      },
      () => process.execPath,
    );
    try {
      const child = spawn(
        process.execPath,
        [
          "-e",
          "process.stderr.write('x'.repeat(200000)); process.exitCode = 139;",
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      await once(child, "close");
      observer.assertAttached();
      assert.deepEqual(abnormal, [139]);
      assert.equal(normalCalls, 0);
    } finally {
      observer.stop();
    }
  });

  it("fails closed if no matching native process was observed", function () {
    const observer = observeWorkflowNativeProcess(
      { onZoteroExit() {} },
      { onAbnormalExit: () => {} },
      () => "__not_a_native_workflow_binary__",
    );
    try {
      assert.throws(() => observer.assertAttached(), "spawn was not observed");
    } finally {
      observer.stop();
    }
  });
});
