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

/** A command's arguments, read only by the names it declared. */
export interface Args {
  has(name: string): boolean;
  value(name: string): string | undefined;
}

/** The flags as the command takes them, e.g. `--force, --profile <slug>`. */
const flagUsage = ({ switches = [], values = {} }: Flags): string =>
  [...switches, ...Object.entries(values).map(([name, value]) => `${name} <${value}>`)].join(", ");

/** What `argv` holds that the command does not take, one message each. A bare `--` is skipped. */
function unexpectedArguments(
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
      // A missing value is left to flagValue, which says so.
      if (!inline && !argv[index + 1]?.startsWith("--")) index += 1;
    } else if (switches.includes(name)) {
      if (inline) messages.push(`${name} takes no value`);
    } else {
      messages.push(`unknown option ${name}`);
    }
  }
  return messages;
}

/**
 * Checks `argv` against the flags a command takes and returns their reader, so the
 * declaration is the only list of them. Anything else (a typo, a value given to a switch, a
 * stray word) throws `error(problems, usage)` and stops the command instead of being
 * ignored. Reading a flag that was not declared is a bug and throws.
 */
export function parseArgs(
  argv: readonly string[],
  flags: Flags,
  error: (problems: string[], usage: string) => Error,
): Args {
  const usage = flagUsage(flags);
  const problems = unexpectedArguments(argv, flags);
  if (problems.length > 0) throw error(problems, usage);
  const declared = (name: string, names: readonly string[]) => {
    if (!names.includes(name)) throw new Error(`${name} is read but not declared`);
  };
  return {
    has: (name) => {
      declared(name, flags.switches ?? []);
      return argv.includes(name);
    },
    value: (name) => {
      declared(name, Object.keys(flags.values ?? {}));
      return flagValue(argv, name, (message) => error([message], usage));
    },
  };
}
