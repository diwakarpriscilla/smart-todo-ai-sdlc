"use strict";

// Regression: changing the filter while editing must cancel the unsaved edit
// and release the edit lock. Run with: node --test tests/

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SCRIPT = fs.readFileSync(
    path.join(__dirname, "..", "application", "script.js"),
    "utf8"
);

class FakeElement {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.listeners = {};
        this.attributes = {};
        this.dataset = {};
        this.value = "";
        this.textContent = "";
        this.className = "";
        this.hidden = false;
        this.classList = {
            add: c => {
                this.className = (this.className + " " + c).trim();
            }
        };
    }
    set innerHTML(_) {
        this.children = [];
    }
    append(...nodes) {
        this.children.push(...nodes);
    }
    appendChild(node) {
        this.children.push(node);
    }
    setAttribute(name, value) {
        this.attributes[name] = value;
    }
    addEventListener(type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
    }
    fire(type, event) {
        (this.listeners[type] || []).forEach(fn => fn(event || {}));
    }
    click() {
        this.fire("click");
    }
    querySelector(selector) {
        const cls = selector.replace(/^\./, "");
        return findAll(this, n => n.className.split(" ").includes(cls))[0] || null;
    }
    focus() {}
    select() {}
}

function findAll(root, predicate) {
    const found = [];
    root.children.forEach(child => {
        if (predicate(child)) {
            found.push(child);
        }
        found.push(...findAll(child, predicate));
    });
    return found;
}

function boot(tasks) {
    const store = new Map([["tasks", JSON.stringify(tasks)]]);
    const setItemCalls = [];
    const localStorage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
            setItemCalls.push({ key, value });
            store.set(key, String(value));
        },
        removeItem: key => store.delete(key)
    };

    const elements = {};
    ["taskInput", "prioritySelect", "addTaskButton", "taskList", "taskSummary", "editNotice"]
        .forEach(id => {
            elements[id] = new FakeElement(id);
        });
    elements.prioritySelect.value = "Medium";

    const filters = {};
    const filterButtons = ["all", "active", "completed"].map(name => {
        const button = new FakeElement("button");
        button.dataset.filter = name;
        filters[name] = button;
        return button;
    });

    const document = {
        getElementById: id => elements[id],
        querySelectorAll: () => filterButtons,
        createElement: tag => new FakeElement(tag)
    };

    const context = vm.createContext({
        document,
        localStorage,
        alert: () => {},
        console
    });
    vm.runInContext(SCRIPT, context);

    return { elements, filters, store, setItemCalls };
}

const TASKS = [
    { id: "a", name: "Active A", completed: false, priority: "High" },
    { id: "b", name: "Active B", completed: false, priority: "Medium" },
    { id: "c", name: "Done C", completed: true, priority: "Low" },
    { id: "d", name: "Done D", completed: true, priority: "Low" }
];

function rowFor(app, name) {
    return app.elements.taskList.children.find(li =>
        findAll(li, n => n.className.split(" ").includes("task-name") && n.textContent === name).length > 0 ||
        findAll(li, n => n.className === "edit-input" && n.value === name).length > 0
    );
}

function buttonIn(li, label) {
    return findAll(li, n => n.tagName === "button" && n.textContent === label)[0];
}

function editInput(app) {
    return app.elements.taskList.querySelector(".edit-input");
}

function startEdit(app, name) {
    buttonIn(rowFor(app, name), "Edit").click();
}

function typeInto(input, text) {
    input.value = text;
    input.fire("input");
}

function visibleNames(app) {
    return findAll(app.elements.taskList, n => n.className.split(" ").includes("task-name"))
        .map(n => n.textContent);
}

function assertEditLockReleased(app) {
    assert.strictEqual(editInput(app), null, "no edit input should remain");
    assert.strictEqual(app.elements.editNotice.hidden, true, "edit notice should be hidden");
    assert.strictEqual(app.elements.editNotice.textContent, "");
}

function assertNothingSaved(app) {
    assert.deepStrictEqual(
        app.setItemCalls.filter(c => c.key === "tasks"),
        []
    );
    assert.deepStrictEqual(JSON.parse(app.store.get("tasks")), TASKS);
}

test("Active -> Completed while editing cancels the edit and releases the lock", () => {
    const app = boot(TASKS);

    app.filters.active.click();
    startEdit(app, "Active A");
    typeInto(editInput(app), "Active A (unsaved)");

    app.filters.completed.click();

    assertEditLockReleased(app);
    assert.deepStrictEqual(visibleNames(app), ["Done C", "Done D"]);
    assertNothingSaved(app);

    startEdit(app, "Done C");
    assert.ok(editInput(app), "another visible task can be edited immediately");
    assert.strictEqual(editInput(app).value, "Done C");
    assert.strictEqual(app.elements.editNotice.hidden, true);
});

