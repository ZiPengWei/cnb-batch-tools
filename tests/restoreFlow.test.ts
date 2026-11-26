import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * 真实时序集成测试（模拟 macOS 关窗销毁窗口 → 重开新建窗口后的完整恢复链）：
 * 1. 渲染层全新加载：merge.targets=[], selectedTargets=[]（内存空），localStorage 有记忆
 * 2. 用户点击仓库 → selectProject：targetBranches 先清空（[]）→ 异步分支列表到达 → setTargets 恢复
 * 3. 后台排序推送 → applySortedBranches → 集合不变仅顺序变化 → 保留恢复的选择
 * 4. 全程校验 localStorage 记忆不被破坏
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

import { watch } from "vue";
import { useMergeStore } from "../src/renderer/store/merge";
import { useProjectsStore } from "../src/renderer/store/projects";
import { listBranches, listProjects } from "../src/renderer/ipc/bridge";

const REPO_TARGETS_KEY = "cnb-repo-targets";
const LAST_PROJECT_KEY = "cnb-last-project";
const REPO = "ofs.cn/contract/ProjectOperation-Frontend";
const BRANCHES = ["gray", "zms/自定义登录页", "master", "wzpz-fix", "dev", "test", "feat-x"];

function readAll(): Record<string, string[]> {
  const raw = localStorage.getItem(REPO_TARGETS_KEY);
  return raw ? JSON.parse(raw) : {};
}

function readLast(): { repo: string; name: string; sourceBranch: string } | null {
  const raw = localStorage.getItem(LAST_PROJECT_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.clearAllMocks();
});

