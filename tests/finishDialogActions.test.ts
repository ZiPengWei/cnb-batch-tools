import { beforeEach, describe, expect, it, vi } from "vitest";
import { h, nextTick } from "vue";
import { mount } from "@vue/test-utils";

/**
 * BatchMergeFinishDialog 操作测试：
 * - 复制报告：把结果摘要转为纯文本写入剪贴板，按钮反馈"已复制"
 * - 仅重试失败：冲突+失败分支对 emit retry-failed；无失败项时不显示按钮
 */

const copyTextMock = vi.fn(async () => ({ ok: true }));
const openExternalMock = vi.fn(async () => undefined);

vi.mock("../src/renderer/ipc/bridge", () => ({
  copyText: (...args: unknown[]) => copyTextMock(...(args as [string])),
  openExternal: (...args: unknown[]) => openExternalMock(...(args as [string])),
}));

import BatchMergeFinishDialog from "../src/renderer/components/BatchMergeFinishDialog.vue";
import { NConfigProvider } from "../src/renderer/ui/naive";
import type { MergeRunSummary } from "../src/renderer/store/merge";

function mountDialog(summary: MergeRunSummary | null, repo = "org/repo") {
  const wrapper = mount({
    setup() {
      return () =>
        h(
          NConfigProvider,
          null,
          () =>
            h(BatchMergeFinishDialog, {
              show: true,
              summary,
              logLines: [],
              repo,
            }),
        );
    },
  });
  return wrapper;
}

function findButton(text: string): HTMLButtonElement | null {
  const btn = Array.from(document.body.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim().startsWith(text),
  );
  return (btn as HTMLButtonElement) || null;
}

const summaryWithIssues: MergeRunSummary = {
  ok: false,
  merged: [{ source: "feat", target: "dev", prNumber: "12" }],
  conflicts: [{ source: "feat", target: "gray", reason: "检测到冲突", prNumber: "13" }],
  failures: [{ source: "feat", target: "test", reason: "HTTP 500" }],
  noop: [{ source: "feat", target: "main", reason: "无变更" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("BatchMergeFinishDialog 复制报告", () => {
  it("点击复制报告：摘要转纯文本写入剪贴板，按钮反馈已复制", async () => {
    const wrapper = mountDialog(summaryWithIssues);
    await nextTick();

    const btn = findButton("复制报告");
    expect(btn).toBeTruthy();
    btn!.click();
    for (let i = 0; i < 8; i++) {
      await nextTick();
      await Promise.resolve();
    }

    expect(copyTextMock).toHaveBeenCalledTimes(1);
    const report = copyTextMock.mock.calls[0][0] as string;
    expect(report).toContain("仓库：org/repo");
    expect(report).toContain("成功 1 · 冲突 1 · 失败 1 · 无变更 1");
    expect(report).toContain("✓ 成功合并 (1)");
    expect(report).toContain("feat -> dev (PR #12)");
    expect(report).toContain("⚠ 冲突跳过（已取消 PR） (1)");
    expect(report).toContain("feat -> gray (PR #13)（检测到冲突）");
    expect(report).toContain("✗ 失败 (1)");
    expect(report).toContain("feat -> test（HTTP 500）");
    expect(report).toContain("○ 无变更跳过 (1)");
    expect(report).toContain("feat -> dev (PR #12)");
    expect(findButton("已复制 ✓")).toBeTruthy();

    wrapper.unmount();
  });

  it("带 PR 编号的明细显示直达链接，点击用浏览器打开", async () => {
    const wrapper = mountDialog(summaryWithIssues);
    await nextTick();

    // merged/conflicts 有 prNumber → 有链接；failures 没有 → 无链接
    const links = Array.from(document.body.querySelectorAll("button")).filter(
      (b) => (b.textContent || "").includes("查看 PR #"),
    );
    expect(links.map((b) => (b.textContent || "").trim())).toEqual([
      "查看 PR #13",
      "查看 PR #12",
    ]);

    (links[0] as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(openExternalMock).toHaveBeenCalledWith(
      "https://cnb.cool/org/repo/-/pulls/13",
    );
    wrapper.unmount();
  });

  it("复制失败时不显示已复制反馈", async () => {
    copyTextMock.mockRejectedValueOnce(new Error("clipboard blocked"));
    const wrapper = mountDialog(summaryWithIssues);
    await nextTick();

    findButton("复制报告")!.click();
    for (let i = 0; i < 8; i++) {
      await nextTick();
      await Promise.resolve();
    }

    expect(findButton("已复制 ✓")).toBeNull();
    wrapper.unmount();
  });
});

describe("BatchMergeFinishDialog 仅重试失败", () => {
  it("有冲突/失败时显示按钮，点击 emit 冲突+失败分支对", async () => {
    const wrapper = mountDialog(summaryWithIssues);
    await nextTick();

    const btn = findButton("仅重试失败 (2)");
    expect(btn).toBeTruthy();
    btn!.click();
    await nextTick();

    const inner = wrapper.findComponent(BatchMergeFinishDialog);
    const emitted = inner.emitted("retry-failed");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual([
      { source: "feat", target: "gray" },
      { source: "feat", target: "test" },
    ]);
    wrapper.unmount();
  });

  it("无冲突/失败时不显示重试按钮", async () => {
    const wrapper = mountDialog({
      ok: true,
      merged: [{ source: "feat", target: "dev" }],
      conflicts: [],
      failures: [],
      noop: [],
    });
    await nextTick();

    expect(findButton("仅重试失败")).toBeNull();
    wrapper.unmount();
  });
});
