"use strict";

// Regression: loading the app must never write to the "tasks" LocalStorage key.
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
    click() {
        (this.listeners.click || []).forEach(fn => fn({}));
    }
    querySelector() {
        return null;
    }
    focus() {}
    select() {}
}

function boot(initialValue) {
    const store = new Map();
    if (initialValue !== undefined) {
        store.set("tasks", initialValue);
    }

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

    const context = vm.createContext({
        document,
        localStorage,
        alert: () => {},
        console
    });
    vm.runInContext(SCRIPT, context);

    return { elements, store, setItemCalls };
}

const SCENARIOS = {
    "valid tasks": JSON.stringify([
        { id: "a", name: "Task A", completed: false, priority: "High" },
        { id: "b", name: "Task B", completed: true, priority: "Low" }
    ]),
    "legacy tasks without ids or priorities": JSON.stringify([
        { name: "Old 1", completed: false },
        { name: "Old 2", completed: true }
    ]),
    "non-object entries and unknown fields": JSON.stringify([
        "junk", 42, null, { id: "x", name: "Keep", extra: "field" }
    ]),
    "malformed JSON": "{not valid json",
    "non-array JSON": JSON.stringify({ not: "an array" })
};

for (const [label, raw] of Object.entries(SCENARIOS)) {
    test(`startup does not write to "tasks" (${label})`, () => {
        const { store, setItemCalls } = boot(raw);

        assert.deepStrictEqual(
            setItemCalls.filter(c => c.key === "tasks"),
            []
        );
        assert.strictEqual(store.get("tasks"), raw);
    });
}

test('startup does not write to "tasks" when the key is absent', () => {
    const { store, setItemCalls } = boot(undefined);

    assert.strictEqual(setItemCalls.length, 0);
    assert.strictEqual(store.has("tasks"), false);
});

test("legacy tasks still render after startup", () => {
    const { elements } = boot(SCENARIOS["legacy tasks without ids or priorities"]);

    assert.strictEqual(elements.taskList.children.length, 2);
    assert.strictEqual(elements.taskSummary.textContent, "1 of 2 tasks completed");
});

test("malformed JSON does not crash and shows the empty state", () => {
    const { elements } = boot(SCENARIOS["malformed JSON"]);

    assert.strictEqual(elements.taskList.children.length, 1);
    assert.strictEqual(elements.taskList.children[0].textContent, "No tasks yet.");
});

test("a user-initiated Add does save to LocalStorage", () => {
    const { elements, store, setItemCalls } = boot(SCENARIOS["valid tasks"]);

    elements.taskInput.value = "New task";
    elements.addTaskButton.click();

    assert.strictEqual(setItemCalls.filter(c => c.key === "tasks").length, 1);
    const saved = JSON.parse(store.get("tasks"));
    assert.strictEqual(saved.length, 3);
    assert.strictEqual(saved[2].name, "New task");
});
