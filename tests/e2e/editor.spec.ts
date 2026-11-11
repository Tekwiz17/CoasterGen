import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { DEFAULT_PROJECT } from "../../src/types";
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

test("size fields accept inches, plain mm, corrections and keyboard stepping", async ({
  page,
}) => {
  await open(page);
  const size = page.getByRole("spinbutton", { name: "Diameter", exact: true });
  await size.fill("4in");
  await size.press("Enter");
  await expect(size).toHaveValue("101.6");
  await ready(page);
  await size.fill("95");
  await size.press("Tab");
  await expect(size).toHaveValue("95");
  await ready(page);
  await size.fill("3.5 in");
  await size.press("Tab");
  await expect(size).toHaveValue("88.9");
  await ready(page);
  await size.fill("bad");
  await size.press("Enter");
  await expect(size).toHaveAttribute("aria-invalid", "true");
  await size.press("Escape");
  await expect(size).toHaveValue("88.9");
  await size.focus();
  await size.press("ArrowUp");
  await size.press("Tab");
  await expect(size).toHaveValue("89.9");
  await ready(page);
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  expect(
    JSON.parse(await readFile((await (await saved).path())!, "utf8")).diameter,
  ).toBe(89.9);
  await fits(page);
});

test("uploaded SVG shape keeps cutouts through export, save and reload; invalid shapes preserve the coaster", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const input = page.getByLabel("Upload SVG coaster shape", { exact: true });
  await input.setInputFiles({
    name: "cutout.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><path fill="#174e3c" fill-rule="evenodd" d="M0 0h100v80H0z M40 30h20v20H40z"/></svg>',
    ),
  });
  await expect(
    page.getByRole("spinbutton", { name: "Longest side", exact: true }),
  ).toBeVisible();
  await ready(page);
  const before = await page
    .locator(".viewport .flat-view > g > path")
    .first()
    .getAttribute("d");
  expect(before?.match(/M/g)?.length).toBe(2);
  await input.setInputFiles({
    name: "empty.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
    ),
  });
  await expect(
    page.getByText("This SVG is empty.", { exact: false }),
  ).toBeVisible();
  expect(
    await page
      .locator(".viewport .flat-view > g > path")
      .first()
      .getAttribute("d"),
  ).toBe(before);
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const p = JSON.parse(await readFile((await (await saved).path())!, "utf8"));
  expect(p.shape).toBe("custom");
  expect(p.shapeContours).toHaveLength(2);
  await printStep(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 3MF", exact: true }).click();
  const files = unzipSync(await readFile((await (await download).path())!));
  expect(JSON.parse(strFromU8(files["Metadata/coastergen.json"])).shape).toBe(
    "custom",
  );
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("spinbutton", { name: "Longest side", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".viewport .flat-view > g > path")
      .first()
      .getAttribute("d"),
  ).toBe(before);
  expect(errors).toEqual([]);
  await fits(page);
});

