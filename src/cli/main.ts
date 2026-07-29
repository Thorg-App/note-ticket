import { basename } from "node:path";

import { HelpCommand } from "./commands/help.js";

const DEFAULT_PROGRAM_NAME = "ticket";

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
        switch (command) {
            case "help":
            case "--help":
            case "-h":
                process.stdout.write(HelpCommand.render(this.programName()));
                return 0;
            default:
                process.stderr.write(`Unknown command: ${command}\n`);
                process.stderr.write(HelpCommand.render(this.programName()));
                return 1;
        }
    }
}

process.exitCode = Cli.run(process.argv.slice(2));
