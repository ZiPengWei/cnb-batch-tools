import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { CnbClient } from "../src/main/services/cnbClient";
import { MergeService } from "../src/main/services/mergeService";
import {
  RELEASES_PAGE_URL,
  fetchLatestRelease,
  isNewerVersion,
} from "../src/main/services/updateChecker";
import {
  cleanupMacOldBundle,
  downloadUpdateAsset,
  installUpdate,
} from "../src/main/services/updateInstaller";
import type { DownloadProgress } from "../src/main/services/updateInstaller";
import type {
  BatchMergeRequest,
  BatchMergeResponse,
  ListBranchesResponse,
  ListProjectsResponse,
} from "../src/renderer/ipc/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null;

const cnb = new CnbClient();
const mergeService = new MergeService(cnb);

// 登录过期通知：凭证失效确认后推送渲染层，弹窗询问是否重新登录。
// 登录窗口打开期间不推送——登录探测（testWebCookie）产生的临时 401 不是过期。
cnb.onAuthExpired = (info) => {
  try {
    if (loginWin) return;
    win?.webContents?.send?.("cnb:auth-expired", info);
  } catch {
    /* 窗口可能尚未创建/已销毁，忽略 */
  }
};

ipcMain.handle(
  "cnb:set-auth",
  async (
    _event: IpcMainInvokeEvent,
    payload: {
      baseUrl: string;
      token: string;
      webCookie?: string;
      mode?: "token" | "cookie";
    }
  ) => {
    if (payload.mode === "cookie" && payload.webCookie) {
      // Cookie 模式：走 cnb.cool 同源 API，无需访问令牌
      cnb.setBaseUrl(payload.baseUrl || "https://cnb.cool");
      cnb.setCookieAuth(payload.webCookie);
    } else {
      // 令牌模式：走 api.cnb.cool
      cnb.setBaseUrl(payload.baseUrl);
      cnb.setToken(payload.token);
      if (payload.webCookie) cnb.setWebCookie(payload.webCookie);
    }
    const res = await cnb.verifyToken();
    // 认证成功后重新武装登录过期检测（允许下次过期再次通知）
    if (res.ok) cnb.resetAuthExpiredFlag();
    return res;
  }
);

/** 退出登录：清空主进程持有的令牌与网页会话 Cookie。 */
ipcMain.handle("cnb:clear-auth", async () => {
  cnb.clearToken();
  cnb.setWebCookie("");
  return { ok: true };
});

// ---------- 应用更新检查（GitHub Release，提示但不强制更新） ----------

export interface UpdateStatus {
  checking: boolean;
  current: string;
  latest: string;
  hasUpdate: boolean;
  releaseUrl: string;
  error: string;
}

let updateStatus: UpdateStatus | null = null;

function pushUpdateStatus(status: UpdateStatus) {
  updateStatus = status;
  try {
    win?.webContents?.send?.("cnb:update-status", status);
  } catch {
    /* 窗口可能尚未创建/已销毁，忽略 */
  }
}

async function runUpdateCheck() {
  const current = app.getVersion();
  pushUpdateStatus({
    checking: true,
    current,
    latest: updateStatus?.latest || "",
    hasUpdate: updateStatus?.hasUpdate || false,
    releaseUrl: updateStatus?.releaseUrl || RELEASES_PAGE_URL,
    error: "",
  });
  try {
    const rel = await fetchLatestRelease();
    pushUpdateStatus({
      checking: false,
      current,
      latest: rel.version,
      hasUpdate: isNewerVersion(current, rel.version),
      releaseUrl: rel.htmlUrl,
      error: "",
    });
  } catch (err: any) {
    pushUpdateStatus({
      checking: false,
      current,
      latest: updateStatus?.latest || "",
      hasUpdate: updateStatus?.hasUpdate || false,
      releaseUrl: updateStatus?.releaseUrl || RELEASES_PAGE_URL,
      error: err?.message ? `检查更新失败: ${err.message}` : "检查更新失败",
    });
  }
}

ipcMain.handle("cnb:app-version", () => app.getVersion());

ipcMain.handle("cnb:get-update-status", () => updateStatus);

ipcMain.handle("cnb:check-update", async () => {
  await runUpdateCheck();
  return updateStatus;
});

// ---------- 应用内更新：下载与安装 ----------

