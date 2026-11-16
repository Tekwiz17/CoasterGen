import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { read3mf } from "../../src/lib/spitgen";
test("MakerGen home opens both tools and preserves the coaster project", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("coastergen-tutorial-v2", "done"),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A little prep/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "CoasterGen", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "SplitGen", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Make a coaster/ }).click();
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make", {
    timeout: 60000,
  });
  await page
    .getByLabel("Project name", { exact: true })
    .fill("My saved coaster");
  await page.getByLabel("Project name", { exact: true }).press("Tab");
  await page.waitForTimeout(800);
  await page.getByRole("link", { name: "MakerGen home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /A little prep/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Split a model/ }).click();
  await expect(page.getByRole("heading", { name: /SplitGen/ })).toBeVisible();
  await page
    .getByRole("link", { name: "All tools", exact: true })
    .first()
    .click();
  await page.getByRole("link", { name: /Make a coaster/ }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "My saved coaster",
    { timeout: 30000 },
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("SpitGen fits split solid parts and exports printable pieces in every mode", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/spitgen");
  await page
    .getByRole("button", { name: "Try a sample model", exact: true })
    .click();
  const save = page.getByRole("button", {
    name: "Download all pieces",
    exact: true,
  });
  for (const fit of ["GlueFit", "SnapFit", "ClickFit", "TightFit"]) {
    await page.getByRole("button", { name: new RegExp("^" + fit) }).click();
    await expect(save).toBeEnabled({ timeout: 60000 });
    await expect(
      page.getByText("1 connector pairs · " + fit, { exact: true }),
    ).toBeVisible();
    const event = page.waitForEvent("download");
    await save.click();
    const zip = unzipSync(await readFile((await (await event).path())!));
    expect(Object.keys(zip).filter((k) => k.endsWith(".stl"))).toHaveLength(2);
    expect(read3mf(zip["assembly-reference.3mf"])).toHaveLength(2);
    expect(strFromU8(zip["assembly-guide.txt"])).toContain(fit);
  }
  await page.getByLabel("Explode view", { exact: true }).fill("0");
  await expect(save).toBeEnabled();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "3MF", exact: true }).first().click();
  const bytes = await readFile((await (await event).path())!);
  expect(read3mf(bytes)).toHaveLength(1);
  await page.getByLabel("Upload 3MF model", { exact: true }).setInputFiles({
    name: "roundtrip.3mf",
    mimeType: "model/3mf",
    buffer: bytes,
  });
  await expect(save).toBeEnabled({ timeout: 60000 });
  await expect(
    page.getByRole("heading", { name: "1 parts, ready to make" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("SpitGen rejects invalid input and recovers with another model", async ({
  page,
}) => {
  await page.goto("/#/spitgen");
  await page.getByLabel("Upload 3MF model").setInputFiles({
    name: "broken.3mf",
    mimeType: "model/3mf",
    buffer: Buffer.from("broken zip"),
  });
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Download all pieces" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Try the sample", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download all pieces" }),
  ).toBeEnabled({ timeout: 60000 });
});

test("upload recommendations, original colors and a steady inspectable preview", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/#/spitgen");
  await page
    .getByRole("button", { name: "Try a sample model", exact: true })
    .click();
  const save = page.getByRole("button", {
    name: "Download all pieces",
    exact: true,
  });
  await expect(save).toBeEnabled({ timeout: 60000 });
  await expect(
    page.getByText("Recommended: TightFit", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Explode view", { exact: true })).toHaveValue(
    "0",
  );
  await page.getByLabel("Inspect part", { exact: true }).selectOption("0");
  const canvas = page.locator(".spit-canvas canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  const handle = (await canvas.elementHandle())!;
  await page.getByRole("button", { name: "Use TightFit", exact: true }).click();
  await expect(save).toBeEnabled({ timeout: 60000 });
  expect(await handle.evaluate((el) => el.isConnected)).toBe(true);
  await expect(page.getByLabel("Inspect part", { exact: true })).toHaveValue(
    "0",
  );
  await expect(page.getByLabel("Explode view", { exact: true })).toHaveValue(
    "0",
  );
  await page.getByLabel("Inspect part", { exact: true }).selectOption("1");
  const event = page.waitForEvent("download");
  await save.click();
  const files = unzipSync(await readFile((await (await event).path())!));
  const parts = read3mf(files["assembly-reference.3mf"]);
  expect(parts).toHaveLength(2);
  expect(parts.map((p) => p.color)).toEqual(["#298769", "#E7AE54"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("connection view reveals fit geometry with adjustable spacing and detail", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/#/spitgen");
  await page
    .getByRole("button", { name: "Try a sample model", exact: true })
    .click();
  const save = page.getByRole("button", {
    name: "Download all pieces",
    exact: true,
  });
  await expect(save).toBeEnabled({ timeout: 60000 });
  await page.getByRole("button", { name: /^SnapFit/ }).click();
  await expect(save).toBeEnabled({ timeout: 60000 });
  await page
    .getByRole("button", { name: "See connections", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "See connections", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Mating faces are turned upward/)).toBeVisible();
  await page.getByLabel("Explode view", { exact: true }).fill("80");
  await expect(page.getByLabel("Explode view", { exact: true })).toHaveValue(
    "80",
  );
  await page
    .getByRole("checkbox", { name: "Surface detail", exact: true })
    .uncheck();
  await page.getByLabel("Inspect part", { exact: true }).selectOption("1");
  await expect(page.locator(".spit-canvas canvas")).toBeVisible();
  const event = page.waitForEvent("download");
  await save.click();
  const files = unzipSync(await readFile((await (await event).path())!));
  expect(read3mf(files["assembly-reference.3mf"])).toHaveLength(2);
  await page
    .getByRole("button", { name: "Reset model view", exact: true })
    .click();
  await expect(page.getByLabel("Explode view", { exact: true })).toHaveValue(
    "0",
  );
  await expect(
    page.getByRole("button", { name: "Assembly", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("one 3MF keeps every body and Bambu Studio uses the same project", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith("bambustudio:")) {
        document.documentElement.dataset.studioLaunch = "requested";
        return;
      }
      click.call(this);
    };
  });
  await page.goto("/#/splitgen");
  await page
    .getByRole("button", { name: "Try a sample model", exact: true })
    .click();
  const button = page.getByRole("button", {
    name: "Download 3MF",
    exact: true,
  });
  await expect(button).toBeEnabled({ timeout: 60000 });
  await page.getByLabel("Inspect part", { exact: true }).selectOption("1");
  const file = page.waitForEvent("download");
  await button.click();
  const downloaded = await file;
  expect(downloaded.suggestedFilename()).toMatch(/-SplitGen\.3mf$/);
  const parts = read3mf(await readFile((await downloaded.path())!));
  expect(parts).toHaveLength(2);
  expect(parts.map((p) => p.name)).toEqual(["Body", "Accent"]);
  await page
    .getByRole("button", { name: "Open in Bambu Studio", exact: true })
    .click();
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByRole("heading", { name: "Open your parts in Bambu Studio" }),
  ).toBeVisible();
  const second = page.waitForEvent("download");
  await modal
    .getByRole("button", { name: "Download & launch Studio", exact: true })
    .click();
  expect(read3mf(await readFile((await (await second).path())!))).toHaveLength(
    2,
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-studio-launch",
    "requested",
  );
  await expect(modal.getByRole("status")).toContainText("Downloaded.");
});
