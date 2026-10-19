/** Tool output: the most a call's result or failure message may hold before it is cut. */

/** Output past either limit is cut to its first and last halves. */
export const outputLimits = { characters: 50_000, lines: 2_000 } as const;