test("eraser removes pixels, supports undo and reset, and preserves the palette after reload", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.getByLabel("Import artwork file", { exact: true }).setInputFiles({
    name: "cleanup.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><path fill="#de3333" d="M0 0h60v80H0z"/><path fill="#2255cc" d="M60 0h60v80H60z"/></svg>',
    ),
  });
  const modal = page.getByRole("dialog"),
    apply = modal.getByRole("button", { name: "Use this image", exact: true });
  await expect(apply).toBeEnabled();
  await modal.getByLabel("Filament 2 color", { exact: true }).fill("#00aa55");
  await modal
    .getByRole("button", { name: "Paint & erase", exact: true })
    .click();
  await modal.getByRole("button", { name: "Erase", exact: true }).click();
  await modal
    .getByRole("slider", { name: "Eraser size", exact: true })
    .fill("12");
  const eraser = modal.getByRole("img", {
    name: "Image eraser.",
    exact: false,
  });
  await expect(eraser).toBeVisible();
  await expect
    .poll(async () =>
      eraser.evaluate((el) => {
        const a = el.getBoundingClientRect(),
          b = el.closest(".image-checker")!.getBoundingClientRect();
        return (
          a.width > 0 &&
          a.height > 0 &&
          a.left >= b.left &&
          a.right <= b.right &&
          a.top >= b.top &&
          a.bottom <= b.bottom
        );
      }),
    )
    .toBe(true);
  async function erase() {
    await eraser.scrollIntoViewIfNeeded();
    const rect = await eraser.boundingBox();
    expect(rect).toBeTruthy();
    const x = rect!.x + rect!.width * 0.8,
      y = rect!.y + rect!.height * 0.5;
    if (test.info().project.name === "mobile") await page.touchscreen.tap(x, y);
    else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 1, y + 1);
      await page.mouse.up();
    }
    await expect(apply).toBeEnabled();
    await expect(
      modal.getByRole("button", { name: "Undo cleanup", exact: true }),
    ).toBeEnabled();
  }
  await erase();
  await modal
    .getByRole("button", { name: "Undo cleanup", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "Undo cleanup", exact: true }),
  ).toBeDisabled();
  await expect(apply).toBeEnabled();
  await erase();
  await modal
    .getByRole("button", { name: "Reset cleanup", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "Reset cleanup", exact: true }),
  ).toBeDisabled();
  await expect(apply).toBeEnabled();
  await erase();
  await expect(
    modal.getByLabel("Filament 2 color", { exact: true }),
  ).toHaveValue("#00aa55");
  await fits(page);
  await apply.click();
  await ready(page);
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const p = JSON.parse(await readFile((await (await saved).path())!, "utf8"));
  expect(p.source).toMatch(/^data:image\/svg\+xml/);
  expect(p.cleanupMask).toMatch(/^data:image\/png;base64,/);
  expect(p.sourcePalette).toHaveLength(p.colorCount);
  const alpha = await page.evaluate(async (source: string) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return [
      ctx.getImageData(
        Math.floor(image.width * 0.8),
        Math.floor(image.height * 0.5),
        1,
        1,
      ).data[0],
      ctx.getImageData(
        Math.floor(image.width * 0.2),
        Math.floor(image.height * 0.5),
        1,
        1,
      ).data[3],
    ];
  }, p.cleanupMask);
  expect(alpha).toEqual([255, 0]);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready(page);
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await expect(
    page.getByLabel("Filament 2 color", { exact: true }),
  ).toHaveValue("#00aa55");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await ready(page);
  await page.getByRole("button", { name: "Edit / erase", exact: true }).click();
  const editDialog = page.getByRole("dialog");
  await expect(
    editDialog.getByRole("button", { name: "Use this image", exact: true }),
  ).toBeEnabled();
  await expect(
    editDialog.getByLabel("Filament 2 color", { exact: true }),
  ).toHaveValue("#00aa55");
  await editDialog
    .getByRole("button", { name: "Use this image", exact: true })
    .click();
  await ready(page);
  await expect(page.getByLabel("Image scale", { exact: true })).toHaveText(
    "95%",
  );
  expect(errors).toEqual([]);
  await fits(page);
});

