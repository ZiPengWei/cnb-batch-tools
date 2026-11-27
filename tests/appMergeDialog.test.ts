import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

const authStoreMock = {
  baseUrl: "https://api.cnb.cool",
  token: "t",
  webCookie: "",
  mode: "token",
  rememberToken: false,
  connected: true,
  busy: false,
  loggingIn: false,
  userName: "u",
  error: "",
  expiredMessage: "",
  loadLocal: vi.fn(),
  connect: vi.fn(),
  loginViaWeb: vi.fn(),
  switchAccount: vi.fn(),
  logout: vi.fn(),
  promptRelogin: vi.fn(),
  dismissRelogin: vi.fn(),
  confirmRelogin: vi.fn(),
};

const projectsStoreMock = reactive({
  items: [],
  loading: false,
  error: "",
  filter: "",
  pinnedRepos: [],
  pinError: "",
  pinningId: "",
  selectedRepo: "org/demo",
  selectedProjectName: "org/demo",
  sourceBranches: ["feat"],
  sourceBranchesLoading: false,
  sourceBranchesError: "",
  targetBranches: ["main"],
  targetBranchesLoading: false,
  targetBranchesError: "",
  selectedSourceBranch: "feat",
  loadProjects: vi.fn(),
  selectProject: vi.fn(),
  loadAllBranches: vi.fn(),
  chooseSourceBranch: vi.fn(function (this: any, name: string) {
    projectsStoreMock.selectedSourceBranch = name;
  }),
  setFilter: vi.fn(),
  togglePin: vi.fn(),
  get filteredItems() {
    return this.items;
  },
  get sortedItems() {
    return this.items;
  },
}) as any;

let resolveMergeRun: ((v: any) => void) | null = null;
const mergeStoreMock = reactive({
  targetFilter: "",
  targets: ["main"],
  selectedTargets: ["main"],
  history: [] as any[],
  logLines: [] as Array<{ text: string; error?: boolean }>,
  running: false,
  activeRunId: "",
  setTargets: vi.fn(),
  toggleTarget: vi.fn(),
  setSelectedTargets: vi.fn(),
  addSelectedTargets: vi.fn(),
  clearTargets: vi.fn(),
  persistCurrentTargets: vi.fn(),
  notifyFinished: vi.fn(),
  log: vi.fn(function (this: any, text: string, error = false) {
    mergeStoreMock.logLines.push({ text: String(text ?? ""), error });
  }),
  run: vi.fn(async () => {
    return await new Promise((resolve) => {
      resolveMergeRun = resolve;
    });
  }),
}) as any;

vi.mock("../src/renderer/store/auth", () => {
  return { useAuthStore: () => authStoreMock };
});

vi.mock("../src/renderer/store/projects", () => {
  return { useProjectsStore: () => projectsStoreMock };
});

vi.mock("../src/renderer/store/merge", () => {
  return {
    useMergeStore: () => mergeStoreMock,
    formatRelativeTime: () => "刚刚",
  };
});

vi.mock("../src/renderer/ipc/bridge", () => {
  return {
    onBatchMergeLog: vi.fn(() => () => {}),
    batchMerge: vi.fn(),
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
    setRepoPinned: vi.fn(),
    webLogin: vi.fn(),
    listProjects: vi.fn(),
    listBranches: vi.fn(),
    onBranchesSorted: vi.fn(() => () => {}),
    openExternal: vi.fn(),
    notify: vi.fn(async () => ({ ok: true })),
    copyText: vi.fn(async () => ({ ok: true })),
    getPlatform: vi.fn(() => ""),
    getCloseAction: vi.fn(async () => "ask"),
    setCloseAction: vi.fn(async (action: string) => action),
    getAppVersion: vi.fn(async () => "1.0.0"),
    getUpdateStatus: vi.fn(async () => null),
    getUpdateDownload: vi.fn(async () => null),
    downloadUpdate: vi.fn(async () => null),
    installUpdate: vi.fn(async () => ({ ok: true })),
    onUpdateDownloadProgress: vi.fn((cb: unknown) => {
      (globalThis as any).__updateDownloadCallback = cb;
      return () => {};
    }),
    checkForUpdate: vi.fn(),
    onUpdateStatus: vi.fn(() => () => {}),
    onAuthExpired: vi.fn(() => () => {}),
  };
});

