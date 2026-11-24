import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CnbClient.getBranchesSortedByCommitTime 测试：
 * 分支列表接口不含提交时间，需要对每个分支请求提交列表（sha=<分支名>）
 * 取最新提交的 committer.date，按时间倒序返回。
 */

const httpMock = {
  defaults: { headers: { common: {} as Record<string, string> } },
  get: vi.fn(),
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

function branch(name: string) {
  return { name, commit: { sha: `sha-${name}` } };
}

function commitOf(date: string) {
  return { commit: { committer: { date }, author: { date } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  httpMock.get.mockReset();
});

describe("getBranchesSortedByCommitTime", () => {
  it("按最新提交时间倒序返回分支（最近提交在前）", async () => {
    httpMock.get.mockImplementation(async (_url: string, config?: any) => {
      const url = String(_url);
      if (url.endsWith("/-/git/branches")) {
        return { data: [branch("old"), branch("newest"), branch("mid")] };
      }
      const sha = config?.params?.sha;
      const dates: Record<string, string> = {
        newest: "2026-10-22T10:00:00Z",
        mid: "2026-10-15T10:00:00Z",
        old: "2026-09-01T10:00:00Z",
      };
      return { data: [commitOf(dates[sha])] };
    });

    const client = new CnbClient();
    const result = await client.getBranchesSortedByCommitTime("org/repo");
    expect(result.map((b) => b.name)).toEqual(["newest", "mid", "old"]);
  });

  it("提交时间查询失败的分支排在末尾，不影响其他分支", async () => {
    httpMock.get.mockImplementation(async (_url: string, config?: any) => {
      const url = String(_url);
      if (url.endsWith("/-/git/branches")) {
        return { data: [branch("broken"), branch("a"), branch("b")] };
      }
      const sha = config?.params?.sha;
      if (sha === "broken") throw new Error("network error");
      const dates: Record<string, string> = {
        a: "2026-10-01T00:00:00Z",
        b: "2026-10-20T00:00:00Z",
      };
      return { data: [commitOf(dates[sha])] };
    });

    const client = new CnbClient();
    const result = await client.getBranchesSortedByCommitTime("org/repo");
    expect(result.map((b) => b.name)).toEqual(["b", "a", "broken"]);
  });

  it("时间字段缺失的分支按 0 处理排末尾", async () => {
    httpMock.get.mockImplementation(async (_url: string, config?: any) => {
      const url = String(_url);
      if (url.endsWith("/-/git/branches")) {
        return { data: [branch("no-date"), branch("with-date")] };
      }
      if (config?.params?.sha === "no-date") {
        return { data: [{}] }; // 无时间字段
      }
      return { data: [commitOf("2026-10-21T00:00:00Z")] };
    });

    const client = new CnbClient();
    const result = await client.getBranchesSortedByCommitTime("org/repo");
    expect(result.map((b) => b.name)).toEqual(["with-date", "no-date"]);
  });

  it("单分支时不发起提交时间请求", async () => {
    httpMock.get.mockResolvedValue({ data: [branch("only")] });

    const client = new CnbClient();
    const result = await client.getBranchesSortedByCommitTime("org/repo");
    expect(result.map((b) => b.name)).toEqual(["only"]);
    const commitCalls = httpMock.get.mock.calls.filter(
      ([u]) => String(u).includes("/-/git/commits")
    );
    expect(commitCalls).toHaveLength(0);
  });
});