interface UpdateDownloadState {
  phase: "idle" | "downloading" | "downloaded" | "error";
  received: number;
  total: number;
  percent: number;
  filePath: string;
  error: string;
}

let updateDownload: UpdateDownloadState = {
  phase: "idle",
  received: 0,
  total: 0,
  percent: 0,
  filePath: "",
  error: "",
};

function pushUpdateDownload(patch: Partial<UpdateDownloadState>) {
  updateDownload = { ...updateDownload, ...patch };
  try {
    win?.webContents?.send?.("cnb:update-download", updateDownload);
  } catch {
    /* 窗口可能尚未创建/已销毁，忽略 */
  }
}

ipcMain.handle("cnb:get-update-download", () => updateDownload);

ipcMain.handle("app:download-update", async () => {
  if (updateDownload.phase === "downloading") return updateDownload;
  pushUpdateDownload({ phase: "downloading", error: "", filePath: "" });
  try {
    const result = await downloadUpdateAsset(
      {
        // Windows 优先 exe 同目录（全自动替换需要），mac 用临时目录
        preferredDir:
          process.platform === "win32"
            ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
            : app.getPath("temp"),
        fallbackDir: app.getPath("downloads"),
      },
      (p: DownloadProgress) => pushUpdateDownload(p),
    );
    pushUpdateDownload({
      phase: "downloaded",
      percent: 100,
      received: result.size,
      total: result.size,
      filePath: result.filePath,
    });
    return updateDownload;
  } catch (e: any) {
    pushUpdateDownload({
      phase: "error",
      error: e?.message ? `下载更新失败: ${e.message}` : "下载更新失败",
    });
    return updateDownload;
  }
});

ipcMain.handle("app:install-update", () => {
  const filePath = updateDownload.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, message: "未找到已下载的更新文件，请重新下载" };
  }
  try {
    const result = installUpdate(filePath);
    // 搬家安装（原位置只读/dmg 内运行）成功：通知用户新版装到了哪里，旧入口可删除
    if (result.migrated && result.installDir) {
      try {
        const n = new Notification({
          title: "更新已自动安装",
          body: `新版本已安装到 ${result.installDir}，即将从该位置启动。`,
          silent: false,
        });
        n.on("click", () => showMainWindow());
        n.show();
      } catch {
        /* 通知失败不影响安装 */
      }
    }
    // 安装脚本已在后台排队：稍候退出，由脚本完成"替换 + 重启"
    setTimeout(() => {
      app.quit();
    }, 500);
    return { ok: true };
  } catch (e: any) {
    const message = e?.message ? `安装更新失败: ${e.message}` : "安装更新失败";
    // 降级：mac 挂载镜像让用户手动拖入；win 打开文件所在文件夹
    try {
      if (process.platform === "darwin") {
        void shell.openPath(filePath);
      } else {
        shell.showItemInFolder(filePath);
      }
    } catch {
      /* 降级失败忽略 */
    }
    return { ok: false, message };
  }
});

/**
 * 打开内嵌网页登录窗口：用户在窗口内正常登录 CNB（密码/扫码/passkey），
 * 登录成功后自动抓取会话 Cookie 返回给渲染层持久化。
 * Cookie 模式下所有 API 走 https://cnb.cool 同源接口，无需访问令牌。
 */
let loginWin: BrowserWindow | null = null;

