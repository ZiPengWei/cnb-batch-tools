import { acceptHMRUpdate, defineStore } from "pinia";
import { batchMerge, notify, onBatchMergeLog, setMergeRunning } from "../ipc/bridge";
import { useProjectsStore } from "./projects";

const isE2E =
  (import.meta as any).env?.VITE_E2E === "1" ||
  String((import.meta as any).env?.MODE || "").toLowerCase() === "e2e";

/** 按仓库记忆目标分支选择的持久化 key（LRU 上限内保留最近使用的仓库） */
const REPO_TARGETS_KEY = "cnb-repo-targets";
const REPO_TARGETS_CAP = 100;

/** 合并历史记录（本地持久化，最近在前） */
export type MergeHistoryEntry = {
  ts: number;
  repo: string;
  /** 源分支（当前 UI 单源，多个时以"、"连接） */
  source: string;
  targets: string[];
  ok: boolean;
  merged: number;
  conflicts: number;
  failures: number;
  noop: number;
  message?: string;
};

const MERGE_HISTORY_KEY = "cnb-merge-history";
const MERGE_HISTORY_CAP = 20;

function readMergeHistory(): MergeHistoryEntry[] {
  try {
    const raw = localStorage.getItem(MERGE_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter(
          (x): x is MergeHistoryEntry =>
            x && typeof x === "object" && typeof x.ts === "number",
        )
      : [];
  } catch {
    return [];
  }
}

/** 相对时间文案：刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期 */
export function formatRelativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  if (diff < MIN) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

function readRepoTargets(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(REPO_TARGETS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveRepoTargets(repo: string, targets: string[]) {
  try {
    const all = readRepoTargets();
    // 先删再写，保持 LRU 顺序（最近使用的仓库排在最后，超限时从最旧开始淘汰）
    delete all[repo];
    const keys = Object.keys(all);
    if (keys.length >= REPO_TARGETS_CAP) {
      for (const k of keys.slice(0, keys.length - REPO_TARGETS_CAP + 1)) {
        delete all[k];
      }
    }
    all[repo] = targets;
    localStorage.setItem(REPO_TARGETS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * 批量合并结果摘要（分支级明细）
 * - merged: 成功合并的分支对
 * - conflicts: 检测到冲突被跳过（PR 已取消）的分支对
 * - noop: 无变更跳过
 * - failures: 其他失败
 */
export type MergeRunSummary = {
  ok: boolean;
  merged: Array<{ source: string; target: string; prNumber?: string }>;
  conflicts: Array<{
    source: string;
    target: string;
    reason?: string;
    prNumber?: string;
  }>;
  noop: Array<{ source: string; target: string; reason?: string }>;
  failures: Array<{
    source: string;
    target: string;
    reason?: string;
    prNumber?: string;
  }>;
  message?: string;
};

export type MergeLogLine = {
  ts: number;
  text: string;
  error?: boolean;
};

function normalizeLogText(text: string) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_RAW_LOG_LINES = 20000;

export const useMergeStore = defineStore("merge", {
  state: () => ({
    targetFilter: "",
    targets: [] as string[],
    selectedTargets: [] as string[],
    logLines: [] as MergeLogLine[],
    running: false,
    activeRunId: "",
    /** 合并历史（本地持久化，最近在前） */
    history: readMergeHistory(),
  }),
  getters: {
    /** 指定仓库的最近一次合并记录（无记录返回 null） */
    lastRunFor(state) {
      return (repo: string): MergeHistoryEntry | null =>
        state.history.find((h) => h.repo === repo) || null;
    },
  },
  actions: {
    /**
     * 更新目标分支候选列表。
     * - 分支集合未变（仅顺序变化，如后台提交时间排序完成）→ 保留当前选择；
     * - 分支集合变化（切换仓库/刷新）→ 恢复该仓库上次保存的目标分支选择
     *   （过滤已不存在的分支），省去重复勾选。
     */
    setTargets(branches: string[]) {
      const next = branches.slice();
      const prevSet = new Set(this.targets);
      const sameSet =
        prevSet.size === next.length && next.every((b) => prevSet.has(b));
      this.targets = next;
      const nextSet = new Set(next);
      if (sameSet) {
        this.selectedTargets = this.selectedTargets.filter((t) =>
          nextSet.has(t)
        );
        return;
      }
      const repo = useProjectsStore().selectedRepo;
      const saved = readRepoTargets()[repo] || [];
      this.selectedTargets = saved.filter((t) => nextSet.has(t));
    },
    /** 覆盖式设置目标分支选择 */
    setSelectedTargets(list: string[]) {
      this.selectedTargets = [...new Set(list)];
      this.persistCurrentTargets();
    },
    /** 并集式追加目标分支选择（全选当前） */
    addSelectedTargets(list: string[]) {
      this.selectedTargets = [
        ...new Set([...this.selectedTargets, ...list]),
      ];
      this.persistCurrentTargets();
    },
    /** 清空目标分支选择 */
    clearTargets() {
      this.selectedTargets = [];
      this.persistCurrentTargets();
    },
    toggleTarget(name: string) {
      if (this.selectedTargets.includes(name)) {
        this.selectedTargets = this.selectedTargets.filter((b) => b !== name);
      } else {
        this.selectedTargets = [...this.selectedTargets, name];
      }
      this.persistCurrentTargets();
    },
    /**
     * 按仓库持久化当前目标分支选择（分支列表已加载时才写，
     * 避免切换仓库的瞬时空态覆盖已有记忆）。
     */
    persistCurrentTargets() {
      const repo = useProjectsStore().selectedRepo;
      if (!repo || !this.targets.length) return;
      saveRepoTargets(repo, this.selectedTargets);
    },
    log(text: string, error = false) {
      const ts = Date.now();
      const norm = normalizeLogText(text);
      this.logLines.push({ ts, text: norm, error });
      if (this.logLines.length > MAX_RAW_LOG_LINES) {
        this.logLines.splice(0, this.logLines.length - MAX_RAW_LOG_LINES);
      }
    },
    /** 记录一次合并（最近在前，超限淘汰最旧） */
    recordRun(entry: MergeHistoryEntry) {
      this.history = [entry, ...this.history].slice(0, MERGE_HISTORY_CAP);
      try {
        localStorage.setItem(MERGE_HISTORY_KEY, JSON.stringify(this.history));
      } catch {
        /* ignore */
      }
    },
    /** 把本次运行写入合并历史 */
    recordCurrentRun(
      repo: string,
      sourceBranches: string[],
      summary: MergeRunSummary,
    ) {
      this.recordRun({
        ts: Date.now(),
        repo,
        source: sourceBranches.join("、"),
        targets: [...this.selectedTargets],
        ok: summary.ok,
        merged: summary.merged.length,
        conflicts: summary.conflicts.length,
        failures: summary.failures.length,
        noop: summary.noop.length,
        ...(summary.message ? { message: summary.message } : {}),
      });
    },
    /**
     * 同步合并运行状态到主进程（合并中的退出保护）。
     * 非 Electron 环境 / E2E 下静默跳过。
     */
    async syncMergeRunning(running: boolean) {
      if (isE2E) return;
      try {
        await setMergeRunning(running);
      } catch {
        /* 非 Electron 环境忽略 */
      }
    },
    /**
     * 合并完成系统通知（长批量时用户常切走，完成后提醒；点击通知唤起主窗口）。
     * 主窗口聚焦时主进程会跳过（用户正在看结果弹窗）；E2E 与通知失败静默跳过。
     */
    async notifyFinished(summary: MergeRunSummary) {
      if (isE2E) return;
      try {
        const parts = [
          `成功 ${summary.merged.length}`,
          `冲突 ${summary.conflicts.length}`,
          `失败 ${summary.failures.length}`,
          `无变更 ${summary.noop.length}`,
        ];
        let body = parts.join(" · ");
        if (!summary.ok && summary.message) {
          body = `${body}（${summary.message.slice(0, 120)}）`;
        }
        const repo = useProjectsStore().selectedProjectName || "";
        await notify({
          title: `批量合并完成${repo ? `：${repo}` : ""}`,
          body,
        });
      } catch {
        /* 通知失败不影响主流程 */
      }
    },
    async run(
      repo: string,
      sourceBranches: string[]
    ): Promise<MergeRunSummary | null> {
      if (!repo || !sourceBranches.length || !this.selectedTargets.length)
        return null;
      const totalOps = sourceBranches.length * this.selectedTargets.length;
      this.running = true;
      this.logLines = [];
      const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      this.activeRunId = runId;
      this.log("=== 开始批量合并 ===");

      if (isE2E) {
        try {
          const steps = Math.min(200, Math.max(30, totalOps * 2));
          await new Promise<void>((resolve) => {
            let i = 0;
            const timer = window.setInterval(() => {
              i += 1;
              this.log(`E2E step ${i}/${steps}`);
              if (i >= steps) {
                window.clearInterval(timer);
                resolve();
              }
            }, 20);
          });
          this.log(`全部已合并，成功 PR 数量：${totalOps}`);
          return {
            ok: true,
            merged: this.selectedTargets.map((t) => ({
              source: sourceBranches[0] || "",
              target: t,
            })),
            conflicts: [],
            noop: [],
            failures: [],
          };
        } finally {
          this.running = false;
          this.activeRunId = "";
        }
      }

      const payload = {
        repo,
        pairs: sourceBranches.flatMap((s) =>
          this.selectedTargets.map((t) => ({
            source: s,
            target: t,
          }))
        ),
        runId,
      };

      void this.syncMergeRunning(true);
      let stopListen: (() => void) | null = null;
      try {
        stopListen = onBatchMergeLog((e) => {
          if (e?.runId && e.runId !== this.activeRunId) return;
          if (!e?.text) return;
          this.log(e.text, !!e.error);
        });
        const res = await batchMerge(payload);
        const summary: MergeRunSummary = {
          ok: res.ok,
          merged: res.merged || [],
          conflicts: res.conflicts || [],
          noop: res.noop || [],
          failures: res.failures || [],
        };
        if (summary.ok) {
          if (summary.merged.length === 0 && summary.noop.length > 0) {
            this.log(`本次无变更，已跳过：${summary.noop.length} 项`);
          } else {
            this.log(
              `全部已合并，成功分支：${summary.merged
                .map((m) => m.target)
                .join("、")}`
            );
          }
        } else {
          if (summary.merged.length)
            this.log(
              `成功合并的分支：${summary.merged
                .map((m) => `${m.source} -> ${m.target}`)
                .join("、")}`
            );
          if (summary.conflicts.length)
            this.log(
              `存在冲突已跳过的分支：${summary.conflicts
                .map((m) => `${m.source} -> ${m.target}`)
                .join("、")}`,
              true
            );
          if (summary.failures.length)
            this.log(
              `失败的分支：${summary.failures
                .map((m) => `${m.source} -> ${m.target}`)
                .join("、")}`,
              true
            );
          if (summary.noop.length)
            this.log(`已跳过无变更：${summary.noop.length} 项`);
        }
        void this.notifyFinished(summary);
        this.recordCurrentRun(repo, sourceBranches, summary);
        return summary;
      } catch (e) {
        const msg = String(e);
        this.log(msg, true);
        const summary: MergeRunSummary = {
          ok: false,
          merged: [],
          conflicts: [],
          noop: [],
          failures: [],
          message: msg,
        };
        void this.notifyFinished(summary);
        this.recordCurrentRun(repo, sourceBranches, summary);
        return summary;
      } finally {
        stopListen?.();
        this.running = false;
        this.activeRunId = "";
        void this.syncMergeRunning(false);
      }
    },
  },
});

// 开发模式下支持 store 热更新（否则 HMR 后仍复用旧 store 实例）
if (import.meta.hot) {
  acceptHMRUpdate(useMergeStore, import.meta.hot);
}
