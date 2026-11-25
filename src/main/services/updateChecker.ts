import axios from "axios";

/**
 * 应用更新检查（基于 GitHub Release）：
 * 主进程启动后自动 + 定时检查，结果推送给渲染层做角标/弹层提示。
 * 不做自动下载与强制更新，用户自行前往 Release 页下载。
 */

export const GITHUB_REPO = "ZiPengWei/cnb-batch-tools";

export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

const RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface LatestRelease {
  tagName: string;
  /** 去掉 v 前缀的纯版本号，如 1.0.1 */
  version: string;
  name: string;
  htmlUrl: string;
  body: string;
}

/** "v1.2.3" / "1.2.3" -> [1, 2, 3]；非法段按 0 处理 */
export function normalizeVersion(v: string): number[] {
  return String(v || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const n = parseInt(part, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
}

/** latest 是否比 current 更新（语义化比较，段数不足补 0） */
export function isNewerVersion(current: string, latest: string): boolean {
  const a = normalizeVersion(current);
  const b = normalizeVersion(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (y !== x) return y > x;
  }
  return false;
}

/**
 * 拉取 GitHub 最新 Release。
 * 网络策略：先直连（proxy:false，规避环境代理明文转发 HTTPS 的问题），
 * 失败后再走环境代理重试一次（部分网络下 GitHub 必须走代理）。
 */
export async function fetchLatestRelease(): Promise<LatestRelease> {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CNB-Tools-UpdateChecker",
  };
  let data: any;
  try {
    const res = await axios.get(RELEASE_API_URL, {
      headers,
      proxy: false,
      timeout: 8000,
    });
    data = res.data;
  } catch {
    const res = await axios.get(RELEASE_API_URL, { headers, timeout: 8000 });
    data = res.data;
  }
  const tagName = String(data?.tag_name || "").trim();
  if (!tagName) throw new Error("Release 响应缺少 tag_name");
  return {
    tagName,
    version: tagName.replace(/^v/i, ""),
    name: String(data?.name || ""),
    htmlUrl: String(data?.html_url || RELEASES_PAGE_URL),
    body: String(data?.body || ""),
  };
}
