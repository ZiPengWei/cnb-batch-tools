import { execFileSync, spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import axios from "axios";
import { GITHUB_REPO } from "./updateChecker";

/**
 * 应用内更新安装器（手写轻量方案，不使用 electron-updater）：
 * - Windows 打包为 portable 单文件 exe，electron-updater 不支持其自动替换；
 * - macOS 应用未签名，Squirrel 更新机制不可用。
 * 因此自行实现：下载 Release 资产（含 sha256 校验）→ 平台各自的安装流程。
 * - Windows：下载新 exe 到当前 exe 同目录 → 纯 ASCII 内容的替换脚本
 *   （%~dp0 引用自身目录，规避中文路径编码问题）等旧进程退出后覆盖并重启。
 * - macOS：下载 dmg → hdiutil 挂载 → 复制 .app 为临时名 → 双 rename 原子替换
 *   （旧版保留为 .old 供回滚，下次启动清理）→ 延迟启动新版 → 退出当前进程。
 * Node 写入的文件不带 Gatekeeper 隔离标记（quarantine），安装后打开不弹"已损坏"。
 */

const RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Windows 便携版 exe 的文件名（与 electron-builder artifactName 一致） */
export const WIN_ASSET_NAME = "CNB-Tools.exe";
/** Windows 下载到 exe 同目录的临时文件名（启动脚本里按此名覆盖正式文件） */
const WIN_TEMP_NAME = "CNB-Tools-update.exe";
/** Windows 替换启动脚本文件名（内容纯 ASCII，完成后自删） */
const WIN_SCRIPT_NAME = "CNB-Tools-update.bat";
/** macOS dmg 的文件名 */
export const MAC_ASSET_NAME = "CNB-Tools.dmg";
/** macOS 应用 bundle 名 */
export const MAC_APP_NAME = "CNB-Tools.app";
/** macOS 替换过程中的临时目录名前缀（同卷临时路径，rename 原子换入） */
const MAC_TMP_PREFIX = ".CNB-Tools.app.tmp-";
/** macOS 旧版备份目录名（替换成功后保留，下次启动清理） */
export const MAC_OLD_NAME = ".CNB-Tools.app.old";

export interface UpdateAsset {
  name: string;
  downloadUrl: string;
  size: number;
  /** GitHub 返回的 sha256（"sha256:xxx" 的 hex 部分），可能为空（旧资产无此字段） */
  sha256: string;
}

export interface DownloadProgress {
  received: number;
  total: number;
  percent: number;
}

export interface DownloadResult {
  filePath: string;
  size: number;
}

export interface InstallResult {
  ok: boolean;
  /** auto: 安装脚本已启动，应用即将退出并被替换重启 */
  mode: "auto";
}

/** 解析 GitHub asset 的 digest 字段（"sha256:hex"）为纯 hex；无/非法时返回空串 */
export function parseAssetDigest(digest: unknown): string {
  const s = String(digest || "");
  const m = /^sha256:([0-9a-fA-F]{64})$/.exec(s);
  return m ? m[1].toLowerCase() : "";
}

/** 从 Release assets 里按平台匹配安装包资产；找不到抛错 */
export function pickAssetForPlatform(
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
    digest?: string;
  }>,
  platform: NodeJS.Platform,
): UpdateAsset {
  const want = platform === "darwin" ? MAC_ASSET_NAME : WIN_ASSET_NAME;
  const found = assets.find((a) => a.name === want);
  if (!found) {
    throw new Error(`最新 Release 缺少 ${want} 安装包`);
  }
  return {
    name: found.name,
    downloadUrl: String(found.browser_download_url || ""),
    size: Number(found.size) || 0,
    sha256: parseAssetDigest(found.digest),
  };
}

/** 生成 Windows 替换启动脚本内容（纯 ASCII：%~dp0 引用脚本所在目录，避免编码问题） */
export function buildWinInstallScript(): string {
  return [
    "@echo off",
    "rem Wait for the app process to exit, then replace and restart.",
    "timeout /t 2 /nobreak >nul",
    `move /y "%~dp0${WIN_TEMP_NAME}" "%~dp0${WIN_ASSET_NAME}"`,
    `start "" "%~dp0${WIN_ASSET_NAME}"`,
    'del "%~f0"',
    "",
  ].join("\r\n");
}

