import { spawnSync } from "node:child_process";

import { ExitCode } from "./exit-codes.js";
import { SpawnedChild } from "./spawned-child.js";

const TICKET_PAGER_ENV_VAR = "TICKET_PAGER";
const PAGER_ENV_VAR = "PAGER";
/** bash `read -r -a pager_cmd <<<"$TICKET_PAGER"` splits on runs of whitespace. */
const WHITESPACE = /\s+/;

/**
 * Long output goes through the user's pager, exactly when bash sent it there.
 *
 * WHY the TTY test: `tk show x > file` and `tk show x | grep …` must produce the text
 * itself, not hand it to `less`. bash gated on `[[ -t 1 ]]` for that reason, and a pager
 * spawned for a redirected stdout would corrupt every scripted use of the command.
 */
export class Pager {
    /** Writes `text` to stdout, or through the pager, and returns the exit code to use. */
    static write(text: string): number {
        const command = Pager.command();
        if (command === undefined) {
            process.stdout.write(text);
            return ExitCode.SUCCESS;
        }
        return Pager.pipeThrough(command, text);
    }

    /**
     * The pager as argv, or undefined when the output is not going to a terminal or no
     * pager is configured. `TICKET_PAGER` wins over `PAGER`, as in bash.
     */
    private static command(): readonly string[] | undefined {
        if (process.stdout.isTTY !== true) {
            return undefined;
        }
        const configured = process.env[TICKET_PAGER_ENV_VAR] || process.env[PAGER_ENV_VAR] || "";
        const argv = configured.trim().split(WHITESPACE).filter((word) => word !== "");
        return argv.length === 0 ? undefined : argv;
    }

    /**
     * bash ran `_show_output | "$PAGER"` under `set -o pipefail`, so the pager's status was
     * the command's status — including 127 when the configured pager does not exist.
     */
    private static pipeThrough(command: readonly string[], text: string): number {
        const [binary, ...args] = command as [string, ...string[]];
        const result = spawnSync(binary, args, { input: text, stdio: ["pipe", "inherit", "inherit"] });
        return SpawnedChild.exitCode(result, binary);
    }
}
