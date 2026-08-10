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

async function installApiFixture(page, apiFixture = fixture) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body;

    if (path === "/api/server-info") {
      body = { ip: "127.0.0.1", url: "http://127.0.0.1:3001" };
    } else if (path === "/api/positions") {
      body = apiFixture.positions;
    } else if (path === "/api/staff") {
      body = apiFixture.staff;
    } else if (path === "/api/groups") {
      body = apiFixture.groups;
    } else if (/^\/api\/schedule\/\d{4}\/\d{1,2}$/.test(path)) {
      body = apiFixture.schedule;
    } else if (/^\/api\/hidden-days\/\d{4}\/\d{1,2}$/.test(path)) {
      body = [];
    } else if (path === "/api/memo" && request.method() === "GET") {
      body = apiFixture.memo;
    } else {
      body = { success: true, memo: apiFixture.memo };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(body)
    });
  });
}

test("人员管理的三项替班限制互斥，手工候选遵守周五至周日边界", async ({ page }) => {
  await installStableClock(page);
  await installApiFixture(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "人员/岗位管理" }).click();
  await expect(page.locator("#staff-tbody .tag-weekend")).toHaveText("仅周末");
  await page.getByRole("button", { name: "＋ 新增人员" }).click();

  const saturdayOnly = page.locator("#staff-sat");
  const weekendOnly = page.locator("#staff-weekend");
  const noSubstitute = page.locator("#staff-no-sub");
  await saturdayOnly.check();
  await expect(weekendOnly).not.toBeChecked();
  await expect(noSubstitute).not.toBeChecked();
  await weekendOnly.check();
  await expect(saturdayOnly).not.toBeChecked();
  await noSubstitute.check();
  await expect(saturdayOnly).not.toBeChecked();
  await expect(weekendOnly).not.toBeChecked();
  await saturdayOnly.check();
  await expect(noSubstitute).not.toBeChecked();
  await page.getByRole("button", { name: "关闭人员编辑弹窗" }).click();
  await page.getByRole("button", { name: "关闭人员岗位管理弹窗" }).click();

  await page.locator('.cell[data-day="17"]').first().click({ button: "right" });
  await expect(page.locator("#ctx-menu")).not.toContainText("宁秋");
  await page.evaluate(() => {
    document.querySelector("#ctx-menu").style.display = "none";
  });

  await page.locator('.cell[data-day="21"]').first().click({ button: "right" });
  await expect(page.locator("#ctx-menu")).toContainText("宁秋");
  await expect(page.locator("#ctx-menu")).not.toContainText("乔松");
  await expect(page.locator("#ctx-menu")).not.toContainText("沈禾");
});

test("API 返回的人员、岗位和小组名称只作为文本渲染", async ({ page }) => {
  const xss = '<img src=x onerror="window.__xssProbe=1">';
  const untrusted = structuredClone(fixture);
  untrusted.staff[0].name = xss;
  untrusted.groups[0].name = xss;
  untrusted.groups[0].member_names[0] = xss;
  untrusted.positions[0].name = xss;
  untrusted.positions[0].default_person = xss;
  untrusted.schedule["1"][untrusted.positions[0].id] = { status: "substitute", person: xss };

  await page.addInitScript(() => { window.__xssProbe = 0; });
  await installStableClock(page);
  await installApiFixture(page, untrusted);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#tbl-body")).toContainText(xss);
  await expect(page.locator("#tbl-body img")).toHaveCount(0);
  await page.getByRole("button", { name: "人员/岗位管理" }).click();
  await expect(page.locator("#staff-tbody")).toContainText(xss);
  await page.getByRole("button", { name: "小组管理" }).click();
  await expect(page.locator("#group-tbody")).toContainText(xss);
  await expect(page.evaluate(() => window.__xssProbe)).resolves.toBe(0);
});

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

