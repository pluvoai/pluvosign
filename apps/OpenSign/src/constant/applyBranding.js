// Runtime brand-color override.
//
// When BRAND_COLOR is set in the deployment's runtime env (see entrypoint.sh
// / .env.prod), this remaps the DaisyUI primary / secondary / accent colors so
// the UI matches the client's brand — with NO rebuild. When unset or invalid,
// the compiled Pluvo Sign palette is kept untouched.
//
// DaisyUI 4.12 stores theme colors as OKLCH components and consumes them as
// `oklch(var(--p) / <alpha>)`, so the override values are emitted in OKLCH.
import { getEnv } from "./Utils";

// sRGB channel (0-1) -> linear light
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// "#rrggbb" / "#rgb" -> { L, C, H } in OKLCH (L 0-1, C ~0-0.4, H 0-360)
function hexToOklch(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16) / 255);
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16) / 255);
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C: Math.hypot(a, bb), H };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// OKLCH triple in DaisyUI's "L% C H" format
const fmt = (c) =>
  `${(clamp(c.L, 0, 1) * 100).toFixed(3)}% ${c.C.toFixed(4)} ${c.H.toFixed(2)}`;
// shift lightness — perceptually uniform in OKLCH
const lighten = (c, d) => ({ L: clamp(c.L + d, 0, 1), C: c.C, H: c.H });
// readable text color to sit on top of a given background color
const content = (c) => (c.L > 0.62 ? "0% 0 0" : "100% 0 0");

const HEX_RE = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

export function applyBranding() {
  const raw = getEnv()?.BRAND_COLOR;
  if (!raw || !HEX_RE.test(raw.trim())) return; // keep the compiled palette
  const primary = hexToOklch(raw.trim());
  const secondary = lighten(primary, -0.1); // a touch darker
  const accent = lighten(primary, 0.08); // a touch lighter
  const css =
    `[data-theme="opensigncss"],[data-theme="opensigndark"]{` +
    `--p:${fmt(primary)};--pc:${content(primary)};` +
    `--s:${fmt(secondary)};--sc:${content(secondary)};` +
    `--a:${fmt(accent)};--ac:${content(accent)};}`;
  const el = document.createElement("style");
  el.id = "pluvo-brand-override";
  el.textContent = css;
  document.head.appendChild(el);
}
