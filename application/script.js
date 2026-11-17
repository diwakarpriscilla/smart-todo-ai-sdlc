
const PRIORITIES = ["High", "Medium", "Low"];
const DEFAULT_PRIORITY = "Medium";

function generateId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function loadTasks() {
    let stored;

    try {
        stored = JSON.parse(localStorage.getItem("tasks"));
    } catch (e) {
        return [];
    }

    if (!Array.isArray(stored)) {
        return [];
    }

    const usedIds = new Set();

    return stored
        .filter(t => t && typeof t === "object" && typeof t.name === "string" && t.name.trim() !== "")
        .map(t => {
            let id = t.id;
            if (id === undefined || id === null || usedIds.has(id)) {
                id = generateId();
            }
            usedIds.add(id);

            return {
                id: id,
                name: t.name.trim(),
                completed: t.completed === true || t.completed === "true",
                priority: PRIORITIES.includes(t.priority) ? t.priority : DEFAULT_PRIORITY
            };
        });
}

let tasks = loadTasks();
let currentFilter = "all";
let editingId = null;
let editDraft = "";
let focusEditInput = false;

const taskInput = document.getElementById("taskInput");
const prioritySelect = document.getElementById("prioritySelect");
const addTaskButton = document.getElementById("addTaskButton");
const taskList = document.getElementById("taskList");
const taskSummary = document.getElementById("taskSummary");
const filterButtons = document.querySelectorAll(".filter-button");
const editNotice = document.getElementById("editNotice");

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

function findTask(id) {
    return tasks.find(t => t.id === id);
}

function matchesFilter(task) {
    if (currentFilter === "active") {
        return !task.completed;
    }
    if (currentFilter === "completed") {
        return task.completed;
    }
    return true;
}

function createPriorityBadge(task) {
    const badge = document.createElement("span");
    badge.className = "priority-badge priority-" + task.priority.toLowerCase();
    badge.textContent = task.priority;
    return badge;
}

function createPrioritySelect(task) {
    const select = document.createElement("select");
    select.className = "task-priority-select";
    select.setAttribute("aria-label", `Change priority for ${task.name}`);

    PRIORITIES.forEach(p => {
        const option = document.createElement("option");
        option.value = p;
        option.textContent = p;
        option.selected = p === task.priority;
        select.appendChild(option);
    });

    select.addEventListener("change", () => {
        const target = findTask(task.id);
        if (!target) {
            return;
        }
        target.priority = select.value;
        saveTasks();
        renderTasks();
    });

    return select;
}

function clearEditNotice() {
    editNotice.textContent = "";
    editNotice.hidden = true;
}

function startEditing(id) {
    if (editingId !== null && editingId !== id) {
        const current = findTask(editingId);
        const label = current ? ` "${current.name}"` : "";
        editNotice.textContent =
            `Finish editing${label} first: please Save or Cancel the current edit before editing another task.`;
        editNotice.hidden = false;

        const activeInput = taskList.querySelector(".edit-input");
        if (activeInput) {
            activeInput.focus();
        }
        return;
    }

    const target = findTask(id);
    if (!target || target.completed) {
        return;
    }

    editingId = id;
    editDraft = target.name;
    focusEditInput = true;
    clearEditNotice();
    renderTasks();
}

function cancelEditing() {
    editingId = null;
    editDraft = "";
    clearEditNotice();
    renderTasks();
}

function saveEditing(id, input) {
    const name = input.value.trim();

    if (!name) {
        alert("Please enter a task name.");
        input.focus();
        return;
    }

    const target = findTask(id);
    if (target && !target.completed) {
        target.name = name;
        saveTasks();
    }

    editingId = null;
    editDraft = "";
    clearEditNotice();
    renderTasks();
}

function createEditRow(li, task) {
    li.classList.add("editing");

    const input = document.createElement("input");
    input.type = "text";
    input.className = "edit-input";
    input.value = editDraft;
    input.setAttribute("aria-label", "Edit task name");

    input.addEventListener("input", () => {
        editDraft = input.value;
    });

    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveEditing(task.id, input);
        } else if (event.key === "Escape") {
            event.preventDefault();
            cancelEditing();
        }
    });

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => saveEditing(task.id, input));

    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.className = "secondary-button";
    cancelButton.addEventListener("click", cancelEditing);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    actions.append(saveButton, cancelButton);

    li.append(input, actions);

    return input;
}

function createViewRow(li, task) {
    const taskText = document.createElement("span");
    taskText.className = "task-name";
    taskText.textContent = task.name;

    if (task.completed) {
        taskText.classList.add("completed");
    }

    taskText.addEventListener("click", () => {
        const target = findTask(task.id);
        if (!target) {
            return;
        }
        target.completed = !target.completed;
        saveTasks();
        renderTasks();
    });

    let editButton = null;
    if (!task.completed) {
        editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => startEditing(task.id));
    }

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";

    deleteButton.addEventListener("click", () => {
        tasks = tasks.filter(t => t.id !== task.id);
        saveTasks();
        renderTasks();
    });

    const actions = document.createElement("div");
    actions.className = "task-actions";
    actions.append(createPriorityBadge(task), createPrioritySelect(task));
    if (editButton) {
        actions.append(editButton);
    }
    actions.append(deleteButton);

    li.append(taskText, actions);
}

function renderTasks() {
    taskList.innerHTML = "";

    const editingTask = editingId !== null ? findTask(editingId) : null;
    if (editingId !== null && (!editingTask || editingTask.completed)) {
        editingId = null;
        editDraft = "";
    }

    if (editingId === null) {
        clearEditNotice();
    }

    const visibleTasks = tasks.filter(matchesFilter);
    let editInput = null;

    visibleTasks.forEach(task => {
        const li = document.createElement("li");

        if (task.id === editingId) {
            editInput = createEditRow(li, task);
        } else {
            createViewRow(li, task);
        }

        taskList.appendChild(li);
    });

    if (visibleTasks.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-state";

        if (currentFilter === "active") {
            empty.textContent = "No active tasks.";
        } else if (currentFilter === "completed") {
            empty.textContent = "No completed tasks.";
        } else {
            empty.textContent = "No tasks yet.";
        }

        taskList.appendChild(empty);
    }

    filterButtons.forEach(button => {
        button.setAttribute(
            "aria-pressed",
            String(button.dataset.filter === currentFilter)
        );
    });

    const completed = tasks.filter(t => t.completed).length;

    taskSummary.textContent =
        `${completed} of ${tasks.length} tasks completed`;

    if (editInput && focusEditInput) {
        editInput.focus();
        editInput.select();
    }
    focusEditInput = false;
}

filterButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (button.dataset.filter !== currentFilter) {
            editingId = null;
            editDraft = "";
        }
        currentFilter = button.dataset.filter;
        renderTasks();
    });
});

addTaskButton.addEventListener("click", () => {
    const name = taskInput.value.trim();

    if (!name) {
        alert("Please enter a task name.");
        return;
    }

    tasks.push({
        id: generateId(),
        name: name,
        completed: false,
        priority: PRIORITIES.includes(prioritySelect.value)
            ? prioritySelect.value
            : DEFAULT_PRIORITY
    });

    taskInput.value = "";
    prioritySelect.value = DEFAULT_PRIORITY;

    saveTasks();
    renderTasks();
});

renderTasks();
