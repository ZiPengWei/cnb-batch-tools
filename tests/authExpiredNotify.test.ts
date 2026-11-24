import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";

/**
 * 登录过期通知（CnbClient.onAuthExpired）测试：
 * - 业务请求返回 401 → 延迟复核 GET /user，确认失效后触发 onAuthExpired
 * - 带 _authVerify 标记的凭证校验请求自身 401 不触发（手动连接/静默重连场景）
 * - 复核通过（会话恢复）不触发；无凭证不触发；一次过期只触发一次
 * - getBranchesFriendly 权威诊断（/user 复核失败）直接触发
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

/** 构造业务请求的 401 AxiosError（config 可带 _authVerify 标记） */
function unauthorizedError(config: Record<string, unknown> = {}) {
  return new AxiosError(
    "Request failed with status code 401",
    "ERR_BAD_REQUEST",
    config as any,
    undefined,
    { status: 401, data: { errmsg: "Unauthorized" } } as any
  );
}

/** 从 mock 中取注册的响应拦截器拒绝处理器 */
function rejectHandler() {
  const calls = httpMock.interceptors.response.use.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as (err: unknown) => Promise<unknown>;
}

async function simulate401(config: Record<string, unknown> = {}) {
  await expect(rejectHandler()(unauthorizedError(config))).rejects.toThrow(
    "Request failed with status code 401"
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  httpMock.get.mockReset();
  vi.useFakeTimers();
});

describe("CnbClient 登录过期探测", () => {
  it("业务请求 401 且复核 /user 失败 → 触发过期通知（令牌模式）", async () => {
    const onExpired = vi.fn();
    const client = new CnbClient("https://api.cnb.cool", "tk");
    client.onAuthExpired = onExpired;
    httpMock.get.mockRejectedValue(unauthorizedError({ _authVerify: true }));

    await simulate401();
    await vi.advanceTimersByTimeAsync(300);

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onExpired.mock.calls[0][0]).toEqual({
      mode: "token",
      message: "访问令牌已失效",
    });
    // 复核请求带 _authVerify 标记，避免拦截器递归
    const recheck = httpMock.get.mock.calls.find(
      ([u]) => String(u) === "/user"
    );
    expect(recheck?.[1]).toMatchObject({ _authVerify: true });
  });

  it("业务请求 401 且复核 /user 失败 → 触发过期通知（Cookie 模式）", async () => {
    const onExpired = vi.fn();
    const client = new CnbClient();
    client.setCookieAuth("sessionid=expired");
    client.onAuthExpired = onExpired;
    httpMock.get.mockRejectedValue(unauthorizedError({ _authVerify: true }));

    await simulate401();
    await vi.advanceTimersByTimeAsync(300);

    expect(onExpired).toHaveBeenCalledWith({
      mode: "cookie",
      message: "网页登录会话已过期",
    });
  });

  it("带 _authVerify 标记的 401（凭证校验自身）不触发探测", async () => {
    const onExpired = vi.fn();
    const client = new CnbClient("https://api.cnb.cool", "tk");
    client.onAuthExpired = onExpired;

    await simulate401({ _authVerify: true });
    await vi.advanceTimersByTimeAsync(300);

    expect(onExpired).not.toHaveBeenCalled();
    // 未发起复核请求
    expect(httpMock.get).not.toHaveBeenCalled();
  });

  it("复核 /user 通过（会话仍有效）时不触发", async () => {
    const onExpired = vi.fn();
    const client = new CnbClient("https://api.cnb.cool", "tk");
    client.onAuthExpired = onExpired;
    httpMock.get.mockResolvedValue({ data: { username: "u" } });

    await simulate401();
    await vi.advanceTimersByTimeAsync(300);

    expect(onExpired).not.toHaveBeenCalled();
  });

  it("未配置任何凭证时 401 不触发（首次登录窗口探测场景）", async () => {
    const onExpired = vi.fn();
    const client = new CnbClient();
    client.onAuthExpired = onExpired;

    await simulate401();
    await vi.advanceTimersByTimeAsync(300);

    expect(onExpired).not.toHaveBeenCalled();
  });

  it("一次过期只触发一次；resetAuthExpiredFlag 后重新武装", async () => {
    const onExpired = vi.fn();
    const client = new CnbClient("https://api.cnb.cool", "tk");
    client.onAuthExpired = onExpired;
    httpMock.get.mockRejectedValue(unauthorizedError({ _authVerify: true }));

    await simulate401();
    await vi.advanceTimersByTimeAsync(300);
    await simulate401();
    await vi.advanceTimersByTimeAsync(300);
    expect(onExpired).toHaveBeenCalledTimes(1);

    client.resetAuthExpiredFlag();
    await simulate401();
    await vi.advanceTimersByTimeAsync(300);
    expect(onExpired).toHaveBeenCalledTimes(2);
  });
});

describe("getBranchesFriendly 诊断触发过期通知", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("404 且 /user 复核失败（Cookie 过期）→ 触发过期通知", async () => {
    const onExpired = vi.fn();
    const client = new CnbClient();
    client.setCookieAuth("sessionid=expired");
    client.onAuthExpired = onExpired;
    httpMock.get.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/-/git/branches")) {
        throw new AxiosError(
          "Request failed with status code 404",
          "ERR_BAD_REQUEST",
          undefined,
          undefined,
          { status: 404, data: {} } as any
        );
      }
      if (String(url).endsWith("/user")) {
        throw unauthorizedError({ _authVerify: true });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    await expect(client.getBranchesFriendly("org/repo")).rejects.toThrow(
      "网页登录已过期，请点击「网页登录」重新登录"
    );
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledWith({
      mode: "cookie",
      message: "网页登录会话已过期",
    });
  });

  it("会话有效（仓库不可达）时不触发过期通知", async () => {
    const onExpired = vi.fn();
    const client = new CnbClient();
    client.setCookieAuth("sessionid=ok");
    client.onAuthExpired = onExpired;
    httpMock.get.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/-/git/branches")) {
        throw new AxiosError(
          "Request failed with status code 404",
          "ERR_BAD_REQUEST",
          undefined,
          undefined,
          { status: 404, data: {} } as any
        );
      }
      if (String(url).endsWith("/user")) {
        return { data: { username: "u" } };
      }
      throw new Error(`unexpected url: ${url}`);
    });

    await expect(client.getBranchesFriendly("org/repo")).rejects.toThrow(
      "仓库不存在或无权限访问"
    );
    expect(onExpired).not.toHaveBeenCalled();
  });
});