test("Completed -> Active while editing cancels the edit and releases the lock", () => {
    const app = boot(TASKS);

    app.filters.completed.click();
    startEdit(app, "Done C");
    typeInto(editInput(app), "Done C (unsaved)");

    app.filters.active.click();

    assertEditLockReleased(app);
    assert.deepStrictEqual(visibleNames(app), ["Active A", "Active B"]);
    assertNothingSaved(app);

    startEdit(app, "Active B");
    assert.ok(editInput(app), "another visible task can be edited immediately");
    assert.strictEqual(editInput(app).value, "Active B");
    assert.strictEqual(app.elements.editNotice.hidden, true);
});

test("original name is intact and draft is cleared after returning to the original filter", () => {
    const app = boot(TASKS);

    app.filters.active.click();
    startEdit(app, "Active A");
    typeInto(editInput(app), "Active A (unsaved)");

    app.filters.completed.click();
    app.filters.active.click();

    assert.strictEqual(editInput(app), null);
    assert.deepStrictEqual(visibleNames(app), ["Active A", "Active B"]);

    startEdit(app, "Active A");
    assert.strictEqual(editInput(app).value, "Active A", "stale draft must not reappear");
    assertNothingSaved(app);
});

test("switching to All while editing also cancels the edit", () => {
    const app = boot(TASKS);

    app.filters.active.click();
    startEdit(app, "Active A");
    typeInto(editInput(app), "Active A (unsaved)");

    app.filters.all.click();

    assertEditLockReleased(app);
    assert.strictEqual(visibleNames(app).length, 4);
    assertNothingSaved(app);
});

test("a blocked edit notice is cleared when the filter changes", () => {
    const app = boot(TASKS);

    app.filters.active.click();
    startEdit(app, "Active A");
    startEdit(app, "Active B");
    assert.strictEqual(app.elements.editNotice.hidden, false);

    app.filters.completed.click();

    assertEditLockReleased(app);
    assertNothingSaved(app);
});

test("Save still persists the edit when the filter is not changed", () => {
    const app = boot(TASKS);

    app.filters.active.click();
    startEdit(app, "Active A");
    typeInto(editInput(app), "  Renamed A  ");
    buttonIn(rowFor(app, "  Renamed A  "), "Save").click();

    assert.strictEqual(editInput(app), null);
    const saved = JSON.parse(app.store.get("tasks"));
    assert.strictEqual(saved[0].name, "Renamed A");
    assert.strictEqual(saved.length, TASKS.length);
});

test("Enter saves and Escape cancels when the filter is not changed", () => {
    const app = boot(TASKS);

    startEdit(app, "Active A");
    typeInto(editInput(app), "Via Enter");
    editInput(app).fire("keydown", { key: "Enter", preventDefault() {} });
    assert.strictEqual(JSON.parse(app.store.get("tasks"))[0].name, "Via Enter");

    startEdit(app, "Active B");
    typeInto(editInput(app), "Via Escape");
    editInput(app).fire("keydown", { key: "Escape", preventDefault() {} });
    assert.strictEqual(editInput(app), null);
    assert.strictEqual(JSON.parse(app.store.get("tasks"))[1].name, "Active B");
});

test("Cancel button discards the edit when the filter is not changed", () => {
    const app = boot(TASKS);

    startEdit(app, "Active A");
    typeInto(editInput(app), "Discard me");
    buttonIn(rowFor(app, "Discard me"), "Cancel").click();

    assert.strictEqual(editInput(app), null);
    assertNothingSaved(app);
});

test("editing another task while one is being edited is still blocked", () => {
    const app = boot(TASKS);

    startEdit(app, "Active A");
    typeInto(editInput(app), "Draft kept");
    startEdit(app, "Active B");

    assert.strictEqual(app.elements.editNotice.hidden, false);
    assert.strictEqual(editInput(app).value, "Draft kept");
});

test("clicking the already-selected filter does not discard the edit in progress", () => {
    const app = boot(TASKS);

    app.filters.active.click();
    startEdit(app, "Active A");
    typeInto(editInput(app), "Still editing");

    app.filters.active.click();

    assert.ok(editInput(app));
    assert.strictEqual(editInput(app).value, "Still editing");
});
