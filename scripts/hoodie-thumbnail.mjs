import {readFileSync,writeFileSync} from "node:fs";
import {unzipSync} from "fflate";
// Reuse the supplied model's own preview, rather than a decorative text graphic.
const files=unzipSync(readFileSync(new URL("../public/hoodie-base.3mf",import.meta.url)));
const preview=files["Auxiliaries/.thumbnails/thumbnail_3mf.png"];
if(!preview)throw new Error("The bundled hoodie preview is missing");
writeFileSync(new URL("../public/hoodie-home.png",import.meta.url),preview);