ipcMain.handle(
  "cnb:web-login",
  async (_event: IpcMainInvokeEvent, payload?: { forceFresh?: boolean }) => {
    if (loginWin) {
      loginWin.focus();
      return { ok: false, error: "登录窗口已打开，请完成登录" };
    }
    const ses = session.fromPartition("persist:cnb-web-login");
    // 切换账号：清空持久化网页会话（Cookie/本地存储等），确保弹出全新登录页
    if (payload?.forceFresh) {
      try {
        await ses.clearStorageData({
          storages: [
            "cookies",
            "localstorage",
            "indexdb",
            "serviceworkers",
            "cachestorage",
          ],
        });
      } catch {
        /* ignore */
      }
    }
    return await new Promise<any>((resolve) => {
    let settled = false;
    const win = new BrowserWindow({
      width: 1024,
      height: 760,
      title: "登录 CNB",
      autoHideMenuBar: true,
      // 页面渲染完成后再显示，避免打开登录窗时白屏
      show: false,
      backgroundColor: "#ffffff",
      webPreferences: { session: ses, contextIsolation: true },
    });
    win.once("ready-to-show", () => win.show());
    // 兜底：远程页面加载异常时也要保证窗口可见
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    }, 5000);
    loginWin = win;

    const settle = (result: any) => {
      if (settled) return;
      settled = true;
      resolve(result);
      try {
        win.close();
      } catch {
        /* ignore */
      }
    };

    // 每次页面跳转后尝试检查登录态：能拿到 cookie 且 GET /user 通过即成功
    const checkLogin = async () => {
      try {
        const cookies = await ses.cookies.get({ domain: "cnb.cool" });
        const cookieStr = cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        if (!cookieStr) return;
        const test = await cnb.testWebCookie(cookieStr);
        if (test.ok) {
          settle({ ok: true, cookie: cookieStr, user: test.user });
        }
      } catch {
        /* ignore, 等下一次导航再检查 */
      }
    };

    win.webContents.on("did-navigate", () => void checkLogin());
    win.webContents.on("did-navigate-in-page", () => void checkLogin());
    win.on("closed", () => {
      loginWin = null;
      if (!settled) settle({ ok: false, error: "登录窗口已关闭" });
    });

    // 主页加载完成后自动点击「微信登录 / WeChat Login」按钮，直接弹出登录框
    // （CNB 无独立登录页，/login 会 404；登录框是主页上的模态框）
    const autoOpenWechatLogin = async () => {
      for (let i = 0; i < 20; i++) {
        try {
          const clicked = await win.webContents.executeJavaScript(
            `(() => {
              const keys = ['微信登录', '微信登陆', 'wechat login'];
              const els = Array.from(document.querySelectorAll('a, button, [role="button"]'));
              const btn = els.find((el) => {
                const t = (el.textContent || '').trim().toLowerCase();
                if (!t || t.length > 30) return false;
                return keys.some((k) => t === k || t.includes(k));
              });
              if (btn) { btn.click(); return true; }
              return false;
            })()`,
            true
          );
          if (clicked) return;
        } catch {
          /* ignore, 等待下一轮 */
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    };
    win.webContents.on("did-finish-load", () => {
      const url = win.webContents.getURL();
      // 仅在中文主页（登录入口所在页）自动点击，登录后的跳转不处理
      try {
        const u = new URL(url);
        if (
          u.hostname === "cnb.cool" &&
          (u.pathname === "/" || u.pathname === "")
        ) {
          void autoOpenWechatLogin();
        }
      } catch {
        /* ignore */
      }
    });

    void win.loadURL("https://cnb.cool/?lang=zh-CN");
  });
});

/**
 * 置顶/取消置顶仓库（写回 CNB 网页 dashboard，实现双向同步）。
 * 需要已配置有效的网页会话 Cookie（cnb:set-auth 时传入）。
 */
ipcMain.handle(
  "cnb:set-repo-pinned",
  async (
    _event: IpcMainInvokeEvent,
    payload: { repo: string; pinned: boolean }
  ) => {
    return cnb.setRepoPinned(payload.repo, payload.pinned);
  }
);

