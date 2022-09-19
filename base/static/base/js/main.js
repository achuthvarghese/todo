// Main JS

// Constants and Variables
const href = location.href;
const apiRoot = "api/";

const ajaxTextStatus = {
    success: "success",
    notmodified: "notmodified",
    nocontent: "nocontent",
    error: "error",
    timeout: "timeout",
    abort: "abort",
    parsererror: "parsererror",
};

const taskStatus = {
    pending: ["pending", "Pending"],
    in_progress: ["in_progress", "In Progress"],
    done: ["done", "Done"],
    get_display_value: function (status) {
        return this[status][1];
    },
};

var apiEndPoints = {};
var tasks = {};

// Wait for DOM to be ready
$(document).ready(() => {
    getEndPoints();
});

function getLocalTask(task_id) {
    if (task_id in tasks) {
        return tasks[task_id];
    } else {
        return;
    }
}

// DOM EventListener functions
// DOM EventListener: Create a new task
function newTask() {
    task = {
        title: document.querySelector("#newTaskForm [name='task-title']").value,
        description: document.querySelector("#newTaskForm [name='task-description']").value,
    };
    console.log(task);
    createTask(task);
}

// DOM EventListener: Delete task
function markCancel(task_id) {
    task = getLocalTask(task_id);
    if (task) {
        deleteTask(task);
    }
}

// DOM EventListener: Update the task status to done
function markDone(task_id) {
    task = getLocalTask(task_id);
    if (task) {
        updatedData = task;
        updatedData.status = taskStatus.done[0];
        updateTask(task, updatedData);
    }
}

// DOM EventListener: Show the details of the task
function showDetails(task_id) {
    $(".task-details").hide("slow");
    if ($(`#${task_id} .task-details`)[0].style.display != "block") {
        $(`#${task_id} .task-details`).toggle("slow");
    }
}

// API call functions
// API call: Retrieve available root end points
function getEndPoints() {
    $.ajax({
        url: `${href}${apiRoot}`,
        type: "GET",
        dataType: "json",
        statusCode: {
            200: function (data) {
                apiEndPoints = data;
                getTasks();
            },
        },
    });
}

// API call: Retrieve all tasks
function getTasks() {
    $.ajax({
        url: `${apiEndPoints.tasks}`,
        type: "GET",
        dataType: "json",
        statusCode: {
            200: function (data) {
                data.forEach((task) => {
                    tasks[task.id] = task;
                });
                refreshTasks();
            },
        },
    });
}

// API call: Create a new task
function createTask(task) {
    $.ajax({
        url: `${apiEndPoints.tasks}`,
        type: "POST",
        dataType: "json",
        data: {
            title: task.title,
            description: task.description,
        },
        headers: {
            "X-CSRFToken": csrf_token,
        },
        mode: "same-origin",
        statusCode: {
            201: function (data) {
                tasks[data.id] = data;
                refreshTasks();
            },
            400: function (response) {
                console.log("Task Not Saved:", response.responseText);
            },
        },
    })
    .always( () => {
        $('#newTaskModal').modal('hide');
        document.querySelector("#newTaskForm [name='task-title']").value = "";
        document.querySelector("#newTaskForm [name='task-description']").value = "";
    });
}

// API call: Retrieve a single task
function getTask(task) {
    $.ajax({
        url: task.url,
        type: "GET",
        dataType: "json",
        statusCode: {
            200: function (data) {
                tasks[data.id] = data;
                refreshTask(data);
            },
        },
    });
}

// API call: Update task details
function updateTask(task, updatedData) {
    $.ajax({
        url: task.url,
        type: "PUT",
        dataType: "json",
        data: {
            title: updatedData.title,
            description: updatedData.description,
            status: updatedData.status,
        },
        headers: {
            "X-CSRFToken": csrf_token,
        },
        mode: "same-origin",
        statusCode: {
            200: function (data) {
                tasks[task.id] = data;
                refreshTasks();
            },
            400: function (response) {
                console.log("Task Not Saved:", response.responseText);
            },
            404: function () {
                console.log("Task Not Found");
            },
        },
    });
}

// API call: Delete task
function deleteTask(task) {
    $.ajax({
        url: task.url,
        type: "DELETE",
        dataType: "json",
        headers: {
            "X-CSRFToken": csrf_token,
        },
        mode: "same-origin",
        statusCode: {
            204: function () {
                delete tasks[task.id];
                refreshTasks();
            },
            404: function () {
                console.log("Task Not Found");
            },
        },
    });
}

// DOM Manipulation functions
// DOM Manipulation: Refresh all tasks
function refreshTasks() {
    taskItems = document.getElementById("task-items");
    if (tasks) {
        taskItemsHtml = "";
        for (id in tasks) {
            task = tasks[id];
            taskHtml = `
            <div class="task-item" id="${task.id}" data-id="${task.id}">
                <div class="task-title">
                ${task.status == taskStatus.done[0]
                    ? '<span class="done"><i class="bi bi-check-circle-fill"></i></span>'
                    : `<span class="done" onclick="markDone('${task.id}')"><i class="bi bi-check-circle"></i></span>`
                }<label onclick="showDetails('${task.id}')" class="${task.status == taskStatus.done[0] ? "linethruogh" : ""}">
                ${task.title}</label><span class="delete" onclick="markCancel('${task.id}')"><i class="bi bi-x-circle-fill"></i></span>
                </div>
                <div class="task-details">
                    <b>Title: </b>${task.title} <br>
                    <b>Status: </b>${taskStatus.get_display_value(task.status)} <br>
                    <b>Description: </b>${task.description} </br>
                </div>
            </div>`;
            taskItemsHtml = taskItemsHtml + taskHtml;
        }
        taskItems.innerHTML = taskItemsHtml;
    }
}

// DOM Manipulation: Refresh a sinlge task
function refreshTask(task) {
    taskItem = document.getElementById(`task-${task.id}`);
    if (taskItem) {
        taskItemHtml = `
            <div class="task-item" id="${task.id}" data-id="${task.id}">
                <div class="task-title">
                    <span class="done" onclick="markDone('${task.id}')"><i class="bi bi-check-circle-fill"></i></span>
                    <label onclick="showDetails('${task.id}')" class="${task.status == taskStatus.done[0] ? "linethruogh" : ""}">
                    ${task.title}</label><span class="delete" onclick="markCancel('${task.id}')"><i class="bi bi-x-circle-fill"></i></span>
                </div>
                <div class="task-details">
                    <b>Title: </b>${task.title} <br>
                    <b>Status: </b>${taskStatus.get_display_value(task.status)} <br>
                    <b>Description: </b>${task.description ? task.description : ""} </br>
                </div>
            </div>`;
        taskItem.innerHTML = taskItemHtml;
    }
}
