import { MissingTicketIdError } from "../core/id.js";
import type { TicketStore } from "../core/ticket-store.js";
import { BrokenPipe } from "./broken-pipe.js";
import { CliError } from "./cli-error.js";
import { CommandEnvironment } from "./command-environment.js";
import { BlockedCommand } from "./commands/blocked.js";
import { ClosedCommand } from "./commands/closed.js";
import { CreateCommand } from "./commands/create.js";
import { DepCommand } from "./commands/dep.js";
import { HelpCommand } from "./commands/help.js";
import { LsCommand } from "./commands/ls.js";
import { QueryCommand } from "./commands/query.js";
import { ReadyCommand } from "./commands/ready.js";
import { ShowCommand } from "./commands/show.js";
import { STATUS_WRAPPERS, StatusCommand, type StatusWrapper } from "./commands/status.js";
import { ExitCode } from "./exit-codes.js";
import { ListOptions } from "./list-options.js";
import { StoreResolver } from "./store-resolver.js";

/** How a read command turns an open tickets directory into printable output. */
type ReadCommandBody = (store: TicketStore, options: ListOptions) => string;

/**
 * CLI entrypoint. Mirrors the bash `case` dispatch in ./ticket for the commands
 * listed in that script's TS_COMMANDS.
 */
class Cli {
    static run(argv: string[]): number {
        const command = argv[0] ?? "help";
        const args = argv.slice(1);
        try {
            return Cli.dispatch(command, args, CommandEnvironment.forProcess());
        } catch (error) {
            const failure = Cli.userFacingFailure(error);
            if (failure === undefined) {
                throw error;
            }
            process.stderr.write(failure.stderrText);
            return failure.exitCode;
        }
    }

    private static dispatch(
        command: string,
        args: readonly string[],
        environment: CommandEnvironment,
    ): number {
        switch (command) {
            case "help":
            case "--help":
            case "-h":
                process.stdout.write(HelpCommand.render(environment.programName));
                return ExitCode.SUCCESS;
            case "ls":
            case "list":
                return Cli.read(args, (store, options) => LsCommand.render(store.loadAll(), options));
            case "ready":
                return Cli.read(args, (store, options) => ReadyCommand.render(store.loadAll(), options));
            case "blocked":
                return Cli.read(args, (store, options) => BlockedCommand.render(store.loadAll(), options));
            case "closed":
                // The store, not loadAll(): `closed` orders by file mtime and reads only the
                // most recently modified files.
                return Cli.read(args, (store, options) => ClosedCommand.render(store, options));
            case "query":
                // Not Cli.read: `query` may hand its output to jq and exit with jq's code,
                // so it owns its own writing.
                return QueryCommand.run(StoreResolver.forReadCommand(), args);
            // Only the read-only `tree`/`cycle` subcommands reach us; bash still serves
            // `dep <id> <dep-id>`, which is a write. See TS_DEP_SUBCOMMANDS in ./ticket.
            case "dep":
                return DepCommand.run(StoreResolver.forReadCommand(), args);
            // Write commands. `create` is the only one allowed to create the tickets
            // directory (bash WRITE_COMMANDS); the rest require an existing one.
            case "create":
                return CreateCommand.run(StoreResolver.forCreateCommand(), args, environment);
            case "status":
                return StatusCommand.run(StoreResolver.forWriteCommand(), args, environment);
            case "start":
                return Cli.setStatus(args, environment, STATUS_WRAPPERS.start);
            case "close":
                return Cli.setStatus(args, environment, STATUS_WRAPPERS.close);
            case "reopen":
                return Cli.setStatus(args, environment, STATUS_WRAPPERS.reopen);
            case "show":
                // Not Cli.read: `show` takes an id rather than list filters, and may hand its
                // output to a pager and exit with the pager's code.
                return ShowCommand.run(StoreResolver.forReadCommand(), args);
            default:
                process.stderr.write(`Unknown command: ${command}\n`);
                process.stderr.write(HelpCommand.render(environment.programName));
                return ExitCode.FAILURE;
        }
    }

    /**
     * The shape every read command shares: open an EXISTING tickets directory, then print
     * what the command renders. An existing-but-empty directory prints nothing and succeeds.
     */
    private static read(args: readonly string[], body: ReadCommandBody): number {
        const store = StoreResolver.forReadCommand();
        process.stdout.write(body(store, ListOptions.parse(args)));
        return ExitCode.SUCCESS;
    }

    private static setStatus(
        args: readonly string[],
        environment: CommandEnvironment,
        wrapper: StatusWrapper,
    ): number {
        return StatusCommand.runWrapper(StoreResolver.forWriteCommand(), args, environment, wrapper);
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

BrokenPipe.reportAsSignalDeath();
process.exitCode = Cli.run(process.argv.slice(2));
