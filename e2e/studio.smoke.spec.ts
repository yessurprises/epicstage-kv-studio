import { expect, test } from "@playwright/test";

test.describe("Studio smoke", () => {
  test("renders /studio with step indicator and event input", async ({ page }) => {
    const console_errors: string[] = [];
    page.on("pageerror", (err) => console_errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console_errors.push(msg.text());
    });

    await page.goto("/studio", { waitUntil: "domcontentloaded" });

    // Step indicator should show 4 steps. exact: true 필요 — "마스터 KV"는
    // 단계 라벨 외에도 모델 선택 안내 문구("Step 3 마스터 KV...")에 등장해
    // strict mode 위반이 난다.
    await expect(page.getByText("입력 & 레퍼런스", { exact: true })).toBeVisible();
    await expect(page.getByText("가이드라인 확인", { exact: true })).toBeVisible();
    await expect(page.getByText("마스터 KV", { exact: true })).toBeVisible();
    await expect(page.getByText("바리에이션 생성", { exact: true })).toBeVisible();

    // No fatal errors
    const fatal = console_errors.filter(
      (e) => !/favicon|manifest|chrome-extension/.test(e),
    );
    expect(fatal).toEqual([]);
  });
});
