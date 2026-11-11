import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
const image = {
  name: "test-art.svg",
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><style>.warm {fill:#000} .warm {fill:#ff7700} .blue {fill:#2244aa}</style><circle class="warm" cx="40" cy="40" r="30"/><path class="blue" d="M70 10h40v60H70z"/></svg>',
  ),
};
async function ready(page: Page) {
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make", {
    timeout: 60000,
  });
}
async function open(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("coastergen-tutorial-v2", "done"),
  );
  await page.goto("/");
  await ready(page);
}
async function printStep(page: Page) {
  await page.getByRole("tab", { name: "Ready to print", exact: true }).click();
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("tutorial supports all steps, skip, replay and persistence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("Download and print", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start designing", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await ready(page);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Tutorial", exact: true }).click();
  await page
    .getByRole("button", { name: "Skip tutorial", exact: true })
    .click();
  await fits(page);
});
test("repeated and rapid palette reductions remain safe in 3D and export valid color slots", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  for (const n of [8, 3, 2, 6, 2]) {
    await page
      .getByRole("button", { name: n + " total colors", exact: true })
      .click();
    await ready(page);
  }
  for (const n of [8, 2, 5, 2])
    await page
      .getByRole("button", { name: n + " total colors", exact: true })
      .click();
  await ready(page);
  await expect(page.locator('.filament-list input[type="color"]')).toHaveCount(
    2,
  );
  await printStep(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 3MF", exact: true }).click();
  const files = unzipSync(await readFile((await (await download).path())!));
  expect(
    JSON.parse(strFromU8(files["Metadata/project_settings.config"]))
      .filament_colour,
  ).toHaveLength(2);
  expect(strFromU8(files["3D/3dmodel.model"])).not.toMatch(/pindex="[2-9]/);
  await page.getByRole("button", { name: "Top / edit", exact: true }).click();
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await ready(page);
  await expect(page.locator('.filament-list input[type="color"]')).toHaveCount(
    5,
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await ready(page);
  await expect(page.locator('.filament-list input[type="color"]')).toHaveCount(
    2,
  );
  expect(errors).toEqual([]);
  await fits(page);
});
test("import previews color limits, custom filaments and mapping before applying", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page
    .getByLabel("Import artwork file", { exact: true })
    .setInputFiles(image);
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByRole("heading", { name: "Set up your image" }),
  ).toBeVisible();
  for (const n of [2, 5, 3]) {
    await modal
      .getByRole("button", { name: n + " total colors", exact: true })
      .click();
    await expect(
      modal.getByRole("button", { name: "Use this image", exact: true }),
    ).toBeEnabled();
  }
  await modal.getByLabel("Filament 2 color", { exact: true }).fill("#7711aa");
  await modal.getByLabel("Filament 3 color", { exact: true }).fill("#339955");
  await modal
    .getByLabel("Map detected color 2", { exact: true })
    .selectOption("2");
  await modal
    .getByRole("button", { name: "Use this image", exact: true })
    .click();
  await ready(page);
  await expect(
    page.getByLabel("Filament 2 color", { exact: true }),
  ).toHaveValue("#7711aa");
  await expect(
    page.getByLabel("Map detected color 2", { exact: true }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "Center", exact: true }).click();
  await expect(page.locator(".center-guides")).toBeVisible();
  await page
    .getByRole("button", { name: "Fit to coaster", exact: true })
    .click();
  await ready(page);
  await printStep(page);
  await page
    .getByRole("button", { name: "More export formats", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Color-matched vector artwork", exact: false })
    .click();
  const svg = await readFile((await (await download).path())!, "utf8");
  expect(svg).toContain("100mm");
  expect(svg).toContain("clipPath");
  expect(svg).toContain("#339955");
  expect(errors).toEqual([]);
  await fits(page);
});
test("magnet validation, alignment and saved project restoration", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "Snap to center & border",
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Center horizontally", exact: true })
    .click();
  await page.getByRole("tab", { name: "Magnets", exact: true }).click();
  await page
    .getByRole("button", { name: "Outer magnets", exact: false })
    .click();
  await ready(page);
  await page.getByRole("tab", { name: "Size", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Total thickness", exact: true })
    .fill("2");
  await expect(page.getByRole("alert")).toContainText("Magnets are too deep");
  await printStep(page);
  await expect(
    page.getByRole("button", { name: "Download 3MF", exact: true }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: "Size", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Total thickness", exact: true })
    .fill("5");
  await ready(page);
  const savedPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const content = await readFile((await (await savedPromise).path())!, "utf8");
  const saved = JSON.parse(content);
  expect(saved.magnetMode).toBe("outer");
  expect(saved.thickness).toBe(5);
  await page
    .getByRole("spinbutton", { name: "Total thickness", exact: true })
    .fill("6");
  await ready(page);
  await page
    .getByLabel("Open CoasterGen project", { exact: true })
    .setInputFiles({
      name: "restore.coaster.json",
      mimeType: "application/json",
      buffer: Buffer.from(content),
    });
  await ready(page);
  await expect(
    page.getByRole("spinbutton", { name: "Total thickness", exact: true }),
  ).toHaveValue("5");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("spinbutton", { name: "Total thickness", exact: true }),
  ).toHaveValue("5");
  await fits(page);
});
test("invalid images are recoverable and cancelled import preserves the current project", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Import artwork file", { exact: true }).setInputFiles({
    name: "broken.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg><broken>"),
  });
  await expect(
    page.getByText("This SVG is invalid. Try exporting it again.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Import artwork file", { exact: true })
    .setInputFiles(image);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "Solstice",
  );
  await printStep(page);
  await expect(
    page.getByRole("button", { name: "Download 3MF", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Source code", exact: false }),
  ).toHaveAttribute("href", "https://github.com/Tekwiz17/CoasterGen");
});

test("printing is step four in the sidebar and image zoom changes saved artwork scale", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.locator(".canvas-column .download-panel")).toHaveCount(0);
  const base = page.locator(".viewport .flat-view > g > path").first();
  const artwork = page
    .locator(".viewport .flat-view g[clip-path] > path")
    .first();
  const beforeBase = await base.getAttribute("d");
  const beforeArt = await artwork.getAttribute("d");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByLabel("Image scale", { exact: true })).toHaveText(
    "95%",
  );
  await ready(page);
  expect(await base.getAttribute("d")).toBe(beforeBase);
  expect(await artwork.getAttribute("d")).not.toBe(beforeArt);
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect(
    JSON.parse(await readFile((await (await saved).path())!, "utf8")).artScale,
  ).toBe(95);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Image scale", { exact: true })).toHaveText(
    "90%",
  );
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(page.getByLabel("Image scale", { exact: true })).toHaveText(
    "85%",
  );
  await ready(page);
  await printStep(page);
  await expect(page.locator(".settings-panel .download-panel")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download 3MF", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("tab", { name: "Ready to print", exact: true })
    .press("Home");
  await expect(
    page.getByRole("tab", { name: "Size", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Size", exact: true }).press("End");
  await expect(
    page.getByRole("tab", { name: "Ready to print", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await fits(page);
});

test("each new example builds a colored, printable model", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  for (const name of ["Solstice", "Ginkgo", "Tidal", "Bauhaus"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await ready(page);
    await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
      name,
    );
    await printStep(page);
    await expect(
      page.getByRole("button", { name: "Download 3MF", exact: true }),
    ).toBeEnabled();
  }
  expect(errors).toEqual([]);
  await fits(page);
});

test("reselecting the current example restores its matched colors and survives reload", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Solstice", exact: true }).click();
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  const filament = page.getByLabel("Filament 2 color", { exact: true });
  const original = await filament.inputValue();
  expect(parseInt(original.slice(1, 3), 16)).toBeLessThan(80);
  await filament.fill("#ff00ff");
  await page.getByRole("button", { name: "Solstice", exact: true }).click();
  await expect(filament).toHaveValue(original);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready(page);
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await expect(
    page.getByLabel("Filament 2 color", { exact: true }),
  ).toHaveValue(original);
});