beforeEach(() => {
  try {
    globalThis.localStorage?.clear?.();
  } catch {}
  vi.clearAllMocks();

  resolveMergeRun = null;

  projectsStoreMock.items = [];
  projectsStoreMock.loading = false;
  projectsStoreMock.error = "";
  projectsStoreMock.filter = "";
  projectsStoreMock.selectedRepo = "org/demo";
  projectsStoreMock.selectedProjectName = "org/demo";
  projectsStoreMock.sourceBranches = ["feat"];
  projectsStoreMock.sourceBranchesLoading = false;
  projectsStoreMock.sourceBranchesError = "";
  projectsStoreMock.targetBranches = ["main"];
  projectsStoreMock.targetBranchesLoading = false;
  projectsStoreMock.targetBranchesError = "";
  projectsStoreMock.selectedSourceBranch = "feat";
  projectsStoreMock.loadProjects = vi.fn();
  projectsStoreMock.selectProject = vi.fn();
  projectsStoreMock.loadAllBranches = vi.fn();
  projectsStoreMock.setFilter = vi.fn();

  mergeStoreMock.targetFilter = "";
  mergeStoreMock.targets = ["main"];
  mergeStoreMock.selectedTargets = ["main"];
  mergeStoreMock.logLines.splice(0);
  mergeStoreMock.running = false;
  mergeStoreMock.activeRunId = "";
  mergeStoreMock.setTargets = vi.fn();
  mergeStoreMock.toggleTarget = vi.fn();
  mergeStoreMock.log = vi.fn((text: any, error = false) => {
    mergeStoreMock.logLines.push({ text: String(text ?? ""), error });
  });
  mergeStoreMock.run = vi.fn(async () => {
    return await new Promise((resolve) => {
      resolveMergeRun = resolve;
    });
  });
});

afterEach(() => {
  try {
    globalThis.localStorage?.clear?.();
  } catch {}
  vi.useRealTimers();
});

