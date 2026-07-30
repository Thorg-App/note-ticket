import { TicketStore, TicketsDirectory } from "../core/ticket-store.js";
import { CliError } from "./cli-error.js";

/** Stderr wording of bash `init_tickets_dir`, which several BDD scenarios assert. */
const NO_GIT_REPO_MESSAGE = "not inside a git repository";
const NO_GIT_REPO_HINT = "Run inside a git repo, or set TICKETS_DIR env var";

/**
 * Opens the tickets directory for a READ command, mirroring bash `init_tickets_dir`:
 * the directory must already exist, because only `create` may bring it into being.
 */
export class StoreResolver {
    /** @throws CliError when there is no repo to read, or no tickets directory in it. */
    static forReadCommand(): TicketStore {
        const resolution = TicketsDirectory.resolve();
        if (resolution.kind === "no-git-repo") {
            throw new CliError(NO_GIT_REPO_MESSAGE, [NO_GIT_REPO_HINT]);
        }
        const store = new TicketStore(resolution.path);
        if (!store.exists()) {
            throw new CliError(`tickets directory '${resolution.path}' does not exist`);
        }
        return store;
    }
}
