import { TicketStore, TicketsDirectory } from "../core/ticket-store.js";

/** Stderr wording of bash `init_tickets_dir`, which several BDD scenarios assert. */
const NO_GIT_REPO_MESSAGES: readonly string[] = [
    "Error: not inside a git repository",
    "Run inside a git repo, or set TICKETS_DIR env var",
];

export type StoreResolution =
    | { readonly kind: "resolved"; readonly store: TicketStore }
    | { readonly kind: "error"; readonly messages: readonly string[] };

/**
 * Opens the tickets directory for a READ command, mirroring bash `init_tickets_dir`:
 * the directory must already exist, because only `create` may bring it into being.
 */
export class StoreResolver {
    static forReadCommand(): StoreResolution {
        const resolution = TicketsDirectory.resolve();
        if (resolution.kind === "no-git-repo") {
            return { kind: "error", messages: NO_GIT_REPO_MESSAGES };
        }
        const store = new TicketStore(resolution.path);
        if (!store.exists()) {
            return {
                kind: "error",
                messages: [`Error: tickets directory '${resolution.path}' does not exist`],
            };
        }
        return { kind: "resolved", store };
    }
}