describe("App 合并弹窗日志", () => {
  it("源分支与目标分支列表使用下拉滚动容器样式", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    const wrapper = mount(App, { attachTo: document.body });

    expect(wrapper.find('[aria-label="源分支列表"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="目标分支列表"]').exists()).toBe(true);

    wrapper.unmount();
  }, 30_000);

  it("极端数据量下三列列表可渲染且保留独立滚动容器", async () => {
    const { mount } = await import("@vue/test-utils");
    const { nextTick } = await import("vue");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.items = Array.from({ length: 1200 }, (_, i) => {
      const id = i + 1;
      return {
        id: `org/p${id}`,
        display: `org/p${id}`,
        search: `org/p${id}`,
        pinyinFull: "",
        pinyinInitials: "",
      };
    });
    projectsStoreMock.selectedRepo = "org/p1";
    projectsStoreMock.sourceBranches = Array.from(
      { length: 900 },
      (_, i) => `feat/${i}`
    );
    projectsStoreMock.selectedSourceBranch = "feat/0";
    projectsStoreMock.targetBranches = Array.from(
      { length: 900 },
      (_, i) => `release/${i}`
    );

    mergeStoreMock.targets = Array.from({ length: 900 }, (_, i) => `t/${i}`);
    mergeStoreMock.selectedTargets = ["t/0"];

    const wrapper = mount(App, { attachTo: document.body });
    await nextTick();

    const projectList = wrapper.find('[aria-label="项目列表"]');
    const sourceList = wrapper.find('[aria-label="源分支列表"]');
    const targetList = wrapper.find('[aria-label="目标分支列表"]');

    expect(projectList.exists()).toBe(true);
    expect(sourceList.exists()).toBe(true);
    expect(targetList.exists()).toBe(true);

    const projectStyle = projectList.attributes("style") || "";
    const sourceStyle = sourceList.attributes("style") || "";
    const targetStyle = targetList.attributes("style") || "";
    expect(projectStyle.replace(/\s/g, "")).toContain("overflow-y:auto");
    expect(sourceStyle.replace(/\s/g, "")).toContain("overflow-y:auto");
    expect(targetStyle.replace(/\s/g, "")).toContain("overflow-y:auto");

    const projectButtons = (projectList.element as HTMLElement).querySelectorAll(
      "button"
    );
    expect(projectButtons.length).toBe(1200);

    // 三个列表是相互独立的滚动容器
    const projectListEl = projectList.element as HTMLElement;
    const sourceListEl = sourceList.element as HTMLElement;
    const targetListEl = targetList.element as HTMLElement;
    expect(projectListEl).not.toBe(sourceListEl);
    expect(sourceListEl).not.toBe(targetListEl);

    // 列表内容渲染在滚动容器内部
    expect(projectListEl.contains(projectButtons[0] as Node)).toBe(true);

    wrapper.unmount();
  }, 60_000);

  it("点击列表项会触发 scrollIntoView 定位到对应项", async () => {
    const { mount } = await import("@vue/test-utils");
    const { nextTick } = await import("vue");
    const App = (await import("../src/App.vue")).default;

    const scrollIntoViewSpy = vi.fn();
    if (!("scrollIntoView" in Element.prototype)) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        value: scrollIntoViewSpy,
        writable: true,
      });
    } else {
      (Element.prototype as any).scrollIntoView = scrollIntoViewSpy;
    }

    const scrollToSpy = vi.fn();
    if (!("scrollTo" in HTMLDivElement.prototype)) {
      Object.defineProperty(HTMLDivElement.prototype, "scrollTo", {
        configurable: true,
        value: scrollToSpy,
        writable: true,
      });
    } else {
      (HTMLDivElement.prototype as any).scrollTo = scrollToSpy;
    }

    projectsStoreMock.items = Array.from({ length: 50 }, (_, i) => {
      const id = i + 1;
      return {
        id: `org/p${id}`,
        display: `org/p${id}`,
        search: `org/p${id}`,
        pinyinFull: "",
        pinyinInitials: "",
      };
    });
    projectsStoreMock.selectedRepo = "org/p1";
    projectsStoreMock.selectProject = vi.fn((p: any) => {
      projectsStoreMock.selectedRepo = p.id;
      projectsStoreMock.selectedProjectName = String(p.display ?? "");
    });

    projectsStoreMock.sourceBranches = Array.from(
      { length: 60 },
      (_, i) => `feat/${i}`
    );
    projectsStoreMock.selectedSourceBranch = "feat/0";

    mergeStoreMock.targets = Array.from({ length: 80 }, (_, i) => `t/${i}`);
    mergeStoreMock.selectedTargets = [];
    mergeStoreMock.toggleTarget = vi.fn((name: string) => {
      const idx = mergeStoreMock.selectedTargets.indexOf(name);
      if (idx >= 0) mergeStoreMock.selectedTargets.splice(idx, 1);
      else mergeStoreMock.selectedTargets.push(name);
    });

    const wrapper = mount(App, { attachTo: document.body });
    await nextTick();

    const projectList = wrapper.find('[aria-label="项目列表"]');
    expect(projectList.exists()).toBe(true);
    const projectButtons = (projectList.element as HTMLElement).querySelectorAll(
      "button"
    );
    expect(projectButtons.length).toBe(50);

    (projectButtons[30] as any).click();
    await nextTick();
    await nextTick();

    expect(projectsStoreMock.selectProject).toHaveBeenCalled();
    expect(scrollIntoViewSpy).toHaveBeenCalled();

    const targetList = wrapper.find('[aria-label="目标分支列表"]');
    expect(targetList.exists()).toBe(true);
    const targetButtons = (targetList.element as HTMLElement).querySelectorAll(
      "button"
    );
    expect(targetButtons.length).toBe(80);

    (targetButtons[10] as any).click();
    await nextTick();
    await nextTick();

    expect(scrollIntoViewSpy).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("合并中弹窗会渲染日志，并自动滚动到底部", async () => {
    resolveMergeRun = null;
    mergeStoreMock.logLines.splice(0);

    const originalIpc = (globalThis as any).window?.ipcRenderer;
    (globalThis as any).window.ipcRenderer = {
      on: vi.fn(),
      off: vi.fn(),
      invoke: vi.fn(),
    };

    const { mount } = await import("@vue/test-utils");
    const { nextTick } = await import("vue");
    const App = (await import("../src/App.vue")).default;

    const wrapper = mount(App, { attachTo: document.body });

    const startBtn = wrapper
      .findAll("button")
      .find((b: any) => {
        const t = b.text();
        return t.includes("开始批量合并") || t.includes("合并");
      });
    expect(startBtn).toBeTruthy();
    await startBtn!.trigger("click");
    await nextTick();

    const confirmBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim() === "确认"
    );
    expect(confirmBtn).toBeTruthy();
    (confirmBtn as HTMLButtonElement).click();

    await nextTick();

    expect(document.body.textContent || "").toContain("暂无日志输出");

    const logWrap = document.body.querySelector(
      '[data-testid="confirm-log-wrapper"]'
    ) as HTMLDivElement | null;
    expect(logWrap).toBeTruthy();
    const logContent =
      (logWrap!.querySelector(".n-log .n-scrollbar-container") as
        | HTMLDivElement
        | null) || (logWrap!.querySelector(".n-log") as HTMLDivElement | null);
    expect(logContent).toBeTruthy();

    Object.defineProperty(logContent!, "scrollHeight", {
      configurable: true,
      get: () => 123,
    });
    logContent!.scrollTop = 0;

    mergeStoreMock.log("L1");
    mergeStoreMock.log("L2", true);
    for (let i = 0; i < 5; i++) {
      await nextTick();
      await Promise.resolve();
      if (logContent!.scrollTop === 123) break;
    }
    expect(logContent!.scrollTop).toBe(123);
    await nextTick();

    expect(document.body.textContent || "").toContain("L1");
    expect(document.body.textContent || "").toContain("L2");
    expect(logContent!.scrollTop).toBe(123);

    if (resolveMergeRun)
      (resolveMergeRun as any)({
        ok: true,
        merged: [],
        conflicts: [],
        noop: [],
        failures: [],
      });
    await nextTick();

    wrapper.unmount();
    (globalThis as any).window.ipcRenderer = originalIpc;
  });

  it("标题与提示使用 CNB 文案", async () => {
    const originalConnected = authStoreMock.connected;
    authStoreMock.connected = false;
    try {
      const { mount } = await import("@vue/test-utils");
      const { nextTick } = await import("vue");
      const App = (await import("../src/App.vue")).default;

      const wrapper = mount(App, { attachTo: document.body });
      await nextTick();

      // 默认展示"网页登录"面板
      let text = wrapper.text();
      expect(text).toContain("CNB 认证");
      expect(text).toContain("网页账号登录（推荐）");
      expect(text).toContain("1. 选择仓库");

      // 切换到"访问令牌"后展示令牌输入面板
      const tokenRadio = wrapper
        .findAll('input[type="radio"]')
        .find((i) => (i.element as HTMLInputElement).value === "token");
      expect(tokenRadio).toBeTruthy();
      await tokenRadio!.setValue();
      await nextTick();
      text = wrapper.text();
      expect(text).toContain("CNB API 地址");
      expect(text).toContain("访问令牌 (Access Token)");

      wrapper.unmount();
    } finally {
      authStoreMock.connected = originalConnected;
    }
  }, 30_000);
});

