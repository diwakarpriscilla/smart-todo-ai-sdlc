"use strict";

// Regression: loadTasks() must normalise legacy/invalid LocalStorage values safely.
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

function boot(rawValue) {
    const store = new Map([["tasks", rawValue]]);
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

function renderedTasks(app) {
    return app.elements.taskList.children
        .filter(li => li.className !== "empty-state")
        .map(li => {
            const span = li.children[0];
            return {
                name: span.textContent,
                completed: span.className.split(" ").includes("completed")
            };
        });
}

function bootTasks(tasks) {
    return boot(JSON.stringify(tasks));
}

function savedTasksAfterAdd(app) {
    app.elements.taskInput.value = "Trigger save";
    app.elements.addTaskButton.click();
    return JSON.parse(app.store.get("tasks"));
}

// ---- completed normalisation ----

const COMPLETED_CASES = [
    ["true (boolean)", true, true],
    ["false (boolean)", false, false],
    ['"true" (legacy string)', "true", true],
    ['"false" (legacy string)', "false", false],
    ["missing", undefined, false],
    ["null", null, false],
    ["invalid string", "yes", false],
    ["invalid number", 1, false],
    ["invalid object", {}, false],
    ["empty string", "", false]
];

for (const [label, input, expected] of COMPLETED_CASES) {
    test(`completed: ${label} loads as ${expected}`, () => {
        const task = { id: "t1", name: "Task", priority: "Medium" };
        if (input !== undefined) {
            task.completed = input;
        }
        const app = bootTasks([task]);

        assert.deepStrictEqual(renderedTasks(app), [{ name: "Task", completed: expected }]);
        assert.strictEqual(
            app.elements.taskSummary.textContent,
            `${expected ? 1 : 0} of 1 tasks completed`
        );

        const saved = savedTasksAfterAdd(app);
        assert.strictEqual(saved[0].completed, expected);
        assert.strictEqual(typeof saved[0].completed, "boolean");
    });
}

// ---- name normalisation ----

test("normal task name is kept unchanged", () => {
    const app = bootTasks([{ id: "t1", name: "Buy milk", completed: false }]);

    assert.deepStrictEqual(renderedTasks(app), [{ name: "Buy milk", completed: false }]);
    assert.strictEqual(savedTasksAfterAdd(app)[0].name, "Buy milk");
});

test("leading and trailing whitespace is trimmed; inner whitespace is kept", () => {
    const app = bootTasks([{ id: "t1", name: "   Buy   milk \t\n", completed: false }]);

    assert.deepStrictEqual(renderedTasks(app), [{ name: "Buy   milk", completed: false }]);
    assert.strictEqual(savedTasksAfterAdd(app)[0].name, "Buy   milk");
});

const UNRENDERABLE_NAMES = [
    ["empty", { id: "bad", name: "", completed: false }],
    ["whitespace-only", { id: "bad", name: "  \t\n  ", completed: false }],
    ["null", { id: "bad", name: null, completed: false }],
    ["missing", { id: "bad", completed: false }],
    ["number", { id: "bad", name: 42, completed: false }],
    ["boolean", { id: "bad", name: true, completed: false }],
    ["object", { id: "bad", name: { text: "x" }, completed: false }],
    ["array", { id: "bad", name: ["x"], completed: false }]
];

for (const [label, badTask] of UNRENDERABLE_NAMES) {
    test(`${label} name is not rendered or saved, and valid neighbours are kept`, () => {
        const app = bootTasks([
            { id: "a", name: "Before", completed: false },
            badTask,
            { id: "c", name: "After", completed: true }
        ]);

        assert.deepStrictEqual(renderedTasks(app), [
            { name: "Before", completed: false },
            { name: "After", completed: true }
        ]);
        assert.strictEqual(app.elements.taskSummary.textContent, "1 of 2 tasks completed");

        const saved = savedTasksAfterAdd(app);
        assert.deepStrictEqual(
            saved.map(t => t.name),
            ["Before", "After", "Trigger save"]
        );
        assert.ok(saved.every(t => t.name !== "null" && t.name !== "undefined" && t.name.trim() !== ""));
    });
}

test('no task is ever created with the literal name "null" or "undefined"', () => {
    const app = bootTasks([
        { id: "a", name: null },
        { id: "b" },
        { id: "c", name: undefined }
    ]);

    assert.deepStrictEqual(renderedTasks(app), []);
    assert.strictEqual(app.elements.taskList.children[0].textContent, "No tasks yet.");
    assert.strictEqual(app.elements.taskSummary.textContent, "0 of 0 tasks completed");
});

test("invalid stored entries are skipped without crashing", () => {
    const app = bootTasks([null, 7, "text", [], { id: "ok", name: "Valid" }]);

    assert.deepStrictEqual(renderedTasks(app), [{ name: "Valid", completed: false }]);
});

// ---- existing safeguards still hold ----

test("startup still does not write to tasks when names/completed values need normalising", () => {
    const raw = JSON.stringify([
        { id: "a", name: "  Padded  ", completed: "false" },
        { id: "b", name: null, completed: "true" }
    ]);
    const app = boot(raw);

    assert.deepStrictEqual(app.setItemCalls.filter(c => c.key === "tasks"), []);
    assert.strictEqual(app.store.get("tasks"), raw);
});

test("valid task data (id, priority, extra completed/priority values) survives normalisation", () => {
    const app = bootTasks([
        { id: "a", name: "A", completed: true, priority: "High" },
        { id: "b", name: "B", completed: "false", priority: "Low" }
    ]);

    const saved = savedTasksAfterAdd(app);
    assert.deepStrictEqual(saved.slice(0, 2), [
        { id: "a", name: "A", completed: true, priority: "High" },
        { id: "b", name: "B", completed: false, priority: "Low" }
    ]);
});
