/**
 * The wall clock, in the only timestamp format the on-disk format knows.
 */

/** `2026-07-30T09:58:33.123Z` -> `2026-07-30T09:58:33Z`. */
const FRACTIONAL_SECONDS = /\.\d{3}Z$/;

/**
 * Source of `created_iso` / `status_updated_iso` / `closed_iso` values.
 *
 * WHY an interface rather than calling `new Date()` where the value is needed: the
 * timestamp is part of the file bytes every write command produces, so a test that
 * pins those bytes needs the time to hold still.
 */
export interface Clock {
    /** Bash `_iso_date`: `%Y-%m-%dT%H:%M:%SZ`, UTC, whole seconds. */
    nowIso(): string;
}

export class SystemClock implements Clock {
    nowIso(): string {
        return new Date().toISOString().replace(FRACTIONAL_SECONDS, "Z");
    }
}

/** A clock that never moves, for tests that assert exact file contents. */
export class FixedClock implements Clock {
    constructor(private readonly iso: string) {}

    nowIso(): string {
        return this.iso;
    }
}
