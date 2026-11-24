import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** Opens one tab of the page by its hash, the way a link to it would. */
async function open(page: Page, tab: string): Promise<void> {
  await page.goto(`/#${tab}`);
}

/** Switches tab on a page that is already open, the way a reader would. */
async function switchTo(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name }).click();
}

/** The row for one key in the values panel, which shows what the hook currently reads. */
function row(page: Page, label: string): Locator {
  return page.locator("div.py-3", { has: page.getByText(label, { exact: true }) }).first();
}

test("a hook follows a write made in another tab", async ({ context, page }) => {
  await open(page, "values");

  const other = await context.newPage();

  await other.goto("/");
  await other.evaluate(() => {
    window.localStorage.setItem("visitCount", "7");
  });

  await expect(page.getByLabel("Visit count")).toContainText("7");
});

test("every hook follows another tab clearing the whole origin", async ({ context, page }) => {
  await open(page, "values");
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

test("a hook over several keys follows another tab, its own writer and a clear", async ({
  context,
  page,
}) => {
  await open(page, "values");

  const summary = page.getByLabel("Summary");

  await expect(summary).toContainText("reads in system at 100%, and has visited 0 times");

  const other = await context.newPage();

  await other.goto("/");
  await other.evaluate(() => {
    window.localStorage.setItem("visitCount", "7");
    window.localStorage.setItem("displayName", JSON.stringify("Ada"));
  });

  await expect(summary).toContainText("Ada reads in system at 100%, and has visited 7 times");

  await page.getByRole("button", { name: /^writer\.set/ }).click();

  await expect(summary).toContainText("Ada reads in dark at 125%");
  expect(await page.evaluate(() => window.localStorage.getItem("fontScale"))).toBe("1.25");

  await switchTo(page, "Storages");
  await page.getByRole("button", { name: "clearSync()", exact: true }).click();
  await switchTo(page, "Values");

  await expect(summary).toContainText("Someone reads in system at 100%, and has visited 0 times");
});

test("a value moves from its old name the first time it is read", async ({ page }) => {
  await open(page, "values");
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
  await open(page, "bad-data");
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
  await open(page, "bad-data");

  await page
    .locator("div.rounded-lg.bg-inset", { hasText: "From before the key had versions" })
    .getByRole("button", { name: "Plant it" })
    .click();

  await expect(page.getByLabel("Layout reads as")).toContainText("compact");
  await expect(page.getByLabel("Layout stored as")).toContainText('"v":2');
});

test("a value written in another tab is migrated by the tab following it", async ({
  context,
  page,
}) => {
  await open(page, "bad-data");
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

  await open(page, "bad-data");
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
  await open(page, "bad-data");
  await page.evaluate(() => {
    window.localStorage.setItem("accent", "GREEN");
  });
  await page.reload();

  await expect(page.getByLabel("Accent reads as")).toContainText("green");

  const stored = await page.evaluate(() => window.localStorage.getItem("accent"));

  expect(stored).toBe('"green"');
});

test("two storages under different prefixes keep apart on one origin", async ({ page }) => {
  await open(page, "storages");

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
  await open(page, "storages");

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

test("clearing undeclared names stays inside the prefix", async ({ page }) => {
  await open(page, "storages");

  const inspector = page.locator("section", {
    has: page.getByRole("heading", { name: "What is actually on the origin" }),
  });

  await page.getByRole("textbox", { name: "Team A note" }).fill("alpha");
  await page.getByRole("textbox", { name: "Team B note" }).fill("beta");
  await page.getByRole("button", { name: "Plant a leftover" }).click();
  await page.getByRole("button", { name: "Plant a foreign key" }).click();

  await expect(inspector.getByText("team-a:draft", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: 'clearSync("undeclared")' }).click();

  await expect(inspector.getByText("team-a:draft", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      leftover: window.localStorage.getItem("team-a:draft"),
      teamA: window.localStorage.getItem("team-a:note"),
      teamB: window.localStorage.getItem("team-b:note"),
      foreign: window.localStorage.getItem("analytics:session"),
    })),
  ).toEqual({
    leftover: null,
    teamA: '"alpha"',
    teamB: '"beta"',
    foreign: '"belongs to someone else"',
  });
});

test("clearing everything empties the origin, and every hook follows", async ({ page }) => {
  await open(page, "values");
  await page.evaluate(() => {
    window.localStorage.setItem("visitCount", "7");
  });
  await page.reload();
  await expect(page.getByLabel("Visit count")).toContainText("7");

  await switchTo(page, "Storages");
  await page.getByRole("textbox", { name: "Team A note" }).fill("alpha");
  await page.getByRole("button", { name: "Plant a foreign key" }).click();
  await page.getByRole("button", { name: 'clearSync("everything")' }).click();

  await expect(page.getByLabel("Team A reads as")).toContainText("undefined");
  await expect(page.getByLabel("Clear removed")).toContainText("analytics:session");
  await switchTo(page, "Values");
  await expect(page.getByLabel("Visit count")).toContainText("0");
  await expect(page.getByText("Nothing stored yet.")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test("another tab follows clearing everything, from the browser's own event", async ({
  context,
  page,
}) => {
  await open(page, "storages");
  await page.evaluate(() => {
    window.localStorage.setItem("visitCount", "7");
  });
  await page.reload();

  const other = await context.newPage();

  await other.goto("/#values");
  await expect(other.getByLabel("Visit count")).toContainText("7");
  await other.evaluate(() => {
    const heard: Array<string | null> = [];

    Object.assign(window, { heard });
    window.addEventListener("storage", (event) => {
      heard.push(event.key);
    });
  });

  await page.getByRole("button", { name: 'clearSync("everything")' }).click();

  await expect(other.getByLabel("Visit count")).toContainText("0");
  expect(await other.evaluate(() => window.localStorage.length)).toBe(0);
  // One event naming no key is what `localStorage.clear()` sends; removing each name would send one per name.
  expect(await other.evaluate(() => Reflect.get(window, "heard"))).toEqual([null]);
});

test("adopting a prefix moves a value left under the bare name", async ({ page }) => {
  await open(page, "storages");
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
  await open(page, "values");

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

  const log = page.locator("section", { has: page.getByRole("heading", { name: "Error log" }) });

  await expect(log.getByText("QUOTA", { exact: true }).first()).toBeVisible();
});

test("the tour passes every check and leaves nothing behind", async ({ page }) => {
  await open(page, "tour");

  await page.getByRole("button", { name: "Run all checks" }).click();

  await expect(page.getByLabel("Tour result")).toContainText("7 / 7 passed");
  expect(
    await page.evaluate(() =>
      Object.keys(window.localStorage).filter((name) => name.startsWith("tour:")),
    ),
  ).toEqual([]);
});

test("planting the old name shows the value moving to the new one", async ({ page }) => {
  await open(page, "values");

  await page.getByRole("button", { name: "Plant legacy:user" }).click();

  await expect(page.getByLabel("Legacy user")).toContainText("moved from legacy:user");
  await expect(row(page, "User").getByText(/Grace/).first()).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("legacy:user"))).toBeNull();
});

test("a write past the quota is refused and changes nothing", async ({ page }) => {
  await open(page, "bad-data");

  await page.getByRole("button", { name: "Write 12 MB to recentSearches" }).click();

  await expect(page.getByLabel("Quota outcome")).toContainText("QUOTA");
  await expect(page.getByText("unchanged ✓")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("recentSearches"))).toBeNull();
});

test("a clear says in its own card what it removed and what it left", async ({ page }) => {
  await open(page, "storages");

  await page.getByRole("button", { name: "Plant a foreign key" }).click();
  await page.getByRole("textbox", { name: "Team A note" }).fill("alpha");
  await page.getByRole("button", { name: "Plant a leftover" }).click();
  await page.getByRole("button", { name: 'clearSync("undeclared")' }).click();

  const removed = page.getByLabel("Clear removed");

  await expect(removed).toContainText("team-a:draft");
  await expect(removed).not.toContainText("analytics:session");
  await expect(removed).not.toContainText("team-a:note");
});

test("a read under the remove policy deletes the value, and the page sees it go", async ({
  page,
}) => {
  await open(page, "bad-data");
  await page.getByLabel("Invalid-data policy").selectOption("remove");

  const corrupt = page.locator("div.rounded-lg.bg-inset", { hasText: "Theme outside the union" });

  await corrupt.getByRole("button", { name: "Plant" }).click();
  await expect(corrupt.getByText('"solarized"')).toHaveCount(2);

  await corrupt.getByRole("button", { name: "Read", exact: true }).click();

  await expect(page.getByLabel("Theme outside the union read")).toContainText("system");
  await expect(page.getByLabel("Theme outside the union read")).toContainText("logged");
  await expect(corrupt.getByText("nothing")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("theme"))).toBeNull();

  const inspector = page.locator("section", {
    has: page.getByRole("heading", { name: "What is actually on the origin" }),
  });

  await expect(inspector.getByText("theme", { exact: true })).toHaveCount(0);
});

test("a bare note is adopted once, and left alone while the prefixed one holds a value", async ({
  page,
}) => {
  await open(page, "storages");

  await page.getByRole("button", { name: "Plant a bare note" }).click();
  await expect(page.getByLabel("Bare note outcome")).toContainText("moved into app:note");

  await page.getByRole("button", { name: "Plant a bare note" }).click();
  await expect(page.getByLabel("Bare note outcome")).toContainText("left alone");
  await expect(page.getByLabel("Bare note", { exact: true })).toContainText("still there");

  await page.getByRole("button", { name: "Clear both" }).click();
  expect(
    await page.evaluate(() => [
      window.localStorage.getItem("app:note"),
      window.localStorage.getItem("note"),
    ]),
  ).toEqual([null, null]);
});

test("a clear made elsewhere on the page reaches the migration card's stored text", async ({
  page,
}) => {
  await open(page, "bad-data");

  await page
    .locator("div.rounded-lg.bg-inset", { hasText: "From a newer release" })
    .getByRole("button", { name: "Plant it" })
    .click();
  await expect(page.getByLabel("Layout stored as")).toContainText('"v":9');

  await switchTo(page, "Storages");
  await page.getByRole("button", { name: "clearSync()", exact: true }).click();
  await switchTo(page, "Bad data");

  await expect(page.getByLabel("Layout stored as")).toContainText("nothing");
});

test("a tour whose storage refuses to empty says so, and can be run again", async ({ page }) => {
  /* Refuses only the tour's own names, so the rest of the page works as usual. */
  await page.addInitScript(() => {
    const remove = Storage.prototype.removeItem;

    Storage.prototype.removeItem = function removeItem(this: Storage, name: string): void {
      if (name.startsWith("tour:")) throw new DOMException("refused", "SecurityError");
      remove.call(this, name);
    };
  });
  await open(page, "tour");

  await page.getByRole("button", { name: "Run all checks" }).click();

  await expect(page.getByRole("alert")).toContainText("could not empty its storage first");
  await expect(page.getByLabel("Tour result")).toContainText("0 / 7 passed");
  await expect(page.getByRole("button", { name: "Run again" })).toBeEnabled();
});
