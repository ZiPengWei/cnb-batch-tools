import axios, { AxiosError, AxiosInstance } from "axios";
import type {
  CnbApiError,
  CnbBranch,
  CnbPull,
  CnbRepo,
  CnbUser,
  CreatePullResult,
} from "../../shared/cnb/types";

type RetryConfig = {
  total: number;
  backoffMs: number;
  statusForcelist: number[];
};

const defaultRetry: RetryConfig = {
  total: 3,
  backoffMs: 600,
  statusForcelist: [429, 500, 502, 503, 504],
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || "").replace(/\/+$/, "");
}

/** 仓库路径 org/repo -> URL 路径（逐段编码，兼容多级组织 a/b/c） */
function encodeRepoPath(repo: string) {
  return String(repo || "")
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

function isRetriableStatus(status: number | undefined, retry: RetryConfig) {
  return status != null && retry.statusForcelist.includes(status);
}

export function extractErrorMessage(err: unknown): CnbApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const data = err.response?.data;
    const message = (() => {
      const d = data as any;
      if (d && typeof d === "object") {
        const msg = d.errmsg ?? d.message;
        if (typeof msg === "string" && msg.trim()) return msg.trim();
        const e = d.error;
        if (typeof e === "string" && e.trim()) return e.trim();
      }
      if (typeof data === "string" && data.trim()) return data.trim().slice(0, 300);
      const text = (err.response?.statusText || "").trim();
      return text || `HTTP ${status || "Error"}`;
    })();
    return { status, message, data };
  }
  return { status: 0, message: String(err ?? "Unknown error") };
}

function isNoChangeError(message: string | undefined) {
  const s = (message || "").toLowerCase();
  const keys = [
    "no commits",
    "no changes",
    "nothing to merge",
    "nothing to commit",
    "already up to date",
    "already up-to-date",
    "无变更",
    "没有变更",
    "没有差异",
    "无需合并",
    "没有可合并",
    "无差异",
  ];
  return keys.some((k) => s.includes(k));
}