describe("组件快照", () => {
  const normalizeSnapshotHtml = (html: string) => {
    return html
      .replace(/aria-labelledby="[^"]+"/g, 'aria-labelledby="__id__"')
      .replace(/\sid="([a-f0-9]{8}|[a-f0-9]{16})"/g, ' id="__id__"');
  };

  it("App 初始渲染快照", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));
    expect(normalizeSnapshotHtml(wrapper.html())).toMatchSnapshot();
    wrapper.unmount();
  });
});

describe("BatchMergeFinishDialog 结果明细", () => {
  it("按分支展示成功/冲突/失败明细", async () => {
    const { mount } = await import("@vue/test-utils");
    const { nextTick } = await import("vue");
    const BatchMergeFinishDialog = (
      await import("../src/renderer/components/BatchMergeFinishDialog.vue")
    ).default;

    const wrapper = mount(BatchMergeFinishDialog, {
      attachTo: document.body,
      props: {
        show: true,
        summary: {
          ok: false,
          merged: [{ source: "fix-1", target: "test" }],
          conflicts: [
            {
              source: "fix-1",
              target: "dev",
              reason: "检测到代码冲突（不可合并）",
            },
          ],
          noop: [{ source: "fix-1", target: "gray", reason: "无变更" }],
          failures: [],
        },
        logLines: ["line-1"],
      },
    });
    await nextTick();
    await nextTick();

    const text = document.body.textContent || "";
    expect(text).toContain("✓ fix-1 -> test");
    expect(text).toContain("✗ fix-1 -> dev");
    expect(text).toContain("检测到代码冲突（不可合并）");
    expect(text).toContain("fix-1 -> gray（无变更）");
    expect(text).toContain("部分合并完成");

    wrapper.unmount();
  });
});

