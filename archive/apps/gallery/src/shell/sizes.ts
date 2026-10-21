/**
 * The terminal sizes the preview frame can take, cycled with `z`. `fit` takes the whole preview;
 * the others are fixed sizes to judge a view at, clipped when the gallery's own window is smaller.
 */

export type FrameSize = { readonly name: string; readonly columns: number; readonly rows: number };

/** Columns and rows a frame is actually drawn at. */
export type Area = { readonly columns: number; readonly rows: number };

const fixed = (columns: number, rows: number): FrameSize => ({
  name: `${columns}×${rows}`,
  columns,
  rows,
});

export const FIT: FrameSize = {
  name: "fit",
  columns: Number.POSITIVE_INFINITY,
  rows: Number.POSITIVE_INFINITY,
};

export const SIZES: readonly [FrameSize, ...FrameSize[]] = [
  FIT,
  fixed(120, 30),
  fixed(100, 30),
  fixed(80, 24),
  fixed(60, 20),
];

/** The border drawn around a fixed size takes a column or row on each side. */
const BORDER = 2;

/** The area `size` is drawn at inside `room`: all of it at `fit`, else the size inside the border. */
export const frameArea = (size: FrameSize, room: Area): Area =>
  size === FIT
    ? room
    : {
        columns: Math.max(0, Math.min(size.columns, room.columns - BORDER)),
        rows: Math.max(0, Math.min(size.rows, room.rows - BORDER)),
      };

/** `80×24`, `80×24 clipped to 70×20`, or `fit 130×40`. */
export const describeFrame = (size: FrameSize, area: Area): string => {
  const shown = `${area.columns}×${area.rows}`;
  if (size === FIT) return `fit ${shown}`;

  if (area.columns < size.columns || area.rows < size.rows) {
    return `${size.name} clipped to ${shown}`;
  }

  return size.name;
};
