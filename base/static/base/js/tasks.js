import {
    NEXT_STATUS,
    STATUS,
    STATUS_ORDER,
    deleteWithUndo,
    h,
    icon,
    showError,
    tasksApi,
} from "./common.js";

const list = document.getElementById("task-list");
const loading = document.getElementById("loading");
const empty = document.getElementById("empty");
const addForm = document.getElementById("add-form");
const addInput = document.getElementById("new-task");
const addError = document.getElementById("add-error");
const filterButtons = [...document.querySelectorAll("[data-filter]")];

const EMPTY = {
    all: ["Nothing here yet", "Add your first task above."],
    pending: ["All clear", "Nothing waiting to start."],
    in_progress: ["Nothing in motion", "Tap a task’s status pill to start it."],
    done: ["Nothing done yet", "Tick a task off and it lands here."],
};

let tasks = [];
let editingId = null;
let filter = new URLSearchParams(location.search).get("status");
if (!(filter in EMPTY)) filter = "all";

function setFilter(value, { push = true } = {}) {
    filter = value;
    if (push) {
        const url = new URL(location.href);
        if (value === "all") url.searchParams.delete("status");
        else url.searchParams.set("status", value);
        history.replaceState(null, "", url);
    }
    render();
}

function replaceTask(updated) {
    tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
}

async function changeTask(task, fields) {
    const before = task;
    replaceTask({ ...task, ...fields });
    render();
    try {
        replaceTask(await tasksApi.update(task, fields));
    } catch (err) {
        replaceTask(before);
        showError(err);
    }
    render();
}

function removeTask(task) {
    const index = tasks.findIndex((t) => t.id === task.id);
    tasks = tasks.filter((t) => t.id !== task.id);
    if (editingId === task.id) editingId = null;
    render();
    deleteWithUndo(task, {
        restore: () => {
            tasks.splice(Math.min(index, tasks.length), 0, task);
            render();
        },
    });
}

function editForm(task) {
    const titleId = `edit-title-${task.id}`;
    const descId = `edit-desc-${task.id}`;
    const errorId = `edit-error-${task.id}`;
    const title = h("input", { class: "input", id: titleId, type: "text", maxlength: 60, value: task.title, required: true, "aria-describedby": errorId });
    const desc = h("textarea", { class: "textarea", id: descId, rows: 3, placeholder: "Add notes, links or next steps" });
    desc.value = task.description;
    const error = h("p", { class: "field__error", id: errorId, role: "alert", hidden: true });
    const cancel = () => {
        editingId = null;
        render();
        list.querySelector(`[data-id="${task.id}"] .task__title`)?.focus();
    };
    const form = h(
        "form",
        {
            class: "task-edit",
            novalidate: true,
            onSubmit: (event) => {
                event.preventDefault();
                const value = title.value.trim();
                if (!value) {
                    error.textContent = "Give it a name first.";
                    error.hidden = false;
                    title.setAttribute("aria-invalid", "true");
                    title.focus();
                    return;
                }
                editingId = null;
                changeTask(task, { title: value, description: desc.value.trim() });
            },
            onKeydown: (event) => {
                if (event.key === "Escape") cancel();
            },
        },
        h("div", { class: "field" }, h("label", { for: titleId, text: "Title" }), title, error),
        h("div", { class: "field" }, h("label", { for: descId, text: "Description" }), desc),
        h(
            "div",
            { class: "task-edit__actions" },
            h("button", { type: "button", class: "btn", onClick: cancel, text: "Cancel" }),
            h("button", { type: "submit", class: "btn btn--accent", text: "Save" }),
        ),
    );
    queueMicrotask(() => title.focus());
    return form;
}

function taskItem(task) {
    const done = task.status === "done";
    const next = NEXT_STATUS[task.status];
    const editing = editingId === task.id;
    return h(
        "li",
        { class: `task${done ? " task--done" : ""}${editing ? " task--editing" : ""}`, dataset: { id: task.id } },
        h(
            "button",
            {
                type: "button",
                class: "check",
                "aria-pressed": String(done),
                "aria-label": `Done: ${task.title}`,
                onClick: () => changeTask(task, { status: done ? "pending" : "done" }),
            },
            icon("check", 22),
        ),
        h(
            "div",
            { class: "task__body" },
            h("button", {
                type: "button",
                class: "task__title",
                "aria-expanded": String(editing),
                title: "Edit task",
                onClick: () => {
                    editingId = editing ? null : task.id;
                    render();
                },
                text: task.title,
            }),
            task.description ? h("span", { class: "task__desc", text: task.description }) : null,
        ),
        h(
            "div",
            { class: "task__actions" },
            h("button", {
                type: "button",
                class: `chip chip--${task.status}`,
                "aria-label": `Status: ${STATUS[task.status].label}. Change to ${STATUS[next].label}`,
                onClick: () => changeTask(task, { status: next }),
                text: STATUS[task.status].label,
            }),
            h("button", { type: "button", class: "icon-btn", "aria-label": `Delete: ${task.title}`, onClick: () => removeTask(task) }, icon("close")),
        ),
        editing ? editForm(task) : null,
    );
}

function render() {
    const counts = { all: tasks.length };
    for (const key of STATUS_ORDER) counts[key] = tasks.filter((t) => t.status === key).length;

    for (const [key, value] of Object.entries(counts)) {
        document.querySelectorAll(`[data-count="${key}"]`).forEach((el) => (el.textContent = value));
    }
    document.querySelector('[data-tile="open"]').textContent = counts.pending + counts.in_progress;
    document.querySelector('[data-tile="in_progress"]').textContent = counts.in_progress;
    document.querySelector('[data-tile="done"]').textContent = counts.done;

    for (const button of filterButtons) {
        button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
    }

    const visible = tasks.filter((t) => filter === "all" || t.status === filter);
    const focusedId = document.activeElement?.closest?.("[data-id]")?.dataset.id;
    const focusedClass = document.activeElement?.className;
    list.replaceChildren(...visible.map(taskItem));
    // Keep keyboard focus on the same control after a re-render.
    if (focusedId && !editingId) {
        const row = list.querySelector(`[data-id="${focusedId}"]`);
        const target = row && focusedClass ? row.querySelector(`.${String(focusedClass).split(" ")[0]}`) : null;
        target?.focus();
    }

    empty.hidden = visible.length > 0;
    if (!visible.length) {
        const [title, body] = EMPTY[filter];
        empty.querySelector("strong").textContent = title;
        empty.querySelector("p").textContent = body;
    }
}

addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = addInput.value.trim();
    if (!title) {
        addError.textContent = "Give it a name first.";
        addError.hidden = false;
        addInput.setAttribute("aria-invalid", "true");
        addInput.focus();
        return;
    }
    const status = filter === "all" || filter === "done" ? "pending" : filter;
    const button = addForm.querySelector("button");
    button.disabled = true;
    try {
        const task = await tasksApi.create({ title, status });
        tasks = [task, ...tasks];
        addInput.value = "";
        render();
    } catch (err) {
        showError(err);
    } finally {
        button.disabled = false;
        addInput.focus();
    }
});

addInput.addEventListener("input", () => {
    addError.hidden = true;
    addInput.removeAttribute("aria-invalid");
});

for (const button of filterButtons) {
    button.addEventListener("click", () => setFilter(button.dataset.filter));
}

async function load() {
    try {
        tasks = await tasksApi.list();
        loading.hidden = true;
        render();
    } catch (err) {
        loading.textContent = "Couldn’t load your tasks. Refresh to try again.";
        showError(err);
    }
}

render();
empty.hidden = true;
load();
