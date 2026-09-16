/**
 * A user-chosen status name (`p2`, `backlog`, …) beyond the built-in `VALID_TICKET_STATUSES`.
 *
 * WHY it needs no behavior of its own: `ready`/`blocked` treat ONLY `open`/`in_progress` as
 * active and only `closed` as finished, so a custom status is automatically "parked" — never
 * offered for pick up, and still blocking its dependents (the same as `punted`).
 */

declare const CUSTOM_TICKET_STATUS_BRAND: unique symbol;

/** Text that passed `CustomTicketStatusParser.of` — branded, so a raw typo is still a type error. */
export type CustomTicketStatus = string & { readonly [CUSTOM_TICKET_STATUS_BRAND]: true };

/**
 * Letters, digits, `_` and `-`, starting with a letter or digit.
 *
 * WHY this narrow: the value is written UNQUOTED into frontmatter, so whitespace, `:`, quotes
 * or a newline would corrupt the file; a leading `-` would read as a CLI flag.
 */
const CUSTOM_STATUS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Plain-language rule, shared by every rejection message. */
export const CUSTOM_TICKET_STATUS_RULE = "letters, digits, '_' and '-', starting with a letter or digit";

export class InvalidTicketStatusError extends Error {
    constructor(readonly statusText: string) {
        super(`invalid status '${statusText}'. A custom status may contain only ${CUSTOM_TICKET_STATUS_RULE}`);
        this.name = "InvalidTicketStatusError";
    }
}

export class CustomTicketStatusParser {
    static isValid(text: string): boolean {
        return CUSTOM_STATUS_PATTERN.test(text);
    }

    /** @throws InvalidTicketStatusError when `text` breaks `CUSTOM_TICKET_STATUS_RULE`. */
    static of(text: string): CustomTicketStatus {
        if (!CustomTicketStatusParser.isValid(text)) {
            throw new InvalidTicketStatusError(text);
        }
        return text as CustomTicketStatus;
    }
}