/**
 * 从 hdiutil attach 的输出中解析 dmg 挂载点。
 * 输出行形如 "/dev/disk4s1\tApple_HFS\t/Volumes/Name (details)"，
 * 挂载点可能含空格，以 " (" 后缀为界截断。
 */
export function parseMountPoint(hdiutilOutput: string): string {
  const m = /(\/Volumes\/[^\n]*)/.exec(String(hdiutilOutput || ""));
  if (!m) return "";
  return m[1]
    .replace(/\s+\([^)]*\)\s*$/, "")
    .replace(/\s+$/, "");
}

/** 在挂载卷中查找应用 bundle（卷根或一级子目录内） */
export function findAppInVolume(volume: string): string {
  const direct = path.join(volume, MAC_APP_NAME);
  if (fs.existsSync(direct)) return direct;
  try {
    for (const entry of fs.readdirSync(volume)) {
      if (entry.startsWith(".")) continue;
      const nested = path.join(volume, entry, MAC_APP_NAME);
      if (fs.existsSync(nested)) return nested;
    }
  } catch {
    /* 读目录失败按未找到处理 */
  }
  return "";
}

/** 文件 sha256 */
export function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

/** 目录是否可写 */
export function isDirWritable(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** 下载目标：目录可写返回完整路径，否则返回空串 */
export function resolveDownloadTarget(dir: string, fileName: string): string {
  if (dir && isDirWritable(dir)) {
    return path.join(dir, fileName);
  }
  return "";
}

/** 获取最新 Release 的当前平台安装包资产（网络策略与 updateChecker 一致：直连失败走代理重试） */
export async function fetchLatestAsset(): Promise<UpdateAsset> {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CNB-Tools-UpdateInstaller",
  };
  let data: any;
  try {
    const res = await axios.get(RELEASE_API_URL, { headers, proxy: false, timeout: 8000 });
    data = res.data;
  } catch {
    const res = await axios.get(RELEASE_API_URL, { headers, timeout: 8000 });
    data = res.data;
  }
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  return pickAssetForPlatform(assets, process.platform);
}

/** 流式下载资产到指定路径，边下边回调进度；完成后按 sha256（若有）校验完整性 */
export async function downloadAsset(
  asset: UpdateAsset,
  filePath: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadResult> {
  const headers = { "User-Agent": "CNB-Tools-UpdateInstaller" };
  let res: any;
  try {
    res = await axios.get(asset.downloadUrl, {
      headers,
      responseType: "stream",
      proxy: false,
      timeout: 60_000,
    });
  } catch {
    res = await axios.get(asset.downloadUrl, {
      headers,
      responseType: "stream",
      timeout: 60_000,
    });
  }

  await new Promise<void>((resolve, reject) => {
    const total = Number(res.headers?.["content-length"]) || asset.size;
    let received = 0;
    let lastReported = -1;
    const out = fs.createWriteStream(filePath);
    res.data.on("data", (chunk: Buffer) => {
      received += chunk.length;
      const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
      if (onProgress && percent !== lastReported) {
        lastReported = percent;
        onProgress({ received, total, percent });
      }
    });
    res.data.pipe(out);
    out.on("finish", () => resolve());
    out.on("error", reject);
    res.data.on("error", reject);
  });

  if (asset.sha256) {
    const actual = sha256File(filePath);
    if (actual !== asset.sha256) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* 清理失败忽略 */
      }
      throw new Error("下载文件校验失败（sha256 不匹配），已删除临时文件");
    }
  }
  return { filePath, size: fs.statSync(filePath).size };
}

/**
 * 下载当前平台的更新包：
 * - Windows：优先下载到 exe 同目录（全自动替换的必要条件），不可写降级到下载目录；
 * - macOS：下载到临时目录。
 * 两个目录都不可写时抛错（由调用方提示走 Release 页）。
 */