describe("App 键盘流", () => {
  it("源分支列表 ↑/↓ 移动高亮、Enter 选择；目标分支列表空格勾选", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.sourceBranches = ["feat", "fix", "dev"];
    projectsStoreMock.selectedSourceBranch = "";
    mergeStoreMock.targets = ["dev", "main"];
    mergeStoreMock.selectedTargets = [];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    const srcList = wrapper.find('[aria-label="源分支列表"]');
    expect(srcList.exists()).toBe(true);

    // ArrowDown 两次：高亮第二项 fix
    await srcList.trigger("keydown", { key: "ArrowDown" });
    await srcList.trigger("keydown", { key: "ArrowDown" });
    const kbdBtns = document.body.querySelectorAll(
      '[aria-label="源分支列表"] .gl-kbd-active',
    );
    expect(kbdBtns.length).toBe(1);
    expect(kbdBtns[0].getAttribute("data-item-key")).toBe("fix");

    // Enter 选中源分支
    await srcList.trigger("keydown", { key: "Enter" });
    expect(projectsStoreMock.selectedSourceBranch).toBe("fix");

    // 目标分支列表：ArrowDown 定位首项，空格勾选
    const tgtList = wrapper.find('[aria-label="目标分支列表"]');
    await tgtList.trigger("keydown", { key: "ArrowDown" });
    await tgtList.trigger("keydown", { key: " " });
    expect(mergeStoreMock.toggleTarget).toHaveBeenCalledWith("dev");

    wrapper.unmount();
  }, 30_000);

  it("与源分支相同的目标分支行禁用，全选当前时跳过", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.sourceBranches = ["dev", "feat"];
    projectsStoreMock.selectedSourceBranch = "dev";
    projectsStoreMock.targetBranches = ["dev", "test"];
    mergeStoreMock.targets = ["dev", "test"];
    mergeStoreMock.selectedTargets = [];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    const devBtn = document.body.querySelector(
      '[aria-label="目标分支列表"] [data-item-key="dev"]',
    ) as HTMLButtonElement | null;
    expect(devBtn).toBeTruthy();
    expect(devBtn!.disabled).toBe(true);
    expect(devBtn!.getAttribute("title")).toBe("与源分支相同，无需合并");

    // 全选当前不包含 dev
    const selectAllBtn = Array.from(
      document.body.querySelectorAll("button"),
    ).find((b) => (b.textContent || "").trim() === "全选当前");
    (selectAllBtn as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mergeStoreMock.addSelectedTargets).toHaveBeenCalledWith(["test"]);

    wrapper.unmount();
  }, 30_000);
});

describe("App 过滤防抖与 Shift 区间多选", () => {
  it("目标分支 Shift 点击从锚点到当前项区间全选", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.sourceBranches = ["dev"];
    projectsStoreMock.selectedSourceBranch = "dev";
    projectsStoreMock.targetBranches = ["a", "b", "c", "d"];
    mergeStoreMock.targets = ["a", "b", "c", "d"];
    mergeStoreMock.selectedTargets = [];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    const clickRow = (key: string, shift = false) => {
      const btn = document.body.querySelector(
        `[aria-label="目标分支列表"] [data-item-key="${key}"]`,
      ) as HTMLButtonElement;
      btn.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: shift }),
      );
    };

    // 普通点击 a：单选切换，并记录为区间锚点
    clickRow("a");
    expect(mergeStoreMock.toggleTarget).toHaveBeenCalledWith("a");

    // Shift 点击 c：区间 [a, b, c] 全选
    clickRow("c", true);
    expect(mergeStoreMock.addSelectedTargets).toHaveBeenCalledWith([
      "a",
      "b",
      "c",
    ]);

    wrapper.unmount();
  }, 30_000);

  it("切换仓库时清空源/目标分支过滤词（仓库过滤词保留）", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.sourceBranches = ["dev", "release/1", "release/2"];
    projectsStoreMock.targetBranches = ["dev", "release/1", "release/2"];
    mergeStoreMock.targets = ["dev", "release/1", "release/2"];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    // 三个列表各自的过滤输入框（在对应工作台列内部，避开认证面板里的令牌输入框）
    const cardInput = (label: string) => {
      const list = document.body.querySelector(`[aria-label="${label}"]`);
      const col = list?.closest(".wb-col");
      return col?.querySelector<HTMLInputElement>(
        "input.n-input__input-el",
      ) as HTMLInputElement;
    };
    const repoInput = cardInput("项目列表");
    const srcInput = cardInput("源分支列表");
    const tgtInput = cardInput("目标分支列表");
    expect(repoInput).toBeTruthy();
    expect(srcInput).toBeTruthy();
    expect(tgtInput).toBeTruthy();

    const setValue = (el: HTMLInputElement, v: string) => {
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setValue(repoInput, "org/");
    setValue(srcInput, "release");
    setValue(tgtInput, "release");
    // 等防抖生效
    await new Promise((r) => setTimeout(r, 200));
    // 分支列表被过滤
    expect(
      document.body.querySelectorAll('[aria-label="源分支列表"] button').length,
    ).toBe(2);

    // 切换仓库：分支过滤词立即清空，仓库过滤词保留
    projectsStoreMock.selectedRepo = "org/other";
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(srcInput.value).toBe("");
    expect(tgtInput.value).toBe("");
    expect(repoInput.value).toBe("org/");
    // 分支列表恢复全量显示
    expect(
      document.body.querySelectorAll('[aria-label="源分支列表"] button').length,
    ).toBe(3);

    wrapper.unmount();
  }, 30_000);
});

