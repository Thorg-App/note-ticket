import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CustomTicketStatusParser, InvalidTicketStatusError } from "../src/core/custom-ticket-status.js";

describe("CustomTicketStatusParser", () => {
    for (const valid of ["p2", "backlog", "Waiting_on-QA", "2"]) {
        it(`GIVEN '${valid}' WHEN validated THEN it is accepted`, () => {
            assert.equal(CustomTicketStatusParser.of(valid), valid);
        });
    }

    for (const invalid of ["", "p 2", "a:b", "-p2", "_p2", '"p2"', "p2\nid: x"]) {
        it(`GIVEN ${JSON.stringify(invalid)} WHEN validated THEN InvalidTicketStatusError is thrown`, () => {
            assert.throws(() => CustomTicketStatusParser.of(invalid), InvalidTicketStatusError);
        });
    }
});
