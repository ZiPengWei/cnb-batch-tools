import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { createPinia, setActivePinia } from "pinia";

/**
 * 分支加载失败友好提示测试：
 * - CnbClient.getBranchesFriendly 对 401/404 做“会话/仓库可达性”诊断
 *   （CNB 对未登录/无权限的私有仓库统一返回 404，Cookie 过期表现为 404）
 * - IPC 结构化返回 error 后，projects store 直接展示友好文案，无 "Error:" 前缀
 */

const httpMock = {
  defaults: { headers: { common: {} as Record<string, string> } },
  get: vi.fn(),
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

function axiosError(status: number) {
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    { status, data: { errcode: status, errmsg: "Not Found" } } as any
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  httpMock.get.mockReset();
});

describe("CnbClient.getBranchesFriendly 诊断", () => {
  it("404 且会话失效（cookie 模式）→ 提示网页登录已过期", async () => {
    httpMock.get.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/-/git/branches")) throw axiosError(404);
      if (String(url).endsWith("/user")) throw axiosError(401);
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new CnbClient();
    client.setCookieAuth("sessionid=abc");
    await expect(client.getBranchesFriendly("org/repo")).rejects.toThrow(
      "网页登录已过期，请点击「网页登录」重新登录"
    );
  });

  it("404 且会话有效 → 提示仓库不存在或无权限", async () => {
    httpMock.get.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/-/git/branches")) throw axiosError(404);
      if (String(url).endsWith("/user")) return { data: { username: "u" } };
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new CnbClient();
    client.setCookieAuth("sessionid=abc");
    await expect(client.getBranchesFriendly("org/repo")).rejects.toThrow(
      "仓库不存在或无权限访问（可能已被改名/移动/删除），请刷新仓库列表后重试"
    );
  });

  it("令牌模式 401 且令牌失效 → 提示访问令牌已失效", async () => {
    httpMock.get.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/-/git/branches")) throw axiosError(401);
      if (String(url).endsWith("/user")) throw axiosError(401);
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new CnbClient("https://api.cnb.cool", "token-abc");
    await expect(client.getBranchesFriendly("org/repo")).rejects.toThrow(
      "访问令牌已失效，请重新配置认证"
    );
  });

  it("401 但会话仍有效 → 保留原始错误", async () => {
    httpMock.get.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/-/git/branches")) throw axiosError(401);
      if (String(url).endsWith("/user")) return { data: { username: "u" } };
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new CnbClient();
    client.setCookieAuth("sessionid=abc");
    await expect(client.getBranchesFriendly("org/repo")).rejects.toThrow(
      "Request failed with status code 401"
    );
  });

  it("其他状态码不做诊断，保留原始错误", async () => {
    httpMock.get.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/-/git/branches")) throw axiosError(400);
      throw new Error(`unexpected url: ${url}`);
    });
    const client = new CnbClient();
    client.setCookieAuth("sessionid=abc");
    await expect(client.getBranchesFriendly("org/repo")).rejects.toThrow(
      "Request failed with status code 400"
    );
    // 未发起 /user 诊断请求
    const userCalls = httpMock.get.mock.calls.filter(
      ([u]) => String(u).endsWith("/user")
    );
    expect(userCalls).toHaveLength(0);
  });

  it("成功时透传按提交时间排序的分支", async () => {
    httpMock.get.mockImplementation(async (_url: string, config?: any) => {
      const url = String(_url);
      if (url.endsWith("/-/git/branches")) {
        return {
          data: [
            { name: "old", commit: { sha: "s-old" } },
            { name: "newest", commit: { sha: "s-newest" } },
          ],
        };
      }
      const sha = config?.params?.sha;
      const dates: Record<string, string> = {
        newest: "2026-11-01T00:00:00Z",
        old: "2026-01-01T00:00:00Z",
      };
      return {
        data: [{ commit: { committer: { date: dates[sha] }, author: { date: dates[sha] } } }],
      };
    });
    const client = new CnbClient();
    client.setCookieAuth("sessionid=abc");
    const result = await client.getBranchesFriendly("org/repo");
    expect(result.map((b) => b.name)).toEqual(["newest", "old"]);
  });
});

describe("projects store 分支错误展示", () => {
  const bridgeMock = vi.hoisted(() => ({
    listProjects: vi.fn(async () => ({ items: [] })),
    listBranches: vi.fn(async () => ({ branches: [] as string[] })),
    setRepoPinned: vi.fn(async () => ({ ok: true as const })),
  }));

  vi.mock("../src/renderer/ipc/bridge", () => bridgeMock);

  it("结构化 error 直接展示为友好提示，不带 Error: 前缀", async () => {
    const { useProjectsStore } = await import("../src/renderer/store/projects");
    setActivePinia(createPinia());
    bridgeMock.listBranches.mockResolvedValueOnce({
      branches: [],
      error: "网页登录已过期，请点击「网页登录」重新登录",
    } as any);
    const store = useProjectsStore();
    store.selectedRepo = "org/repo";
    await store.loadAllBranches();
    const expected = "分支刷新失败：网页登录已过期，请点击「网页登录」重新登录";
    expect(store.sourceBranchesError).toBe(expected);
    expect(store.targetBranchesError).toBe(expected);
    expect(store.sourceBranchesError).not.toContain("Error:");
  });

  it("正常返回时清空错误并填充分支列表", async () => {
    const { useProjectsStore } = await import("../src/renderer/store/projects");
    setActivePinia(createPinia());
    bridgeMock.listBranches.mockResolvedValueOnce({
      branches: ["main", "dev"],
    } as any);
    const store = useProjectsStore();
    store.selectedRepo = "org/repo";
    await store.loadAllBranches();
    expect(store.sourceBranches).toEqual(["main", "dev"]);
    expect(store.targetBranches).toEqual(["main", "dev"]);
    expect(store.sourceBranchesError).toBe("");
  });
});
