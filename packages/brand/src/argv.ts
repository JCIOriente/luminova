/**
 * The value of `--name <value>` or `--name=<value>`, undefined when the flag is absent.
 * A flag without a value is an error, built by the caller so it keeps its own error type.
 */
export function flagValue(
  argv: readonly string[],
  name: string,
  error: (message: string) => Error,
): string | undefined {
  for (const [index, arg] of argv.entries()) {
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    if (arg === name) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw error(`${name} needs a value.`);
      return value;
    }
  }
  return undefined;
}
