/**
 * The id-resolution failures `TicketManager` methods throw. Library-level (not core's)
 * because core reports resolution outcomes as data (`IdResolution`); turning an outcome
 * into a thrown error is this facade's contract.
 */

/** No ticket's id equals or contains the searched text. */
export class TicketNotFoundError extends Error {
    constructor(readonly search: string) {
        super(`ticket '${search}' not found`);
        this.name = new.target.name;
    }
}

/** More than one ticket matched at the winning tier (exact, else substring). */
export class AmbiguousTicketIdError extends Error {
    constructor(
        readonly search: string,
        /** The full ids of every ticket that matched. */
        readonly matchingIds: readonly string[],
    ) {
        super(`ticket id '${search}' is ambiguous: matches ${matchingIds.join(", ")}`);
        this.name = new.target.name;
    }
}
