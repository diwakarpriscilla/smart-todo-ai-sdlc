# Smart To-Do

A small, framework-free (html/css/vanilla JS) to-do app that persists tasks in the browser via LocalStorage.

## Features

- Create tasks
- Mark tasks completed/incompleted
- Delete tasks
- Persistence via LocalStorage
- **Edit taskname (incomplete tasks only)**
## Task edit behavior (demo scope)

- You can rename only **incomplete** tasks.
- Completed tasks are **not editable** (the Edit button is not shown, and the JS has a guard to prevent renaming even if called programmatically).
- Edits are saved to LocalStorage and persist after a refresh.

## Local setup & running

This app is static and does not require a backend.

*Option A (easiest): vs code Live Server*

1. Open this repo in VS Code.
2. Install the "Live Server" extension if you don't already have it.
3. Right-click `application/index.html` → "Open with Live Server".
4. Open the URL that Live Server provides (for example: `http://127.0.0.1:5500/application/index.html`).

**Option B (any static server): Python **
1. From the repo root, run:

   ```bash
   python -m http.server 5500
   ```

2. Visit: `http://127.0.0.1:5500/application/index.html`

## Acceptance test (instructions)

Manual browser steps for the demo scenario:

 1. Load the app (e.g. `http://127.0.0.1:5500/application/index.html`).
 2. Create a task named **Buy groceries**.
 3. Click **Edit** on the incomplete task.
 4. Change the name to **Buy groceries and milk**.
 5. Click **Save**.
 6. Verify the updated name appears in the list.
 7. Refresh the page.
 8. Verify the updated name persists after the refresh.

## Development / testing

- Run the tests:

  ```bash
  node --test tests/
  ```
