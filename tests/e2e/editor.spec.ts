import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
test("edit, snap, export a multicolor 3MF, and restore a saved project", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make", {
    timeout: 60000,
  });
  await page.getByRole("tab", { name: "Artwork", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Snap to center & border" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Center", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2D edit", exact: true }),
  ).toHaveClass("active");
  await expect(page.locator(".center-guides")).toBeVisible();
  await page
    .getByRole("button", { name: "Center horizontally", exact: true })
    .click();
  await page.getByRole("tab", { name: "Magnets", exact: true }).click();
  await page
    .getByRole("button", { name: "Outer magnets", exact: false })
    .click();
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make");
  await page.getByRole("tab", { name: "Coaster", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Total thickness", exact: true })
    .fill("2");
  await expect(page.getByRole("alert")).toContainText("Magnets are too deep");
  await expect(
    page.getByRole("button", { name: "Download 3MF" }),
  ).toBeDisabled();
  await page
    .getByRole("spinbutton", { name: "Total thickness", exact: true })
    .fill("5");
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make");
  await page
    .getByRole("button", { name: "Map artwork colors", exact: true })
    .click();
  await page
    .getByLabel("Map detected color 2", { exact: true })
    .selectOption("3");
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make");
  const filePromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 3MF" }).click();
  const file = await filePromise;
  const bytes = await readFile((await file.path())!);
  const zip = unzipSync(bytes);
  const colors = JSON.parse(strFromU8(zip["Metadata/project_settings.config"]));
  expect(colors.filament_colour).toHaveLength(4);
  expect(strFromU8(zip["Metadata/model_settings.config"])).toContain(
    'key="extruder"',
  );
  const projectPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const saved = await projectPromise;
  const data = JSON.parse(await readFile((await saved.path())!, "utf8"));
  expect(data.thickness).toBe(5);
  expect(data.magnetMode).toBe("outer");
  expect(data.mapping[1]).toBe(3);
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make");
  await expect(
    page.getByRole("spinbutton", { name: "Total thickness", exact: true }),
  ).toHaveValue("5");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("upload artwork, center, change color count and export an SVG", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make", {
    timeout: 60000,
  });
  await page.getByLabel("Import artwork file", { exact: true }).setInputFiles({
    name: "test-art.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><circle cx="40" cy="40" r="30" fill="#ff7700"/><path d="M70 10h40v60H70z" fill="#2244aa"/></svg>',
    ),
  });
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make");
  await page
    .getByRole("button", { name: "3 total colors", exact: true })
    .click();
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make");
  await page.getByRole("button", { name: "Center", exact: true }).click();
  await expect(page.getByTestId("model-status")).toHaveText("Ready to make");
  await page
    .getByRole("button", { name: "Export coaster", exact: true })
    .click();
  const filePromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Color-matched vector artwork", exact: false })
    .click();
  const file = await filePromise;
  expect(file.suggestedFilename()).toMatch(/\.svg$/);
  const svg = await readFile((await file.path())!, "utf8");
  expect(svg).toContain("100mm");
  expect(svg).toContain("clipPath");
});