export async function downloadUpdateAsset(
  opts: { preferredDir: string; fallbackDir: string },
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadResult> {
  const asset = await fetchLatestAsset();
  const fileName = process.platform === "darwin" ? MAC_ASSET_NAME : WIN_TEMP_NAME;
  const target =
    resolveDownloadTarget(opts.preferredDir, fileName) ||
    resolveDownloadTarget(opts.fallbackDir, fileName);
  if (!target) {
    throw new Error("下载目录不可写，无法自动下载更新");
  }
  // 旧文件（上次下载/失败的残留）先删除：若正被挂载引用也能清掉引用源
  try {
    fs.rmSync(target, { force: true });
  } catch {
    /* 删除失败忽略，覆盖写兜底 */
  }
  return downloadAsset(asset, target, onProgress);
}

/**
 * 执行安装（按当前平台分发）。成功后安装脚本已在后台排队，
 * 调用方随后 app.quit() 即可完成"退出 → 替换 → 重启"。
 * 失败抛错，由调用方做降级（mac 挂载镜像手动拖 / win 打开所在文件夹）。
 */
export function installUpdate(filePath: string): InstallResult {
  if (process.platform === "darwin") {
    installMac(filePath);
  } else {
    installWindows(filePath);
  }
  return { ok: true, mode: "auto" };
}

/** Windows 安装：写替换脚本（等当前进程退出后 move 覆盖 + 重启）并 detached 启动 */
function installWindows(filePath: string): void {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  if (!isDirWritable(exeDir)) {
    throw new Error(`目录不可写：${exeDir}，请将应用移到可写位置（如桌面）后重试`);
  }
  // 新 exe 必须与正式 exe 同目录（脚本按同目录覆盖）；不在则移过去
  const tempPath = path.join(exeDir, WIN_TEMP_NAME);
  if (path.resolve(filePath) !== path.resolve(tempPath)) {
    fs.copyFileSync(filePath, tempPath);
  }
  const scriptPath = path.join(exeDir, WIN_SCRIPT_NAME);
  fs.writeFileSync(scriptPath, buildWinInstallScript(), "utf8");
  const child = spawn("cmd.exe", ["/c", scriptPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

/** 当前 app bundle 所在目录（.app 的父目录）。execPath 形如 .../CNB-Tools.app/Contents/MacOS/CNB-Tools，上四级。 */
function macBundleDir(): string {
  return path.resolve(process.execPath, "..", "..", "..", "..");
}

/** 清理 macOS 上一次替换保留的旧版备份（下次启动时调用） */
export function cleanupMacOldBundle(): void {
  if (process.platform !== "darwin") return;
  try {
    const oldPath = path.join(macBundleDir(), MAC_OLD_NAME);
    if (fs.existsSync(oldPath)) {
      fs.rmSync(oldPath, { recursive: true, force: true });
    }
  } catch {
    /* 清理失败忽略 */
  }
}

/** macOS 安装：挂载 dmg → 替换 .app → 延迟启动新版 */
function installMac(dmgPath: string): void {
  // 应用正从挂载镜像/dmg 内或 Gatekeeper 转译路径运行时无法原地替换，
  // 提前给出明确指引（否则 fs 操作会抛出难懂的 ENOTDIR/EROFS 等系统码）
  if (process.execPath.includes("/Volumes/") || process.execPath.includes("AppTranslocation")) {
    throw new Error(
      "应用正在安装镜像（dmg）内直接运行。请先退出应用，把 CNB-Tools.app 拖入「应用程序」文件夹，再从「应用程序」启动后更新",
    );
  }
  const bundleDir = macBundleDir();
  if (!isDirWritable(bundleDir)) {
    throw new Error(`目录不可写：${bundleDir}，请把应用移到「应用程序」或个人目录后重试`);
  }

  // 0. 预清理：上次失败后 openPath 降级挂载的镜像可能还挂着，同名卷先推出（失败无害）
  try {
    execFileSync("hdiutil", ["detach", `/Volumes/CNB-Tools`, "-force"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch {
    /* 卷不存在/未挂载，忽略 */
  }

  // 1. 挂载（-nobrowse 避免 Finder 侧栏弹窗）
  let attachOut: string;
  try {
    attachOut = execFileSync("hdiutil", ["attach", "-nobrowse", "-noautoopen", dmgPath], {
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (e: any) {
    const detail = String(e?.stderr || e?.message || e).trim();
    throw new Error(`挂载安装镜像失败：${detail || "hdiutil attach 异常"}`);
  }
  const volume = parseMountPoint(attachOut);
  if (!volume) throw new Error("无法定位安装镜像挂载点");
  try {
    replaceMacApp(volume, bundleDir, dmgPath);
  } catch (e) {
    // 包上下文：出错时能直接看出是哪个环节、哪些路径
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`替换应用失败（挂载点：${volume}；安装目录：${bundleDir}）：${msg}`);
  } finally {
    // 2. 尽力卸载（失败不影响安装结果）
    try {
      execFileSync("hdiutil", ["detach", volume, "-force"], { encoding: "utf8" });
    } catch {
      /* 卸载失败忽略 */
    }
  }
}

/**
 * 从挂载卷替换应用（纯 fs 操作，便于测试）：
 * 找到卷内 .app → 复制为临时名 → 双 rename 原子替换（旧版保留 .old）→ 删 dmg → 延迟启动新版。
 * 任一步失败时清理临时副本并抛错，旧版保持不动。
 */
export function replaceMacApp(
  volume: string,
  bundleDir: string,
  dmgPath: string,
  /** 供测试注入；生产使用真实 fs.renameSync */
  renameImpl: (from: string, to: string) => void = (from, to) =>
    fs.renameSync(from, to),
): void {
  const appSrc = findAppInVolume(volume);
  if (!appSrc) throw new Error("安装镜像内未找到应用");
  const tmpPath = path.join(bundleDir, `${MAC_TMP_PREFIX}${Date.now()}`);
  try {
    fs.cpSync(appSrc, tmpPath, { recursive: true });
  } catch (e) {
    // 包装上下文：源/目标路径一并暴露，opendir/ENOTDIR 等系统码可一次定位
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`复制安装文件失败（源：${appSrc}；目标：${tmpPath}）：${msg}`);
  }
  const bundlePath = path.join(bundleDir, MAC_APP_NAME);
  const oldPath = path.join(bundleDir, MAC_OLD_NAME);
  let movedOld = false;
  try {
    // 双 rename 原子替换：旧版移入 .old（保留回滚），临时名换入正式名
    fs.rmSync(oldPath, { recursive: true, force: true });
    renameImpl(bundlePath, oldPath);
    movedOld = true;
    try {
      renameImpl(tmpPath, bundlePath);
    } catch (e2) {
      // 第二次失败：旧版已被移入 .old，必须回滚原位，否则应用"消失"
      try {
        renameImpl(oldPath, bundlePath);
      } catch {
        /* 回滚失败：.old 保留在原目录旁，可手动改回 */
      }
      throw e2;
    }
    // 清理 dmg，延迟启动新版（等当前进程退出，避免新旧并存）
    try {
      fs.unlinkSync(dmgPath);
    } catch {
      /* 删除失败忽略 */
    }
    const child = spawn("/bin/sh", ["-c", `sleep 1; /usr/bin/open "${bundlePath}"`], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (e) {
    // 替换失败：清理临时副本（已换入的正式名是回滚后的旧版，保持不动）
    try {
      fs.rmSync(tmpPath, { recursive: true, force: true });
    } catch {
      /* 清理失败忽略 */
    }
    // rename 阶段的错误一并包上下文（ENOENT/EBUSY 等系统码可定位到具体环节）
    const raw = e instanceof Error ? e.message : String(e);
    const msg = raw.startsWith("复制安装文件失败") || raw.startsWith("替换应用失败")
      ? raw
      : `替换分支失败（应用：${bundlePath}；备份：${oldPath}）：${raw}`;
    // movedOld 且回滚也失败时旧版仍在 .old——错误信息里提示恢复方式
    const hint = movedOld && !fs.existsSync(bundlePath)
      ? `（原应用已备份在 ${oldPath}，可手动改名为 ${MAC_APP_NAME} 恢复）`
      : "";
    throw new Error(`${msg}${hint}`);
  }
}
