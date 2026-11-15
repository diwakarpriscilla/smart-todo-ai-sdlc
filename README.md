# Smart To-Do (Static HTML/CSS/JS)

A simple to-do list app that runs entirely in the browser using LocalStorage.

## Running the app

1. Open `application/index.html`in your browser, or use a local static server.
 2. Recommended: VS Code + "Live Server"
   - App URL: `http://127.0.0.1:5500/application/index.html`

## Features

- Add tasks
## - Mark tasks complete by clicking the task name
- Delete tasks
- Persistence via browser LocalStorage
- *New* - Set an optional due date per task
- *New* - Optional in-app reminder time (toast notification)


## Data model (backward-compatible)

Tasks are stored in LocalStorage as a JSON array under the key `tasks`.

- Old saved tasks (only `name` and `completed`) still load correctly.
 - New fields are optional: `dueDate`, `remindAt`, `reminderFired` 

## Limitations

- Reminders are *in-app only*. They will only fire while the page is open (interval polling).
- The app does not include background scheduling (service worker/backend).

