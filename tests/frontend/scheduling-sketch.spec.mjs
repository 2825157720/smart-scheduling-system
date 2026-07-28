import { expect, test } from "@playwright/test";
import { buildFrontendFixture, FIXED_NOW } from "./fixtures/schedule-fixture.mjs";

const fixture = buildFrontendFixture();
const allowedHosts = new Set(["127.0.0.1:3001", "localhost:3001"]);

async function installStableClock(page) {
  await page.addInitScript((fixedNow) => {
    const NativeDate = Date;
    const fixedTime = new NativeDate(fixedNow).valueOf();
    class FixedDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedTime]));
      }
      static now() {
        return fixedTime;
      }
    }
    FixedDate.parse = NativeDate.parse;
    FixedDate.UTC = NativeDate.UTC;
    window.Date = FixedDate;
  }, FIXED_NOW);
}

async function installApiFixture(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;

    if (path === "/api/server-info") {
      body = { ip: "127.0.0.1", url: "http://127.0.0.1:3001" };
    } else if (path === "/api/positions") {
      body = fixture.positions;
    } else if (path === "/api/staff") {
      body = fixture.staff;
    } else if (path === "/api/groups") {
      body = fixture.groups;
    } else if (/^\/api\/schedule\/\d{4}\/\d{1,2}$/.test(path)) {
      body = fixture.schedule;
    } else if (/^\/api\/hidden-days\/\d{4}\/\d{1,2}$/.test(path)) {
      body = [];
    } else if (path === "/api/memo" && request.method() === "GET") {
      body = fixture.memo;
    } else {
      body = { success: true, memo: fixture.memo };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(body)
    });
  });
}

