const svg = (body: string) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">' +
  body +
  "</svg>";
const frame = (body: string) =>
  '<defs><clipPath id="disc"><circle cx="200" cy="200" r="174"/></clipPath></defs><g clip-path="url(#disc)">' +
  body +
  "</g>";
// Deliberately broad filled shapes and strokes: all features remain printable
// at a typical 100 mm coaster size, without hairlines or ambiguous SVG fills.
export const SAMPLES = [
  {
    id: "sunset",
    name: "Solstice",
    subtitle: "Sun and architectural arches",
    svg: svg(
      '<circle cx="200" cy="200" r="174" fill="#263D39"/>' +
        '<path d="M85 316V180a115 115 0 0 1 230 0v136h-27V180a88 88 0 0 0-176 0v136Z" fill="#F2E9D8"/>' +
        '<circle cx="200" cy="174" r="58" fill="#DFAB49"/>' +
        '<path d="M137 316v-75h126v75Z" fill="#D6603F"/>' +
        '<path d="M137 254h126v12H137Zm0 29h126v12H137Z" fill="#263D39"/>' +
        '<path d="M120 331h160v12H120Z" fill="#DFAB49"/>',
    ),
  },
  {
    id: "bloom",
    name: "Ginkgo",
    subtitle: "Botanical fan leaves",
    svg: svg(
      '<circle cx="200" cy="200" r="174" fill="#DFAB49"/>' +
        '<path d="M207 326c-8-81-9-152 9-224" fill="none" stroke="#263D39" stroke-width="12" stroke-linecap="round"/>' +
        '<path d="M204 237C91 219 51 143 91 96c27-32 67-23 87-4 24-44 78-35 91-1 27-8 69 9 67 45-4 62-69 92-132 101Z" fill="#263D39"/>' +
        '<path d="M206 223c-12-55-38-97-66-123m65 123c-2-49 7-90 31-126m-29 126c39-27 68-54 92-83" fill="none" stroke="#F2E9D8" stroke-width="8" stroke-linecap="round"/>' +
        '<path d="M201 291c-56 6-95-14-105-49 43-27 90-12 105 49Z" fill="#D6603F"/>' +
        '<path d="M203 292c31-50 78-62 111-39-14 37-58 52-111 39Z" fill="#D6603F"/>',
    ),
  },
  {
    id: "waves",
    name: "Tidal",
    subtitle: "Layered waves and a setting sun",
    svg: svg(
      frame(
        '<circle cx="200" cy="200" r="174" fill="#DFAB49"/>' +
          '<circle cx="233" cy="132" r="48" fill="#D6603F"/>' +
          '<path d="M20 211C86 150 122 151 189 206S300 262 380 194V390H20Z" fill="#263D39"/>' +
          '<path d="M20 253C87 193 125 196 191 247S307 301 380 237V390H20Z" fill="#F2E9D8"/>' +
          '<path d="M20 296C87 237 126 239 191 290S308 344 380 280V390H20Z" fill="#D6603F"/>' +
          '<path d="M20 339C87 281 127 282 192 333S309 387 380 323V390H20Z" fill="#263D39"/>',
      ),
    ),
  },
  {
    id: "orbit",
    name: "Bauhaus",
    subtitle: "Balanced circles and color blocks",
    svg: svg(
      frame(
        '<circle cx="200" cy="200" r="174" fill="#263D39"/>' +
          '<path d="M26 26h174v174H26Z" fill="#D6603F"/>' +
          '<path d="M200 200h174v174H200Z" fill="#DFAB49"/>' +
          '<path d="M200 50a150 150 0 0 1 150 150H200Z" fill="#F2E9D8"/>' +
          '<path d="M200 350A150 150 0 0 1 50 200h150Z" fill="#F2E9D8"/>' +
          '<circle cx="200" cy="200" r="76" fill="#263D39"/>' +
          '<circle cx="200" cy="200" r="49" fill="#D6603F"/>' +
          '<circle cx="200" cy="200" r="22" fill="#F2E9D8"/>' +
          '<circle cx="104" cy="103" r="23" fill="#DFAB49"/>' +
          '<circle cx="296" cy="297" r="23" fill="#D6603F"/>',
      ),
    ),
  },
  {
    id: "blank",
    name: "Blank",
    subtitle: "A clean white coaster",
    svg: svg(""),
  },
];
export const svgDataUrl = (value: string) =>
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(value);
