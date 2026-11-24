import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * 目标分支选择记忆测试：
 * - 分支集合变化（切换仓库/刷新）→ 恢复该仓库上次保存的选择（过滤失效分支）
 * - 分支集合不变仅顺序变化（后台提交时间排序完成）→ 保留当前选择
 * - 选择变化按仓库持久化（toggle/set/add/clear）
 * - 分支列表未加载（瞬时空态）时不覆盖已有记忆
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

import { useMergeStore } from "../src/renderer/store/merge";
import { useProjectsStore } from "../src/renderer/store/projects";

const REPO_TARGETS_KEY = "cnb-repo-targets";

function readAll(): Record<string, string[]> {
  const raw = localStorage.getItem(REPO_TARGETS_KEY);
  return raw ? JSON.parse(raw) : {};
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.clearAllMocks();
});

describe("merge store 目标分支记忆", () => {
  it("分支集合变化时恢复该仓库上次保存的选择（过滤已不存在的分支）", () => {
    localStorage.setItem(
      REPO_TARGETS_KEY,
      JSON.stringify({ "org/a": ["dev", "test", "gone"] })
    );
    const projects = useProjectsStore();
    projects.selectedRepo = "org/a";
    const merge = useMergeStore();

    merge.setTargets(["dev", "test", "main"]);

    expect(merge.selectedTargets).toEqual(["dev", "test"]);
  });

  it("分支集合不变仅顺序变化时保留当前选择（后台排序平滑更新）", () => {
    const projects = useProjectsStore();
    projects.selectedRepo = "org/a";
    const merge = useMergeStore();

    merge.setTargets(["main", "dev", "test"]);
    merge.setSelectedTargets(["main"]);

    // 后台排序完成：同一集合不同顺序
    merge.setTargets(["dev", "test", "main"]);

    expect(merge.selectedTargets).toEqual(["main"]);
  });

  it("切换到无记忆的仓库时清空选择", () => {
    localStorage.setItem(REPO_TARGETS_KEY, JSON.stringify({ "org/a": ["dev"] }));
    const projects = useProjectsStore();
    const merge = useMergeStore();

    projects.selectedRepo = "org/a";
    merge.setTargets(["dev"]);
    merge.setSelectedTargets(["dev"]);
    expect(merge.selectedTargets).toEqual(["dev"]);

    projects.selectedRepo = "org/b";
    merge.setTargets(["dev", "main"]);
    expect(merge.selectedTargets).toEqual([]);
  });

  it("toggle/add/clear 都会按仓库持久化当前选择", () => {
    const projects = useProjectsStore();
    projects.selectedRepo = "org/a";
    const merge = useMergeStore();

    merge.setTargets(["dev", "test", "main"]);
    merge.toggleTarget("dev");
    expect(readAll()["org/a"]).toEqual(["dev"]);

    merge.addSelectedTargets(["test"]);
    expect(readAll()["org/a"]).toEqual(["dev", "test"]);

    merge.clearTargets();
    expect(readAll()["org/a"]).toEqual([]);
  });

  it("分支列表未加载（瞬时空态）时不写入记忆", () => {
    localStorage.setItem(REPO_TARGETS_KEY, JSON.stringify({ "org/a": ["dev"] }));
    const projects = useProjectsStore();
    projects.selectedRepo = "org/b";
    const merge = useMergeStore();

    // 模拟切换仓库时分支列表先被清空
    merge.setTargets([]);
    merge.toggleTarget("dev"); // 空态下的误操作不应落盘

    expect(readAll()["org/a"]).toEqual(["dev"]);
    expect(readAll()["org/b"]).toBeUndefined();
  });

  it("记忆仓库数超过上限时淘汰最旧条目", () => {
    const seeded: Record<string, string[]> = {};
    for (let i = 0; i < 100; i++) seeded[`org/r${i}`] = ["main"];
    localStorage.setItem(REPO_TARGETS_KEY, JSON.stringify(seeded));

    const projects = useProjectsStore();
    projects.selectedRepo = "org/new";
    const merge = useMergeStore();
    merge.setTargets(["dev"]);
    merge.setSelectedTargets(["dev"]);

    const all = readAll();
    expect(all["org/new"]).toEqual(["dev"]);
    expect(all["org/r0"]).toBeUndefined(); // 最旧的被淘汰
    expect(all["org/r99"]).toEqual(["main"]);
    expect(Object.keys(all)).toHaveLength(100);
  });
});
