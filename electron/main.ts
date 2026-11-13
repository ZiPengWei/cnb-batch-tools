import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
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
    // 分支按最新提交时间倒序（最近提交的在前），便于挑选活跃分支。
    // 401/404 会在客户端内做会话/仓库可达性诊断并转换为友好提示，
    // 这里以结构化 error 返回，避免 Electron 把错误包装成 invoke 前缀文案。
    try {
      const branches = await cnb.getBranchesFriendly(payload.repo);
      const names = branches
        .map((b) => b.name)
        .filter((x): x is string => Boolean(x));
      return { branches: names };
    } catch (e) {
      return {
        branches: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
);

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
    backgroundColor: "#ffffff",
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

// 任何路径触发的退出（Cmd+Q / 托盘退出 / app.quit）都放行 close 拦截
app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  closeAction = loadCloseAction();
  createWindow();
  // 自动检查更新：启动后延迟 3 秒（不阻塞启动），之后每 6 小时一次。
  // 仅提示（渲染层角标/弹层），不自动下载、不强制更新。
  setTimeout(() => void runUpdateCheck().catch(() => {}), 3000);
  setInterval(() => void runUpdateCheck().catch(() => {}), 6 * 60 * 60 * 1000);
});