describe("App 快捷键 / 窗口标题 / 仓库网页入口", () => {
  it("目标列表 Ctrl/Cmd+A 全选当前（排除同源禁用行）", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.sourceBranches = ["dev"];
    projectsStoreMock.selectedSourceBranch = "dev";
    projectsStoreMock.targetBranches = ["dev", "test", "gray"];
    mergeStoreMock.targets = ["dev", "test", "gray"];
    mergeStoreMock.selectedTargets = [];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    const tgtList = wrapper.find('[aria-label="目标分支列表"]');
    await tgtList.trigger("keydown", { key: "a", ctrlKey: true });

    expect(mergeStoreMock.addSelectedTargets).toHaveBeenCalledWith([
      "test",
      "gray",
    ]);

    wrapper.unmount();
  }, 30_000);

  it("Ctrl/Cmd+F 聚焦仓库过滤输入框", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 0));

    const active = document.activeElement;
    expect(active?.classList.contains("n-input__input-el")).toBe(true);
    const repoCol = active
      ?.closest(".wb-col")
      ?.querySelector('[aria-label="项目列表"]');
    expect(repoCol).toBeTruthy();

    wrapper.unmount();
  }, 30_000);

  it("窗口标题跟随当前仓库/源分支/目标数量", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    // beforeEach 预置了选中仓库/分支，这里先清空再验证默认标题
    projectsStoreMock.selectedRepo = "";
    projectsStoreMock.selectedSourceBranch = "";
    mergeStoreMock.selectedTargets = [];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toBe("CNB 批量合并工具");

    projectsStoreMock.selectedRepo = "org/demo";
    projectsStoreMock.selectedSourceBranch = "feat";
    mergeStoreMock.selectedTargets = ["dev", "test"];
    await new Promise((r) => setTimeout(r, 0));

    expect(document.title).toBe("org/demo · feat → 2 个目标");
    wrapper.unmount();
  }, 30_000);

  it("仓库行 ↗ 按钮用浏览器打开仓库网页", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.items = [
      { id: "org/demo", display: "org/demo", search: "org/demo", pinyinFull: "", pinyinInitials: "" },
    ];
    projectsStoreMock.selectedRepo = "org/demo";

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    const btn = document.body.querySelector(
      '[aria-label="在浏览器打开仓库 org/demo"]',
    ) as HTMLElement | null;
    expect(btn).toBeTruthy();
    btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    const { openExternal } = await import("../src/renderer/ipc/bridge");
    expect(vi.mocked(openExternal)).toHaveBeenCalledWith(
      "https://cnb.cool/org/demo",
    );

    wrapper.unmount();
  }, 30_000);
});

