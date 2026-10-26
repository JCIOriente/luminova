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
    if (arg.startsWith(`${name}=`)) {
      const value = arg.slice(name.length + 1);
      if (!value) throw error(`${name} needs a value.`);
      return value;
    }
    if (arg === name) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw error(`${name} needs a value.`);
      return value;
    }
  }
  return undefined;
}

/** The flags a command takes: switches stand alone, and each value flag names its value. */
export interface Flags {
  switches?: readonly string[];
  values?: Readonly<Record<string, string>>;
}

/** The flags as the command takes them, e.g. `--force, --profile <slug>`. */
export const flagUsage = ({ switches = [], values = {} }: Flags): string =>
  [...switches, ...Object.entries(values).map(([name, value]) => `${name} <${value}>`)].join(", ");

/**
 * What `argv` holds that the command does not take, one message each, so a typo stops the
 * command instead of being ignored. A bare `--` is skipped. A value flag missing its value
 * is left to `flagValue`, which says so.
 */
export function unexpectedArguments(
  argv: readonly string[],
  { switches = [], values = {} }: Flags,
): string[] {
  const messages: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--") continue;
    if (!arg.startsWith("-")) {
      messages.push(`unexpected argument "${arg}"`);
      continue;
    }
    const [name = arg] = arg.split("=", 1);
    const inline = name.length < arg.length;
    if (Object.hasOwn(values, name)) {
      if (!inline && !argv[index + 1]?.startsWith("--")) index += 1;
    } else if (switches.includes(name)) {
      if (inline) messages.push(`${name} takes no value`);
    } else {
      messages.push(`unknown option ${name}`);
    }
  }
  return messages;
}
