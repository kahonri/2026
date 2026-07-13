import { test, expect } from "@playwright/test";

const PLACE = "osaka";

async function clearStorage(page: import("@playwright/test").Page) {
  await page.goto("/reading");
  await page.evaluate(() => localStorage.removeItem("oshi-uranai-birth"));
}

test("時刻既知：太陽・月・アセンダントが出て、週間で実テキストが表示される", async ({ page }) => {
  await clearStorage(page);
  await page.reload();
  await page.locator("input[name=birthdate]").fill("1990-03-15");
  await page.locator("input[name=birthtime]").fill("14:30");
  await page.locator("select[name=place]").selectOption(PLACE);
  await page.locator("button[type=submit]").click();

  await expect(page.locator(".chart-summary")).toContainText("アセンダント");
  await expect(page.locator(".note")).toHaveCount(0);

  const mainFortune = page.locator(".card.main .fortune").first();
  await expect(mainFortune).toBeVisible();
  await expect(mainFortune).not.toContainText("準備中");
});

test("タブ切替：今月の運勢でも実テキスト（プレースホルダなし）が出る", async ({ page }) => {
  await clearStorage(page);
  await page.reload();
  await page.locator("input[name=birthdate]").fill("1990-03-15");
  await page.locator("input[name=birthtime]").fill("14:30");
  await page.locator("select[name=place]").selectOption(PLACE);
  await page.locator("button[type=submit]").click();

  await page.getByRole("tab", { name: "今月の運勢" }).click();
  await expect(page.locator(".period-label")).toContainText("年");
  await expect(page.locator(".placeholder")).toHaveCount(0);
  await expect(page.locator(".card.main .fortune").first()).not.toContainText("準備中");
});

test("時刻不明：注記が出て、ハウス記述が結果本文に現れない", async ({ page }) => {
  await clearStorage(page);
  await page.reload();
  await page.locator("input[name=birthdate]").fill("1990-03-15");
  await page.locator("input[name=timeUnknown]").check();
  await page.locator("select[name=place]").selectOption(PLACE);
  await page.locator("button[type=submit]").click();

  await expect(page.locator(".note")).toContainText("出生時刻が未入力");
  await expect(page.locator(".chart-summary")).not.toContainText("アセンダント");

  // ハウス語は注記(.note)以外には出ない
  const cardsText = await page.locator(".result .card").allTextContents();
  expect(cardsText.join("")).not.toContain("ハウス");
});

test("localStorage復元：再訪時にフォームへ前回入力が復元される", async ({ page }) => {
  await clearStorage(page);
  await page.reload();
  await page.locator("input[name=birthdate]").fill("1990-03-15");
  await page.locator("input[name=birthtime]").fill("14:30");
  await page.locator("select[name=place]").selectOption(PLACE);
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".chart-summary")).toBeVisible();

  await page.goto("/reading");
  await expect(page.locator("input[name=birthdate]")).toHaveValue("1990-03-15");
  await expect(page.locator("input[name=birthtime]")).toHaveValue("14:30");
  await expect(page.locator("select[name=place]")).toHaveValue(PLACE);
});

test("根拠の折りたたみ：開くとアスペクトの根拠が表示される", async ({ page }) => {
  await clearStorage(page);
  await page.reload();
  await page.locator("input[name=birthdate]").fill("1990-03-15");
  await page.locator("input[name=birthtime]").fill("14:30");
  await page.locator("select[name=place]").selectOption(PLACE);
  await page.locator("button[type=submit]").click();

  const details = page.locator(".basis-details");
  await expect(details.locator("li").first()).toBeHidden();
  await details.locator("summary").click();
  await expect(details.locator("li").first()).toBeVisible();
});
