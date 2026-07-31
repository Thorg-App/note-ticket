/**
 * Ticket ID generation and partial-ID resolution.
 */

import { randomBytes } from "node:crypto";

const ID_PREFIX = "nid_";
const ID_SUFFIX = "_e";
const ID_RANDOM_LENGTH = 25;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Largest multiple of the alphabet size that fits in a byte, for rejection sampling. */
const UNBIASED_BYTE_LIMIT = 256 - (256 % ID_ALPHABET.length);

export class TicketId {
    /** `nid_<25 chars of [a-z0-9]>_e`. */
    static generate(): string {
        let random = "";
        while (random.length < ID_RANDOM_LENGTH) {
            for (const byte of randomBytes(ID_RANDOM_LENGTH)) {
                if (byte < UNBIASED_BYTE_LIMIT) {
                    random += ID_ALPHABET[byte % ID_ALPHABET.length];
                    if (random.length === ID_RANDOM_LENGTH) {
                        break;
                    }
                }
            }
        }
        return `${ID_PREFIX}${random}${ID_SUFFIX}`;
    }
}

/** One candidate the resolver searches. */
export interface IdCandidate {
    readonly id: string;
    readonly path: string;
}

export type IdResolution =
    | { readonly kind: "resolved"; readonly candidate: IdCandidate }
    | { readonly kind: "not-found"; readonly search: string }
    | { readonly kind: "ambiguous"; readonly search: string; readonly candidates: readonly IdCandidate[] };

/**
 * Resolves a user-supplied (possibly partial) ID against known ticket IDs.
 *
 * Tiers: an exact match wins over any number of substring matches; more than one
 * match at the winning tier is an ambiguity. Input is whitespace-trimmed because
 * IDs are routinely pasted by agents.
 */
export class IdResolver {
    constructor(private readonly candidates: readonly IdCandidate[]) {}

    resolve(search: string): IdResolution {
        const trimmed = search.trim();
        const exact = this.candidates.filter((candidate) => candidate.id === trimmed);
        const matches = exact.length > 0 ? exact : this.partialMatches(trimmed);
        const first = matches[0];
        if (first === undefined) {
            return { kind: "not-found", search: trimmed };
        }
        if (matches.length > 1) {
            return { kind: "ambiguous", search: trimmed, candidates: matches };
        }
        return { kind: "resolved", candidate: first };
    }

    /**
     * An empty search matches NOTHING.
     *
     * DIVERGENCE (deliberate): awk `index(s, "")` is 1, so bash resolves `""` to the
     * only ticket in a single-ticket repo and calls it "ambiguous" otherwise. That makes
     * `tk close "$UNSET_VAR"` mutate an arbitrary ticket, so it is treated as a bug, not
     * a contract. Confirmed as a bug by the owner in nid_5g3eta9cf7yi6iukmscxma6wc_e
     * (closed); divergence #9 in docs-internal/migration-to-ts-high-level.md.
     */
    private partialMatches(search: string): readonly IdCandidate[] {
        if (search === "") {
            return [];
        }
        return this.candidates.filter((candidate) => candidate.id.includes(search));
    }
}
