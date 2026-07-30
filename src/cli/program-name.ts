import { basename } from "node:path";

const DEFAULT_PROGRAM_NAME = "ticket";

/** Env var the bash dispatcher sets to its own `$0` before `exec node`. */
const INVOKED_AS_ENV_VAR = "TICKET_INVOKED_AS";

/**
 * The name the user typed, as usage text must spell it (`tk`, `ticket`, …).
 *
 * WHY the env var: the bash dispatcher `exec`s `node dist/ticket.mjs`, so `argv[1]` is the
 * bundle rather than the invoked script, and node cannot see bash's `$0`. Bash passes it
 * along. Several bash usage lines interpolate `$(basename "$0")`, so hardcoding `ticket`
 * would print a command the user cannot run under any other name.
 */
export class ProgramName {
    static invoked(env: NodeJS.ProcessEnv = process.env, argv: readonly string[] = process.argv): string {
        const invokedAs = env[INVOKED_AS_ENV_VAR];
        if (invokedAs) {
            return basename(invokedAs);
        }
        const script = argv[1];
        return script ? basename(script) : DEFAULT_PROGRAM_NAME;
    }
}
