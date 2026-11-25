/**
 * 应用内更新安装器测试：
 * 覆盖资产匹配、digest 解析、Windows 脚本生成、挂载点解析、下载（含 sha256 校验）、
 * Windows/macOS 安装流程（mock 子进程与平台标识）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

const spawnMock = vi.fn(() => ({ unref: vi.fn() }));
const execFileSyncMock = vi.fn(() => "");

vi.mock("child_process", () => {
  const fns = {
    spawn: (...args: unknown[]) => spawnMock(...(args as [string, string[], any])),
    execFileSync: (...args: unknown[]) =>
      execFileSyncMock(...(args as [string, string[], any])),
  };
  return { ...fns, default: fns };
});

const axiosGetMock = vi.fn();
vi.mock("axios", () => ({
  default: { get: (...args: unknown[]) => axiosGetMock(...(args as [string, any])) },
}));

import {
  buildWinInstallScript,
  cleanupMacOldBundle,
  downloadAsset,
  findAppInVolume,
  installUpdate,
  MAC_APP_NAME,
  MAC_ASSET_NAME,
  parseAssetDigest,
  parseMountPoint,
  pickAssetForPlatform,
  replaceMacApp,
  sha256File,
  WIN_ASSET_NAME,
} from "../src/main/services/updateInstaller";

const originalPlatform = process.platform;
const originalExecPath = process.execPath;

function setPlatform(p: string) {
  Object.defineProperty(process, "platform", { value: p });
}
function setExecPath(p: string) {
  Object.defineProperty(process, "execPath", { value: p });
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cnb-upd-"));
}

const ASSETS = [
  {
    name: WIN_ASSET_NAME,
    browser_download_url: `https://github.com/x/${WIN_ASSET_NAME}`,
    size: 10,
    digest: "sha256:" + "a".repeat(64),
  },
  {
    name: MAC_ASSET_NAME,
    browser_download_url: `https://github.com/x/${MAC_ASSET_NAME}`,
    size: 20,
    digest: "sha256:" + "b".repeat(64),
  },
];

describe("parseAssetDigest", () => {
  it("解析合法 sha256 digest", () => {
    expect(parseAssetDigest("sha256:" + "ab".repeat(32))).toBe("ab".repeat(32));
  });
  it("非法/缺失 digest 返回空串", () => {
    expect(parseAssetDigest("md5:abc")).toBe("");
    expect(parseAssetDigest("sha256:xyz")).toBe("");
    expect(parseAssetDigest(undefined)).toBe("");
  });
});

describe("pickAssetForPlatform", () => {
  it("macOS 匹配 dmg", () => {
    const a = pickAssetForPlatform(ASSETS, "darwin");
    expect(a.name).toBe(MAC_ASSET_NAME);
    expect(a.sha256).toBe("b".repeat(64));
  });
  it("Windows 匹配 exe", () => {
    const a = pickAssetForPlatform(ASSETS, "win32");
    expect(a.name).toBe(WIN_ASSET_NAME);
    expect(a.sha256).toBe("a".repeat(64));
  });
  it("缺少对应资产时抛错", () => {
    expect(() => pickAssetForPlatform([], "win32")).toThrow(WIN_ASSET_NAME);
  });
});

describe("buildWinInstallScript", () => {
  it("纯 ASCII、含 %~dp0 引用与 move/start/del", () => {
    const s = buildWinInstallScript();
    expect(/^[\x00-\x7F]*$/.test(s)).toBe(true);
    expect(s).toContain("%~dp0CNB-Tools-update.exe");
    expect(s).toContain('%~dp0"'.slice(0, 0) + "move /y \"%~dp0CNB-Tools-update.exe\" \"%~dp0CNB-Tools.exe\"");
    expect(s).toContain('start "" "%~dp0CNB-Tools.exe"');
    expect(s).toContain('del "%~f0"');
    expect(s).toContain("\r\n");
  });
});

describe("parseMountPoint", () => {
  it("解析标准 hdiutil 输出", () => {
    const out = "/dev/disk4s1\tApple_HFS\t/Volumes/CNB-Tools\n/dev/disk4\tApple_HFS\t/Volumes/CNB-Tools\n";
    expect(parseMountPoint(out)).toBe("/Volumes/CNB-Tools");
  });
  it("挂载点含空格且带 (read-only) 后缀", () => {
    const out = "/dev/disk4s1\tApple_HFS\t/Volumes/My Tools 1 (Apple_HFS: read-only)\n";
    expect(parseMountPoint(out)).toBe("/Volumes/My Tools 1");
  });
  it("无挂载点返回空串", () => {
    expect(parseMountPoint("no volumes here")).toBe("");
  });
});

describe("findAppInVolume", () => {
  it("卷根直接命中", () => {
    const vol = tmpDir();
    fs.mkdirSync(path.join(vol, MAC_APP_NAME));
    expect(findAppInVolume(vol)).toBe(path.join(vol, MAC_APP_NAME));
  });
  it("一级子目录内命中", () => {
    const vol = tmpDir();
    fs.mkdirSync(path.join(vol, "nested", MAC_APP_NAME), { recursive: true });
    expect(findAppInVolume(vol)).toBe(path.join(vol, "nested", MAC_APP_NAME));
  });
  it("卷内无应用返回空串", () => {
    const vol = tmpDir();
    expect(findAppInVolume(vol)).toBe("");
  });
});

describe("sha256File", () => {
  it("已知内容 hash", () => {
    const f = path.join(tmpDir(), "f.txt");
    fs.writeFileSync(f, "hello");
    expect(sha256File(f)).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("downloadAsset", () => {
  it("流式写入 + 进度回调到 100%", async () => {
    const dir = tmpDir();
    const target = path.join(dir, "pkg.bin");
    axiosGetMock.mockResolvedValueOnce({
      headers: { "content-length": "2" },
      data: Readable.from(["a", "b"]),
    });
    const asset = { name: "x", downloadUrl: "http://x/1", size: 2, sha256: "" };
    const seen: number[] = [];
    const r = await downloadAsset(asset, target, (p) => seen.push(p.percent));
    expect(fs.readFileSync(target, "utf8")).toBe("ab");
    expect(r.size).toBe(2);
    expect(seen[seen.length - 1]).toBe(100);
  });
  it("sha256 不匹配时抛错并删除文件", async () => {
    const dir = tmpDir();
    const target = path.join(dir, "pkg.bin");
    axiosGetMock.mockResolvedValueOnce({
      headers: { "content-length": "1" },
      data: Readable.from(["z"]),
    });
    const asset = { name: "x", downloadUrl: "http://x/1", size: 1, sha256: "0".repeat(64) };
    await expect(downloadAsset(asset, target)).rejects.toThrow("sha256");
    expect(fs.existsSync(target)).toBe(false);
  });
});

describe("installUpdate Windows", () => {
  beforeEach(() => {
    spawnMock.mockClear();
    setPlatform("win32");
    setExecPath(path.join("C:", "fake", "CNB-Tools.exe"));
    process.env.PORTABLE_EXECUTABLE_DIR = "";
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "execPath", { value: originalExecPath });
  });

  it("新 exe 复制到 exe 同目录，写脚本并 detached 启动 cmd", () => {
    const exeDir = tmpDir();
    process.env.PORTABLE_EXECUTABLE_DIR = exeDir;
    const downloaded = path.join(tmpDir(), "elsewhere.exe");
    fs.writeFileSync(downloaded, "new-exe");

    const r = installUpdate(downloaded);
    expect(r.ok).toBe(true);
    // 新 exe 已复制到位
    expect(fs.readFileSync(path.join(exeDir, "CNB-Tools-update.exe"), "utf8")).toBe("new-exe");
    // 启动脚本内容正确
    const bat = path.join(exeDir, "CNB-Tools-update.bat");
    expect(fs.readFileSync(bat, "utf8")).toContain("move /y");
    // detached 启动 cmd.exe /c <script>
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnMock.mock.calls[0] as [string, string[], any];
    expect(cmd).toBe("cmd.exe");
    expect(args[0]).toBe("/c");
    expect(args[1]).toBe(bat);
    expect(opts.detached).toBe(true);
  });

  it("exe 目录不可写时抛错", () => {
    process.env.PORTABLE_EXECUTABLE_DIR = path.join(tmpDir(), "not-exists-dir");
    expect(() => installUpdate("whatever")).toThrow("不可写");
  });
});

describe("replaceMacApp（macOS 替换流程，纯 fs）", () => {
  let bundleDir: string;
  let volume: string;
  let dmgPath: string;

  beforeEach(() => {
    spawnMock.mockClear();
    bundleDir = tmpDir();
    volume = tmpDir();
    dmgPath = path.join(tmpDir(), "pkg.dmg");
    fs.writeFileSync(dmgPath, "dmg-bytes");
    // 旧版应用内容
    fs.mkdirSync(path.join(bundleDir, MAC_APP_NAME, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(bundleDir, MAC_APP_NAME, "Contents", "old.txt"), "old");
    // dmg 卷内新版应用内容
    fs.mkdirSync(path.join(volume, MAC_APP_NAME, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(volume, MAC_APP_NAME, "Contents", "new.txt"), "new");
  });

  it("双 rename 替换：新版就位、旧版保留 .old、dmg 清理、延迟 open", () => {
    replaceMacApp(volume, bundleDir, dmgPath);
    // 新版应用内容已就位
    expect(
      fs.readFileSync(path.join(bundleDir, MAC_APP_NAME, "Contents", "new.txt"), "utf8"),
    ).toBe("new");
    expect(fs.existsSync(path.join(bundleDir, MAC_APP_NAME, "Contents", "old.txt"))).toBe(false);
    // 旧版保留为 .old
    expect(
      fs.readFileSync(path.join(bundleDir, ".CNB-Tools.app.old", "Contents", "old.txt"), "utf8"),
    ).toBe("old");
    // dmg 已删除
    expect(fs.existsSync(dmgPath)).toBe(false);
    // 无临时副本残留
    expect(fs.readdirSync(bundleDir).filter((n) => n.startsWith(".CNB-Tools.app.tmp-"))).toEqual([]);
    // 延迟启动新版本
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(cmd).toBe("/bin/sh");
    expect(args.join(" ")).toContain(`/usr/bin/open "${path.join(bundleDir, MAC_APP_NAME)}"`);
  });

  it("卷内未找到应用时抛错，旧版不受影响", () => {
    const emptyVolume = tmpDir();
    expect(() => replaceMacApp(emptyVolume, bundleDir, dmgPath)).toThrow("未找到应用");
    expect(
      fs.readFileSync(path.join(bundleDir, MAC_APP_NAME, "Contents", "old.txt"), "utf8"),
    ).toBe("old");
    expect(fs.existsSync(dmgPath)).toBe(true);
    expect(fs.readdirSync(bundleDir).filter((n) => n.startsWith(".CNB-Tools.app.tmp-"))).toEqual([]);
  });
});

describe("installUpdate macOS 集成（attach 输出经 parseMountPoint）", () => {
  let bundleDir: string;
  let volume: string;
  let dmgPath: string;

  beforeEach(() => {
    spawnMock.mockClear();
    execFileSyncMock.mockClear();
    setPlatform("darwin");
    bundleDir = tmpDir();
    volume = tmpDir();
    dmgPath = path.join(tmpDir(), "pkg.dmg");
    fs.writeFileSync(dmgPath, "dmg-bytes");
    setExecPath(path.join(bundleDir, MAC_APP_NAME, "Contents", "MacOS", "CNB-Tools"));
    fs.mkdirSync(path.join(bundleDir, MAC_APP_NAME, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(bundleDir, MAC_APP_NAME, "Contents", "old.txt"), "old");
    fs.mkdirSync(path.join(volume, MAC_APP_NAME, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(volume, MAC_APP_NAME, "Contents", "new.txt"), "new");
    // attach 输出真实 volume（tmpDir 路径不带 /Volumes/ 前缀，
    // 但 hdiutil 实际输出里挂载点必然是 /Volumes/... —— parseMountPoint 按行匹配，
    // 这里用真实 volume 路径直接作为挂载点行传入即可被解析到）
    execFileSyncMock.mockImplementation((cmd: string, args?: string[]) => {
      if (cmd === "hdiutil" && args?.[0] === "attach") {
        return `/dev/disk4s1\tApple_HFS\t${volume}\n`;
      }
      return "";
    });
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "execPath", { value: originalExecPath });
  });

  it("parseMountPoint 匹配不到 /Volumes/ 时抛错且 detach 未执行", () => {
    expect(() => installUpdate(dmgPath)).toThrow("挂载点");
    expect(fs.existsSync(dmgPath)).toBe(true);
    const calls = execFileSyncMock.mock.calls.map((c) => (c[1] as string[])?.[0]);
    expect(calls).toContain("attach");
    expect(calls).not.toContain("detach");
  });
});

describe("cleanupMacOldBundle", () => {
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "execPath", { value: originalExecPath });
  });

  it("macOS 下删除上次替换保留的 .old 备份", () => {
    const bundleDir = tmpDir();
    setPlatform("darwin");
    setExecPath(path.join(bundleDir, MAC_APP_NAME, "Contents", "MacOS", "CNB-Tools"));
    fs.mkdirSync(path.join(bundleDir, ".CNB-Tools.app.old"), { recursive: true });
    cleanupMacOldBundle();
    expect(fs.existsSync(path.join(bundleDir, ".CNB-Tools.app.old"))).toBe(false);
  });

  it("非 macOS 平台直接跳过", () => {
    setPlatform("win32");
    setExecPath(path.join("C:", "fake", "CNB-Tools.exe"));
    // 不抛错即可
    expect(() => cleanupMacOldBundle()).not.toThrow();
  });
});
