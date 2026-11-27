import { describe, expect, it } from "vitest";
import {
  buildHighlightSegments,
  getBranchTone,
  parseMergeProgress,
  splitRepoPath,
} from "../src/renderer/utils/branchMatch";

describe("branchMatch 工具", () => {
  it("splitRepoPath 正确拆分命名空间与主仓库名", () => {
    expect(splitRepoPath("org/team/pay-service")).toEqual({
      namespace: "org/team",
      name: "pay-service",
    });
    expect(splitRepoPath("single-repo")).toEqual({
      namespace: "",
      name: "single-repo",
    });
  });

  it("getBranchTone 识别常见分支前缀语义", () => {
    expect(getBranchTone("main")).toBe("main");
    expect(getBranchTone("dev")).toBe("env");
    expect(getBranchTone("feat/login")).toBe("feat");
    expect(getBranchTone("hotfix/crash")).toBe("fix");
    expect(getBranchTone("release/2.1")).toBe("release");
    expect(getBranchTone("custom-branch")).toBe("default");
  });

  it("buildHighlightSegments 支持连续子串与子序列高亮", () => {
    expect(buildHighlightSegments("feat/order-pay", "order")).toEqual([
      { text: "feat/", hit: false },
      { text: "order", hit: true },
      { text: "-pay", hit: false },
    ]);
    expect(buildHighlightSegments("release/10", "r10")).toEqual([
      { text: "r", hit: true },
      { text: "elease/", hit: false },
      { text: "10", hit: true },
    ]);
  });

  it("parseMergeProgress 按真实日志流精准更新目标状态与进度", () => {
    const res = parseMergeProgress(
      ["dev", "test", "gray", "main"],
      [
        "正在处理: feat -> dev",
        "✓ 合并成功: feat -> dev (PR #11)",
        "正在处理: feat -> test",
        "✗ 检测到冲突，已跳过并取消 PR: feat -> test (PR #12)",
        "正在处理: feat -> gray",
        "无变更，跳过: feat -> gray",
        "正在处理: feat -> main",
      ],
    );
    expect(res.statuses).toEqual({
      dev: "merged",
      test: "conflict",
      gray: "noop",
      main: "running",
    });
    expect(res.completed).toBe(3);
    expect(res.total).toBe(4);
    expect(res.percent).toBe(86);
  });
});
