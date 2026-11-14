# Implementation Plan: T01 – Task Due Dates & Reminders (E01)

This plan covers the implementation of due terms and in-app reminders for the *Smart To-Do* app.

Related Jira stories:
 - EPMCDMETST1-70787 – Set due date on a task
 - EPMCDMETST1-70788 – Set reminder time (in-app notification)

Note: The current repo is a static HTML/CSS/JS app using localStorage. There is no backend/cron job in this repo, so reminders are implemented via a front-end interval poller while the page is active. This maps to Jira's "in-app notification" notes for MVP.

## 1. Scope & Approach

1) Data model update: extend task object to store dueDate and remindAt (when set), plus one-shot flags to prevent duplicate notifications.
2) UI update: add due date input and (ptional) reminder inputs to task creation (and minimally update flow via an edat-task modal/form or in-list controls).
3) Reminder logic: a setTimeout/setInterval poller that scans tasks every N seconds and creates an in-app notification when remindAt ≤ now and not yet fired.
4) Overdue indicator: render overdue styling when dueDate < now and task not completed.

## 2. Task Breakdown (Mapped to Jira Stories)

See the Jira story mapping in the Planning Agent JSON output.

## 3. Dependencies

- Data model changes (adding dueDate/remindAt) must land before UI validation and list rendering of these fields.
- Reminder poller depends on a clear schema for remindAt in the task object.

## 4. Testing Strategy (high-level)

- Unit: date parsing/formatting, overdue calculation, reminder due evaluation (fire once).

- Integration:/manual: create task w/ dueDate, reload and verify persistence; set remindAt in near future, verify toast/notification appears and does not duplicate after reload.

- Accessibility: date inputs have labels; notification uses ARI live region (if implemented).

## 5. Risks & Mitigations

- Risk: Limited background reminders (browser cannot run jobs when tab is closed). Mitigation: document as minimum vsa in-app only MVP; future enhancement to add service worker/backend scheduler.
- Risk: Date/timezone handling. Mitigation: store ISO 8601 strings in localStorage and display using local time consistently.

## 6. Milestones

- M-1: Data model updated & due date shown w/ overdue indicator
 - M-2: Reminder configuration & in-app notifications
 - M-3: Hardening (edge cases, accessibility, final tests)
