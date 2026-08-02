/**
 * The bytes `add-note` appends, and the only place that knows the note layout. Pure —
 * shared by the CLI's `add-note` and the library's `TicketManager.addNote`.
 */

import { LINE_SEPARATOR } from "./text.js";

/** The section notes are collected under. */
const NOTES_HEADING = "## Notes";

/**
 * bash `grep -q '^## Notes' "$file"`: any line STARTING with the heading, anywhere in the
 * FILE. So `## Notesish` counts as the section already existing, and so would the heading
 * inside a frontmatter block — both verified against ./ticket.
 */
const NOTES_HEADING_PRESENT = /^## Notes/m;

export class TicketNote {
    /**
     * The exact bytes bash's two `printf … >> "$file"` calls appended.
     *
     * @param file the whole current file text. WHY the whole FILE and not the body decides the
     *   heading: bash's `grep -q '^## Notes'` scanned every line, frontmatter included, and
     *   appending a second `## Notes` under an existing one would fork the section.
     */
    static appendedTo(file: string, note: string, timestamp: string): string {
        const heading = NOTES_HEADING_PRESENT.test(file)
            ? ""
            : `${LINE_SEPARATOR}${NOTES_HEADING}${LINE_SEPARATOR}`;
        const stamp = `${LINE_SEPARATOR}**${timestamp}**${LINE_SEPARATOR}`;
        return `${heading}${stamp}${LINE_SEPARATOR}${note}${LINE_SEPARATOR}`;
    }
}
