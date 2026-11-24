import { describe, expect, it, vi } from "vitest";

import { MergeService } from "../src/main/services/mergeService";

function createClientMock() {
  return {
    compareBranches: vi.fn().mockResolvedValue({ totalCommits: 1 }),
    createPull: vi.fn(),
    findOpenPull: vi.fn().mockResolvedValue(null),
    getPull: vi.fn(),
    mergePull: vi.fn(),
    closePull: vi.fn().mockResolvedValue(true),
  } as const;
}

/** 带真实 axios 实例结构（defaults.headers.common、interceptors）的实例 mock */
function axiosInstanceMock(methods: Record<string, unknown>) {
  return {
    defaults: { headers: { common: {} as Record<string, string> } },
    interceptors: { response: { use: vi.fn() } },
    ...methods,
  };
}

const REPO = "org/repo";

describe("MergeService.runBatchMerge（每个目标分支独立处理）", () => {
  it("opts.onLog 会收到进度日志", async () => {
    vi.useFakeTimers();
    const client = createClientMock();
    client.createPull.mockResolvedValueOnce({ number: "1" });
    const service = new MergeService(client as any);
    client.getPull
      .mockResolvedValueOnce({
        number: "1",
        state: "open",
        mergeable_state: "mergeable",
      })
      .mockResolvedValueOnce({
        number: "1",
        state: "merged",
      });
    client.mergePull.mockResolvedValueOnce({ merged: true, message: "ok" });

    const onLog = vi.fn();
    const p = service.runBatchMerge(REPO, [
      { source: "feat", target: "main" },
    ], { onLog });
    await vi.runAllTimersAsync();
    await p;
    vi.useRealTimers();

    expect(onLog).toHaveBeenCalled();
    const texts = onLog.mock.calls.map((c) => c[0]);
    expect(texts.some((t) => String(t).includes("正在创建 PR"))).toBe(true);
    expect(texts.some((t) => String(t).includes("✓ 合并成功"))).toBe(true);
    expect(texts.some((t) => String(t).includes("=== 批量合并结束 ==="))).toBe(true);
  });

  it("source==target 时返回 noop 且不创建 PR", async () => {
    const client = createClientMock();
    const service = new MergeService(client as any);

    const res = await service.runBatchMerge(REPO, [
      { source: "a", target: "a" },
    ]);

    expect(client.createPull).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.merged).toEqual([]);
    expect(res.noop).toEqual([
      { type: "noop", source: "a", target: "a", reason: "source == target" },
    ]);
    expect(res.conflicts).toEqual([]);
    expect(res.failures).toEqual([]);
  });

  it("比较无变更时跳过创建 PR（noop）", async () => {
    const client = createClientMock();
    client.compareBranches.mockResolvedValueOnce({ totalCommits: 0 });
    const service = new MergeService(client as any);

    const res = await service.runBatchMerge(REPO, [
      { source: "feat", target: "main" },
    ]);

    expect(client.createPull).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.merged).toEqual([]);
    expect(res.noop).toEqual([
      { type: "noop", source: "feat", target: "main", reason: "无变更" },
    ]);
  });

  it("dev 有冲突时跳过并取消 PR，test 无冲突直接合并（互不影响）", async () => {
    vi.useFakeTimers();
    const client = createClientMock();
    // 第一个 PR（-> dev）冲突；第二个 PR（-> test）可合并
    client.createPull
      .mockResolvedValueOnce({ number: "11" })
      .mockResolvedValueOnce({ number: "12" });
    client.getPull.mockImplementation(async (_repo: string, n: string) => {
      if (n === "11")
        return {
          number: "11",
          state: "open",
          mergeable_state: "conflict",
          blocked_on: "code_conflict",
        };
      return { number: "12", state: "open", mergeable_state: "mergeable" };
    });
    client.mergePull.mockResolvedValueOnce({ merged: true, message: "ok" });

    const service = new MergeService(client as any);
    const onLog = vi.fn();
    const p = service.runBatchMerge(
      REPO,
      [
        { source: "fix-1", target: "dev" },
        { source: "fix-1", target: "test" },
      ],
      { onLog }
    );
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();

    // 冲突分支：跳过并取消 PR
    expect(client.closePull).toHaveBeenCalledWith(REPO, "11");
    expect(res.ok).toBe(false);
    expect(res.conflicts).toEqual([
      {
        type: "conflict",
        source: "fix-1",
        target: "dev",
        reason: "检测到代码冲突（不可合并）",
        prNumber: "11",
      },
    ]);
    // 无冲突分支：直接合并成功
    expect(client.mergePull).toHaveBeenCalledWith(REPO, "12", {
      commitTitle: "Merge fix-1 into test [Batch Tool]",
    });
    expect(res.merged).toEqual([
      { type: "merged", source: "fix-1", target: "test", prNumber: "12" },
    ]);
    expect(res.failures).toEqual([]);

    const texts = onLog.mock.calls.map((c) => c[0]);
    expect(
      texts.some((t) => String(t).includes("✗ 检测到冲突，已跳过并取消 PR"))
    ).toBe(true);
    expect(
      texts.some((t) => String(t).includes("存在冲突已跳过的分支: fix-1 -> dev"))
    ).toBe(true);
    expect(
      texts.some((t) => String(t).includes("成功合并的分支: fix-1 -> test"))
    ).toBe(true);
  });

  it("blocked_on=code_conflict 但 mergeable_state 未更新时也识别为冲突", async () => {
    vi.useFakeTimers();
    const client = createClientMock();
    client.createPull.mockResolvedValueOnce({ number: "21" });
    client.getPull.mockResolvedValue({
      number: "21",
      state: "open",
      mergeable_state: "checking",
      blocked_on: "code_conflict",
    });

    const service = new MergeService(client as any);
    const p = service.runBatchMerge(REPO, [
      { source: "feat", target: "main" },
    ]);
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();

    expect(res.ok).toBe(false);
    expect(res.conflicts.length).toBe(1);
    expect(res.conflicts[0].reason).toContain("代码冲突");
    expect(client.closePull).toHaveBeenCalledWith(REPO, "21");
    expect(client.mergePull).not.toHaveBeenCalled();
  });

  it("创建 PR 失败时优先复用已存在的 open PR", async () => {
    vi.useFakeTimers();
    const client = createClientMock();
    client.createPull.mockResolvedValueOnce({
      status: "error",
      message: "pull request already exists",
    });
    client.findOpenPull.mockResolvedValueOnce({
      number: "31",
      state: "open",
      head: { ref: "refs/heads/feat" },
      base: { ref: "refs/heads/main" },
    });
    client.getPull.mockResolvedValueOnce({
      number: "31",
      state: "open",
      mergeable_state: "mergeable",
    });
    client.mergePull.mockResolvedValueOnce({ merged: true, message: "ok" });

    const service = new MergeService(client as any);
    const onLog = vi.fn();
    const p = service.runBatchMerge(
      REPO,
      [{ source: "feat", target: "main" }],
      { onLog }
    );
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();

    expect(client.findOpenPull).toHaveBeenCalledWith(REPO, "feat", "main");
    expect(client.mergePull).toHaveBeenCalledWith(REPO, "31", {
      commitTitle: "Merge feat into main [Batch Tool]",
    });
    expect(res.ok).toBe(true);
    expect(res.merged).toEqual([
      { type: "merged", source: "feat", target: "main", prNumber: "31" },
    ]);
    const texts = onLog.mock.calls.map((c) => c[0]);
    expect(texts.some((t) => String(t).includes("已存在的 PR #31"))).toBe(true);
  });

  it("创建 PR 失败且无已存在 PR 时记为失败", async () => {
    const client = createClientMock();
    client.createPull.mockResolvedValueOnce({
      status: "error",
      message: "没有权限",
    });
    const service = new MergeService(client as any);

    const res = await service.runBatchMerge(REPO, [
      { source: "feat", target: "main" },
    ]);

    expect(res.ok).toBe(false);
    expect(res.failures).toEqual([
      {
        type: "failure",
        source: "feat",
        target: "main",
        reason: "没有权限",
      },
    ]);
  });

  it("创建 PR 返回 noop 错误时记为无变更", async () => {
    const client = createClientMock();
    client.compareBranches.mockResolvedValueOnce(null); // 预检失败，走创建
    client.createPull.mockResolvedValueOnce({
      status: "noop",
      message: "无变更",
    });
    const service = new MergeService(client as any);

    const res = await service.runBatchMerge(REPO, [
      { source: "feat", target: "main" },
    ]);

    expect(res.ok).toBe(true);
    expect(res.noop).toEqual([
      { type: "noop", source: "feat", target: "main", reason: "无变更" },
    ]);
  });

  it("合并调用失败时取消 PR 并记为失败", async () => {
    vi.useFakeTimers();
    const client = createClientMock();
    client.createPull.mockResolvedValueOnce({ number: "41" });
    client.getPull.mockResolvedValue({
      number: "41",
      state: "open",
      mergeable_state: "mergeable",
    });
    client.mergePull.mockRejectedValueOnce(new Error("分支保护：需要评审"));

    const service = new MergeService(client as any);
    const p = service.runBatchMerge(REPO, [
      { source: "feat", target: "main" },
    ]);
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();

    expect(res.ok).toBe(false);
    expect(res.failures.length).toBe(1);
    expect(res.failures[0].reason).toContain("分支保护");
    expect(client.closePull).toHaveBeenCalledWith(REPO, "41");
  });

  it("PR 已被手动合并（state=merged）时计入成功", async () => {
    vi.useFakeTimers();
    const client = createClientMock();
    client.createPull.mockResolvedValueOnce({ number: "51" });
    client.getPull.mockResolvedValue({
      number: "51",
      state: "merged",
      mergeable_state: "merged",
    });

    const service = new MergeService(client as any);
    const p = service.runBatchMerge(REPO, [
      { source: "feat", target: "main" },
    ]);
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();

    expect(res.ok).toBe(true);
    expect(res.merged).toEqual([
      { type: "merged", source: "feat", target: "main", prNumber: "51" },
    ]);
    expect(client.mergePull).not.toHaveBeenCalled();
    expect(client.closePull).not.toHaveBeenCalled();
  });

  it("可合并状态检测超时时取消 PR 并记为失败", async () => {
    vi.useFakeTimers();
    const client = createClientMock();
    client.createPull.mockResolvedValueOnce({ number: "61" });
    client.getPull.mockResolvedValue({
      number: "61",
      state: "open",
      mergeable_state: "checking",
    });

    const service = new MergeService(client as any);
    const p = service.runBatchMerge(REPO, [
      { source: "feat", target: "main" },
    ]);
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();

    expect(res.ok).toBe(false);
    expect(res.failures.length).toBe(1);
    expect(res.failures[0].reason).toContain("超时");
    expect(client.closePull).toHaveBeenCalledWith(REPO, "61");
  });
});

