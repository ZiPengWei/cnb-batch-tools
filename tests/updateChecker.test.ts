import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({
  default: { get: axiosGet },
}));

import {
  RELEASES_PAGE_URL,
  fetchLatestRelease,
  isNewerVersion,
  normalizeVersion,
} from "../src/main/services/updateChecker";

/** 更新检查：版本号规范化、语义化比较、GitHub Release 拉取 */

describe("normalizeVersion", () => {
  it("去掉 v 前缀并拆为数字段", () => {
    expect(normalizeVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(normalizeVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(normalizeVersion("V2.0.0")).toEqual([2, 0, 0]);
  });

  it("非法输入按 0 处理", () => {
    expect(normalizeVersion("")).toEqual([0]);
    expect(normalizeVersion("1.x.3")).toEqual([1, 0, 3]);
    expect(normalizeVersion("abc")).toEqual([0]);
  });
});

describe("isNewerVersion", () => {
  it("patch/minor/major 更高时返回 true", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("相同或更低版本返回 false", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(false);
    expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
  });

  it("段数不足时补 0 比较", () => {
    expect(isNewerVersion("1.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0")).toBe(false);
  });

  it("数字逐段比较（不是字符串比较）", () => {
    // 字符串比较会得出 1.10 < 1.9 的错误结论
    expect(isNewerVersion("1.9.0", "1.10.0")).toBe(true);
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(false);
  });

  it("latest 带 v 前缀也能正确比较", () => {
    expect(isNewerVersion("1.0.0", "v1.0.1")).toBe(true);
    expect(isNewerVersion("v1.0.1", "v1.0.1")).toBe(false);
  });
});

describe("fetchLatestRelease", () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it("直连成功时解析 tag_name/html_url", async () => {
    axiosGet.mockResolvedValueOnce({
      data: {
        tag_name: "v1.2.0",
        name: "v1.2.0",
        html_url: "https://github.com/ZiPengWei/batch-tools/releases/tag/v1.2.0",
        body: "release notes",
      },
    });

    const rel = await fetchLatestRelease();
    expect(rel.tagName).toBe("v1.2.0");
    expect(rel.version).toBe("1.2.0");
    expect(rel.htmlUrl).toContain("/releases/tag/v1.2.0");
    // 首次尝试应为直连（proxy: false）
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet.mock.calls[0][1]?.proxy).toBe(false);
  });

  it("直连失败后走环境代理重试并成功", async () => {
    axiosGet
      .mockRejectedValueOnce(new Error("connect timeout"))
      .mockResolvedValueOnce({
        data: { tag_name: "v2.0.0", html_url: "https://example.com/r2" },
      });

    const rel = await fetchLatestRelease();
    expect(rel.version).toBe("2.0.0");
    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(axiosGet.mock.calls[1][1]?.proxy).toBeUndefined();
  });

  it("两次尝试都失败时抛出错误（调用方兜底显示）", async () => {
    axiosGet.mockRejectedValue(new Error("offline"));
    await expect(fetchLatestRelease()).rejects.toThrow("offline");
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it("响应缺少 tag_name 时抛出错误", async () => {
    axiosGet.mockResolvedValueOnce({ data: {} });
    await expect(fetchLatestRelease()).rejects.toThrow("tag_name");
  });

  it("Release 页地址指向 latest", () => {
    expect(RELEASES_PAGE_URL).toBe(
      "https://github.com/ZiPengWei/cnb-batch-tools/releases/latest"
    );
  });
});
