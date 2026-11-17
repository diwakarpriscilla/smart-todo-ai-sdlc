"use strict";

// Feature: only incomplete tasks can be renamed, in the UI and in the logic.
// Run with: node --test tests/

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

// Passing the same store to a second boot() simulates a page refresh.
function boot(store) {
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

    const document = {
        getElementById: id => elements[id],
        querySelectorAll: () => [],
        createElement: tag => new FakeElement(tag)
    };

    const alerts = [];
    const context = vm.createContext({
        document,
        localStorage,
        alert: message => alerts.push(message),
        console
    });
    vm.runInContext(SCRIPT, context);

    return { elements, store, setItemCalls, alerts, context };
}

function seeded(tasks) {
    return boot(new Map([["tasks", JSON.stringify(tasks)]]));
}

function rows(app) {
    return app.elements.taskList.children;
}

function rowFor(app, name) {
    return rows(app).find(li =>
        findAll(li, n => n.className.split(" ").includes("task-name") && n.textContent === name).length > 0 ||
        findAll(li, n => n.className === "edit-input" && n.value === name).length > 0
    );
}

function buttonIn(li, label) {
    return findAll(li, n => n.tagName === "button" && n.textContent === label)[0];
}

function nameSpan(app, name) {
    return findAll(rowFor(app, name), n => n.className.split(" ").includes("task-name"))[0];
}

function editInput(app) {
    return app.elements.taskList.querySelector(".edit-input");
}

function visibleNames(app) {
    return findAll(app.elements.taskList, n => n.className.split(" ").includes("task-name"))
        .map(n => n.textContent);
}

function typeInto(input, text) {
    input.value = text;
    input.fire("input");
}

function addTask(app, name) {
    app.elements.taskInput.value = name;
    app.elements.addTaskButton.click();
}

function storedTasks(app) {
    return JSON.parse(app.store.get("tasks"));
}

test("acceptance: create, edit, save, verify, refresh, verify persistence", () => {
    const app = boot(new Map());

    addTask(app, "Buy groceries");
    assert.deepStrictEqual(visibleNames(app), ["Buy groceries"]);

    buttonIn(rowFor(app, "Buy groceries"), "Edit").click();
    assert.ok(editInput(app), "inline edit input is shown");
    assert.strictEqual(editInput(app).value, "Buy groceries");

    typeInto(editInput(app), "Buy groceries and milk");
    buttonIn(rowFor(app, "Buy groceries and milk"), "Save").click();

    assert.strictEqual(editInput(app), null, "edit mode is closed after Save");
    assert.deepStrictEqual(visibleNames(app), ["Buy groceries and milk"]);
    assert.strictEqual(storedTasks(app)[0].name, "Buy groceries and milk");

    const refreshed = boot(app.store);
    assert.deepStrictEqual(visibleNames(refreshed), ["Buy groceries and milk"]);
    assert.strictEqual(storedTasks(refreshed).length, 1);
    assert.deepStrictEqual([...refreshed.store.keys()], ["tasks"], "only the existing LocalStorage key is used");
});

test("Edit control appears only on incomplete tasks", () => {
    const app = seeded([
        { id: "a", name: "Open", completed: false, priority: "Medium" },
        { id: "b", name: "Done", completed: true, priority: "Medium" }
    ]);

    assert.ok(buttonIn(rowFor(app, "Open"), "Edit"));
    assert.strictEqual(buttonIn(rowFor(app, "Done"), "Edit"), undefined);
    assert.ok(buttonIn(rowFor(app, "Done"), "Delete"), "completed tasks can still be deleted");
});

test("completing a task removes Edit and uncompleting restores it", () => {
    const app = seeded([{ id: "a", name: "Toggle me", completed: false, priority: "Medium" }]);

    nameSpan(app, "Toggle me").click();
    assert.strictEqual(buttonIn(rowFor(app, "Toggle me"), "Edit"), undefined);
    assert.strictEqual(storedTasks(app)[0].completed, true);

    nameSpan(app, "Toggle me").click();
    assert.ok(buttonIn(rowFor(app, "Toggle me"), "Edit"));
    assert.strictEqual(storedTasks(app)[0].completed, false);
});

test("logic guard: startEditing refuses a completed task", () => {
    const app = seeded([{ id: "done", name: "Done", completed: true, priority: "Medium" }]);

    app.context.startEditing("done");

    assert.strictEqual(editInput(app), null);
    assert.deepStrictEqual(visibleNames(app), ["Done"]);
    assert.strictEqual(app.setItemCalls.length, 0);
});