describe("重开窗口后的恢复链（真实时序）", () => {
  it("选仓库 → 分支异步到达 → 恢复 localStorage 记忆；sorted 推送后保留", async () => {
    // 上一轮会话保存的记忆
    localStorage.setItem(REPO_TARGETS_KEY, JSON.stringify({ [REPO]: ["test"] }));

    const projects = useProjectsStore();
    const merge = useMergeStore();
    // 渲染层全新加载：内存无任何状态
    expect(merge.targets).toEqual([]);
    expect(merge.selectedTargets).toEqual([]);

    // 注册 App.vue 里的同步 watch（targetBranches → merge.setTargets）
    const stopWatch = watch(
      () => projects.targetBranches,
      (b) => merge.setTargets(b),
      { deep: true },
    );

    // listBranches 延迟 resolve（真实网络时序：清空与列表到达分离，watch flush 两次）
    vi.mocked(listBranches).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ branches: BRANCHES.slice() }), 30),
        ),
    );

    // 用户点击仓库
    await projects.selectProject({ id: REPO, display: REPO });

    // 等待 watch flush（微任务调度）+ 分支列表到达后的恢复
    await vi.waitFor(() => expect(merge.selectedTargets).toEqual(["test"]));
    expect(readAll()[REPO]).toEqual(["test"]); // 记忆未被破坏

    // 后台排序推送（集合相同、顺序不同）
    projects.applySortedBranches(REPO, BRANCHES.slice().reverse());
    await flushWatch();
    expect(merge.selectedTargets).toEqual(["test"]);

    // 用户再勾一个 → 正常落盘
    merge.toggleTarget("dev");
    expect(readAll()[REPO]).toEqual(["test", "dev"]);

    stopWatch();
  });

  it("切到无记忆的仓库时清空，切回有记忆的仓库时再恢复", async () => {
    localStorage.setItem(REPO_TARGETS_KEY, JSON.stringify({ [REPO]: ["test"] }));
    const projects = useProjectsStore();
    const merge = useMergeStore();

    const stopWatch = watch(
      () => projects.targetBranches,
      (b) => merge.setTargets(b),
      { deep: true },
    );

    vi.mocked(listBranches).mockResolvedValue({ branches: BRANCHES.slice() });

    await projects.selectProject({ id: REPO, display: REPO });
    await vi.waitFor(() => expect(merge.selectedTargets).toEqual(["test"]));

    // 切到另一个仓库（无记忆）
    await projects.selectProject({ id: "org/other", display: "org/other" });
    await vi.waitFor(() => expect(merge.selectedTargets).toEqual([]));

    // 切回原仓库 → 再恢复
    await projects.selectProject({ id: REPO, display: REPO });
    await vi.waitFor(() => expect(merge.selectedTargets).toEqual(["test"]));
    expect(readAll()[REPO]).toEqual(["test"]);

    stopWatch();
  });

  it("重开窗口：loadProjects 自动恢复上次仓库 + 源分支 + 目标分支记忆", async () => {
    // 上一轮会话保存的现场
    localStorage.setItem(REPO_TARGETS_KEY, JSON.stringify({ [REPO]: ["test"] }));
    localStorage.setItem(
      LAST_PROJECT_KEY,
      JSON.stringify({ repo: REPO, name: REPO, sourceBranch: "wzpz-fix" }),
    );

    // 仓库列表包含上次仓库（仍有权限）
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        { id: REPO, display: REPO, search: REPO, pinyinFull: "", pinyinInitials: "" },
        { id: "org/other", display: "org/other", search: "org/other", pinyinFull: "", pinyinInitials: "" },
      ],
    });
    vi.mocked(listBranches).mockResolvedValue({ branches: BRANCHES.slice() });

    const projects = useProjectsStore();
    const merge = useMergeStore();
    const stopWatch = watch(
      () => projects.targetBranches,
      (b) => merge.setTargets(b),
      { deep: true },
    );

    // 模拟重开窗口：连接成功后 loadProjects（内部自动恢复上次仓库）
    await projects.loadProjects();
    await vi.waitFor(() => {
      expect(projects.selectedRepo).toBe(REPO);
      expect(projects.selectedSourceBranch).toBe("wzpz-fix");
      expect(merge.selectedTargets).toEqual(["test"]);
    });

    // 用户点别的源分支 → 持久化更新
    projects.chooseSourceBranch("dev");
    expect(readLast()).toMatchObject({ repo: REPO, sourceBranch: "dev" });

    // 切到其他仓库：源分支记忆清空、目标分支为空（无该仓库记忆）
    await projects.selectProject({ id: "org/other", display: "org/other" });
    await vi.waitFor(() => expect(merge.selectedTargets).toEqual([]));
    expect(readLast()).toMatchObject({ repo: "org/other", sourceBranch: "" });
    expect(projects.selectedSourceBranch).toBe("");

    stopWatch();
  });

  it("上次仓库已不在列表（被删/无权限）时不恢复", async () => {
    localStorage.setItem(
      LAST_PROJECT_KEY,
      JSON.stringify({ repo: "org/gone", name: "org/gone", sourceBranch: "x" }),
    );
    vi.mocked(listProjects).mockResolvedValue({
      items: [
        { id: REPO, display: REPO, search: REPO, pinyinFull: "", pinyinInitials: "" },
      ],
    });
    vi.mocked(listBranches).mockResolvedValue({ branches: BRANCHES.slice() });

    const projects = useProjectsStore();
    await projects.loadProjects();

    expect(projects.selectedRepo).toBe("");
    expect(projects.selectedSourceBranch).toBe("");
  });

  it("chooseSourceBranch 持久化源分支；分支加载后自动恢复上次源分支", async () => {
    const projects = useProjectsStore();
    vi.mocked(listBranches).mockResolvedValue({ branches: BRANCHES.slice() });

    await projects.selectProject({ id: REPO, display: REPO });
    projects.chooseSourceBranch("wzpz-fix");
    expect(readLast()).toMatchObject({ repo: REPO, sourceBranch: "wzpz-fix" });

    // 同仓库重选（如刷新）：源分支记忆保留并自动恢复
    await projects.selectProject({ id: REPO, display: REPO });
    expect(projects.selectedSourceBranch).toBe("wzpz-fix");
    expect(readLast()).toMatchObject({ repo: REPO, sourceBranch: "wzpz-fix" });
  });
});

function flushWatch(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}
