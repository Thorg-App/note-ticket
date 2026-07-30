/**
 * The two id-array relations a ticket carries in its frontmatter: `deps` and `links`.
 *
 * WHY one class for both: `dep`/`undep` and `link`/`unlink` differ only in the field they
 * address and in what they print. Adding an id, dropping an id and deciding "is it already
 * there" are one set of rules, and a second copy of them is how the two fields drift apart.
 */

import type { Ticket } from "./ticket.js";
import { TicketField } from "./ticket.js";

/** What adding ids to one ticket produced: the ticket to save, and how many were NEW. */
export interface RelationAddition {
    readonly ticket: Ticket;
    /** 0 means nothing changed, and `ticket` is the unmodified input. */
    readonly addedCount: number;
}

export class TicketRelation {
    private constructor(
        /** The frontmatter key holding the inline id array. */
        readonly field: string,
    ) {}

    /** `deps`: tickets that must finish before this one — directed, one side only. */
    static readonly DEPENDENCY = new TicketRelation(TicketField.DEPS);
    /** `links`: related tickets — symmetric, so both sides are written by `link`/`unlink`. */
    static readonly LINK = new TicketRelation(TicketField.LINKS);

    /**
     * The related ids, in file order. A ticket with no such field relates to nothing.
     *
     * DIVERGENCE (deliberate, whitelist #14): bash read this field through `yaml_field`,
     * whose `grep` finds nothing when the field is absent; under `set -euo pipefail` that
     * failing pipeline aborted `dep`/`undep` with exit 1 and NO message at all. A missing
     * field is simply an empty relation here.
     */
    idsOf(ticket: Ticket): readonly string[] {
        return ticket.arrayField(this.field);
    }

    /**
     * The ticket with `id` appended, or undefined when it is already related.
     *
     * DIVERGENCE (deliberate, whitelist #13): membership is exact ARRAY-ELEMENT equality.
     * bash asked `grep -q "$id"` of the raw array text, so an id that merely occurs as a
     * SUBSTRING of another one counted as present.
     */
    withAdded(ticket: Ticket, id: string): Ticket | undefined {
        const addition = this.withAllAdded(ticket, [id]);
        return addition.addedCount === 0 ? undefined : addition.ticket;
    }

    /**
     * The ticket with every id of `ids` that it does not have yet appended, in the order
     * given. `ids` is expected to be distinct — the callers resolve full ids first.
     */
    withAllAdded(ticket: Ticket, ids: readonly string[]): RelationAddition {
        const present = this.idsOf(ticket);
        const missing = ids.filter((id) => !present.includes(id));
        if (missing.length === 0) {
            return { ticket, addedCount: 0 };
        }
        return {
            ticket: ticket.withArrayField(this.field, [...present, ...missing]),
            addedCount: missing.length,
        };
    }

    /**
     * The ticket with `id` dropped, or undefined when it was not related in the first place.
     *
     * DIVERGENCE (deliberate, whitelist #13): removal drops array ELEMENTS. bash deleted the
     * matching TEXT with `sed`, so removing an id that is a substring of a sibling id mangled
     * that sibling (`[t-1, t-111]` minus `t-1` became `[11]`).
     */
    withRemoved(ticket: Ticket, id: string): Ticket | undefined {
        const present = this.idsOf(ticket);
        if (!present.includes(id)) {
            return undefined;
        }
        return ticket.withArrayField(
            this.field,
            present.filter((each) => each !== id),
        );
    }
}