describe("CnbClient", () => {
  it("仓库路径中的特殊字符会被逐段编码", async () => {
    const axiosMod: any = await import("axios");
    const get = vi.fn().mockResolvedValue({ status: 200, data: [] });
    const post = vi.fn().mockResolvedValue({ status: 201, data: { number: "1" } });
    (axiosMod.default.create as any).mockReturnValueOnce(axiosInstanceMock({ get, post }));

    const { CnbClient } = await import("../src/main/services/cnbClient");
    const client = new CnbClient("https://api.cnb.cool", "t");
    await client.getBranches("org/sub/repo name");
    await client.createPull("org/sub/repo name", "feat", "main", "title");

    expect(get.mock.calls[0][0]).toBe("/org/sub/repo%20name/-/git/branches");
    expect(post.mock.calls[0][0]).toBe("/org/sub/repo%20name/-/pulls");
    expect(post.mock.calls[0][1]).toEqual({
      head: "feat",
      base: "main",
      title: "title",
    });
  });

  it("createPull 无变更错误返回 noop", async () => {
    const axiosMod: any = await import("axios");
    const post = vi
      .fn()
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: { errcode: 1, errmsg: "没有可合并的变更" } },
      });
    (axiosMod.default.create as any).mockReturnValueOnce(axiosInstanceMock({ post }));

    const { CnbClient } = await import("../src/main/services/cnbClient");
    const client = new CnbClient("https://api.cnb.cool", "t");
    const res = await client.createPull("org/repo", "feat", "main", "title");
    expect(res).toEqual({ status: "noop", message: "没有可合并的变更" });
  });

  it("mergePull 返回合并结果", async () => {
    const axiosMod: any = await import("axios");
    const put = vi
      .fn()
      .mockResolvedValue({ status: 200, data: { merged: true, sha: "abc" } });
    (axiosMod.default.create as any).mockReturnValueOnce(axiosInstanceMock({ put }));

    const { CnbClient } = await import("../src/main/services/cnbClient");
    const client = new CnbClient("https://api.cnb.cool", "t");
    const res = await client.mergePull("org/repo", "12");
    expect(res).toEqual({ merged: true, message: "", sha: "abc" });
    expect(put.mock.calls[0][0]).toBe("/org/repo/-/pulls/12/merge");
    expect(put.mock.calls[0][1]).toMatchObject({
      commit_title: expect.any(String),
      merge_style: "merge",
    });
  });

  it("closePull 通过 PATCH state=closed 取消 PR", async () => {
    const axiosMod: any = await import("axios");
    const patch = vi.fn().mockResolvedValue({ status: 200, data: {} });
    (axiosMod.default.create as any).mockReturnValueOnce(axiosInstanceMock({ patch }));

    const { CnbClient } = await import("../src/main/services/cnbClient");
    const client = new CnbClient("https://api.cnb.cool", "t");
    const ok = await client.closePull("org/repo", "12");
    expect(ok).toBe(true);
    expect(patch.mock.calls[0][0]).toBe("/org/repo/-/pulls/12");
    expect(patch.mock.calls[0][1]).toEqual({ state: "closed" });
  });

  it("findOpenPull 按源分支过滤已存在的 open PR", async () => {
    const axiosMod: any = await import("axios");
    const get = vi.fn().mockResolvedValue({
      status: 200,
      data: [
        { number: "1", state: "open", head: { ref: "refs/heads/other" } },
        { number: "2", state: "open", head: { ref: "refs/heads/feat" } },
      ],
    });
    (axiosMod.default.create as any).mockReturnValueOnce(axiosInstanceMock({ get }));

    const { CnbClient } = await import("../src/main/services/cnbClient");
    const client = new CnbClient("https://api.cnb.cool", "t");
    const pr = await client.findOpenPull("org/repo", "feat", "main");
    expect(pr && (pr as any).number).toBe("2");
    expect(get.mock.calls[0][1]?.params).toMatchObject({
      state: "open",
      base_ref: "main",
    });
  });
});

vi.mock("axios", async () => {
  const actual = await vi.importActual<any>("axios");
  return {
    ...actual,
    default: {
      create: vi.fn(),
      isAxiosError: (e: any) => Boolean(e && e.isAxiosError),
    },
    create: vi.fn(),
    isAxiosError: (e: any) => Boolean(e && e.isAxiosError),
  };
});
