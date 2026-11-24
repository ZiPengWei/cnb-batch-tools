import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * 合并历史记录测试：
 * - run 完成写入历史（最近在前），cap 20
 * - lastRunFor 按仓库取最近一条
 * - formatRelativeTime 相对时间文案
 */

vi.mock("../src/renderer/ipc/bridge", () => ({
  batchMerge: vi.fn(),
  onBatchMergeLog: vi.fn(() => () => {}),
  notify: vi.fn(async () => ({ ok: true })),
  setMergeRunning: vi.fn(async () => ({ ok: true })),
  listProjects: vi.fn(async () => ({ items: [] })),
  listBranches: vi.fn(async () => ({ branches: [] })),
  setRepoPinned: vi.fn(async () => ({ ok: true })),
}));

import {
  formatRelativeTime,
  useMergeStore,
} from "../src/renderer/store/merge";

const HISTORY_KEY = "cnb-merge-history";

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.clearAllMocks();
});

describe("merge store 合并历史", () => {
  it("recordCurrentRun 写入历史并持久化（最近在前）", () => {
    const store = useMergeStore();
    store.selectedTargets = ["dev", "test"];

    store.recordCurrentRun("org/a", ["feat"], {
      ok: true,
      merged: [{ source: "feat", target: "dev" }],
      conflicts: [],
      failures: [],
      noop: [],
    });

    const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    expect(all).toHaveLength(1);
    expect(store.history).toHaveLength(1);
    expect(store.history[0]).toMatchObject({
      repo: "org/a",
      source: "feat",
      targets: ["dev", "test"],
      ok: true,
      merged: 1,
      conflicts: 0,
      failures: 0,
      noop: 0,
    });

    // 第二次运行排在前面
    store.recordCurrentRun("org/a", ["fix"], {
      ok: false,
      merged: [],
      conflicts: [{ source: "fix", target: "dev", reason: "冲突" }],
      failures: [],
      noop: [],
    });
    expect(store.history).toHaveLength(2);
    expect(store.history[0].source).toBe("fix");
    expect(store.history[0].conflicts).toBe(1);
  });

  it("历史最多保留 20 条", () => {
    const store = useMergeStore();
    for (let i = 0; i < 25; i++) {
      store.recordCurrentRun(`org/r${i}`, ["feat"], {
        ok: true,
        merged: [],
        conflicts: [],
        failures: [],
        noop: [{ source: "feat", target: "dev" }],
      });
    }
    expect(store.history).toHaveLength(20);
    expect(store.history[0].repo).toBe("org/r24");
    expect(store.history[19].repo).toBe("org/r5");
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")).toHaveLength(20);
  });

  it("lastRunFor 按仓库取最近一条；无记录返回 null", () => {
    const store = useMergeStore();
    store.recordCurrentRun("org/a", ["feat"], {
      ok: true,
      merged: [],
      conflicts: [],
      failures: [],
      noop: [],
    });
    store.recordCurrentRun("org/b", ["fix"], {
      ok: true,
      merged: [],
      conflicts: [],
      failures: [],
      noop: [],
    });
    store.recordCurrentRun("org/a", ["feat2"], {
      ok: false,
      merged: [],
      conflicts: [],
      failures: [],
      noop: [],
    });

    expect(store.lastRunFor("org/a")?.source).toBe("feat2");
    expect(store.lastRunFor("org/b")?.source).toBe("fix");
    expect(store.lastRunFor("org/none")).toBeNull();
  });

  it("store 初始化时从 localStorage 恢复历史", () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([
        {
          ts: Date.now(),
          repo: "org/saved",
          source: "feat",
          targets: ["dev"],
          ok: true,
          merged: 1,
          conflicts: 0,
          failures: 0,
          noop: 0,
        },
      ]),
    );
    const store = useMergeStore();
    expect(store.lastRunFor("org/saved")?.merged).toBe(1);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-11-24T17:00:00+08:00").getTime();

  it("1 分钟内显示 刚刚", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("刚刚");
  });

  it("小时内显示 N 分钟前", () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
  });

  it("天内显示 N 小时前", () => {
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3 小时前");
  });

  it("30 天内显示 N 天前", () => {
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe("2 天前");
  });

  it("超过 30 天显示具体日期", () => {
    const text = formatRelativeTime(now - 40 * 86_400_000, now);
    expect(text).not.toContain("天前");
    expect(text.length).toBeGreaterThan(0);
  });

  it("未来时间戳按 刚刚 处理（容错）", () => {
    expect(formatRelativeTime(now + 86_400_000, now)).toBe("刚刚");
  });
});
