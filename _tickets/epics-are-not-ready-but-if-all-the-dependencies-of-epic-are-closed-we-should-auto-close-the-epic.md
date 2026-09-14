---
working_dir: note-ticket
id: nid_tal154ct9c0afwe3l8aacsar6_e
title: "epics are not ready but if all the dependencies of epic are closed we should auto close the epic"
status: in_progress
deps: []
links: []
created_iso: 2026-09-14T23:21:48Z
status_updated_iso: 2026-09-14T23:24:27Z
type: task
priority: 3
assignee: nickolaykondratyev
tags: []
---

`epic` should not be given out WHEN we call for ready tickets, since they are not tasks.

However, we should have ability to auto close all epics, through CLI and interface API. We should be able Auto close all the epics that have all of their dependencies complete.

This call, auto-close call should be explicitly triggered, and we should not do this implicitly. That means a new CLI function to auto-close epics that have finished, as well as to the interface that we can call this programmatically from apps that use Ticket programmatically.