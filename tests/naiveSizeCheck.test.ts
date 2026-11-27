import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

function walk(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip node_modules and build outputs
      if (entry.name === "node_modules" || entry.name.startsWith("dist"))
        continue;
      walk(p, files);
    } else {
      files.push(p);
    }
  }
  return files;
}

function read(file: string): string {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return "";
  }
}

function findNaiveTagViolations(
  content: string
): { tag: string; kind: string; snippet: string }[] {
  const violations: { tag: string; kind: string; snippet: string }[] = [];

  const matches = content.match(/<n-[a-z0-9-]+[^>]*>/gi) || [];
  for (const m of matches) {
    const tag = (
      m.match(/^<\s*(n-[a-z0-9-]+)/i)?.[1] || "unknown"
    ).toLowerCase();
    if (/\sclass\s*=/.test(m))
      violations.push({ tag, kind: "class", snippet: m });
    if (/\sstyle\s*=/.test(m))
      violations.push({ tag, kind: "style", snippet: m });
    if (/\ssize\s*=/.test(m) || /\s:size\s*=/.test(m))
      violations.push({ tag, kind: "size", snippet: m });
  }

  const configMatches = content.match(/<n-config-provider[^>]*>/gi) || [];
  for (const m of configMatches) {
    // theme-overrides 由 src/renderer/ui/theme.ts 统一管理设计系统 Token，其余底层覆写仍禁止
    const forbidden = [
      "cls-prefix",
      "namespace",
      "breakpoints",
    ];
    for (const key of forbidden) {
      const re = new RegExp(`\\s(:)?${key}\\s*=`, "i");
      if (re.test(m))
        violations.push({ tag: "n-config-provider", kind: key, snippet: m });
    }
  }

  return violations;
}

describe("Naive UI 使用规范：统一主题与组件干净用法", () => {
  it("所有 Naive UI 组件不直接使用内联 class/size/style，且不覆写底层前缀与断点", () => {
    const base = path.resolve(__dirname, "..", "src");
    const files = walk(base).filter((f) => f.endsWith(".vue"));
    const allViolations: {
      file: string;
      tag: string;
      kind: string;
      snippet: string;
    }[] = [];
    for (const f of files) {
      const content = read(f);
      const vs = findNaiveTagViolations(content);
      for (const v of vs) allViolations.push({ file: f, ...v });
    }
    const message =
      "以下 Naive UI 组件用法不符合规范：\n" +
      allViolations
        .map(
          (v) =>
            `- ${path.relative(base, v.file)} :: ${v.tag} :: ${
              v.kind
            } :: ${v.snippet.replace(/\s+/g, " ").slice(0, 200)}`
        )
        .join("\n");
    expect(allViolations.length, message).toBe(0);
  });
});
