
let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

const taskInput = document.getElementById("taskInput");
const addTaskButton = document.getElementById("addTaskButton");
const taskList = document.getElementById("taskList");
const taskSummary = document.getElementById("taskSummary");

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

function renderTasks() {
    taskList.innerHTML = "";

    tasks.forEach((task, index) => {
        const li = document.createElement("li");

        const taskText = document.createElement("span");
        taskText.textContent = task.name;

        if (task.completed) {
            taskText.classList.add("completed");
        }

        taskText.addEventListener("click", () => {
            tasks[index].completed = !tasks[index].completed;
            saveTasks();
            renderTasks();
        });

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", () => {
            tasks.splice(index, 1);
            saveTasks();
            renderTasks();
        });

        li.append(taskText, deleteButton);
        taskList.appendChild(li);
    });

    const completed = tasks.filter(t => t.completed).length;

    taskSummary.textContent =
        `${completed} of ${tasks.length} tasks completed`;
}

addTaskButton.addEventListener("click", () => {
    const name = taskInput.value.trim();

    if (!name) {
        alert("Please enter a task name.");
        return;
    }

    tasks.push({
        name: name,
        completed: false
    });

    taskInput.value = "";

    saveTasks();
    renderTasks();
});

renderTasks();
