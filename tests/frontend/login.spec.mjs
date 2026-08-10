import { expect, test } from "@playwright/test";
import { TEST_AUTH_PASSWORD, TEST_AUTH_USERNAME } from "./fixtures/auth-fixture.mjs";

test.use({ storageState: { cookies: [], origins: [] } });

test("未登录访问会进入登录页，正确凭据建立会话并可退出", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByRole("heading", { name: "智能排班系统" })).toBeVisible();

  await page.getByLabel("账号").fill(TEST_AUTH_USERNAME);
  await page.getByLabel("密码").fill(TEST_AUTH_PASSWORD);
  await page.getByRole("button", { name: "登录并进入" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === "paiban_session");
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Strict");

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
