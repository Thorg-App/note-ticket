---
id: nid_y97pkv7n102f9wklmlhhesr6e_e
title: "Lets make sure that extra statuses still block a ticket"
status: open
deps: []
links: []
created_iso: 2026-08-12T23:39:04Z
status_updated_iso: 2026-08-12T23:39:04Z
type: task
priority: 3
assignee: nickolaykondratyev
tags: []
---

Let's make sure that a different status than 'closed' still is treated as a blocker for the ticket if the status is not explicitly stated in the known statuses.

So that we can support 

`t1 --deps> t2`
t2 has `status: some-other-status` then `t1` is NOT treated as ready. It will be seen as blocked on t2 getting to `closed` status. 

As i understand this behavior should already be the case and we just need testing for this.