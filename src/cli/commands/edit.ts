import { spawnSync } from "node:child_process";

import { LINE_SEPARATOR } from "../../core/text.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { UsageError } from "../cli-error.js";
import type { CommandEnvironment } from "../command-environment.js";
import { ExitCode } from "../exit-codes.js";
import { SpawnedChild } from "../spawned-child.js";
import { TicketLookup } from "../ticket-lookup.js";

/** bash `cmd_edit`'s usage line, which names the literal `ticket`, not the invoked name. */
const USAGE = "Usage: ticket edit <id>";

const EDITOR_ENV_VAR = "EDITOR";
/** bash `${EDITOR:-vi}`. */
const DEFAULT_EDITOR = "vi";

/** What is printed instead of launching an editor when there is no terminal to draw on. */
const PATH_PREFIX = "Edit ticket file: ";

/** Which editor to launch. */
export class Editor {
    /**
     * bash `"${EDITOR:-vi}"`, including that an EMPTY `EDITOR` falls back to `vi`.
     *
     * WHY-NOT splitting the value into words the way `TICKET_PAGER` is split: bash expanded
     * `"$EDITOR"` QUOTED, so `EDITOR="code -w"` was looked up as one filename containing a
     * space and failed with "command not found". Splitting it here would make a command bash
     * rejected start working, which is a behavior change nobody asked for — and `$EDITOR`
     * holding a bare binary is the overwhelmingly common case.
     */
    static configured(env: NodeJS.ProcessEnv): string {
        return env[EDITOR_ENV_VAR] || DEFAULT_EDITOR;
    }
}

/** `edit <id>`: open a ticket in the user's editor, or say where it is. */
export class EditCommand {
    static run(
        store: TicketStore,
        args: readonly string[],
        environment: CommandEnvironment,
    ): number {
        if (args.length < 1) {
            throw new UsageError([USAGE]);
        }
        const ticket = TicketLookup.byId(store.loadAll(), args[0] as string);
        if (!EditCommand.canRunAnEditor(environment)) {
            process.stdout.write(`${PATH_PREFIX}${ticket.path}${LINE_SEPARATOR}`);
            return ExitCode.SUCCESS;
        }
        return EditCommand.launch(Editor.configured(process.env), ticket.path);
    }

    /**
     * bash `[ -t 0 ] && [ -t 1 ]`: BOTH streams. A full-screen editor needs a terminal to read
     * keystrokes from as much as one to draw on, so `tk edit x > file` and
     * `tk edit x < /dev/null` both print the path instead — which is also what makes the
     * command scriptable.
     */
    private static canRunAnEditor(environment: CommandEnvironment): boolean {
        return environment.terminal.isStdinTerminal() && environment.terminal.isStdoutTerminal();
    }

    /**
     * The editor owns the terminal (`stdio: "inherit"`) and its exit code becomes ours, as it
     * did in bash where it was the last command of the function.
     */
    private static launch(editor: string, path: string): number {
        return SpawnedChild.exitCode(spawnSync(editor, [path], { stdio: "inherit" }), editor);
    }
}
