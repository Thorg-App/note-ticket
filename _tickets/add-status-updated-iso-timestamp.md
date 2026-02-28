---
id: 7f209dtd2styppry2w3uqlg8c
title: "Add status updated iso timestamp"
status: in_progress
deps: []
links: []
created_iso: 2026-02-28T01:53:54Z
type: task
priority: 0
assignee: nickolaykondratyev
---

Add 'status_updated_iso' timestamp

It should be similar to `created_iso` as it should also contain ISO8601 timestamp.
```
created_iso
```

However, instead of created timestamp it should contain the timestamp when last time 'status' was updated/changed. Hence, anytime we updated the status the 'status_updated_iso' timestamp should reflect this change in ISO8601 format.

Make sure there are sufficient new testing added for this use case.