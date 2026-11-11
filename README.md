# CoasterGen

A small, local design studio for multicolor 3D-printed coasters. Set dimensions, import artwork, preview and map image colors, add underside magnet pockets, and download a colored 3MF.

## Run

```sh
npm ci
npm run dev
```

```sh
npm run build
npm test
npm run test:e2e
```

Vercel uses the Vite preset and `dist` output. No environment variables, database, API keys, server functions, or backend are needed.

## What it does

- Round, soft-square, and hexagonal coasters, with dimensions in millimeters.
- PNG, JPG, WebP, and self-contained SVG artwork. Images never upload.
- A large top-view editor and four sidebar steps: Size, Image, Magnets, and Print. The +/− image-size controls change artwork scale and the exported geometry; camera fit remains separate.
- Four redesigned SVG examples: Solstice, Ginkgo, Tidal, and Bauhaus.
- Optional 3D view and a first-visit tutorial with skip and replay.
- An import dialog with original/coaster previews, 2–8 color limits, custom filament colors, and explicit image-to-filament mapping before applying.
- Perceptual OKLab color quantization, edge-connected background removal, and vector contour tracing in a Web Worker. Smooth edges removes tiny color flecks, smooths a shared boundary graph, and simplifies shared chains once to keep neighboring color inlays aligned. Turn smoothing off for pixel art.
- Palette/model request keys reject outdated results, including rapid color reductions. Exports wait for the current model.
- 2–8 total filament slots; four by default, including the base. Custom filament colors and explicit detected-color-to-slot mapping.
- Artwork scaling, rotation, mirroring, X/Y position, centering, direct dragging in 2D, visible-artwork centering, six alignment buttons, center guides, and center/border snapping (hold Alt/Option to bypass).
- Live 3D orbit/zoom and an underside view. A 2D fallback works without WebGL.
- Real boolean-cut underside magnet pockets: one center magnet or 2–8 outer magnets. Outer edge gap is measured from pocket wall to the conservative inscribed coaster edge; hexagon/square corner pockets may sit farther from the actual outline. Pocket diameter is magnet diameter plus selected diametral clearance. Pocket depth is magnet thickness plus 0.1 mm. Validation requires at least 0.6 mm of roof below the artwork and 0.8 mm edge/separation walls.
- A flush top color layer, included in total height. Manifold generates watertight color meshes and nonoverlapping inlays.
- Colored 3MF, vector SVG, geometry-only STL, and editable `.coaster.json` downloads.
- Local autosave in IndexedDB, portable project files, and undo/redo. No hosted database.
- Fonts and WASM ship with the app. No analytics or third-party processing requests.

## Bambu Studio

3MF exports contain standard base-material colors and a multipart component assembly, plus Bambu `Metadata/model_settings.config` part/extruder assignments and `Metadata/project_settings.config` filament color arrays. They do **not** contain printer-specific slicing settings or G-code. Open the 3MF **as a project**, choose your own printer/material/process, and map filament slots to your AMS before slicing. Import behavior varies by slicer version; the app does not claim that a print has been sliced or physically test-printed.

The **Open in Bambu Studio** workflow downloads the local colored 3MF and invokes the `bambustudio://` application handler. Drag the downloaded file into Studio or use File → Open Project. Bambu's remote import handler requires a remotely accessible file URL; a browser blob URL cannot be fetched by a native application. CoasterGen deliberately keeps the export local, so there is no pretend direct-file handoff or file upload service.

## Accuracy

Artwork is rasterized at 192, 320, 512 (default), or 768 pixels on its longest edge. The default smoothing resolves antialiased edge pixels against their actual neighboring colors, removes isolated specks, and relaxes shared boundaries. It fits local cubic Bézier curves while protecting sharp corners, resamples both sides from the same shared curve, and simplifies at 0.06-pixel tolerance. Color junctions remain fixed and adjoining regions reuse the same vertices. SVG inputs are also rasterized and color-reduced; their original Bézier geometry is not retained. A 100 mm image at 320 pixels has roughly 0.31 mm source resolution before scaling. Very small features may be below a printer nozzle's printable width. Total-volume PLA weight is an estimate at 1.24 g/cm³; actual slicer infill, purge, and supports change material usage. Magnet fit depends on your printer; test before gluing.

## Stack

React, TypeScript, Vite, Three.js, Manifold WASM, fit-curve, fflate, Lucide, and self-hosted DM Sans. Source code is in `src/`; the compute worker is `src/engine.worker.ts`.

Keyboard shortcuts: ⌘/Ctrl+Z undo; ⌘/Ctrl+Shift+Z redo; ⌘/Ctrl+S save a project copy; F fit the preview.

## Brand assets

The Bambu Studio icon in `public/bambu-studio.svg` is the official application icon from [bambulab/BambuStudio](https://github.com/bambulab/BambuStudio/blob/master/resources/images/BambuStudio.svg). Bambu Studio and GitHub marks identify the linked products; CoasterGen is an independent project.

For browser tests, install Chromium with `npx playwright install --with-deps chromium`. An existing Chromium executable can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The regression suite runs desktop and mobile flows for tutorial persistence, repeated/rapid palette reduction in 3D, import previews and color mapping, colored exports, magnet validation, project recovery, and invalid files.
