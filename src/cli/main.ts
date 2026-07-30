import { basename } from "node:path";

import { MissingTicketIdError } from "../core/id.js";
import type { TicketStore } from "../core/ticket-store.js";
import { CliError } from "./cli-error.js";
import { BlockedCommand } from "./commands/blocked.js";
import { HelpCommand } from "./commands/help.js";
import { LsCommand } from "./commands/ls.js";
import { ReadyCommand } from "./commands/ready.js";
import { ListOptions } from "./list-options.js";
import { StoreResolver } from "./store-resolver.js";

const DEFAULT_PROGRAM_NAME = "ticket";
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

/** How a read command turns an open tickets directory into printable output. */
type ReadCommandBody = (store: TicketStore, options: ListOptions) => string;

/**
 * CLI entrypoint. Mirrors the bash `case` dispatch in ./ticket for the commands
 * listed in that script's TS_COMMANDS.
 */
class Cli {
    /**
     * Name the user invoked us as, used in usage text.
     *
     * WHY the env var: the bash dispatcher exec's `node dist/ticket.mjs`, so
     * argv[1] is the bundle, not the invoked script. Bash passes its $0 along.
     */
    private static programName(): string {
        const invokedAs = process.env["TICKET_INVOKED_AS"];
        if (invokedAs) {
            return basename(invokedAs);
        }
        const arg = process.argv[1];
        return arg ? basename(arg) : DEFAULT_PROGRAM_NAME;
    }

    static run(argv: string[]): number {
        const command = argv[0] ?? "help";
        const args = argv.slice(1);
        try {
            return Cli.dispatch(command, args);
        } catch (error) {
            const failure = Cli.userFacingFailure(error);
            if (failure === undefined) {
                throw error;
            }
            process.stderr.write(failure.stderrText);
            return EXIT_FAILURE;
        }
    }

    private static dispatch(command: string, args: readonly string[]): number {
        switch (command) {
            case "help":
            case "--help":
            case "-h":
                process.stdout.write(HelpCommand.render(Cli.programName()));
                return EXIT_SUCCESS;
            case "ls":
            case "list":
                return Cli.read(args, (store, options) => LsCommand.render(store.loadAll(), options));
            case "ready":
                return Cli.read(args, (store, options) => ReadyCommand.render(store.loadAll(), options));
            case "blocked":
                return Cli.read(args, (store, options) => BlockedCommand.render(store.loadAll(), options));
            default:
                process.stderr.write(`Unknown command: ${command}\n`);
                process.stderr.write(HelpCommand.render(Cli.programName()));
                return EXIT_FAILURE;
        }
    }

    /**
     * The shape every read command shares: open an EXISTING tickets directory, then print
     * what the command renders. An existing-but-empty directory prints nothing and succeeds.
     */
    private static read(args: readonly string[], body: ReadCommandBody): number {
        const store = StoreResolver.forReadCommand();
        process.stdout.write(body(store, ListOptions.parse(args)));
        return EXIT_SUCCESS;
    }

    /**
     * The failure as the user should see it, or undefined for a defect, which must keep
     * its stack trace instead of masquerading as a usage error.
     */
    private static userFacingFailure(error: unknown): CliError | undefined {
        if (error instanceof CliError) {
            return error;
        }
        // A corrupt repo is the user's problem, not a defect, but core knows nothing of
        // the CLI, so its error is adopted into the one user-facing channel here.
        if (error instanceof MissingTicketIdError) {
            return new CliError(error.message);
        }
        return undefined;
    }
}

process.exitCode = Cli.run(process.argv.slice(2));
