import { test, expect } from "@playwright/test";
test("HoodieGen home and two design paths", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByRole("link", { name: /HoodieGen/ }).click();
  await expect(
    page.getByRole("heading", { name: "A hoodie. Your style." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download 3MF", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await page.getByRole("button", { name: "Surface map Advanced" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download map template" }).click();
  expect((await dl).suggestedFilename()).toBe("HoodieGen-map-template.svg");
  await page.getByRole("button", { name: "Image Simple" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("back artwork")).toBeAttached();
});
if (process.env.HOODIE_FIXTURE)
  test("real hoodie image, map and painted export", async ({ page }) => {
    test.setTimeout(240000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/#/hoodiegen");
    await expect(page.getByText("Original hoodie loaded · Ready to design")).toBeVisible({ timeout: 90000 });
    await expect(
      page.getByRole("button", { name: "Download 3MF", exact: true }),
    ).toBeEnabled({ timeout: 90000 });
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#eecc11"/><circle cx="100" cy="50" r="40" fill="#e34455"/></svg>',
    );
    await page.getByLabel("front artwork").setInputFiles({
      name: "art.svg",
      mimeType: "image/svg+xml",
      buffer: svg,
    });
    await page.getByRole("button", {name:"Use this image"}).click({timeout:90000});
    await expect(page.getByAltText("front artwork")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download 3MF", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByLabel("back artwork").setInputFiles({
      name: "back.svg",
      mimeType: "image/svg+xml",
      buffer: svg,
    });
    await page.getByRole("button", {name:"Use this image"}).click({timeout:90000});
    await expect(
      page.getByRole("button", { name: "Download 3MF", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole("button", { name: "Surface map Advanced" }).click();
    await page.getByLabel("Surface map image").setInputFiles({
      name: "map.svg",
      mimeType: "image/svg+xml",
      buffer: svg,
    });
    await page.getByRole("button", {name:"Use this image"}).click({timeout:90000});
    await expect(
      page.getByRole("button", { name: "Download 3MF", exact: true }),
    ).toBeEnabled({ timeout: 60000 });
    await page.getByRole("checkbox", { name: "Smooth color edges (beta)" }).check();
    await expect(page.getByRole("button", { name: "Download 3MF", exact: true })).toBeEnabled({timeout:90000});
    const dl = page.waitForEvent("download", { timeout: 90000 });
    await page
      .getByRole("button", { name: "Download 3MF", exact: true })
      .click();
    expect((await dl).suggestedFilename()).toBe("HoodieGen.3mf");
    await page.screenshot({
      path: "/tmp/hoodiegen-desktop.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