describe("App 应用内更新 UI", () => {
  it("有新版本时展示下载按钮；下载完成后展示重启安装；安装失败显示降级提示", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;
    const bridge = await import("../src/renderer/ipc/bridge");

    // 有新版本
    vi.mocked(bridge.getUpdateStatus).mockResolvedValue({
      checking: false,
      current: "1.0.7",
      latest: "1.0.8",
      hasUpdate: true,
      releaseUrl: "https://example.com/releases",
      error: "",
    });

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // n-popover 懒渲染：先点版本号按钮展开，内容才挂到 DOM
    const versionBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => (b.textContent || "").includes("v1.0.7"),
    );
    expect(versionBtn).toBeTruthy();
    versionBtn!.click();
    await new Promise((r) => setTimeout(r, 30));
    await new Promise((r) => setTimeout(r, 30));

    // 初始：下载并自动安装
    const dlBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => (b.textContent || "").includes("下载并自动安装"),
    );
    expect(dlBtn).toBeTruthy();

    // 点击下载 → 主进程返回 downloading 状态
    vi.mocked(bridge.downloadUpdate).mockResolvedValue({
      phase: "downloading",
      received: 5,
      total: 10,
      percent: 50,
      filePath: "",
      error: "",
    });
    dlBtn!.click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(bridge.downloadUpdate)).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("正在下载更新… 50%");

    // 主进程推送下载完成 → 重启并安装按钮出现
    const downloadState = (globalThis as any).__updateDownloadCallback;
    expect(downloadState).toBeTruthy();
    downloadState({
      phase: "downloaded",
      received: 10,
      total: 10,
      percent: 100,
      filePath: "/tmp/CNB-Tools.exe",
      error: "",
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const downloadedBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => (b.textContent || "").includes("重启并安装"),
    );
    expect(downloadedBtn).toBeTruthy();
    downloadedBtn!.click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(bridge.installUpdate)).toHaveBeenCalledTimes(1);

    // 安装失败（降级）→ 显示错误信息
    vi.mocked(bridge.installUpdate).mockResolvedValue({
      ok: false,
      message: "安装更新失败: 目录不可写",
    });
    // 重新点击（installingUpdate 已复位）
    downloadedBtn!.click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.body.textContent).toContain("安装更新失败: 目录不可写");

    wrapper.unmount();
  }, 30_000);
});

describe("App 高频效率交互", () => {
  it("点击核心环境按钮一键勾选所有可选核心分支（跳过同源）", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.sourceBranches = ["dev", "feat/login"];
    projectsStoreMock.selectedSourceBranch = "dev";
    projectsStoreMock.targetBranches = ["dev", "test", "gray", "main"];
    mergeStoreMock.targets = ["dev", "test", "gray", "main"];
    mergeStoreMock.selectedTargets = [];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    const coreBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => (b.textContent || "").includes("核心环境"),
    );
    expect(coreBtn).toBeTruthy();
    (coreBtn as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(mergeStoreMock.addSelectedTargets).toHaveBeenCalledWith([
      "test",
      "gray",
    ]);
    wrapper.unmount();
  }, 30_000);

  it("Ctrl/Cmd+Enter 在就绪时直接打开合并确认弹窗", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.selectedRepo = "org/demo";
    projectsStoreMock.selectedSourceBranch = "feat";
    mergeStoreMock.targets = ["main"];
    mergeStoreMock.selectedTargets = ["main"];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 30));

    expect(document.body.textContent || "").toContain("确认合并");
    wrapper.unmount();
  }, 30_000);

  it("过滤框按 Esc 立即清空已输入的过滤词", async () => {
    const { mount } = await import("@vue/test-utils");
    const App = (await import("../src/App.vue")).default;

    projectsStoreMock.sourceBranches = ["dev", "release/1"];

    const wrapper = mount(App, { attachTo: document.body });
    await new Promise((r) => setTimeout(r, 0));

    const srcList = document.body.querySelector('[aria-label="源分支列表"]');
    const srcInput = srcList
      ?.closest(".wb-col")
      ?.querySelector<HTMLInputElement>("input.n-input__input-el");
    expect(srcInput).toBeTruthy();

    srcInput!.value = "release";
    srcInput!.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 180));
    expect(
      document.body.querySelectorAll('[aria-label="源分支列表"] button').length,
    ).toBe(1);

    srcInput!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(srcInput!.value).toBe("");
    expect(
      document.body.querySelectorAll('[aria-label="源分支列表"] button').length,
    ).toBe(2);

    wrapper.unmount();
  }, 30_000);
});