test("logic guard: a save cannot rename a task that became completed mid-edit", () => {
    const app = seeded([{ id: "a", name: "Original", completed: false, priority: "Medium" }]);

    buttonIn(rowFor(app, "Original"), "Edit").click();
    typeInto(editInput(app), "Sneaky rename");
    vm.runInContext('findTask("a").completed = true', app.context);

    editInput(app).fire("keydown", { key: "Enter", preventDefault() {} });

    assert.strictEqual(editInput(app), null);
    assert.strictEqual(vm.runInContext('findTask("a").name', app.context), "Original");
    assert.strictEqual(app.setItemCalls.length, 0);
});

test("rendering drops an edit session whose task is completed", () => {
    const app = seeded([{ id: "a", name: "Original", completed: false, priority: "Medium" }]);

    buttonIn(rowFor(app, "Original"), "Edit").click();
    vm.runInContext('findTask("a").completed = true; renderTasks();', app.context);

    assert.strictEqual(editInput(app), null);
    assert.strictEqual(buttonIn(rowFor(app, "Original"), "Edit"), undefined);
});

for (const [label, text] of [["empty", ""], ["whitespace-only", "   \t "]]) {
    test(`${label} names are rejected, nothing is saved and editing stays open`, () => {
        const app = seeded([{ id: "a", name: "Keep me", completed: false, priority: "Medium" }]);

        buttonIn(rowFor(app, "Keep me"), "Edit").click();
        typeInto(editInput(app), text);
        buttonIn(rowFor(app, text), "Save").click();

        assert.strictEqual(app.alerts.length, 1);
        assert.ok(editInput(app), "still in edit mode");
        assert.strictEqual(app.setItemCalls.length, 0);
        assert.strictEqual(storedTasks(app)[0].name, "Keep me");

        editInput(app).fire("keydown", { key: "Enter", preventDefault() {} });
        assert.strictEqual(app.alerts.length, 2, "Enter is validated the same way");
        assert.strictEqual(storedTasks(app)[0].name, "Keep me");
    });
}

test("Enter saves (trimmed) and Escape cancels", () => {
    const app = seeded([
        { id: "a", name: "First", completed: false, priority: "High" },
        { id: "b", name: "Second", completed: false, priority: "Low" }
    ]);

    buttonIn(rowFor(app, "First"), "Edit").click();
    typeInto(editInput(app), "  First renamed  ");
    editInput(app).fire("keydown", { key: "Enter", preventDefault() {} });
    assert.deepStrictEqual(visibleNames(app), ["First renamed", "Second"]);
    assert.strictEqual(storedTasks(app)[0].name, "First renamed");
    assert.strictEqual(storedTasks(app)[0].priority, "High", "other fields are untouched");

    const writes = app.setItemCalls.length;
    buttonIn(rowFor(app, "Second"), "Edit").click();
    typeInto(editInput(app), "Discarded");
    editInput(app).fire("keydown", { key: "Escape", preventDefault() {} });
    assert.strictEqual(editInput(app), null);
    assert.deepStrictEqual(visibleNames(app), ["First renamed", "Second"]);
    assert.strictEqual(app.setItemCalls.length, writes, "Escape does not save");
});

test("Cancel button discards the edit", () => {
    const app = seeded([{ id: "a", name: "Stay", completed: false, priority: "Medium" }]);

    buttonIn(rowFor(app, "Stay"), "Edit").click();
    typeInto(editInput(app), "Gone");
    buttonIn(rowFor(app, "Gone"), "Cancel").click();

    assert.deepStrictEqual(visibleNames(app), ["Stay"]);
    assert.strictEqual(app.setItemCalls.length, 0);
});

test("creation, completion, uncompletion and deletion still work and persist", () => {
    const app = boot(new Map());

    addTask(app, "One");
    addTask(app, "Two");
    assert.deepStrictEqual(visibleNames(app), ["One", "Two"]);
    assert.strictEqual(app.elements.taskSummary.textContent, "0 of 2 tasks completed");

    nameSpan(app, "One").click();
    assert.strictEqual(app.elements.taskSummary.textContent, "1 of 2 tasks completed");
    assert.strictEqual(storedTasks(app)[0].completed, true);

    nameSpan(app, "One").click();
    assert.strictEqual(app.elements.taskSummary.textContent, "0 of 2 tasks completed");

    buttonIn(rowFor(app, "One"), "Delete").click();
    assert.deepStrictEqual(visibleNames(app), ["Two"]);
    assert.deepStrictEqual(storedTasks(app).map(t => t.name), ["Two"]);

    assert.deepStrictEqual(visibleNames(boot(app.store)), ["Two"]);
});
