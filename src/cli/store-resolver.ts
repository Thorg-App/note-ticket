import { TicketStore, TicketsDirectory } from "../core/ticket-store.js";
import { CliError } from "./cli-error.js";

/** Stderr wording of bash `init_tickets_dir`, which several BDD scenarios assert. */
const NO_GIT_REPO_MESSAGE = "not inside a git repository";
const NO_GIT_REPO_HINT = "Run inside a git repo";

/**
 * Opens the tickets directory, mirroring bash `init_tickets_dir`: the directory must
 * already exist for every command except `create`, which is the only entry in bash's
 * `WRITE_COMMANDS` and therefore the only one allowed to bring it into being.
 */
export class StoreResolver {
    /** @throws CliError when there is no repo to read, or no tickets directory in it. */
    static forReadCommand(): TicketStore {
        return StoreResolver.existingStore();
    }

    /**
     * A mutating command other than `create` (`status`, `dep`, `link`, `add-note`, …).
     *
     * WHY a separate name when the rule is identical to a read's: that the two coincide is
     * bash's decision, not an identity. `create` alone is in `WRITE_COMMANDS`, so "it is a
     * write, therefore it may create the directory" is precisely the wrong inference, and a
     * caller reading `forReadCommand()` in a write command would be right to fix it.
     *
     * @throws CliError when there is no repo, or no tickets directory in it.
     */
    static forWriteCommand(): TicketStore {
        return StoreResolver.existingStore();
    }

    /**
     * `create`, the ONLY command that may create the tickets directory (bash `ensure_dir`).
     *
     * Bash calls `ensure_dir` BEFORE parsing arguments, so even a rejected `create` leaves
     * the directory behind; keeping the mkdir in the resolver reproduces that ordering.
     *
     * @throws CliError when there is no repo to create it in.
     */
    static forCreateCommand(): TicketStore {
        const store = new TicketStore(StoreResolver.ticketsDir());
        store.ensureDir();
        return store;
    }

    private static existingStore(): TicketStore {
        const ticketsDir = StoreResolver.ticketsDir();
        const store = new TicketStore(ticketsDir);
        if (!store.exists()) {
            throw new CliError(`tickets directory '${ticketsDir}' does not exist`);
        }
        return store;
    }

    private static ticketsDir(): string {
        const resolution = TicketsDirectory.resolve();
        if (resolution.kind === "no-git-repo") {
            throw new CliError(NO_GIT_REPO_MESSAGE, [NO_GIT_REPO_HINT]);
        }
        return resolution.path;
    }
}
