const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${body}</svg>`;
export const SAMPLES = [
  {
    id: "sunset",
    name: "Golden hour",
    subtitle: "A little mountain escape",
    svg: svg(
      `<defs><clipPath id="c"><circle cx="200" cy="200" r="184"/></clipPath></defs><g clip-path="url(#c)"><circle cx="200" cy="200" r="184" fill="#DFAB49"/><circle cx="252" cy="144" r="61" fill="#D6603F"/><path d="M5 283 129 137 268 298Z" fill="#263D39"/><path d="m95 177 34-40 35 41-25-8-11 14-15-14Z" fill="#F2E9D8"/><path d="m173 291 89-100 149 174H0Z" fill="#D6603F"/><path d="m234 223 28-32 29 34-19-6-10 11-13-12Z" fill="#F2E9D8"/><path d="M-2 322q105-77 209-8t211-7v98H0Z" fill="#263D39"/><path d="M-12 352q113-61 216-4t213-2" fill="none" stroke="#F2E9D8" stroke-width="8"/><path d="M25 100h89m-62 21h37m212 121h62" stroke="#F2E9D8" stroke-width="7" stroke-linecap="round"/></g>`,
    ),
  },
  {
    id: "bloom",
    name: "Flower power",
    subtitle: "Something for your desk",
    svg: svg(
      `<g fill="#D6603F"><ellipse cx="200" cy="114" rx="43" ry="88"/><ellipse cx="200" cy="286" rx="43" ry="88"/><ellipse cx="114" cy="200" rx="88" ry="43"/><ellipse cx="286" cy="200" rx="88" ry="43"/><ellipse cx="139" cy="139" rx="43" ry="88" transform="rotate(-45 139 139)"/><ellipse cx="261" cy="261" rx="43" ry="88" transform="rotate(-45 261 261)"/><ellipse cx="139" cy="261" rx="43" ry="88" transform="rotate(45 139 261)"/><ellipse cx="261" cy="139" rx="43" ry="88" transform="rotate(45 261 139)"/></g><circle cx="200" cy="200" r="68" fill="#DFAB49"/><circle cx="177" cy="188" r="9" fill="#263D39"/><circle cx="223" cy="188" r="9" fill="#263D39"/><path d="M172 219q28 29 56 0" fill="none" stroke="#263D39" stroke-width="8" stroke-linecap="round"/>`,
    ),
  },
  {
    id: "waves",
    name: "Slow tides",
    subtitle: "Go with the flow",
    svg: svg(
      `<defs><clipPath id="w"><circle cx="200" cy="200" r="182"/></clipPath></defs><g clip-path="url(#w)"><circle cx="200" cy="200" r="182" fill="#DFAB49"/><circle cx="125" cy="120" r="48" fill="#D6603F"/><path d="M0 210q50-65 100 0t100 0 100 0 100 0v200H0Z" fill="#263D39"/><path d="M0 255q50-65 100 0t100 0 100 0 100 0v170H0Z" fill="#F2E9D8"/><path d="M0 300q50-65 100 0t100 0 100 0 100 0v150H0Z" fill="#D6603F"/><path d="M0 343q50-65 100 0t100 0 100 0 100 0v100H0Z" fill="#263D39"/></g>`,
    ),
  },
  {
    id: "orbit",
    name: "In good orbit",
    subtitle: "A cosmic coffee break",
    svg: svg(
      `<circle cx="200" cy="200" r="118" fill="#D6603F"/><path d="M95 145a118 118 0 0 1 191-15H115m-28 33h220m-229 33h240m-235 33h234m-212 33h192m-152 33h109" stroke="#DFAB49" stroke-width="14"/><ellipse cx="200" cy="200" rx="183" ry="44" transform="rotate(-30 200 200)" fill="none" stroke="#263D39" stroke-width="16"/><path d="m72 62 5 15 16 5-16 5-5 15-5-15-16-5 16-5Zm254 210 6 18 18 6-18 6-6 18-6-18-18-6 18-6Z" fill="#DFAB49"/><circle cx="307" cy="64" r="11" fill="#263D39"/>`,
    ),
  },
];
export const svgDataUrl = (value: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