test("live multicolor painting survives remapping, save/reload, restore, zoom and export", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page
    .getByLabel("Import artwork file", { exact: true })
    .setInputFiles(image);
  let modal = page.getByRole("dialog"),
    apply = modal.getByRole("button", { name: "Use this image", exact: true });
  await expect(apply).toBeEnabled({ timeout: 30000 });
  await modal.getByLabel("Filament 2 color", { exact: true }).fill("#00aa55");
  await modal.getByLabel("Filament 3 color", { exact: true }).fill("#ee22dd");
  await modal
    .getByRole("button", { name: "Paint & erase", exact: true })
    .click();
  await modal
    .getByRole("slider", { name: "Brush size", exact: true })
    .fill("40");
  const brush = modal.getByRole("img", {
    name: "Image paint brush.",
    exact: false,
  });
  await expect(brush).toBeVisible();
  await expect(
    modal.getByRole("checkbox", { name: "Keep fine details", exact: false }),
  ).toBeChecked();
  async function paint(x: number, y: number, live = false) {
    await brush.scrollIntoViewIfNeeded();
    const r = (await brush.boundingBox())!,
      px = r.x + r.width * x,
      py = r.y + r.height * y;
    const preview = modal.getByTestId("live-cleanup-preview");
    const before = await preview.getAttribute("href");
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px + r.width * 0.02, py);
    if (live) {
      await expect(apply).toBeDisabled();
      await expect.poll(() => preview.getAttribute("href")).not.toBe(before);
    }
    await page.mouse.up();
    await expect(apply).toBeEnabled({ timeout: 30000 });
  }
  await modal
    .getByRole("button", { name: "Paint with filament 2", exact: true })
    .click();
  await paint(0.3, 0.4, true);
  await modal
    .getByRole("button", { name: "Paint with filament 3", exact: true })
    .click();
  await paint(0.8, 0.5);
  await modal
    .getByRole("button", { name: "Undo cleanup", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "Redo cleanup", exact: true }),
  ).toBeEnabled();
  await modal
    .getByRole("button", { name: "Redo cleanup", exact: true })
    .click();
  await expect(apply).toBeEnabled({ timeout: 30000 });
  await modal
    .getByRole("button", { name: "Zoom in cleanup", exact: true })
    .click();
  await expect(modal.locator(".cleanup-view-tools")).toContainText("2×");
  await modal
    .getByRole("button", { name: "Move cleanup view", exact: true })
    .click();
  await expect(
    modal.getByRole("button", { name: "Move cleanup view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await modal
    .getByRole("button", { name: "Fit cleanup image", exact: true })
    .click();
  await modal
    .getByRole("button", { name: "Move cleanup view", exact: true })
    .click();
  await modal
    .getByLabel("Import image detail", { exact: true })
    .selectOption("1024");
  await expect(apply).toBeEnabled({ timeout: 30000 });
  await expect(
    modal.getByLabel("Filament 2 color", { exact: true }),
  ).toHaveValue("#00aa55");
  await expect(
    modal.getByLabel("Filament 3 color", { exact: true }),
  ).toHaveValue("#ee22dd");
  await modal
    .getByRole("slider", { name: "Brush size", exact: true })
    .fill("1");
  await paint(0.6, 0.25);
  await fits(page);
  await apply.click();
  await ready(page);
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Painted details");
  for (const select of await page.locator(".color-mapping select").all())
    await select.selectOption("0");
  await ready(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(saved.detail).toBe(1024);
  expect(saved.cleanupMask).toMatch(/^data:image\/png;base64,/);
  const codes = await page.evaluate(async (mask: string) => {
    const i = new Image();
    i.src = mask;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = i.width;
    c.height = i.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(i, 0, 0);
    return [
      [0.3, 0.4],
      [0.8, 0.5],
      [0.6, 0.25],
    ].map(
      ([x, y]) =>
        ctx.getImageData(
          Math.floor(c.width * x),
          Math.floor(c.height * y),
          1,
          1,
        ).data[0],
    );
  }, saved.cleanupMask);
  expect(codes).toEqual([2, 3, 3]);
  await printStep(page);
  await page
    .getByRole("button", { name: "More export formats", exact: true })
    .click();
  const svgDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Color-matched vector artwork", exact: false })
    .click();
  const svg = await readFile((await (await svgDownload).path())!, "utf8");
  expect(svg).toContain('fill="#00AA55"');
  expect(svg).toContain('fill="#EE22DD"');
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await ready(page);
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await page.getByRole("button", { name: "Edit / erase", exact: true }).click();
  modal = page.getByRole("dialog");
  apply = modal.getByRole("button", { name: "Use this image", exact: true });
  await expect(apply).toBeEnabled({ timeout: 30000 });
  await modal
    .getByRole("button", { name: "Paint & erase", exact: true })
    .click();
  await modal.getByRole("button", { name: "Restore", exact: true }).click();
  await modal
    .getByRole("slider", { name: "Brush size", exact: true })
    .fill("60");
  const restore = modal.getByRole("img", {
    name: "Restore automatic colors.",
    exact: false,
  });
  await restore.scrollIntoViewIfNeeded();
  const box = (await restore.boundingBox())!;
  await restore.click({
    position: { x: box.width * 0.8, y: box.height * 0.5 },
  });
  await expect(apply).toBeEnabled({ timeout: 30000 });
  await apply.click();
  await ready(page);
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    "Painted details",
  );
  const second = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const edited = JSON.parse(
    await readFile((await (await second).path())!, "utf8"),
  );
  const restored = await page.evaluate(async (mask: string) => {
    const i = new Image();
    i.src = mask;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = i.width;
    c.height = i.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(i, 0, 0);
    return ctx.getImageData(
      Math.round(c.width * 0.8),
      Math.round(c.height * 0.5),
      1,
      1,
    ).data[3];
  }, edited.cleanupMask);
  expect(restored).toBe(0);
  expect(errors).toEqual([]);
  await fits(page);
});

test("matching original colors recovers a small accent while retaining cleanup and placement", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const cleanupMask = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgb(2,0,0)";
    ctx.fillRect(20, 20, 5, 5);
    return c.toDataURL("image/png");
  });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64"><path fill="#fff" d="M0 0h128v64H0z"/><path fill="#141e37" d="M0 0h64v64H0z"/><path fill="#e61e46" d="M40 30h1v1h-1z"/></svg>';
  const p = {
    ...DEFAULT_PROJECT,
    name: "Small accents",
    source: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
    sourceName: "small-accents.svg",
    sample: "",
    colorCount: 3,
    colors: ["#FFFFFF", "#141E37", "#948292"],
    sourcePalette: ["#FFFFFF", "#141E37", "#948292"],
    matchBase: "#FFFFFF",
    mapping: [0, 1, 2],
    cleanupMask,
    artScale: 88,
    artX: 2,
    artY: -3,
  };
  await page
    .getByLabel("Open CoasterGen project", { exact: true })
    .setInputFiles({
      name: "small-accents.coaster.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await ready(page);
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await expect(
    page.getByLabel("Filament 3 color", { exact: true }),
  ).toHaveValue("#948292");
  await page
    .getByRole("button", { name: "Match original colors", exact: true })
    .click();
  await ready(page);
  await expect(
    page.getByLabel("Filament 3 color", { exact: true }),
  ).toHaveValue("#e61e46");
  await page.getByRole("button", { name: "Edit / erase", exact: true }).click();
  const modal = page.getByRole("dialog"),
    apply = modal.getByRole("button", { name: "Use this image", exact: true });
  await expect(apply).toBeEnabled({ timeout: 30000 });
  await modal.getByLabel("Filament 3 color", { exact: true }).fill("#1122ff");
  await modal
    .getByRole("button", { name: "Match original colors", exact: true })
    .click();
  await expect(apply).toBeEnabled({ timeout: 30000 });
  await expect(
    modal.getByLabel("Filament 3 color", { exact: true }),
  ).toHaveValue("#e61e46");
  await apply.click();
  await ready(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(saved.cleanupMask).toBe(cleanupMask);
  expect(saved.source).toBe(p.source);
  expect(saved.name).toBe(p.name);
  expect([saved.artScale, saved.artX, saved.artY]).toEqual([88, 2, -3]);
  expect(saved.sourcePalette).toContain("#E61E46");
  await printStep(page);
  const model = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 3MF", exact: true }).click();
  const files = unzipSync(await readFile((await (await model).path())!));
  expect(
    JSON.parse(strFromU8(files["Metadata/project_settings.config"]))
      .filament_colour,
  ).toContain("#E61E46");
  expect(errors).toEqual([]);
  await fits(page);
});

test("blank white template exports and Quality applies its four settings", async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page);
  await page.getByRole("button", { name: "Blank", exact: true }).click();
  await ready(page);
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await expect(
    page.getByLabel("Filament 1 color", { exact: true }),
  ).toHaveValue("#ffffff");
  await printStep(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 3MF", exact: true }).click();
  const files = unzipSync(await readFile((await (await download).path())!));
  const xml = strFromU8(files["3D/3dmodel.model"]);
  expect(xml).toContain("<mesh>");
  expect(xml).not.toContain('pindex="1"');
  await page.getByRole("button", { name: "Solstice", exact: true }).click();
  await ready(page);
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "4 total colors", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByLabel("Filament 1 color", { exact: true }),
  ).toHaveValue("#f2e9d8");
  await page
    .getByLabel("Import artwork file", { exact: true })
    .setInputFiles(image);
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Quality", exact: true }).click();
  await expect(
    modal.getByRole("button", { name: "Quality", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    modal.getByLabel("Import image detail", { exact: true }),
  ).toHaveValue("1024");
  await expect(
    modal.getByRole("checkbox", { name: /^Keep fine details/ }),
  ).not.toBeChecked();
  await expect(
    modal.getByRole("checkbox", { name: /^Remove background/ }),
  ).toBeChecked();
  await expect(
    modal.getByRole("checkbox", { name: /^Smooth edges/ }),
  ).toBeChecked();
  const apply = modal.getByRole("button", {
    name: "Use this image",
    exact: true,
  });
  await expect(apply).toBeEnabled({ timeout: 60000 });
  await apply.click();
  await ready(page);
  await page.getByRole("tab", { name: "Image & colors", exact: true }).click();
  await page.getByRole("button", { name: "Edit / erase", exact: true }).click();
  await expect(
    modal.getByRole("button", { name: "Quality", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await modal.getByRole("checkbox", { name: /^Keep fine details/ }).check();
  await expect(
    modal.getByRole("button", { name: "Quality", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await fits(page);
});
