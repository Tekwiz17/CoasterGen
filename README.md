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

Custom shapes: in **Size**, choose **Upload SVG shape**. The filled silhouette becomes the base, and transparent holes become cutouts. The SVG must form one connected piece; disconnected islands are rejected. The longest side sets the size in mm, with aspect ratio preserved. Outlines are traced at 768 pixels and their borders are offset geometrically, including around holes. Custom outlines and names are included in saved projects.

Image cleanup: choose **Edit / erase** in Image & colors (including on examples), then **Paint & erase**. Choose Paint and a filament swatch to brush over a region in that exact output filament; Erase reveals the base, and Restore brings back automatic mapping. The mapped image and coaster preview update while drawing. Brush sizes go down to one image pixel; zoom up to 8× and pan with Move or Alt-drag. Keyboard users can move the brush with arrow keys and paint with Space. Undo, redo, and reset apply to cleanup strokes. Corrections are saved in a separate local PNG layer, so the original SVG/image remains intact. Manual paint bypasses automatic color mapping and stays assigned to its filament slot. Changing a filament swatch updates painted areas too. On color-count reduction, unavailable painted slots use the last remaining slot; increasing the count or undoing the change restores their original slot numbers.

New imports use 768 px detail by default, with up to 1024 px available. **Keep fine details** retains small accent regions and thin strokes that noise cleanup would otherwise remove, and protects their shared boundaries from collapsing during smoothing. Turn it off when specks in a noisy image matter more than tiny details. Paint is applied after automatic cleanup so small manual corrections are retained. Filament choices and project names survive reopening and detail changes.

Color matching uses a perceptual Oklab palette fitted to real source samples. Edge mixtures are downweighted before palette selection so an antialias fringe does not displace a small accent. Fine-detail mode retains exact illustration colors, limits the influence of very large background regions during palette selection, and protects the area of small islands and holes, narrow channels, and straight corners while smoothing shared boundaries. Solid fills stay anchored to well supported RGB colors. Use **Match original colors** in Image & colors or the import dialog to refresh an older project's palette; this updates filament colors while keeping brush corrections, size, and placement.

Background removal samples the full image border rather than trusting the first corner. Transparent corners are supported, and the tighter flood threshold preserves pale details beside a plain background.

Dimensions accept bare numbers or `mm` as millimeters. A suffix such as `4in`, `4 inches`, or `4"` converts on Enter or leaving the field (4 inches = 101.6 mm). All model and export dimensions remain in mm.

## Bambu Studio

3MF exports contain standard base-material colors and a multipart component assembly, plus Bambu `Metadata/model_settings.config` part/extruder assignments and `Metadata/project_settings.config` filament color arrays. They do **not** contain printer-specific slicing settings or G-code. Open the 3MF **as a project**, choose your own printer/material/process, and map filament slots to your AMS before slicing. Import behavior varies by slicer version; the app does not claim that a print has been sliced or physically test-printed.

The **Open in Bambu Studio** workflow downloads the local colored 3MF and invokes the `bambustudio://` application handler. Drag the downloaded file into Studio or use File → Open Project. Bambu's remote import handler requires a remotely accessible file URL; a browser blob URL cannot be fetched by a native application. CoasterGen deliberately keeps the export local, so there is no pretend direct-file handoff or file upload service.

## Accuracy

Artwork is rasterized at 192, 320, 512, 768 (new imports), or 1024 pixels on its longest edge. Smoothing resolves antialiased edge pixels against their actual neighboring colors, removes isolated specks, and relaxes shared boundaries. It fits local cubic Bézier curves while protecting sharp corners, resamples both sides from the same shared curve, and simplifies at 0.06-pixel tolerance. Color junctions remain fixed and adjoining regions reuse the same vertices. SVG inputs are also rasterized and color-reduced; their original Bézier geometry is not retained. A 100 mm image at 320 pixels has roughly 0.31 mm source resolution before scaling. Very small features may be below a printer nozzle's printable width. Total-volume PLA weight is an estimate at 1.24 g/cm³; actual slicer infill, purge, and supports change material usage. Magnet fit depends on your printer; test before gluing.

## Stack

React, TypeScript, Vite, Three.js, Manifold WASM, Clipper, fit-curve, fflate, Lucide, and self-hosted DM Sans. Source code is in `src/`; the compute worker is `src/engine.worker.ts`.

Keyboard shortcuts: ⌘/Ctrl+Z undo; ⌘/Ctrl+Shift+Z redo; ⌘/Ctrl+S save a project copy; F fit the preview.

## Brand assets

The Bambu Studio icon in `public/bambu-studio.svg` is the official application icon from [bambulab/BambuStudio](https://github.com/bambulab/BambuStudio/blob/master/resources/images/BambuStudio.svg). Bambu Studio and GitHub marks identify the linked products; CoasterGen is an independent project.

For browser tests, install Chromium with `npx playwright install --with-deps chromium`. An existing Chromium executable can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The regression suite runs desktop and mobile flows for tutorial persistence, repeated/rapid palette reduction in 3D, import previews and color mapping, colored exports, magnet validation, project recovery, and invalid files.

Image import includes a **Quality** preset: extra-high 1024 px detail, background removal and edge smoothing on, and fine-detail protection off. Its settings remain individually adjustable. The **Blank** template starts with a plain white coaster and exports only its base.

Use **Paint & erase → Fill area**, choose a filament, and click one connected color region. Separate islands keep their color; fills support undo and persist in project files and exports. **Crop image** lets you drag a selection or enter percentages before applying; **Reset crop** restores the original image and its brush edits within the import dialog. **Center** resets X and Y to exactly zero. Mapping menus identify filaments by their actual hex colors.

**Export to MakerWorld** downloads the colored 3MF, opens MakerWorld’s model upload page, and provides optional CoasterGen credit text with a copy button. Upload and publication are completed by the user on MakerWorld. MakerWorld icon: [Dashboard Icons](https://github.com/homarr-labs/dashboard-icons/blob/main/svg/maker-world.svg); brand marks belong to their respective owners.
