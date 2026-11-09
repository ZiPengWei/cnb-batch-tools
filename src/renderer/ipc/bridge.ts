import type { ListBranchesResponse, ListProjectsResponse } from "./types";
import type {
  BatchMergeLogEvent,
  BatchMergeRequest,
  BatchMergeResponse,
} from "./types";

type IpcInvoke = (channel: string, ...args: any[]) => Promise<any>;

function invoke(): IpcInvoke {
  return (
    (window.ipcRenderer?.invoke?.bind(window.ipcRenderer) as any) ??
    (async () => {
      throw new Error("ipcRenderer 不可用（请确认已在 Electron 环境运行）");
    })
  );
}

export async function setAuth(payload: {
  baseUrl: string;
  token: string;
  /** cnb.cool 网页会话 Cookie（可选，用于置顶双向同步或 Cookie 模式认证） */
  webCookie?: string;
  /** 认证模式：token=访问令牌（api.cnb.cool），cookie=网页登录会话（cnb.cool） */
  mode?: "token" | "cookie";
}) {
  return invoke()("cnb:set-auth", payload) as Promise<any>;
}

/** 清空主进程持有的认证凭证（令牌与网页 Cookie），用于退出登录。 */
export async function clearAuth() {
  return invoke()("cnb:clear-auth");
}

/**
 * 打开内嵌网页登录窗口，用户登录 CNB 后自动返回会话 Cookie。
 * forceFresh=true 时清空持久化网页会话，强制全新登录（用于切换账号）。
 */
export async function webLogin(opts?: { forceFresh?: boolean }): Promise<
  | { ok: true; cookie: string; user?: { name?: string; username?: string; nickname?: string } }
  | { ok: false; error: string }
> {
  return invoke()("cnb:web-login", opts);
}

/**
 * 置顶/取消置顶仓库（写回 CNB 网页 dashboard）。
 * 需要在认证时提供有效的网页会话 Cookie。
 */
export async function setRepoPinned(payload: {
  repo: string;
  pinned: boolean;
}): Promise<
  { ok: true } | { ok: false; error: { status: number; message: string } }
> {
  return invoke()("cnb:set-repo-pinned", payload);
}

export async function listProjects(): Promise<ListProjectsResponse> {
  return invoke()("cnb:list-projects") as Promise<ListProjectsResponse>;
}

export async function listBranches(payload: {
  repo: string;
}): Promise<ListBranchesResponse> {
  return invoke()("cnb:list-branches", payload) as Promise<ListBranchesResponse>;
}

export async function batchMerge(
  payload: BatchMergeRequest
): Promise<BatchMergeResponse> {
  return invoke()("cnb:batch-merge", payload) as Promise<BatchMergeResponse>;
}

export function onBatchMergeLog(callback: (e: BatchMergeLogEvent) => void) {
  const ipc = window.ipcRenderer;
  if (!ipc?.on || !ipc?.off) return () => {};
  (ipc as any).removeAllListeners?.("cnb:batch-merge-log");
  const handler = (_event: any, payload: BatchMergeLogEvent) => {
    callback(payload);
  };
  ipc.on("cnb:batch-merge-log", handler);
  return () => {
    ipc.off("cnb:batch-merge-log", handler);
  };
}

export async function openExternal(url: string) {
  return invoke()("shell:open-external", url);
}

/** 当前平台标识（Electron preload 注入；非 Electron 环境返回空字符串） */
export function getPlatform(): string {
  return (window.ipcRenderer?.platform as string) || "";
}

// ---------- Windows 关闭行为设置 ----------

/** 关闭窗口的默认行为：ask=每次询问 / tray=最小化到系统托盘 / exit=直接退出 */
export type CloseAction = "ask" | "tray" | "exit";

/** 读取已保存的关闭行为偏好 */
export async function getCloseAction(): Promise<CloseAction> {
  return invoke()("app:get-close-action") as Promise<CloseAction>;
}

/** 保存关闭行为偏好（Windows 设置项） */
export async function setCloseAction(action: CloseAction): Promise<CloseAction> {
  return invoke()("app:set-close-action", action) as Promise<CloseAction>;
}

// ---------- 应用更新检查 ----------

export interface UpdateStatus {
  checking: boolean;
  current: string;
  latest: string;
  hasUpdate: boolean;
  releaseUrl: string;
  error: string;
}

/** 当前应用版本号（主进程 app.getVersion()） */
export async function getAppVersion(): Promise<string> {
  return invoke()("cnb:app-version") as Promise<string>;
}

/** 主进程最近一次检查的更新状态（可能为 null：尚未检查过） */
export async function getUpdateStatus(): Promise<UpdateStatus | null> {
  return invoke()("cnb:get-update-status") as Promise<UpdateStatus | null>;
}

/** 主动触发一次更新检查（结果同样会通过 onUpdateStatus 推送） */
export async function checkForUpdate(): Promise<UpdateStatus | null> {
  return invoke()("cnb:check-update") as Promise<UpdateStatus | null>;
}

/** 订阅主进程的更新状态推送（自动检查/定时检查的结果） */
export function onUpdateStatus(callback: (status: UpdateStatus) => void) {
  const ipc = window.ipcRenderer;
  if (!ipc?.on || !ipc?.off) return () => {};
  const handler = (_event: any, payload: UpdateStatus) => callback(payload);
  ipc.on("cnb:update-status", handler);
  return () => {
    ipc.off("cnb:update-status", handler);
  };
}
