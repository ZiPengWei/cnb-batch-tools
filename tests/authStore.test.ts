import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * 认证 store 测试：
 * - 网页登录（Cookie 模式）始终持久化会话，不受"记住令牌"勾选影响
 * - 令牌模式受 rememberToken 控制
 * - 退出登录清空本地与主进程凭证
 */

const bridgeState = {
  webLoginResult: {
    ok: true,
    cookie: "sessionid=abc",
    user: { username: "alice" },
  } as any,
  setAuthResult: { ok: true, user: { username: "alice" } } as any,
};

vi.mock("../src/renderer/ipc/bridge", () => ({
  webLogin: vi.fn(async () => bridgeState.webLoginResult),
  setAuth: vi.fn(async () => bridgeState.setAuthResult),
  clearAuth: vi.fn(async () => ({ ok: true })),
  setRepoPinned: vi.fn(async () => ({ ok: true })),
  listProjects: vi.fn(async () => ({ items: [] })),
  listBranches: vi.fn(async () => ({ branches: [] })),
  onBatchMergeLog: vi.fn(() => () => {}),
}));

import { CNB_AUTH_STORAGE_KEY, useAuthStore } from "../src/renderer/store/auth";
import { clearAuth } from "../src/renderer/ipc/bridge";

function readStored(): any {
  const raw = localStorage.getItem(CNB_AUTH_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.clearAllMocks();
  bridgeState.webLoginResult = {
    ok: true,
    cookie: "sessionid=abc",
    user: { username: "alice" },
  };
  bridgeState.setAuthResult = { ok: true, user: { username: "alice" } };
});

describe("authStore 认证模式与持久化", () => {
  it("网页登录成功后即使未勾选记住令牌也持久化 Cookie 会话", async () => {
    const store = useAuthStore();
    store.rememberToken = false;
    const ok = await store.loginViaWeb();
    expect(ok).toBe(true);
    expect(store.mode).toBe("cookie");
    expect(store.connected).toBe(true);
    const stored = readStored();
    expect(stored).not.toBeNull();
    expect(stored.webCookie).toBe("sessionid=abc");
    expect(stored.mode).toBe("cookie");
  });

  it("令牌连接未勾选记住令牌时不持久化", async () => {
    const store = useAuthStore();
    store.baseUrl = "https://api.cnb.cool";
    store.token = "tk";
    store.rememberToken = false;
    await store.connect();
    expect(store.connected).toBe(true);
    expect(readStored()).toBeNull();
  });

  it("令牌连接勾选记住令牌时持久化令牌", async () => {
    const store = useAuthStore();
    store.baseUrl = "https://api.cnb.cool";
    store.token = "tk";
    store.rememberToken = true;
    await store.connect();
    const stored = readStored();
    expect(stored).not.toBeNull();
    expect(stored.token).toBe("tk");
    expect(stored.mode).toBe("token");
  });

  it("退出登录清空状态、持久化与主进程凭证", async () => {
    const store = useAuthStore();
    store.rememberToken = false;
    await store.loginViaWeb();
    expect(store.connected).toBe(true);

    await store.logout();

    expect(store.connected).toBe(false);
    expect(store.userName).toBe("");
    expect(store.webCookie).toBe("");
    expect(store.token).toBe("");
    expect(store.mode).toBe("token");
    expect(localStorage.getItem(CNB_AUTH_STORAGE_KEY)).toBeNull();
    expect(clearAuth).toHaveBeenCalledTimes(1);
  });

  it("退出登录在主进程清理失败时也完成本地退出", async () => {
    const store = useAuthStore();
    store.rememberToken = false;
    await store.loginViaWeb();
    vi.mocked(clearAuth).mockRejectedValueOnce(new Error("ipc error"));

    await expect(store.logout()).resolves.toBeUndefined();
    expect(store.connected).toBe(false);
    expect(localStorage.getItem(CNB_AUTH_STORAGE_KEY)).toBeNull();
  });
});

