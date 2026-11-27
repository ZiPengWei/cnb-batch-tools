import { expect, test } from "@playwright/test";

async function waitForAnyButton(list: any) {
  await expect
    .poll(async () => {
      return await list.locator("button").count();
    })
    .toBeGreaterThan(0);
}

test("三列表支持独立滚动", async ({ page }) => {
  await page.goto("/");

  const projectList = page.locator('[aria-label="项目列表"]');
  const sourceList = page.locator('[aria-label="源分支列表"]');
  const targetList = page.locator('[aria-label="目标分支列表"]');

  await expect(projectList).toBeVisible();
  await expect(sourceList).toBeVisible();
  await expect(targetList).toBeVisible();

  await waitForAnyButton(projectList);
  await waitForAnyButton(sourceList);
  await waitForAnyButton(targetList);

  const projectDims = await projectList.evaluate((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      rectHeight: rect.height,
      overflowY: cs.overflowY,
      position: cs.position,
    };
  });
  if (projectDims.overflowY !== "auto" && projectDims.overflowY !== "scroll") {
    throw new Error(`项目列表 overflowY 非滚动：${JSON.stringify(projectDims)}`);
  }
  if (!(projectDims.scrollHeight > projectDims.clientHeight)) {
    throw new Error(`项目列表未产生溢出滚动：${JSON.stringify(projectDims)}`);
  }

  const projectScrollTopBefore = await sourceList.evaluate(
    (el: HTMLElement) => el.scrollTop
  );

  await projectList.evaluate((el: HTMLElement) => {
    el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
    el.dispatchEvent(new Event("scroll"));
  });

  await expect
    .poll(async () => {
      return await projectList.evaluate((el: HTMLElement) => el.scrollTop);
    })
    .toBeGreaterThan(0);

  // 滚动项目列表不影响其他列表
  const sourceScrollTopAfter = await sourceList.evaluate(
    (el: HTMLElement) => el.scrollTop
  );
  expect(sourceScrollTopAfter).toBe(projectScrollTopBefore);
});

test("合并弹窗日志会自动滚动到底部", async ({ page }) => {
  await page.goto("/");

  const targetList = page.locator('[aria-label="目标分支列表"]');
  await expect(targetList).toBeVisible();
  await waitForAnyButton(targetList);
  await targetList.locator("button:not([disabled])").first().click();

  const startBtn = page.getByRole("button", { name: /^合并/ }).first();
  await expect(startBtn).toBeEnabled();
  await startBtn.click();
  await page.getByRole("button", { name: "确认" }).click();

  const wrap = page.locator('[data-testid="confirm-log-wrapper"]');
  await expect(wrap).toBeVisible();

  await expect(wrap.getByText(/E2E step/).first()).toBeVisible();

  const logContent = wrap.locator(".n-log .n-scrollbar-container");
  const fallback = wrap.locator(".n-log");
  const content = (await logContent.count()) ? logContent.first() : fallback.first();

  await expect
    .poll(async () => {
      return await content.evaluate((el: HTMLElement) => el.scrollHeight > el.clientHeight);
    })
    .toBe(true);

  await expect
    .poll(async () => {
      return await content.evaluate((el: HTMLElement) => {
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return true;
        return el.scrollTop >= max - 4;
      });
    })
    .toBe(true);
});