async function requestWithRetry<T>(
  fn: () => Promise<T>,
  retry: RetryConfig = defaultRetry
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retry.total; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const axiosErr = e as AxiosError;
      const status = axios.isAxiosError(axiosErr)
        ? axiosErr.response?.status
        : undefined;
      const retriable = isRetriableStatus(status, retry);
      if (!retriable || i === retry.total) break;
      const backoff = retry.backoffMs * Math.max(1, i + 1);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

/**
 * CNB (cnb.cool) Open API 客户端
 * 文档：https://api.cnb.cool/
 *
 * 认证方式：Authorization: Bearer <访问令牌>
 * 仓库标识：完整仓库路径字符串（如 "org/repo"），而非数字 ID
 */
export class CnbClient {
  private baseUrl: string;
  private http: AxiosInstance;
  /** cnb.cool 网页会话 Cookie（可选，用于同步置顶到网页 dashboard） */
  private webCookie = "";

  constructor(baseUrl = "https://api.cnb.cool", token: string | null = null) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 20_000,
      // 禁用环境代理（HTTP(S)_PROXY）：axios 经 HTTP 代理转发 HTTPS 请求时不走
      // CONNECT 隧道而是明文转发，会被网关拒绝（400 The plain HTTP request was
      // sent to HTTPS port）。本客户端面向固定国内 API（api.cnb.cool），直连即可。
      proxy: false,
    });
    // CNB 的 git/PR 相关接口对 Accept 头做精确校验（仅接受 application/json 或
    // application/vnd.cnb.api+json），axios 默认的 "application/json, text/plain, */*"
    // 会触发 406，这里显式覆盖。
    this.http.defaults.headers.common.Accept = "application/json";
    if (token) this.setToken(token);
  }

  setBaseUrl(url: string) {
    this.baseUrl = normalizeBaseUrl(url);
    this.http.defaults.baseURL = this.baseUrl;
  }

  setToken(token: string) {
    const common = this.httpDefaultsCommon();
    common.Authorization = `Bearer ${token}`;
    // 令牌模式下清理网页 Cookie，避免两套凭证互相干扰
    delete common.Cookie;
    delete common["X-XSRF-TOKEN"];
    this.webCookie = "";
  }

  clearToken() {
    delete this.httpDefaultsCommon().Authorization;
  }

  /** 设置网页会话 Cookie（仅注入 Cookie 头，不影响令牌模式） */
  setWebCookie(cookie: string) {
    const clean = (cookie || "").trim();
    this.webCookie = clean;
    const common = this.httpDefaultsCommon();
    if (!clean) {
      delete common.Cookie;
      delete common["X-XSRF-TOKEN"];
      return;
    }
    common.Cookie = clean;
    const xsrf = clean.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    if (xsrf) common["X-XSRF-TOKEN"] = decodeURIComponent(xsrf[1].trim());
    else delete common["X-XSRF-TOKEN"];
  }

  /**
   * 设置 cnb.cool 网页会话 Cookie（来自应用内网页登录）。
   * Cookie 模式下走 https://cnb.cool 的同源 API（与 api.cnb.cool 路由一致），
   * 无需访问令牌；同时自动携带 XSRF-TOKEN 供 POST/DELETE 的 CSRF 校验。
   */
  setCookieAuth(cookie: string) {
    this.setWebCookie(cookie);
    // Cookie 模式下清理令牌头，避免混淆
    delete this.httpDefaultsCommon().Authorization;
  }

  private httpDefaultsCommon(): Record<string, any> {
    const anyHttp = this.http as any;
    if (!anyHttp.defaults) anyHttp.defaults = {};
    if (!anyHttp.defaults.headers) anyHttp.defaults.headers = {};
    if (!anyHttp.defaults.headers.common) anyHttp.defaults.headers.common = {};
    return anyHttp.defaults.headers.common;
  }

  /** 当前认证模式：有网页会话 Cookie 即 cookie 模式，否则为访问令牌模式 */
  get authMode(): "cookie" | "token" {
    return this.webCookie ? "cookie" : "token";
  }

  /** 校验网页 Cookie 是否有效（GET https://cnb.cool/user） */
  async testWebCookie(
    cookie: string
  ): Promise<
    { ok: true; user: CnbUser } | { ok: false; error: CnbApiError }
  > {
    try {
      const res = await requestWithRetry(() =>
        this.http.get<CnbUser>("https://cnb.cool/user", {
          headers: { Cookie: cookie },
        })
      );
      return { ok: true, user: res.data };
    } catch (e) {
      return { ok: false, error: extractErrorMessage(e) };
    }
  }

  /**
   * 置顶/取消置顶仓库（写回 CNB 网页 dashboard，实现双向同步）。
   * 需要已通过网页登录获得会话 Cookie（setCookieAuth）。
   */
  async setRepoPinned(
    repo: string,
    pinned: boolean
  ): Promise<{ ok: true } | { ok: false; error: CnbApiError }> {
    if (!this.webCookie) {
      return {
        ok: false,
        error: {
          status: 0,
          message: "尚未登录 CNB 网页账号，无法同步置顶（仅本地生效）",
        },
      };
    }
    const repoPath = encodeRepoPath(repo);
    const url = `https://cnb.cool/user/dashboard/pinned-stars/${repoPath}`;
    try {
      await requestWithRetry(() =>
        pinned
          ? this.http.post(url, null, {
              headers: { Origin: "https://cnb.cool", Referer: "https://cnb.cool/" },
            })
          : this.http.delete(url, {
              headers: { Origin: "https://cnb.cool", Referer: "https://cnb.cool/" },
            })
      );
      return { ok: true };
    } catch (e) {
      const err = extractErrorMessage(e);
      if (err.status === 401 || err.status === 403) {
        err.message = `网页登录已失效（HTTP ${err.status}），请重新登录：${err.message}`;
      }
      return { ok: false, error: err };
    }
  }

  /** 获取当前用户信息（用于验证令牌有效性），需 account-profile:r 权限 */
  async verifyToken(): Promise<
    { ok: true; user: CnbUser } | { ok: false; error: CnbApiError }
  > {
    try {
      const res = await requestWithRetry(() =>
        this.http.get<CnbUser>("/user")
      );
      return { ok: true, user: res.data };
    } catch (e) {
      return { ok: false, error: extractErrorMessage(e) };
    }
  }

  /**
   * 获取当前用户拥有指定权限及以上的仓库列表（含个人与组织仓库）
   * 需 account-engage:r 权限。分页遍历全部页。
   */
  async getAllRepos(minRole = "Developer"): Promise<CnbRepo[]> {
    const repos: CnbRepo[] = [];
    let page = 1;
    const pageSize = 100;

    for (;;) {
      const params = {
        role: minRole,
        page,
        page_size: pageSize,
        order_by: "last_updated_at",
        desc: true,
      };
      try {
        const res = await requestWithRetry(() =>
          this.http.get<CnbRepo[]>("/user/repos", { params })
        );
        const data = res.data || [];
        if (!data.length) break;
        repos.push(...data);
        if (data.length < pageSize) break;
        page += 1;
        if (page > 100) break;
      } catch (e) {
        if (repos.length) break;
        throw e;
      }
    }

    const uniqueByPath = new Map<string, CnbRepo>();
    for (const r of repos) {
      const path = r?.path || String(r?.id || "");
      if (!path) continue;
      if (!uniqueByPath.has(path)) uniqueByPath.set(path, r);
    }
    return Array.from(uniqueByPath.values());
  }

  /** 分页获取仓库全部分支名列表 */
  async getBranches(repo: string): Promise<CnbBranch[]> {
    const branches: CnbBranch[] = [];
    let page = 1;
    const pageSize = 100;
    const repoPath = encodeRepoPath(repo);

    for (;;) {
      const params = { page, page_size: pageSize };
      try {
        const res = await requestWithRetry(() =>
          this.http.get<CnbBranch[]>(`/${repoPath}/-/git/branches`, { params })
        );
        const data = res.data || [];
        if (!data.length) break;
        branches.push(...data);
        if (data.length < pageSize) break;
        page += 1;
        if (page > 100) break;
      } catch (e) {
        if (branches.length) break;
        throw e;
      }
    }

    const uniqueByName = new Map<string, CnbBranch>();
    for (const b of branches) {
      const name = b?.name;
      if (!name) continue;
      if (!uniqueByName.has(name)) uniqueByName.set(name, b);
    }
    return Array.from(uniqueByName.values());
  }

  /**
   * 获取分支（按最新提交时间倒序），并对 401/404 做可达性诊断后抛出友好错误。
   *
   * 背景：CNB 对“未登录/无权限的私有仓库”统一返回 404（不泄露存在性），
   * 网页 Cookie 过期后分支请求会变成匿名请求 → 表现为 404 而非 401，
   * 仓库列表（启动时加载的缓存）却看起来正常，用户难以定位。
   * 诊断方式：用当前凭证再请求一次 GET /user —— 失败即凭证失效（提示重新登录）；
   * 成功则说明会话有效，是该仓库不可达（改名/移动/删除/权限回收）。
   */
  async getBranchesFriendly(repo: string): Promise<CnbBranch[]> {
    try {
      return await this.getBranchesSortedByCommitTime(repo);
    } catch (e) {
      const err = extractErrorMessage(e);
      if (err.status !== 401 && err.status !== 404) throw e;
      const check = await this.verifyToken();
      if (!check.ok) {
        throw new Error(
          this.authMode === "cookie"
            ? "网页登录已过期，请点击「网页登录」重新登录"
            : "访问令牌已失效，请重新配置认证"
        );
      }
      if (err.status === 404) {
        throw new Error(
          "仓库不存在或无权限访问（可能已被改名/移动/删除），请刷新仓库列表后重试"
        );
      }
      // 401 但会话仍有效：权限语义，保留原始错误
      throw e;
    }
  }

  /** 从提交对象中提取提交时间（毫秒）；字段缺失或解析失败返回 0 */
  private parseCommitTime(payload: any): number {
    const raw =
      payload?.commit?.committer?.date || payload?.commit?.author?.date || "";
    const t = Date.parse(String(raw));
    return Number.isFinite(t) ? t : 0;
  }

  /**
   * 获取全部分支，并按最新提交时间倒序排序（最近提交的分支在前）。
   * 分支列表接口不含提交时间，需对每个分支请求一次提交列表（受控并发）；
   * 单个分支的时间查询失败不阻塞整体，该分支按 0 时间排到末尾（组内保持原序）。
   */
  async getBranchesSortedByCommitTime(repo: string): Promise<CnbBranch[]> {
    const branches = await this.getBranches(repo);
    if (branches.length <= 1) return branches;

    const repoPath = encodeRepoPath(repo);
    const times = new Map<string, number>();
    const CONCURRENCY = 6;
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= branches.length) return;
        const name = branches[index].name!;
        try {
          const res = await requestWithRetry(() =>
            this.http.get<any[]>(`/${repoPath}/-/git/commits`, {
              params: { sha: name, page: 1, page_size: 1 },
            })
          );
          times.set(name, this.parseCommitTime(res.data?.[0]));
        } catch {
          times.set(name, 0);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, branches.length) }, worker)
    );

    // 稳定排序：时间相同的分支保持接口原序
    return [...branches].sort((a, b) => {
      const ta = times.get(a.name!) ?? 0;
      const tb = times.get(b.name!) ?? 0;
      return tb - ta;
    });
  }

  /**
   * 比较两个分支的差异，用于预检“无变更”（noop）。
   * 返回 { totalCommits }；接口失败时返回 null（不阻塞主流程）。
   */
  async compareBranches(
    repo: string,
    base: string,
    head: string
  ): Promise<{ totalCommits: number } | null> {
    const repoPath = encodeRepoPath(repo);
    const baseHead = `${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
    try {
      const res = await requestWithRetry(() =>
        this.http.get<any>(`/${repoPath}/-/git/compare/${baseHead}`)
      );
      const data = res.data as any;
      const total = Number(data?.total_commits ?? data?.commits?.length ?? 0);
      return { totalCommits: Number.isFinite(total) ? total : 0 };
    } catch {
      return null;
    }
  }

  /** 创建合并请求（PR）。需 repo-pr:rw 权限 */
  async createPull(
    repo: string,
    sourceBranch: string,
    targetBranch: string,
    title: string
  ): Promise<CreatePullResult> {
    const repoPath = encodeRepoPath(repo);
    const data = {
      head: sourceBranch,
      base: targetBranch,
      title,
    };
    try {
      const res = await requestWithRetry(() =>
        this.http.post<CnbPull>(`/${repoPath}/-/pulls`, data)
      );
      return res.data;
    } catch (e) {
      const apiErr = extractErrorMessage(e);
      if (isNoChangeError(apiErr.message))
        return { status: "noop", message: apiErr.message };
      return { status: "error", message: apiErr.message };
    }
  }

  /**
   * 查找源/目标分支相同的 open 状态 PR（用于复用已存在的 PR）
   * CNB 支持按 base_ref 过滤，源分支在客户端按 head.ref 过滤
   */
  async findOpenPull(
    repo: string,
    sourceBranch: string,
    targetBranch: string
  ): Promise<CnbPull | null> {
    const repoPath = encodeRepoPath(repo);
    try {
      const params = {
        state: "open",
        base_ref: targetBranch,
        page: 1,
        page_size: 100,
      };
      const res = await requestWithRetry(() =>
        this.http.get<CnbPull[]>(`/${repoPath}/-/pulls`, { params })
      );
      const list = res.data || [];
      return (
        list.find((p) => {
          const headRef = String(p?.head?.ref || "").replace(/^refs\/heads\//, "");
          return headRef === sourceBranch;
        }) || null
      );
    } catch {
      return null;
    }
  }

  /** 获取 PR 详情（含 mergeable_state / state / blocked_on） */
  async getPull(repo: string, pullNumber: string | number): Promise<CnbPull> {
    const repoPath = encodeRepoPath(repo);
    const res = await requestWithRetry(() =>
      this.http.get<CnbPull>(`/${repoPath}/-/pulls/${encodeURIComponent(
        String(pullNumber)
      )}`)
    );
    return res.data;
  }

  /** 合并 PR。需 repo-pr:rw 权限。返回 { merged, message, sha } */
  async mergePull(
    repo: string,
    pullNumber: string | number,
    opts?: {
      mergeStyle?: "merge" | "squash" | "rebase";
      commitTitle?: string;
      commitMessage?: string;
    }
  ): Promise<{ merged: boolean; message: string; sha?: string }> {
    const repoPath = encodeRepoPath(repo);
    const data = {
      // CNB 要求 commit_title 必填，缺失会返回 400 "commit_title is required"
      commit_title: opts?.commitTitle || "Merge pull request",
      commit_message: opts?.commitMessage,
      // 合法值仅 merge / squash / rebase（不含 fast_forward）
      merge_style: opts?.mergeStyle ?? "merge",
    };
    const res = await requestWithRetry(() =>
      this.http.put<{ merged?: boolean; message?: string; sha?: string }>(
        `/${repoPath}/-/pulls/${encodeURIComponent(String(pullNumber))}/merge`,
        data,
        { timeout: 30_000 }
      )
    );
    return {
      merged: Boolean(res.data?.merged),
      message: res.data?.message || "",
      sha: res.data?.sha,
    };
  }

  /** 关闭（取消）PR：PATCH state=closed */
  async closePull(repo: string, pullNumber: string | number): Promise<boolean> {
    const repoPath = encodeRepoPath(repo);
    try {
      await requestWithRetry(() =>
        this.http.patch(
          `/${repoPath}/-/pulls/${encodeURIComponent(String(pullNumber))}`,
          { state: "closed" }
        )
      );
      return true;
    } catch {
      return false;
    }
  }
}