ipcMain.handle(
  "cnb:list-projects",
  async (): Promise<ListProjectsResponse> => {
    const repos = await cnb.getAllRepos();
    const items = repos
      .map((r) => {
        const display = (r.path || r.name || "").toString();
        const id = display;
        if (!display) return null;
        return {
          id,
          display,
          search: display.toLowerCase(),
          pinyinFull: "",
          pinyinInitials: "",
          pinned: r.pinned === true,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => a.search.localeCompare(b.search));
    return { items };
  }
);

ipcMain.handle(
  "cnb:list-branches",
  async (
    _event: IpcMainInvokeEvent,
    payload: { repo: string }
  ): Promise<ListBranchesResponse> => {
    // 快速路径：仅拉取分支列表（401/404 在客户端内做会话/仓库可达性诊断并
    // 转换为友好提示），立即返回让分支可选；提交时间排序在后台计算完成后经
    // cnb:branches-sorted 推送渲染层平滑更新。这里以结构化 error 返回，
    // 避免 Electron 把错误包装成 invoke 前缀文案。
    try {
      const branches = await cnb.getBranchesFriendly(payload.repo);
      const names = branches
        .map((b) => b.name)
        .filter((x): x is string => Boolean(x));
      void scheduleBranchSort(payload.repo);
      return { branches: names };
    } catch (e) {
      return {
        branches: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
);

/** 后台分支排序任务序号（仅保留最新一次请求的结果） */
let branchSortToken = 0;

/**
 * 后台按最新提交时间计算分支排序（分支多时较慢，不阻塞列表展示），
 * 完成后推送 cnb:branches-sorted；渲染层校验 repo 匹配后平滑更新列表。
 */
async function scheduleBranchSort(repo: string) {
  const token = ++branchSortToken;
  try {
    const sorted = await cnb.getBranchesSortedByCommitTime(repo);
    if (token !== branchSortToken) return; // 已有更新的排序请求，丢弃旧结果
    const names = sorted
      .map((b) => b.name)
      .filter((x): x is string => Boolean(x));
    if (!names.length) return;
    win?.webContents?.send?.("cnb:branches-sorted", { repo, branches: names });
  } catch {
    /* 排序失败不提示，保持名称顺序 */
  }
}

ipcMain.handle(
  "cnb:batch-merge",
  async (
    event: IpcMainInvokeEvent,
    payload: BatchMergeRequest
  ): Promise<BatchMergeResponse> => {
    const runId = payload.runId || "unknown";
    return await mergeService.runBatchMerge(payload.repo, payload.pairs, {
      onLog: (text, error) => {
        event.sender.send("cnb:batch-merge-log", { runId, text, error });
      },
    });
  }
);

ipcMain.handle("shell:open-external", async (_event, url: string) => {
  await shell.openExternal(url);
});

// ---------- 系统通知（批量合并完成提醒，点击唤起主窗口） ----------

ipcMain.handle(
  "app:notify",
  (
    _event: IpcMainInvokeEvent,
    payload: { title: string; body: string }
  ): { ok: boolean; skipped?: string } => {
    try {
      if (!Notification.isSupported()) return { ok: false, skipped: "unsupported" };
      // 主窗口正在聚焦时用户就在看结果弹窗，不打扰
      if (win && !win.isDestroyed() && win.isFocused()) {
        return { ok: false, skipped: "focused" };
      }
      const n = new Notification({
        title: String(payload?.title || "CNB 批量合并工具"),
        body: String(payload?.body || "").slice(0, 200),
      });
      n.on("click", () => showMainWindow());
      n.show();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
);

// ---------- 剪贴板（结果报告复制） ----------

ipcMain.handle("app:copy-text", (_event, text: string) => {
  try {
    clipboard.writeText(String(text ?? ""));
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

// ---------- 合并进行中的退出保护 ----------

/** 批量合并是否进行中（渲染层经 app:set-merge-running 同步） */
let mergeRunning = false;

ipcMain.handle("app:set-merge-running", (_event, running: boolean) => {
  mergeRunning = Boolean(running);
  return { ok: true };
});

/** macOS：Cmd+Q 等退出路径在合并进行中时先确认 */
app.on("before-quit", (e) => {
  if (mergeRunning && !forceQuitConfirmed) {
    e.preventDefault();
    void confirmQuitDuringMerge();
    return;
  }
  isQuitting = true;
});

let forceQuitConfirmed = false;

async function confirmQuitDuringMerge() {
  if (!win || win.isDestroyed()) {
    forceQuitConfirmed = true;
    app.quit();
    return;
  }
  win.show();
  win.focus();
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    title: "批量合并进行中",
    message: "批量合并正在进行，退出会中断未完成的合并。",
    detail: "已开始的 PR 会保留；未处理的目标分支可稍后重试。",
    buttons: ["取消", "退出并中断"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (response === 1) {
    forceQuitConfirmed = true;
    app.quit();
  }
}

// ---------- Windows 关闭行为（托盘最小化 / 直接退出，可记住选择） ----------

type CloseAction = "ask" | "tray" | "exit";

let closeAction: CloseAction = "ask";
let tray: Tray | null = null;
/** 真正退出（托盘菜单/Cmd+Q/app.quit）时置 true，close 拦截据此放行 */
let isQuitting = false;

function prefsFile() {
  return path.join(app.getPath("userData"), "preferences.json");
}

function readPrefs(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(prefsFile(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function loadCloseAction(): CloseAction {
  const v = readPrefs().closeAction;
  return v === "tray" || v === "exit" || v === "ask" ? v : "ask";
}

function saveCloseAction(action: CloseAction) {
  try {
    const prefs = readPrefs();
    prefs.closeAction = action;
    fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2));
  } catch {
    /* 保存失败不阻塞关闭流程 */
  }
}

function showMainWindow() {
  if (!win || win.isDestroyed()) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Windows：创建系统托盘图标（首次最小化到托盘时才创建） */
function ensureTray() {
  if (tray || process.platform !== "win32") return;
  const icon = nativeImage
    .createFromPath(path.join(process.env.VITE_PUBLIC, "icon.png"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("CNB 批量合并工具");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开主界面", click: () => showMainWindow() },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => showMainWindow());
}

/**
 * Windows：窗口关闭请求处理（close 已被 preventDefault 拦截后进入这里）。
 * ask → 弹窗询问（可勾选记住选择）；tray → 隐藏到托盘；exit → 真正退出。
 */
async function handleCloseRequest() {
  // 合并进行中：先提醒，避免误关中断批量合并
  if (mergeRunning) {
    if (!win || win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      title: "批量合并进行中",
      message: "批量合并正在进行，退出会中断未完成的合并。",
      detail: "可最小化到托盘等待完成；已开始的 PR 会保留。",
      buttons: ["最小化到托盘", "强制退出"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (response !== 1) {
      ensureTray();
      win.hide();
      return;
    }
    forceQuitConfirmed = true;
    isQuitting = true;
    app.quit();
    return;
  }
  let action = closeAction;
  if (action === "ask") {
    if (!win || win.isDestroyed()) return;
    const { response, checkboxChecked } = await dialog.showMessageBox(win, {
      type: "question",
      title: "关闭窗口",
      message: "要最小化到系统托盘，还是直接退出？",
      detail:
        "最小化到托盘后程序在后台运行，可从右下角托盘图标重新打开主界面。",
      buttons: ["最小化到托盘", "直接退出"],
      defaultId: 0,
      cancelId: 0,
      checkboxLabel: "记住我的选择，不再询问",
      noLink: true,
    });
    action = response === 1 ? "exit" : "tray";
    if (checkboxChecked) {
      closeAction = action;
      saveCloseAction(action);
    }
  }
  if (action === "exit") {
    isQuitting = true;
    app.quit();
    return;
  }
  ensureTray();
  if (win && !win.isDestroyed()) win.hide();
}

ipcMain.handle("app:get-close-action", () => closeAction);

ipcMain.handle("app:set-close-action", (_event, action: CloseAction) => {
  if (action === "ask" || action === "tray" || action === "exit") {
    closeAction = action;
    saveCloseAction(action);
  }
  return closeAction;
});

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeInitialWindowBounds() {
  const display = screen.getPrimaryDisplay();
  const wa = display.workAreaSize;
  const waW = Math.max(0, Number(wa.width || 0));
  const waH = Math.max(0, Number(wa.height || 0));

  const phi = 1.618;
  const hardMaxW = Math.round(1000 * phi);

  const baseMinW = 980;
  const baseMinH = 640;
  const minWidth = Math.min(baseMinW, waW || baseMinW);
  const minHeight = Math.min(baseMinH, waH || baseMinH);

  const maxWidth = Math.max(minWidth, waW || minWidth);
  const maxHeight = Math.max(minHeight, waH || minHeight);

  let width = Math.min(Math.round(maxWidth * 0.92), hardMaxW);
  let height = Math.round(width / phi);

  const capH = Math.round(maxHeight * 0.92);
  if (height > capH) {
    height = capH;
    width = Math.round(height * phi);
  }

  width = clamp(width, minWidth, maxWidth);
  height = clamp(height, minHeight, maxHeight);

  return { width, height, minWidth, minHeight };
}

/**
 * 固定页面缩放 100%：
 * - 禁用触控板捏合缩放（setVisualZoomLevelLimits）
 * - Ctrl+滚轮触发的 zoom-changed 一律重置回 1
 * 应用无菜单栏，用户误触缩放后没有任何恢复入口，故直接固定。
 */
function pinZoomLevel(wc: WebContents) {
  wc.setVisualZoomLevelLimits(1, 1).catch(() => {
    /* 旧版本 API 可能不存在，忽略 */
  });
  wc.on("zoom-changed", () => {
    wc.setZoomFactor(1);
  });
}

// ---------- 窗口大小/位置记忆（macOS 关窗重开、重启后不再回到初始尺寸） ----------

interface SavedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function windowBoundsFile() {
  return path.join(app.getPath("userData"), "window-bounds.json");
}

function loadSavedBounds(): SavedBounds | null {
  try {
    const data = JSON.parse(fs.readFileSync(windowBoundsFile(), "utf8")) as Partial<SavedBounds>;
    if (
      !Number.isFinite(data.x) ||
      !Number.isFinite(data.y) ||
      !Number.isFinite(data.width) ||
      !Number.isFinite(data.height) ||
      (data.width as number) < 400 ||
      (data.height as number) < 300
    ) {
      return null;
    }
    return {
      x: Math.round(data.x as number),
      y: Math.round(data.y as number),
      width: Math.round(data.width as number),
      height: Math.round(data.height as number),
    };
  } catch {
    return null;
  }
}

function saveWindowBounds() {
  try {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    // getNormalBounds 取非最大化/非全屏时的尺寸，最大化时恢复的是还原后的尺寸
    const b = win.getNormalBounds();
    fs.mkdirSync(path.dirname(windowBoundsFile()), { recursive: true });
    fs.writeFileSync(windowBoundsFile(), JSON.stringify(b));
  } catch {
    /* 保存失败不影响关闭流程 */
  }
}

/** 恢复的位置是否至少部分落在某个显示器的可视区域内（防止拔掉外接屏后窗口跑丢） */
function boundsVisibleOnScreen(b: SavedBounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    const mx = 80;
    const my = 40;
    return (
      b.x + b.width > wa.x + mx &&
      b.x < wa.x + wa.width - mx &&
      b.y + b.height > wa.y + my &&
      b.y < wa.y + wa.height - my
    );
  });
}

function restoreWindowBounds(initial: {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}): SavedBounds | null {
  const saved = loadSavedBounds();
  if (!saved) return null;
  if (!boundsVisibleOnScreen(saved)) return null;
  if (saved.width < initial.minWidth || saved.height < initial.minHeight) return null;
  return saved;
}

function createWindow() {
  const initial = computeInitialWindowBounds();
  // 优先恢复上一次的窗口大小与位置（macOS 关窗重开 / 应用重启场景）
  const restored = restoreWindowBounds(initial);

  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "icon.png"),
    width: restored ? restored.width : initial.width,
    height: restored ? restored.height : initial.height,
    ...(restored ? { x: restored.x, y: restored.y } : {}),
    minWidth: initial.minWidth,
    minHeight: initial.minHeight,
    // 先隐藏窗口，页面首次渲染完成后再显示，避免启动白屏
    show: false,
    // 背景跟随系统主题（与渲染层曜石青蓝/云岩微雾底色一致），避免启动闪屏
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0C0E12" : "#F4F6F9",
    // macOS 启用一体化内嵌标题栏，红绿灯自然融入顶栏左侧
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 15 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  win.once("ready-to-show", () => {
    win?.show();
  });
  // 兜底：极端情况下 ready-to-show 不触发，3 秒后强制显示
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  }, 3000);

  if (!restored) {
    win.center();
  }

  // 关闭窗口（含 Cmd+Q 退出）前记录窗口大小与位置，供下次恢复
  win.on("close", (e) => {
    saveWindowBounds();
    // Windows：按用户偏好决定最小化到托盘或真正退出；macOS 走系统默认（关窗不退出）
    if (process.platform === "win32" && !isQuitting) {
      e.preventDefault();
      void handleCloseRequest();
    }
  });
  // 防止持有已销毁窗口引用
  win.on("closed", () => {
    if (win && win.isDestroyed()) win = null;
  });

  // 固定页面缩放 100%（防误触 Ctrl+滚轮 / 触控板捏合）
  pinZoomLevel(win.webContents);

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  // Windows 系统通知需要 AppUserModelId，否则 Toast 不弹出
  if (process.platform === "win32") {
    app.setAppUserModelId(app.getName());
  }
  // macOS 应用内更新会把旧版保留为 .old，本次已是新版启动 → 清理上次备份
  cleanupMacOldBundle();
  closeAction = loadCloseAction();
  createWindow();
  // 自动检查更新：启动后延迟 3 秒（不阻塞启动），之后每 6 小时一次。
  // 仅提示（渲染层角标/弹层），不自动下载、不强制更新。
  setTimeout(() => void runUpdateCheck().catch(() => {}), 3000);
  setInterval(() => void runUpdateCheck().catch(() => {}), 6 * 60 * 60 * 1000);
});
