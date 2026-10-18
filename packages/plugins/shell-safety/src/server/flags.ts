/** Reads command arguments the way their programs do, closely enough to spot a dangerous flag. */

/** Arguments that are not options; a lone `-` is a positional (standard input). */
export const positionals = (args: ReadonlyArray<string>): ReadonlyArray<string> =>
  args.filter((arg) => arg === "-" || !arg.startsWith("-"));

/** True when `arg` is the long option `flag`, alone or as `flag=value`. */
const isLong = (arg: string, flag: string) => arg === flag || arg.startsWith(`${flag}=`);

/** True when `arg` is a cluster of short options such as `-ro` that includes `letter`. */
const inCluster = (arg: string, letter: string) =>
  arg.startsWith("-") && !arg.startsWith("--") && arg.slice(1).includes(letter);

/** True when any argument uses one of the short `letters` or `longs`. */
export const usesOption = (
  args: ReadonlyArray<string>,
  letters: ReadonlyArray<string>,
  longs: ReadonlyArray<string>,
): boolean =>
  args.some(
    (arg) =>
      letters.some((letter) => inCluster(arg, letter)) || longs.some((flag) => isLong(arg, flag)),
  );

/** True when any argument is exactly one of `words`, for programs like `find` with word options. */
export const usesWord = (args: ReadonlyArray<string>, words: ReadonlySet<string>): boolean =>
  args.some((arg) => words.has(arg));

/** True when `arg` is one of the `options`, alone or as `option=value`. */
export const isOneOf = (arg: string, options: ReadonlyArray<string>): boolean =>
  options.some((option) => isLong(arg, option));
