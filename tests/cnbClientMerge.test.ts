import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CnbClient.mergePull 测试：
 * CNB 合并接口要求 commit_title 必填（缺失返回 400 "commit_title is required"），
 * merge_style 合法值仅 merge / squash / rebase。
 */

const httpMock = {
  defaults: { headers: { common: {} as Record<string, string> } },
  get: vi.fn(),
  put: vi.fn(),
  interceptors: { response: { use: vi.fn() } },
};

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      create: () => httpMock,
    },
  };
});

import { CnbClient } from "../src/main/services/cnbClient";

beforeEach(() => {
  vi.clearAllMocks();
  httpMock.put.mockReset();
});

describe("mergePull", () => {
  it("请求体必须包含 commit_title（CNB 必填字段）与默认 merge_style", async () => {
    httpMock.put.mockResolvedValue({
      data: { merged: true, message: "ok", sha: "abc123" },
    });

    const client = new CnbClient();
    const res = await client.mergePull("org/repo", 26, {
      commitTitle: "Merge ljl/fix into dev [Batch Tool]",
    });

    expect(res.merged).toBe(true);
    expect(res.sha).toBe("abc123");

    const [url, body] = httpMock.put.mock.calls[0];
    expect(String(url)).toBe("/org/repo/-/pulls/26/merge");
    expect(body).toMatchObject({
      commit_title: "Merge ljl/fix into dev [Batch Tool]",
      merge_style: "merge",
    });
  });

  it("未提供 commitTitle 时使用兜底标题，避免 400", async () => {
    httpMock.put.mockResolvedValue({ data: { merged: true, message: "" } });

    const client = new CnbClient();
    await client.mergePull("org/repo", 1);

    const [, body] = httpMock.put.mock.calls[0];
    expect((body as any).commit_title).toBeTruthy();
  });

  it("commit_message 传入时包含在请求体中，未传入时为 undefined", async () => {
    httpMock.put.mockResolvedValue({ data: { merged: true, message: "" } });

    const client = new CnbClient();
    await client.mergePull("org/repo", 2, {
      commitTitle: "t",
      commitMessage: "m",
    });
    const [, body1] = httpMock.put.mock.calls[0];
    expect((body1 as any).commit_message).toBe("m");

    await client.mergePull("org/repo", 3, { commitTitle: "t" });
    const [, body2] = httpMock.put.mock.calls[1];
    expect((body2 as any).commit_message).toBeUndefined();
  });
});
