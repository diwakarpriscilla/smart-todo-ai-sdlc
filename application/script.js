// Task schema (backward-compatible)
// { name: string, completed: boolean, dueDate?: 'YYY-MM-DD', remindAt?: ISO datetime, reminderFired?: boolean }

let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

const taskInput = document.getElementById("taskInput");
const dueDateInput = document.getElementById("dueDateInput");
const remindAtInput = document.getElementById("remindAtInput");
const formError = document.getElementById("formError");

const addTaskButton = document.getElementById("addTaskButton");
const taskList = document.getElementById("taskList");
const taskSummary = document.getElementById("taskSummary");
const toasts = document.getElementById("toasts");

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

function showFormError(message) {
    if (!formError) return;
    formError.textContent = message;
    formError.hidden = false;
}

function clearFormError() {
    if (!formError) return;
    formError.textContent = "";
    formError.hidden = true;
}

function parseDateInputValue(value) {
    // Supports date/datetime-local values and validates invalid dates
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function getDueDateEndOfDay(dueDateStr) {
    if (!dueDateStr) return null;
    // End of due day in local time to avoid marking it overdue too early
    const parts = dueDateStr.split("-").map((n) => parseInt(n, 10));
    if (parts.length !== 3) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function isTaskOverdue(task) {
    if (task.completed) return false;
    const dueEnd = getDueDateEndOfDay(task.dueDate);
    if (!dueEnd) return false;
    return dueEnd.getTime() < Date.now();
}

function formatDueDateDisplay(dueDateStr) {
    if (!dueDateStr) return "--";
    return dueDateStr;
}

function showToast(title, text) {
    if (!toasts) return;

    const el = document.createElement("div");
    el.className = "toast";

    const t = document.createElement("div");
    t.className = "toast-title";
    t.textContent = title;

    const m = document.createElement("div");
    m.className = "toast-text";
    m.textContent = text;

    el.append(t, m);
    toasts.appendChild(el);

    // Auto dismiss
    setTimeout(() => {
        el.remove();
    }, 5000);
}

function renderTasks() {
    taskList.innerHTML = "";

    tasks.forEach((task, index) => {
        const li = document.createElement("li");

        const main = document.createElement("div");
        main.className = "task-main";

        const header = document.createElement("div");
        header.className = "hader-line";

        const taskText = document.createElement("span");
        taskText.className = "task-name";
        taskText.textContent = task.name;

        if (task.completed) {
            taskText.classList.add("completed");
        }
        if (isTaskOverdue(task)) {
            taskText.classList.add("overdue");
        }

        taskText.addEventListener("click", () => {
            tasks[index].completed = !tasks[index].completed;
            saveTasks();
            renderTasks();
        });

        header.appendChild(taskText);
        main.appendChild(header);

        const meta = document.createElement("div");
        meta.className = "task-meta";

        const due = document.createElement("span");
        due.className = "meta-item";
        due.innerHTML = `<espan class="meta-label">Due:</espan> ${formatDueDateDisplay(task.dueDate)}`;
        meta.appendChild(due);

        main.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "task-actions";

        const deleteButton = document.createElement("button");
        deleteButton.className = "task-delete";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", () => {
            tasks.splice(index, 1);
            saveTasks();
            renderTasks();
        });

        actions.appendChild(deleteButton);

        li.append(main, actions);
        taskList.appendChild(li);
    });

    const completed = tasks.filter(t => t.completed).length;

    taskSummary.textContent = `${completed} of ${tasks.length} tasks completed`;
}

function validateNewTask({ name, dueDate, remindAt }) {
    if (!name) return "Please enter a task name.";
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return "Please enter a valid due date.";
    }

    if (remindAt) {
        const remindDate = parseDateInputValue(remindAt);
        if (!remindDate) return "Please enter a valid reminder date/time.";
        if (remindDate.getTime() <= Date.now() - 1000) {
            return "Reminder time must be in the future.";
        }
    }
    return null;
}

addTaskButton.addEventListener("click", () => {
    clearFormError();

    const name = taskInput.value.trim();
    const dueDate = dueDateInput ? dueDateInput.value : "";
    const remindAt = remindAtInput ? remindAtInput.value : "";

    const validationError = validateNewTask({ name, dueDate, remindAt });
    if (validationError) {
        showFormError(validationError);
        return;
    }

    tasks.push({
        name,
        completed: false,
        dueDate: dueDate || undefined,
        remindAt: remindAt || undefined,
        reminderFired: false
    });

    taskInput.value = "";
    if (dueDateInput) dueDateInput.value = "";
    if (remindAtInput) remindAtInput.value = "";

    saveTasks();
    renderTasks();
.});

function runReminderCheck() {
    const now = Date.now();
    let didSave = false;

    tasks.forEach((task) => {
        if (task.completed) return;
        if (task.reminderFired) return;
        if (!task.remindAt) return;

        const remindDate = new Date(task.remindAt);
        if (Number.isNaN(remindDate.getTime())) return;

        if (remindDate.getTime() <= now) {
            task.reminderFired = true;
            didSave = true;
            showToast("Reminder", `${task.name} (Due: ${formatDueDateDisplay(task.dueDate)})`);
        }
    });

    if (didSave) saveTasks();
}

// Poll while the page is open (in-app notifications only)
setInterval(runReminderCheck, 10000);

clearFormError();
renderTasks();
runReminderCheck();
