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
  loadLocal: vi.fn(),
  connect: vi.fn(),
  loginViaWeb: vi.fn(),
  switchAccount: vi.fn(),
  logout: vi.fn(),
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
  logLines: [] as Array<{ text: string; error?: boolean }>,
  running: false,
  activeRunId: "",
  setTargets: vi.fn(),
  toggleTarget: vi.fn(),
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
    openExternal: vi.fn(),
    getPlatform: vi.fn(() => ""),
    getCloseAction: vi.fn(async () => "ask"),
    setCloseAction: vi.fn(async (action: string) => action),
    getAppVersion: vi.fn(async () => "1.0.0"),
    getUpdateStatus: vi.fn(async () => null),
    checkForUpdate: vi.fn(),
    onUpdateStatus: vi.fn(() => () => {}),
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