test("手绘纸张主题在固定排班数据下稳定呈现", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  const failedResources = [];
  const externalRequests = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResources.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && !allowedHosts.has(url.host)) {
      externalRequests.push(request.url());
    }
  });

  await installStableClock(page);
  await installApiFixture(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#tbl-body > tr")).toHaveCount(14);
  await expect(page.locator("#tbl-head tr:first-child .col-day")).toHaveCount(31);
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "Kalam"', "Schedule"),
      document.fonts.load('16px "Patrick Hand"', "Memo"),
      document.fonts.load('16px "LXGW WenKai Screen"', "排班")
    ]);
    await document.fonts.ready;
  });

  await expect(page.locator(".cell-on").first()).toBeVisible();
  await expect(page.locator(".cell-off").first()).toBeVisible();
  await expect(page.locator(".cell-sub").first()).toBeVisible();
  await expect(page.locator(".cell-pending").first()).toBeVisible();
  await expect(page.locator(".cell-split").first()).toBeVisible();
  await expect(page.locator(".split-slot.status-on").first()).toBeVisible();
  await expect(page.locator(".split-slot.status-off").first()).toBeVisible();
  await expect(page.locator(".split-slot.status-substitute").first()).toBeVisible();
  await expect(page.locator(".split-slot.status-pending").first()).toBeVisible();

  const pageOverflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
    tableCanScroll: document.querySelector("#schedule-wrap").scrollWidth > document.querySelector("#schedule-wrap").clientWidth
  }));
  expect(pageOverflow.document).toBeLessThanOrEqual(1);
  expect(pageOverflow.body).toBeLessThanOrEqual(1);
  expect(pageOverflow.tableCanScroll).toBe(true);

  const memoGeometry = await page.evaluate(() => {
    const panel = document.querySelector("#memo-panel").getBoundingClientRect();
    const textarea = document.querySelector("#memo-text").getBoundingClientRect();
    const meta = document.querySelector("#memo-meta").getBoundingClientRect();
    return {
      metaInsidePanel: meta.bottom <= panel.bottom - 8,
      textareaBeforeMeta: textarea.bottom <= meta.top - 4
    };
  });
  expect(memoGeometry.metaInsidePanel).toBe(true);
  expect(memoGeometry.textareaBeforeMeta).toBe(true);

  await expect(page.getByRole("button", { name: "当天排班" })).toBeVisible();
  await expect(page.getByRole("button", { name: "导入排休" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot("schedule-sketch.png");

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedResources).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("主要弹窗、右键菜单与响应式工具条仍可操作", async ({ page }) => {
  await installStableClock(page);
  await installApiFixture(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#tbl-body > tr")).toHaveCount(14);

  const sideTabs = page.locator(".side-tab");
  for (let index = 0; index < await sideTabs.count(); index += 1) {
    await sideTabs.nth(index).click();
    await expect(sideTabs.nth(index)).toHaveClass(/active/);
  }

  const stickyGeometry = await page.evaluate(async () => {
    const area = document.querySelector("#schedule-area");
    const wrap = document.querySelector("#schedule-wrap");
    const scroller = window.matchMedia("(max-width: 899px)").matches ? wrap : area;
    scroller.scrollLeft = 360;
    scroller.scrollTop = 120;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const scrollerRect = scroller.getBoundingClientRect();
    const firstHeaderRect = document.querySelector("#tbl-head tr:first-child th").getBoundingClientRect();
    return {
      canScrollVertically: scroller.scrollHeight > scroller.clientHeight,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
      stickyOffset: Math.abs(firstHeaderRect.top - scrollerRect.top)
    };
  });
  expect(stickyGeometry.scrollLeft).toBeGreaterThan(0);
  if (stickyGeometry.canScrollVertically) {
    expect(stickyGeometry.scrollTop).toBeGreaterThan(0);
    expect(stickyGeometry.stickyOffset).toBeLessThanOrEqual(14);
  }

  await page.getByRole("button", { name: "当天排班" }).click();
  await expect(page.getByRole("dialog", { name: "当天排班" })).toBeVisible();
  await page.getByRole("button", { name: "关闭当天排班弹窗" }).click();

  await page.getByRole("button", { name: "导入排休" }).click();
  await expect(page.getByRole("dialog", { name: "导入排休" })).toBeVisible();
  await page.getByRole("button", { name: "关闭导入排休弹窗" }).click();

  await page.locator('.cell[data-day="16"]').first().click({ button: "right" });
  await expect(page.locator("#ctx-menu")).toBeVisible();
  await page.evaluate(() => {
    document.querySelector("#ctx-menu").style.display = "none";
  });

  await page.getByRole("button", { name: "列设置" }).click();
  await expect(page.getByRole("dialog", { name: "列设置" })).toBeVisible();
  await page.getByRole("button", { name: "关闭列设置弹窗" }).click();

  await page.getByRole("button", { name: "人员/岗位管理" }).click();
  await expect(page.getByRole("dialog", { name: "人员 / 岗位管理" })).toBeVisible();
  await page.getByRole("button", { name: "关闭人员岗位管理弹窗" }).click();

  const nestedDialogs = [
    ["showAddGroup", "group-modal", "关闭小组编辑弹窗"],
    ["showAddStaff", "staff-modal", "关闭人员编辑弹窗"],
    ["showAddPos", "pos-modal", "关闭岗位编辑弹窗"]
  ];
  for (const [openFunction, dialogId, closeLabel] of nestedDialogs) {
    await page.evaluate((functionName) => window[functionName](), openFunction);
    await expect(page.locator(`#${dialogId}`)).toBeVisible();
    await page.getByRole("button", { name: closeLabel }).click();
  }

  await page.evaluate(() => window.loading(true));
  await expect(page.locator("#loading")).toBeVisible();
  await page.evaluate(() => window.loading(false));
  await expect(page.locator("#loading")).toBeHidden();

  await page.evaluate(() => window.showPollIndicator());
  await expect(page.locator("#poll-indicator")).toHaveText("同步中...");
  await expect(page.locator("#poll-indicator")).toHaveText("✓ 已同步");

  await page.getByRole("button", { name: "编辑" }).click();
  await expect(page.locator("#memo-text")).toBeFocused();
  const memoFocus = await page.locator("#memo-text").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      style: style.outlineStyle,
      width: style.outlineWidth
    };
  });
  expect(memoFocus).toEqual({
    color: "rgb(35, 88, 165)",
    style: "solid",
    width: "3px"
  });
  await page.getByRole("button", { name: "取消" }).click();

  const rows = page.locator("#tbl-body > tr");
  await rows.nth(0).dragTo(rows.nth(1));
  await expect(page.locator("#toast")).toHaveText("岗位顺序已保存");
  await expect(page.locator("#toast")).toHaveClass(/show/);

  const geometry = await page.evaluate(() => {
    const primary = document.querySelector(".topbar-primary-actions").getBoundingClientRect();
    const tools = document.querySelector(".topbar-tool-actions");
    return {
      primaryVisible: primary.width > 0 && primary.height > 0,
      toolsScrollable: tools.scrollWidth >= tools.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(geometry.primaryVisible).toBe(true);
  expect(geometry.toolsScrollable).toBe(true);
  expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
});

test("1366、320、200% 等效视口与字体失败回退保持可用", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440x900", "补充验收只需执行一次");

  const cases = [
    { name: "desktop-1366", viewport: { width: 1366, height: 768 } },
    { name: "mobile-320", viewport: { width: 320, height: 720 } },
    // 1366×768 在 200% 浏览器缩放下的 CSS 可视区约为 683×384。
    { name: "zoom-200-equivalent", viewport: { width: 683, height: 384 } },
    { name: "font-fallback", viewport: { width: 390, height: 844 }, blockFonts: true }
  ];

  for (const acceptanceCase of cases) {
    const context = await browser.newContext({
      viewport: acceptanceCase.viewport,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce"
    });
    const page = await context.newPage();
    await installStableClock(page);
    if (acceptanceCase.blockFonts) {
      await page.route("**/fonts/**", (route) => route.abort("failed"));
    }
    await installApiFixture(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#tbl-body > tr")).toHaveCount(14);
    await expect(page.getByRole("button", { name: "当天排班" })).toBeVisible();
    await expect(page.getByRole("button", { name: "导入排休" })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const schedule = document.querySelector("#schedule-area").getBoundingClientRect();
      const side = document.querySelector("#side-panel").getBoundingClientRect();
      const tools = document.querySelector(".topbar-tool-actions");
      return {
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scheduleCanScroll: document.querySelector("#schedule-wrap").scrollWidth
          > document.querySelector("#schedule-wrap").clientWidth,
        sideBelowSchedule: side.top >= schedule.bottom - 1,
        toolsOverflow: tools.scrollWidth - tools.clientWidth,
        pollVisible: document.querySelector("#poll-indicator").getBoundingClientRect().width > 0
      };
    });

    expect(geometry.pageOverflow, acceptanceCase.name).toBeLessThanOrEqual(1);
    expect(geometry.scheduleCanScroll, acceptanceCase.name).toBe(true);
    if (acceptanceCase.name === "desktop-1366") {
      expect(geometry.sideBelowSchedule).toBe(false);
      expect(geometry.toolsOverflow).toBeLessThanOrEqual(1);
      expect(geometry.pollVisible).toBe(true);
    }
    if (acceptanceCase.name === "mobile-320") {
      expect(geometry.sideBelowSchedule).toBe(true);
      expect(geometry.toolsOverflow).toBeGreaterThan(1);
    }
    if (acceptanceCase.blockFonts) {
      await expect(page.locator("#memo-title")).toBeVisible();
      await expect(page.locator("#schedule-table")).toBeVisible();
    }
    await context.close();
  }
});
