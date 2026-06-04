import { test, expect, type Page } from "@playwright/test";

// Drives the mock harness at /preview-dev. It mounts the production
// useStreamingIframe hook + a sandboxed iframe, then writes a hand-crafted
// HTML document in 8 setTimeout-spaced chunks. We assert progressive growth
// of the iframe's parsed DOM during streaming — i.e. live preview is real,
// not a single-shot mount at the end.
//
// Why a mock harness rather than the real /generate flow: each real run costs
// Gemini credits and ~60s. The hook is the surface we care about; the
// production flow is a thin wrapper over it.

const STREAM_DURATION_MS = 8 * 250 + 250; // 8 chunks × 250ms + slack

async function streamLen(page: Page): Promise<number> {
  return page.evaluate(() => {
    const iframe = document.querySelector("[data-testid=preview-iframe]") as HTMLIFrameElement | null;
    return iframe?.contentDocument?.documentElement?.outerHTML.length ?? 0;
  });
}

test.describe("streaming preview", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/preview-dev");
    // Guard: confirm the dev server actually served the latest harness code.
    await expect(page.getByTestId("build-version")).toContainText("build: v");
    await expect(page.getByTestId("preview-iframe")).toHaveAttribute("sandbox", "allow-same-origin");
  });

  test("incremental write grows the iframe DOM during streaming", async ({ page }) => {
    await page.getByTestId("btn-start").click();

    // While streaming, take three samples spaced through the run. Each later
    // sample must observe a strictly larger document than the prior.
    await page.waitForTimeout(300);
    const early = await streamLen(page);
    expect(early, "stream must start writing within 300ms").toBeGreaterThan(50);

    await page.waitForTimeout(700);
    const mid = await streamLen(page);
    expect(mid).toBeGreaterThan(early);

    await page.waitForTimeout(700);
    const late = await streamLen(page);
    expect(late).toBeGreaterThanOrEqual(mid);

    // Wait for completion + assert final state
    await expect(page.getByTestId("phase")).toHaveText("done", { timeout: STREAM_DURATION_MS });
    await expect(page.getByTestId("step")).toHaveText("8 / 8");
    const finalLen = await streamLen(page);
    expect(finalLen).toBeGreaterThan(1000);

    const bodyChildren = await page.evaluate(() => {
      const iframe = document.querySelector("[data-testid=preview-iframe]") as HTMLIFrameElement | null;
      return iframe?.contentDocument?.body?.children.length ?? 0;
    });
    expect(bodyChildren).toBeGreaterThanOrEqual(5);
  });

  test("reset blanks the iframe back to about:blank length", async ({ page }) => {
    await page.getByTestId("btn-start").click();
    await expect(page.getByTestId("phase")).toHaveText("done", { timeout: STREAM_DURATION_MS });
    expect(await streamLen(page)).toBeGreaterThan(1000);

    await page.getByTestId("btn-reset").click();
    await expect(page.getByTestId("phase")).toHaveText("idle");
    // about:blank's documentElement.outerHTML is ~39 chars (`<html><head></head><body></body></html>`).
    expect(await streamLen(page)).toBeLessThan(100);
  });

  test("re-stream after reset works (revise loop)", async ({ page }) => {
    await page.getByTestId("btn-start").click();
    await expect(page.getByTestId("phase")).toHaveText("done", { timeout: STREAM_DURATION_MS });
    await page.getByTestId("btn-reset").click();
    await expect(page.getByTestId("phase")).toHaveText("idle");

    await page.getByTestId("btn-start").click();
    await expect(page.getByTestId("phase")).toHaveText("streaming");
    await expect(page.getByTestId("phase")).toHaveText("done", { timeout: STREAM_DURATION_MS });
    expect(await streamLen(page)).toBeGreaterThan(1000);
  });

  test("leading ```html fence is stripped from the live stream", async ({ page }) => {
    await page.getByTestId("opt-fence").check();
    await page.getByTestId("btn-start").click();
    // Sample early enough that the fence-bearing chunks have landed.
    await page.waitForTimeout(600);
    const earlyHtml = await page.evaluate(() => {
      const iframe = document.querySelector("[data-testid=preview-iframe]") as HTMLIFrameElement | null;
      return iframe?.contentDocument?.documentElement?.outerHTML ?? "";
    });
    expect(earlyHtml).not.toContain("```");
    expect(earlyHtml).toContain("<head>");
  });
});
