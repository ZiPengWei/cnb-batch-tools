import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

let batchMergeLogCallback: ((e: any) => void) | null = null;
const stopListenSpy = vi.fn();

let batchMergeResult: any = {
  ok: true,
  merged: [{ type: "merged", source: "feat", target: "main", prNumber: "1" }],
  conflicts: [],
  noop: [],
  failures: [],
};

vi.mock("../src/renderer/ipc/bridge", () => {
  return {
    onBatchMergeLog: (cb: (e: any) => void) => {
      batchMergeLogCallback = cb;
      return () => {
        stopListenSpy();
        batchMergeLogCallback = null;
      };
    },
    batchMerge: async (payload: any) => {
      const runId = payload?.runId;
      batchMergeLogCallback?.({ runId: "other", text: "should-not-show" });
      batchMergeLogCallback?.({ runId, text: "step-1" });
      batchMergeLogCallback?.({ runId, text: "step-2", error: true });
      return batchMergeResult;
    },
    notify: vi.fn(async () => ({ ok: true })),
    setMergeRunning: vi.fn(async () => ({ ok: true })),
    listProjects: vi.fn(async () => ({ items: [] })),
    listBranches: vi.fn(async () => ({ branches: [] })),
    setRepoPinned: vi.fn(async () => ({ ok: true })),
  };
});

import { useMergeStore } from "../src/renderer/store/merge";

beforeEach(() => {
  batchMergeResult = {
    ok: true,
    merged: [{ type: "merged", source: "feat", target: "main", prNumber: "1" }],
    conflicts: [],
    noop: [],
    failures: [],
  };
});

describe("merge store log wiring", () => {
  it("run() 会把批量合并日志写入 logLines，并按 runId 过滤", async () => {
    setActivePinia(createPinia());
    const store = useMergeStore();
    store.selectedTargets = ["main"];

    const res = await store.run("org/repo", ["feat"]);
    expect(res?.ok).toBe(true);

    const texts = store.logLines.map((l) => l.text);
    expect(texts).toContain("=== 开始批量合并 ===");
    expect(texts).toContain("step-1");
    expect(texts).toContain("step-2");
    expect(texts).toContain("全部已合并，成功分支：main");
    expect(texts).not.toContain("should-not-show");

    const step2 = store.logLines.find((l) => l.text === "step-2");
    expect(step2?.error).toBe(true);

    expect(stopListenSpy).toHaveBeenCalledTimes(1);
  });

  it("log() 会记录日志到 logLines，并在超过限制时自动裁剪", () => {
    setActivePinia(createPinia());
    const store = useMergeStore();

    for (let i = 0; i < 100; i++) store.log(`Log ${i}`);

    expect(store.logLines.length).toBe(100);
    expect(store.logLines[0].text).toBe("Log 0");
    expect(store.logLines[99].text).toBe("Log 99");
  });

  it("log() 会正确标记错误日志", () => {
    setActivePinia(createPinia());
    const store = useMergeStore();

    store.log("Normal log");
    store.log("Error log", true);

    expect(store.logLines.length).toBe(2);
    expect(store.logLines[0].error).toBeFalsy();
    expect(store.logLines[1].error).toBe(true);
  });

  it("setTargets() 不应清空既有日志（避免结果弹窗日志丢失）", () => {
    setActivePinia(createPinia());
    const store = useMergeStore();

    store.log("测试日志-1");
    store.setTargets(["main"]);

    expect(store.logLines.length).toBe(1);
    expect(store.logLines[0].text).toContain("测试日志-1");
  });
});

describe("merge store 冲突结果摘要", () => {
  it("run() 存在冲突时记录跳过与成功分支日志", async () => {
    setActivePinia(createPinia());
    const store = useMergeStore();
    store.selectedTargets = ["dev", "test"];

    batchMergeResult = {
      ok: false,
      merged: [{ type: "merged", source: "fix-1", target: "test", prNumber: "2" }],
      conflicts: [
        {
          type: "conflict",
          source: "fix-1",
          target: "dev",
          reason: "检测到代码冲突（不可合并）",
          prNumber: "1",
        },
      ],
      noop: [],
      failures: [],
    };

    const res = await store.run("org/repo", ["fix-1"]);
    expect(res?.ok).toBe(false);
    expect(res?.merged).toEqual([
      { type: "merged", source: "fix-1", target: "test", prNumber: "2" },
    ]);
    expect(res?.conflicts).toEqual([
      {
        type: "conflict",
        source: "fix-1",
        target: "dev",
        reason: "检测到代码冲突（不可合并）",
        prNumber: "1",
      },
    ]);

    const texts = store.logLines.map((l) => l.text);
    expect(texts).toContain("成功合并的分支：fix-1 -> test");
    expect(texts).toContain("存在冲突已跳过的分支：fix-1 -> dev");
  });
});