test("只显示 5 天时列宽稳定且普通格与拆分格统一", async ({ page }) => {
  await installStableClock(page);
  await installApiFixture(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#tbl-body > tr")).toHaveCount(14);

  await page.getByRole("button", { name: "列设置" }).click();
  const dialog = page.getByRole("dialog", { name: "列设置" });
  await dialog.getByRole("button", { name: "全不选", exact: true }).click();
  for (const day of [1, 2, 3, 4, 5]) {
    await dialog.locator(`input[data-day="${day}"]`).check();
  }
  await dialog.getByRole("button", { name: "应用", exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator("#tbl-head tr:first-child .col-day")).toHaveCount(5);
  await expect(page.locator('.cell-split[data-day="3"]')).toHaveCount(1);

  const geometry = await page.evaluate(() => {
    const headerCells = [...document.querySelectorAll("#tbl-head tr:first-child th")];
    const dayHeaders = headerCells.slice(3);
    const firstBodyRow = document.querySelector("#tbl-body > tr");
    const bodyDayCells = [...firstBodyRow.cells].slice(3);
    const split = document.querySelector('.cell-split[data-day="3"]');
    const slots = [...split.querySelectorAll(".split-slot")];
    const regular = document.querySelector('.cell:not(.cell-split)[data-day="3"]');
    const table = document.querySelector("#schedule-table");
    const wrap = document.querySelector("#schedule-wrap");

    return {
      fixedHeaderWidths: headerCells.slice(0, 3).map(
        (element) => element.getBoundingClientRect().width
      ),
      headerWidths: dayHeaders.map(
        (element) => element.getBoundingClientRect().width
      ),
      bodyWidths: bodyDayCells.map(
        (element) => element.getBoundingClientRect().width
      ),
      regularWidth: regular.getBoundingClientRect().width,
      splitWidth: split.getBoundingClientRect().width,
      slotWidths: slots.map(
        (element) => element.getBoundingClientRect().width
      ),
      tableWidth: table.getBoundingClientRect().width,
      wrapWidth: wrap.clientWidth,
      tableCanScroll: wrap.scrollWidth > wrap.clientWidth,
      documentOverflow:
        document.documentElement.scrollWidth
        - document.documentElement.clientWidth,
      bodyOverflow:
        document.body.scrollWidth - document.body.clientWidth
    };
  });

  const spread = (values) => Math.max(...values) - Math.min(...values);

  expect(geometry.fixedHeaderWidths[0]).toBeCloseTo(108, 0);
  expect(geometry.fixedHeaderWidths[1]).toBeCloseTo(72, 0);
  expect(geometry.fixedHeaderWidths[2]).toBeCloseTo(48, 0);
  expect(spread(geometry.headerWidths)).toBeLessThanOrEqual(0.5);
  expect(spread(geometry.bodyWidths)).toBeLessThanOrEqual(0.5);
  for (const width of geometry.headerWidths) {
    expect(width).toBeGreaterThanOrEqual(55.5);
  }
  geometry.headerWidths.forEach((width, index) => {
    expect(Math.abs(width - geometry.bodyWidths[index]))
      .toBeLessThanOrEqual(0.5);
  });

  expect(Math.abs(geometry.regularWidth - geometry.splitWidth))
    .toBeLessThanOrEqual(0.5);
  expect(geometry.slotWidths).toHaveLength(2);
  expect(Math.abs(geometry.slotWidths[0] - geometry.slotWidths[1]))
    .toBeLessThanOrEqual(0.5);
  expect(geometry.slotWidths[0] / (geometry.slotWidths[0] + geometry.slotWidths[1]))
    .toBeCloseTo(0.5, 2);
  if (geometry.wrapWidth >= geometry.tableWidth + 80) {
    expect(geometry.wrapWidth - geometry.tableWidth).toBeGreaterThanOrEqual(80);
  } else {
    expect(geometry.tableCanScroll).toBe(true);
  }
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.bodyOverflow).toBeLessThanOrEqual(1);

  await expect(page.locator("#toast")).not.toHaveClass(/show/, { timeout: 5_000 });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot("hidden-five-days.png");
});

test("普通姓名与拆分姓名完整显示并保留上午下午语义", async ({ page }) => {
  const nameFixture = buildFrontendFixture();
  const regularPid = nameFixture.positions[2].id;
  const splitPid = nameFixture.positions[4].id;
  nameFixture.schedule["3"][regularPid] = {
    status: "substitute",
    person: "欧阳明月"
  };
  nameFixture.schedule["3"][splitPid] = {
    status: "split",
    person: "诸葛青云",
    slots: {
      am: { status: "on", person: "诸葛青云", workload: 6 },
      pm: { status: "substitute", person: "司马南风", workload: 6 }
    }
  };

  await installStableClock(page);
  await installApiFixture(page, nameFixture);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#tbl-body > tr")).toHaveCount(14);

  const regular = page.locator(
    `.cell-sub[data-pid="${regularPid}"][data-day="3"]`
  );
  const split = page.locator(
    `.cell-split[data-pid="${splitPid}"][data-day="3"]`
  );
  const am = split.locator(":scope > .split-slot.slot-am");
  const pm = split.locator(":scope > .split-slot.slot-pm");
  const amPerson = am.locator(":scope > .slot-person");
  const pmPerson = pm.locator(":scope > .slot-person");

  await expect(regular).toHaveText("欧阳明月");
  await expect(regular).toHaveAttribute("data-person", "欧阳明月");
  await expect(regular).toHaveAttribute("title", /欧阳明月/);
  await expect(split.locator(".slot-label")).toHaveCount(0);
  await expect(am).toHaveAttribute("data-slot", "am");
  await expect(pm).toHaveAttribute("data-slot", "pm");
  await expect(am).toHaveAttribute("title", /^上午：.*诸葛青云/);
  await expect(pm).toHaveAttribute("title", /^下午：.*司马南风/);
  await expect(am.locator(":scope > .sr-only")).toHaveText(/^上午：.*诸葛青云/);
  await expect(pm.locator(":scope > .sr-only")).toHaveText(/^下午：.*司马南风/);
  await expect(amPerson).toHaveText("诸葛青云");
  await expect(pmPerson).toHaveText("司马南风");

  const metrics = await page.evaluate(
    ({ regularSelector, splitSelector }) => {
      const regularElement = document.querySelector(regularSelector);
      const splitElement = document.querySelector(splitSelector);
      const amElement = splitElement.querySelector(":scope > .split-slot.slot-am");
      const pmElement = splitElement.querySelector(":scope > .split-slot.slot-pm");

      const measureText = (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const box = element.getBoundingClientRect();
        const textBox = range.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          text: element.textContent.trim(),
          textOverflow: style.textOverflow,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          boxLeft: box.left,
          boxRight: box.right,
          textLeft: textBox.left,
          textRight: textBox.right
        };
      };

      return {
        regular: measureText(regularElement),
        amPerson: measureText(amElement.querySelector(":scope > .slot-person")),
        pmPerson: measureText(pmElement.querySelector(":scope > .slot-person")),
        amLeft: amElement.getBoundingClientRect().left,
        amRight: amElement.getBoundingClientRect().right,
        pmLeft: pmElement.getBoundingClientRect().left,
        dayWidths: [...document.querySelectorAll("#tbl-head tr:first-child .col-day")]
          .map((element) => element.getBoundingClientRect().width),
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bodyOverflow: document.body.scrollWidth - document.body.clientWidth
      };
    },
    {
      regularSelector: `.cell-sub[data-pid="${regularPid}"][data-day="3"]`,
      splitSelector: `.cell-split[data-pid="${splitPid}"][data-day="3"]`
    }
  );

  for (const [metric, fullName] of [
    [metrics.regular, "欧阳明月"],
    [metrics.amPerson, "诸葛青云"],
    [metrics.pmPerson, "司马南风"]
  ]) {
    expect(metric.text).toBe(fullName);
    expect(metric.text).not.toMatch(/\.{3}|…/);
    expect(metric.textOverflow).not.toBe("ellipsis");
    expect(metric.scrollWidth).toBeLessThanOrEqual(metric.clientWidth + 1);
    expect(metric.scrollHeight).toBeLessThanOrEqual(metric.clientHeight + 1);
    expect(metric.textLeft).toBeGreaterThanOrEqual(metric.boxLeft - 1);
    expect(metric.textRight).toBeLessThanOrEqual(metric.boxRight + 1);
  }

  const spread = (values) => Math.max(...values) - Math.min(...values);
  expect(metrics.dayWidths[0]).toBeGreaterThan(56);
  expect(spread(metrics.dayWidths)).toBeLessThanOrEqual(0.5);
  expect(metrics.amLeft).toBeLessThan(metrics.pmLeft);
  expect(metrics.amRight).toBeLessThanOrEqual(metrics.pmLeft + 1);
  expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
  expect(metrics.bodyOverflow).toBeLessThanOrEqual(1);

  const initialDayWidth = metrics.dayWidths[0];
  const savedName = "欧阳\"><b data-name-injected>明</b>&'";
  await page.evaluate(
    async ({ pid, person }) => {
      await window.saveCellState(
        pid,
        4,
        "substitute",
        person,
        { skipAutoHooks: true }
      );
    },
    { pid: regularPid, person: savedName }
  );

  const savedCell = page.locator(
    `.cell-sub[data-pid="${regularPid}"][data-day="4"]`
  );
  await expect(savedCell).toHaveText(savedName);
  await expect(savedCell).toHaveAttribute("data-person", savedName);
  await expect(savedCell).toHaveAttribute("title", `替班: ${savedName}`);
  await expect(page.locator("[data-name-injected]")).toHaveCount(0);

  const savedWidths = await page
    .locator("#tbl-head tr:first-child .col-day")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width)
    );
  expect(savedWidths[0]).toBeGreaterThan(initialDayWidth);
  expect(spread(savedWidths)).toBeLessThanOrEqual(0.5);

  await page.evaluate(
    async ({ pid, person }) => {
      await window.saveCellState(
        pid,
        4,
        "on",
        person,
        { skipAutoHooks: true }
      );
    },
    { pid: regularPid, person: nameFixture.positions[2].default_person }
  );
  const restoredWidths = await page
    .locator("#tbl-head tr:first-child .col-day")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width)
    );
  expect(spread(restoredWidths)).toBeLessThanOrEqual(0.5);
  expect(restoredWidths[0]).toBeCloseTo(initialDayWidth, 0);

  await page.getByRole("button", { name: "列设置" }).click();
  const columnDialog = page.getByRole("dialog", { name: "列设置" });
  await columnDialog.locator('input[data-day="3"]').uncheck();
  await columnDialog.getByRole("button", { name: "应用", exact: true }).click();
  await expect(columnDialog).toBeHidden();

  const hiddenLongNameWidths = await page
    .locator("#tbl-head tr:first-child .col-day")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width)
    );
  expect(hiddenLongNameWidths).toHaveLength(30);
  expect(spread(hiddenLongNameWidths)).toBeLessThanOrEqual(0.5);
  expect(hiddenLongNameWidths[0]).toBeCloseTo(56, 0);

  await page.getByRole("button", { name: "列设置" }).click();
  await columnDialog.locator('input[data-day="3"]').check();
  await columnDialog.getByRole("button", { name: "应用", exact: true }).click();
  await expect(columnDialog).toBeHidden();

  const shownLongNameWidths = await page
    .locator("#tbl-head tr:first-child .col-day")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width)
    );
  expect(shownLongNameWidths).toHaveLength(31);
  expect(spread(shownLongNameWidths)).toBeLessThanOrEqual(0.5);
  expect(shownLongNameWidths[0]).toBeCloseTo(initialDayWidth, 0);
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
