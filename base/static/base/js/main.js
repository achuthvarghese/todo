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
var tasks = [];

// Wait for DOM to be ready
$(document).ready(() => {
    getEndPoints();
});

// DOM EventListener functions
// DOM EventListener:
function markCancel(task_id) {
    console.log(`Cancel ${task_id}`);
}

// DOM EventListener: Update the task status to done
function markDone(task_id) {
    task = undefined;
    for (let index = 0; index < tasks.length; index++) {
        task = tasks[index];
        if (task.id == task_id) {
            updatedData = task;
            updatedData.status = taskStatus.done[0];
            console.log(task, updatedData);
            break;
        }
    }
    if (task) {
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
    }).done((data, textStatus) => {
        if (textStatus == ajaxTextStatus.success) {
            apiEndPoints = data;
            getTasks();
        }
    });
}

// API call: Retrieve all tasks
function getTasks() {
    $.ajax({
        url: `${apiEndPoints.tasks}`,
        type: "GET",
        dataType: "json",
    }).done((data, textStatus) => {
        if (textStatus == ajaxTextStatus.success) {
            tasks = data;
            refreshTasks();
        }
    });
}

// API call: Retrieve a single task
function getTask(task) {
    $.ajax({
        url: task.url,
        type: "GET",
        dataType: "json",
    }).done((data, textStatus) => {
        if (textStatus == ajaxTextStatus.success) {
            refreshTask(data);
        }
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
    }).done((data, textStatus) => {
        if (textStatus == ajaxTextStatus.success) {
            refreshTask(data);
        }
    });
}

// DOM Manipulation functions
// DOM Manipulation: Refresh all tasks
function refreshTasks() {
    taskItems = document.getElementById("task-items");
    if (tasks) {
        taskItemsHtml = "";
        tasks.forEach((task) => {
            taskHtml = `
            <div class="task-item" id="${task.id}" data-id="${task.id}">
                <div class="task-title">
                ${task.status == taskStatus.done[0]
                    ? '<span class="done">&#x2714;</span>'
                    : `<span class="done" onclick="markDone('${task.id}')">&#x2714;</span>`
                }<label onclick="showDetails('${task.id}')" class="${task.status == taskStatus.done[0] ? "linethruogh" : ""}">
                ${task.title}</label><span class="delete" onclick="markCancel('${task.id}')">&#x2717;</span>
                </div>
                <div class="task-details">
                    <b>Title: </b>${task.title} <br>
                    <b>Status: </b>${taskStatus.get_display_value(task.status)} <br>
                    <b>Description: </b>${task.description} </br>
                </div>
            </div>`;
            taskItemsHtml = taskItemsHtml + taskHtml;
        });
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
                    <span class="done" onclick="markDone('${task.id}')">&#x2714;</span>
                    <label onclick="showDetails('${task.id}')" class="${task.status == taskStatus.done[0] ? "linethruogh" : ""}">
                    ${task.title}</label><span class="delete" onclick="markCancel('${task.id}')">&#x2717;</span>
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