describe("authStore 静默重连（macOS 关窗重开/重启后恢复登录态）", () => {
  it("Cookie 模式有已保存会话时 loadLocal 自动恢复连接", async () => {
    localStorage.setItem(
      CNB_AUTH_STORAGE_KEY,
      JSON.stringify({
        baseUrl: "https://cnb.cool",
        token: "",
        webCookie: "sessionid=abc",
        mode: "cookie",
        rememberToken: false,
      }),
    );
    const store = useAuthStore();

    await store.loadLocal();

    expect(store.connected).toBe(true);
    expect(store.userName).toBe("alice");
    expect(store.mode).toBe("cookie");
    const { setAuth } = await import("../src/renderer/ipc/bridge");
    expect(vi.mocked(setAuth)).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "cookie", webCookie: "sessionid=abc" }),
    );
  });

  it("令牌模式勾选记住令牌时 loadLocal 自动恢复连接", async () => {
    localStorage.setItem(
      CNB_AUTH_STORAGE_KEY,
      JSON.stringify({
        baseUrl: "https://api.cnb.cool",
        token: "tk",
        webCookie: "",
        mode: "token",
        rememberToken: true,
      }),
    );
    const store = useAuthStore();

    await store.loadLocal();

    expect(store.connected).toBe(true);
    expect(store.userName).toBe("alice");
    const { setAuth } = await import("../src/renderer/ipc/bridge");
    expect(vi.mocked(setAuth)).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "token", token: "tk" }),
    );
  });

  it("凭证已失效时保持未连接且保留凭证供手动重试", async () => {
    bridgeState.setAuthResult = { ok: false, error: { message: "401" } };
    localStorage.setItem(
      CNB_AUTH_STORAGE_KEY,
      JSON.stringify({
        baseUrl: "https://cnb.cool",
        token: "",
        webCookie: "sessionid=expired",
        mode: "cookie",
        rememberToken: false,
      }),
    );
    const store = useAuthStore();

    await store.loadLocal();

    expect(store.connected).toBe(false);
    expect(store.webCookie).toBe("sessionid=expired");
    expect(store.busy).toBe(false);
  });

  it("无已保存凭证时不发起静默重连", async () => {
    const store = useAuthStore();

    await store.loadLocal();

    expect(store.connected).toBe(false);
    const { setAuth } = await import("../src/renderer/ipc/bridge");
    expect(vi.mocked(setAuth)).not.toHaveBeenCalled();
  });

  it("静默重连返回 401（凭证失效）时弹出重新登录提示", async () => {
    bridgeState.setAuthResult = {
      ok: false,
      error: { status: 401, message: "Unauthorized" },
    };
    localStorage.setItem(
      CNB_AUTH_STORAGE_KEY,
      JSON.stringify({
        baseUrl: "https://cnb.cool",
        token: "",
        webCookie: "sessionid=expired",
        mode: "cookie",
        rememberToken: false,
      }),
    );
    const store = useAuthStore();

    await store.loadLocal();

    expect(store.connected).toBe(false);
    expect(store.expiredMessage).toBe("保存的登录已过期");
    expect(store.busy).toBe(false);
  });

  it("静默重连网络失败（无 status）时不弹过期提示", async () => {
    bridgeState.setAuthResult = {
      ok: false,
      error: { status: 0, message: "Network Error" },
    };
    localStorage.setItem(
      CNB_AUTH_STORAGE_KEY,
      JSON.stringify({
        baseUrl: "https://cnb.cool",
        token: "",
        webCookie: "sessionid=abc",
        mode: "cookie",
        rememberToken: false,
      }),
    );
    const store = useAuthStore();

    await store.loadLocal();

    expect(store.connected).toBe(false);
    expect(store.expiredMessage).toBe("");
  });
});

describe("authStore 登录过期弹窗（是否重新登录）", () => {
  it("promptRelogin 记录过期文案；已有文案时忽略重复通知", () => {
    const store = useAuthStore();
    store.promptRelogin("网页登录会话已过期");
    expect(store.expiredMessage).toBe("网页登录会话已过期");

    store.promptRelogin("另一条过期通知");
    expect(store.expiredMessage).toBe("网页登录会话已过期");
  });

  it("无入参时按认证模式给出默认文案", () => {
    const store = useAuthStore();
    store.mode = "token";
    store.promptRelogin();
    expect(store.expiredMessage).toBe("访问令牌已失效");
  });

  it("正在登录或连接流程中忽略过期通知", () => {
    const store = useAuthStore();
    store.loggingIn = true;
    store.promptRelogin("网页登录会话已过期");
    expect(store.expiredMessage).toBe("");

    store.loggingIn = false;
    store.busy = true;
    store.promptRelogin("网页登录会话已过期");
    expect(store.expiredMessage).toBe("");
  });

  it("dismissRelogin 关闭弹窗", () => {
    const store = useAuthStore();
    store.promptRelogin("网页登录会话已过期");
    store.dismissRelogin();
    expect(store.expiredMessage).toBe("");
  });

  it("confirmRelogin 关闭弹窗并强制全新网页登录（自动弹出登录窗口）", async () => {
    const store = useAuthStore();
    store.promptRelogin("网页登录会话已过期");

    await store.confirmRelogin();

    expect(store.expiredMessage).toBe("");
    const { webLogin } = await import("../src/renderer/ipc/bridge");
    expect(vi.mocked(webLogin)).toHaveBeenCalledWith({ forceFresh: true });
    expect(store.connected).toBe(true);
    expect(store.mode).toBe("cookie");
  });

  it("重新登录成功后清空过期提示", async () => {
    const store = useAuthStore();
    store.promptRelogin("网页登录会话已过期");
    await store.loginViaWeb();
    expect(store.expiredMessage).toBe("");
  });
});
