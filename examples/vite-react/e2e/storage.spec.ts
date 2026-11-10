import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** The row for one key in the values panel, which shows what the hook currently reads. */
function row(page: Page, label: string): Locator {
  return page.locator("div.py-3", { has: page.getByText(label, { exact: true }) }).first();
}

test("a hook follows a write made in another tab", async ({ context, page }) => {
  await page.goto("/");

  const other = await context.newPage();

  await other.goto("/");
  await other.evaluate(() => {
    window.localStorage.setItem("visitCount", "7");
  });

  await expect(page.getByLabel("Visit count")).toContainText("7");
});

test("every hook follows another tab clearing the whole origin", async ({ context, page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("visitCount", "7");
  });
  await page.reload();
  await expect(page.getByLabel("Visit count")).toContainText("7");

  const other = await context.newPage();

  await other.goto("/");
  await other.evaluate(() => {
    window.localStorage.clear();
  });

  await expect(page.getByLabel("Visit count")).toContainText("0");
});

test("a value moves from its old name the first time it is read", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("legacy:user", JSON.stringify({ id: "u1", name: "Ada" }));
  });
  await page.reload();

  await expect(row(page, "User").getByText(/Ada/).first()).toBeVisible();

  const stored = await page.evaluate(() => ({
    moved: window.localStorage.getItem("app:user"),
    left: window.localStorage.getItem("legacy:user"),
  }));

  expect(stored).toEqual({ moved: JSON.stringify({ id: "u1", name: "Ada" }), left: null });
});

test("a value from before the key had versions is migrated and saved", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("layout", JSON.stringify({ compact: true }));
  });
  await page.reload();

  await expect(page.getByLabel("Layout reads as")).toContainText("compact");

  const stored = await page.evaluate(() => window.localStorage.getItem("layout"));

  expect(stored).toBe(JSON.stringify({ v: 2, d: { density: "compact" } }));
  await expect(page.getByLabel("Layout stored as")).toContainText('"v":2');
});

test("a migration made while the page is open is shown and saved", async ({ page }) => {
  await page.goto("/");

  await page
    .locator("div.rounded-lg", { hasText: "From before the key had versions" })
    .getByRole("button", { name: "Plant it" })
    .click();

  await expect(page.getByLabel("Layout reads as")).toContainText("compact");
  await expect(page.getByLabel("Layout stored as")).toContainText('"v":2');
});

test("a value written in another tab is migrated by the tab following it", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Layout reads as")).toContainText("comfortable");

  const other = await context.newPage();

  await other.goto("/");
  await other.evaluate(() => {
    window.localStorage.setItem("layout", JSON.stringify({ compact: true }));
  });

  await expect(page.getByLabel("Layout reads as")).toContainText("compact");

  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("layout")))
    .toBe(JSON.stringify({ v: 2, d: { density: "compact" } }));
});

test("data from a newer release falls back and is left stored", async ({ page }) => {
  const newer = JSON.stringify({ v: 9, d: { density: "tight" } });

  await page.goto("/");
  await page.evaluate((text) => {
    window.localStorage.setItem("layout", text);
  }, newer);
  await page.reload();

  await expect(page.getByLabel("Layout reads as")).toContainText("comfortable");
  await expect(page.getByText("UNKNOWN_VERSION", { exact: true }).first()).toBeVisible();

  const stored = await page.evaluate(() => window.localStorage.getItem("layout"));

  expect(stored).toBe(newer);
});

test("text that was never JSON is repaired by recover and saved bare", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("accent", "GREEN");
  });
  await page.reload();

  await expect(page.getByLabel("Accent reads as")).toContainText("green");

  const stored = await page.evaluate(() => window.localStorage.getItem("accent"));

  expect(stored).toBe('"green"');
});

test("two storages under different prefixes keep apart on one origin", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("textbox", { name: "Team A note" }).fill("alpha");
  await page.getByRole("textbox", { name: "Team B note" }).fill("beta");

  const stored = await page.evaluate(() => ({
    a: window.localStorage.getItem("team-a:note"),
    b: window.localStorage.getItem("team-b:note"),
    bare: window.localStorage.getItem("note"),
  }));

  expect(stored).toEqual({ a: '"alpha"', b: '"beta"', bare: null });

  await page
    .locator("div.py-3", { has: page.getByText("Team A", { exact: true }) })
    .getByRole("button", { name: "Clear" })
    .click();

  await expect(page.getByLabel("Team A reads as")).toContainText("undefined");
  await expect(page.getByLabel("Team B reads as")).toContainText("beta");
  expect(await page.evaluate(() => window.localStorage.getItem("team-b:note"))).toBe('"beta"');
});

test("the origin inspector follows writes and clears through a prefixed storage", async ({
  page,
}) => {
  await page.goto("/");

  const inspector = page.locator("section", {
    has: page.getByRole("heading", { name: "What is actually on the origin" }),
  });

  await page.getByRole("textbox", { name: "Team A note" }).fill("alpha");

  await expect(inspector.getByText("team-a:note", { exact: true })).toBeVisible();

  await page
    .locator("div.py-3", { has: page.getByText("Team A", { exact: true }) })
    .getByRole("button", { name: "Clear" })
    .click();

  await expect(inspector.getByText("team-a:note", { exact: true })).toHaveCount(0);
});

test("adopting a prefix moves a value left under the bare name", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("note", JSON.stringify("from before"));
  });
  await page.reload();

  await expect(page.getByLabel("Adopted note reads as")).toContainText("from before");

  const stored = await page.evaluate(() => ({
    adopted: window.localStorage.getItem("app:note"),
    bare: window.localStorage.getItem("note"),
  }));

  expect(stored).toEqual({ adopted: '"from before"', bare: null });
  await expect(page.getByLabel("Bare note")).toContainText("empty");
});

test("a full origin is reported as a quota error", async ({ page }) => {
  await page.goto("/");

  const refusedWith = await page.evaluate(() => {
    let refused = "nothing refused";
    let index = 0;

    /* Halving down to a single character, so that no room is left for even the shortest write. */
    for (let size = 1024 * 1024; size >= 1; size = Math.floor(size / 2)) {
      for (;;) {
        try {
          window.localStorage.setItem(`f${String(index)}`, "x".repeat(size));
          index += 1;
        } catch (error) {
          refused = error instanceof DOMException ? error.name : String(error);
          break;
        }
      }
    }

    return refused;
  });

  expect(refusedWith).toMatch(/QuotaExceededError|NS_ERROR_DOM_QUOTA_REACHED/);

  await page.getByRole("textbox", { name: "Display name" }).first().fill("Ada");

  await expect(page.getByText("QUOTA", { exact: true }).first()).toBeVisible();
});
