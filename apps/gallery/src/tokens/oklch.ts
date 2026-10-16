/**
 * OKLCH and sRGB hex conversion. OKLCH keeps lightness perceptual, so every hue's ramp step has the
 * same visual weight.
 */

export type Oklch = { readonly lightness: number; readonly chroma: number; readonly hue: number };

type Rgb = readonly [number, number, number];

const toLinearRgb = ({ lightness, chroma, hue }: Oklch): Rgb => {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m = (lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s = (lightness - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;

  return [
    4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s,
    -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s,
    -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s,
  ];
};

const isInGamut = (rgb: Rgb) => rgb.every((channel) => channel >= -0.0001 && channel <= 1.0001);

const encodeChannel = (linear: number) => {
  const clamped = Math.min(1, Math.max(0, linear));
  const gamma = clamped <= 0.003_130_8 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;

  return Math.round(gamma * 255)
    .toString(16)
    .padStart(2, "0");
};

/** Lowers chroma until the color fits in sRGB, keeping its lightness and hue. */
const fitGamut = (color: Oklch): Rgb => {
  const rgb = toLinearRgb(color);
  if (isInGamut(rgb) || color.chroma <= 0) return rgb;

  return fitGamut({ ...color, chroma: Math.max(0, color.chroma - 0.002) });
};

export const oklchToHex = (color: Oklch): string =>
  `#${fitGamut(color).map(encodeChannel).join("")}`;

const decodeChannel = (hex: string) => {
  const gamma = Number.parseInt(hex, 16) / 255;

  return gamma <= 0.040_45 ? gamma / 12.92 : ((gamma + 0.055) / 1.055) ** 2.4;
};

export const hexToOklch = (hex: string): Oklch => {
  const r = decodeChannel(hex.slice(1, 3));
  const g = decodeChannel(hex.slice(3, 5));
  const b = decodeChannel(hex.slice(5, 7));
  const l = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);
  const a = 1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s;
  const bAxis = 0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s;

  return {
    lightness: 0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    chroma: Math.hypot(a, bAxis),
    hue: ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360,
  };
};
