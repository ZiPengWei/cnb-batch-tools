import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * applySortedBranches 测试：
 * 主进程后台计算完"按最新提交时间排序"的分支后推送，store 校验
 * 仓库匹配与加载态后平滑更新两列分支列表。
 */

vi.mock("../src/renderer/ipc/bridge", () => ({
  listProjects: vi.fn(async () => ({ items: [] })),
  listBranches: vi.fn(async () => ({ branches: [] })),
  setRepoPinned: vi.fn(async () => ({ ok: true })),
  setAuth: vi.fn(),
  clearAuth: vi.fn(),
  webLogin: vi.fn(),
}));

import { useProjectsStore } from "../src/renderer/store/projects";

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.clearAllMocks();
});

describe("projects store applySortedBranches", () => {
  it("仓库匹配且加载完成时更新两列分支顺序", () => {
    const store = useProjectsStore();
    store.selectedRepo = "org/a";
    store.sourceBranches = ["dev", "main", "feat/x"];
    store.targetBranches = ["dev", "main", "feat/x"];

    store.applySortedBranches("org/a", ["feat/x", "dev", "main"]);

    expect(store.sourceBranches).toEqual(["feat/x", "dev", "main"]);
    expect(store.targetBranches).toEqual(["feat/x", "dev", "main"]);
  });

  it("仓库不匹配（已切换仓库）时忽略推送", () => {
    const store = useProjectsStore();
    store.selectedRepo = "org/a";
    store.sourceBranches = ["dev", "main"];

    store.applySortedBranches("org/b", ["main", "dev"]);

    expect(store.sourceBranches).toEqual(["dev", "main"]);
  });

  it("分支加载进行中时忽略推送", () => {
    const store = useProjectsStore();
    store.selectedRepo = "org/a";
    store.sourceBranches = ["dev", "main"];
    store.sourceBranchesLoading = true;

    store.applySortedBranches("org/a", ["main", "dev"]);

    expect(store.sourceBranches).toEqual(["dev", "main"]);
  });

  it("顺序未变化时不更新（避免无谓刷新）", () => {
    const store = useProjectsStore();
    store.selectedRepo = "org/a";
    store.sourceBranches = ["feat/x", "dev", "main"];

    store.applySortedBranches("org/a", ["feat/x", "dev", "main"]);

    // 引用不变，避免触发下游 watcher
    expect(store.sourceBranches).toEqual(["feat/x", "dev", "main"]);
  });

  it("空推送忽略", () => {
    const store = useProjectsStore();
    store.selectedRepo = "org/a";
    store.sourceBranches = ["dev"];

    store.applySortedBranches("org/a", []);

    expect(store.sourceBranches).toEqual(["dev"]);
  });
});
