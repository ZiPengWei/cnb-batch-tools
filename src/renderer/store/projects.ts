import { acceptHMRUpdate, defineStore } from "pinia";
import { listBranches, listProjects, setRepoPinned } from "../ipc/bridge";
import type { ListProjectsItem } from "../ipc/types";

const isE2E =
  (import.meta as any).env?.VITE_E2E === "1" ||
  String((import.meta as any).env?.MODE || "").toLowerCase() === "e2e";

const PINNED_REPOS_KEY = "cnb-pinned-repos";
/** 应用内手动置顶的仓库（与服务端置顶区分来源） */
const LOCAL_PINS_KEY = "cnb-local-pinned-repos";
/** 服务端置顶、但用户在应用内手动取消的仓库（刷新后不恢复置顶） */
const UNPINNED_SERVER_PINS_KEY = "cnb-unpinned-server-pins";

function readStringList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readPinnedRepos(): string[] {
  return readStringList(PINNED_REPOS_KEY);
}

function readLocalPins(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_PINS_KEY);
    if (raw !== null) {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
    }
  } catch {
    return [];
  }
  // 迁移：旧版本仅持久化 cnb-pinned-repos，全部视为应用内手动置顶
  return readPinnedRepos();
}

export const useProjectsStore = defineStore("projects", {
  state: () => ({
    items: [] as ListProjectsItem[],
    loading: false,
    error: "",

    filter: "",

    /** 置顶仓库 id 列表（含服务端同步 + 应用内手动置顶，持久化 key: cnb-pinned-repos） */
    pinnedRepos: readPinnedRepos(),

    /** 应用内手动置顶的仓库 id（持久化 key: cnb-local-pinned-repos，刷新后保留） */
    localPins: readLocalPins(),

    /**
     * 服务端置顶、但被用户在应用内手动取消的仓库 id 列表
     * （持久化 key: cnb-unpinned-server-pins，避免每次刷新被重新置顶）
     */
    localUnpinnedServerPins: readStringList(UNPINNED_SERVER_PINS_KEY),

    /** 置顶同步到 CNB 的最近一次错误提示（空=无错误） */
    pinError: "",

    /** 正在执行置顶写回的仓库 id（防重复点击，空=空闲） */
    pinningId: "",

    /** 当前选中的仓库完整路径（org/repo） */
    selectedRepo: "",
    selectedProjectName: "",

    sourceBranches: [] as string[],
    sourceBranchesLoading: false,
    sourceBranchesError: "",
    targetBranches: [] as string[],
    targetBranchesLoading: false,
    targetBranchesError: "",
    selectedSourceBranch: "",
  }),
  getters: {
    filteredItems(state) {
      const q = (state.filter || "").trim().toLowerCase();
      if (!q) return state.items;
      return state.items.filter((p) => {
        const s = p.search || p.display.toLowerCase();
        if (s.includes(q)) return true;
        return isSubsequence(q, s);
      });
    },
    /** 置顶仓库排在最前，各组内保持原有顺序 */
    sortedItems(state) {
      const pinned = state.pinnedRepos;
      const list: ListProjectsItem[] = this.filteredItems;
      const on = list.filter((p) => pinned.includes(p.id));
      const off = list.filter((p) => !pinned.includes(p.id));
      return [...on, ...off];
    },
  },
  actions: {
    reset() {
      this.items = [];
      this.loading = false;
      this.error = "";
      this.filter = "";
      this.selectedRepo = "";
      this.selectedProjectName = "";
      this.sourceBranches = [];
      this.sourceBranchesLoading = false;
      this.sourceBranchesError = "";
      this.targetBranches = [];
      this.targetBranchesLoading = false;
      this.targetBranchesError = "";
      this.selectedSourceBranch = "";
    },
    setFilter(text: string) {
      this.filter = text;
    },
    /**
     * 切换仓库置顶状态：先本地乐观更新 UI，再写回 CNB 网页 dashboard
     * （需要已配置网页 Cookie），失败时回滚并记录 pinError。
     */
    async togglePin(id: string) {
      if (this.pinningId) return;
      const willPin = !this.pinnedRepos.includes(id);
      this.applyPinLocal(id, willPin);
      if (isE2E) return;
      this.pinningId = id;
      try {
        const res = await setRepoPinned({ repo: id, pinned: willPin });
        if (res?.ok) {
          this.pinError = "";
          // 同步内存中的服务端标记，保持后续判定一致
          const item = this.items.find((i) => i.id === id);
          if (item) item.pinned = willPin;
          // 写回成功后服务端即权威：清除本地来源记录，
          // 之后用户在 CNB 网页上的反向操作（重新置顶/取消置顶）刷新时可跟随
          this.clearLocalPinRecords(id);
        } else {
          this.applyPinLocal(id, !willPin);
          const msg = res?.error?.message || "未知错误";
          this.pinError = `置顶同步失败：${msg}`;
        }
      } catch (e) {
        this.applyPinLocal(id, !willPin);
        this.pinError = `置顶同步失败：${String(e)}`;
      } finally {
        this.pinningId = "";
      }
    },

    /** 本地置顶簿记（pin=true 添加，false 移除），含持久化 */
    applyPinLocal(id: string, pin: boolean) {
      const serverPinned = this.items.some((i) => i.id === id && i.pinned);
      if (!pin) {
        const idx = this.pinnedRepos.indexOf(id);
        if (idx >= 0) this.pinnedRepos.splice(idx, 1);
        const lIdx = this.localPins.indexOf(id);
        if (lIdx >= 0) this.localPins.splice(lIdx, 1);
        // 取消的是服务端置顶仓库时记录覆盖，刷新后不再恢复
        if (
          serverPinned &&
          !this.localUnpinnedServerPins.includes(id)
        ) {
          this.localUnpinnedServerPins.push(id);
        }
      } else {
        if (!this.pinnedRepos.includes(id)) this.pinnedRepos.push(id);
        if (!this.localPins.includes(id)) this.localPins.push(id);
        // 应用内重新置顶后撤销本地取消记录
        const oIdx = this.localUnpinnedServerPins.indexOf(id);
        if (oIdx >= 0) this.localUnpinnedServerPins.splice(oIdx, 1);
      }
      this.persistPins();
    },

    /**
     * 写回成功后清除该仓库的本地来源记录（localPins / localUnpinnedServerPins）。
     * 此时服务端状态即权威：之后用户在 CNB 网页上的反向操作（重新置顶/取消置顶）
     * 在应用刷新列表时可以正确跟随，不会被本地覆盖记录挡住。
     */
    clearLocalPinRecords(id: string) {
      const lIdx = this.localPins.indexOf(id);
      if (lIdx >= 0) this.localPins.splice(lIdx, 1);
      const oIdx = this.localUnpinnedServerPins.indexOf(id);
      if (oIdx >= 0) this.localUnpinnedServerPins.splice(oIdx, 1);
      this.persistPins();
    },
    persistPins() {
      try {
        localStorage.setItem(
          PINNED_REPOS_KEY,
          JSON.stringify(this.pinnedRepos)
        );
        localStorage.setItem(
          LOCAL_PINS_KEY,
          JSON.stringify(this.localPins)
        );
        localStorage.setItem(
          UNPINNED_SERVER_PINS_KEY,
          JSON.stringify(this.localUnpinnedServerPins)
        );
      } catch {
        /* ignore */
      }
    },
    async loadProjects() {
      this.loading = true;
      this.error = "";
      try {
        if (isE2E) {
          const items = Array.from({ length: 1200 }, (_, i) => {
            const id = i + 1;
            return {
              id: `demo/p${id}`,
              display: `demo/p${id}`,
              search: `demo/p${id}`,
              pinyinFull: "",
              pinyinInitials: "",
            } satisfies ListProjectsItem;
          });
          this.items = items;
          if (!this.selectedRepo) {
            await this.selectProject({ id: items[0].id, display: items[0].display });
          }
          return;
        }
        const res = await listProjects();
        this.items = res.items || [];
        // 同步服务端置顶状态。置顶 = 服务端置顶（排除应用内手动取消过的）
        // ∪ 应用内手动置顶（localPins），且只保留仍存在于列表中的仓库
        const serverPinned = this.items
          .filter((i) => i.pinned)
          .map((i) => i.id);
        const serverPinnedSet = new Set(serverPinned);
        const merged = [
          ...serverPinned.filter(
            (id) => !this.localUnpinnedServerPins.includes(id)
          ),
          ...this.localPins.filter((id) => !serverPinnedSet.has(id)),
        ];
        const ids = new Set(this.items.map((i) => i.id));
        this.pinnedRepos = Array.from(new Set(merged)).filter((id) =>
          ids.has(id)
        );
        // 覆盖表只保留仍处于服务端置顶状态的仓库；手动置顶表清理失效仓库
        this.localUnpinnedServerPins = this.localUnpinnedServerPins.filter(
          (id) => serverPinnedSet.has(id)
        );
        this.localPins = this.localPins.filter((id) => ids.has(id));
        this.persistPins();
      } catch (e) {
        const msg = String(e);
        this.error = msg ? `仓库列表刷新失败：${msg}` : "仓库列表刷新失败";
      } finally {
        this.loading = false;
      }
    },
    async selectProject(p: { id: string; display: string }) {
      this.selectedRepo = p.id;
      this.selectedProjectName = p.display;
      this.selectedSourceBranch = "";
      this.sourceBranches = [];
      this.targetBranches = [];
      await this.loadAllBranches();
    },
    async loadAllBranches() {
      if (!this.selectedRepo) return;
      this.sourceBranchesLoading = true;
      this.sourceBranchesError = "";
      this.targetBranchesLoading = true;
      this.targetBranchesError = "";
      this.sourceBranches = [];
      this.targetBranches = [];
      try {
        if (isE2E) {
          const core = ["dev", "test", "gray", "main"];
          const extra = Array.from({ length: 900 }, (_, i) => `release/${i}`);
          const list = [...core, ...extra];
          this.sourceBranches = list.slice();
          this.targetBranches = list.slice();
          if (!this.selectedSourceBranch) this.selectedSourceBranch = list[0] || "";
          return;
        }
        const res = await listBranches({ repo: this.selectedRepo });
        // 结构化错误（主进程已做会话/可达性诊断的友好提示），直接展示
        if (res?.error) {
          const friendly = `分支刷新失败：${res.error}`;
          this.sourceBranchesError = friendly;
          this.targetBranchesError = friendly;
          return;
        }
        const list = res.branches || [];
        this.sourceBranches = list;
        this.targetBranches = list;
      } catch (e) {
        const msg = String(e);
        const friendly = msg ? `分支刷新失败：${msg}` : "分支刷新失败";
        this.sourceBranchesError = friendly;
        this.targetBranchesError = friendly;
      } finally {
        this.sourceBranchesLoading = false;
        this.targetBranchesLoading = false;
      }
    },
  },
});

function isSubsequence(needle: string, haystack: string) {
  if (!needle) return true;
  let j = 0;
  for (let i = 0; i < haystack.length && j < needle.length; i++) {
    if (haystack[i] === needle[j]) j++;
  }
  return j === needle.length;
}

// 开发模式下支持 store 热更新（否则 HMR 后仍复用旧 store 实例）
if (import.meta.hot) {
  acceptHMRUpdate(useProjectsStore, import.meta.hot);
}
