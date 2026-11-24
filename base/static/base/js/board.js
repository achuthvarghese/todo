import { STATUS, STATUS_ORDER, age, deleteWithUndo, h, icon, showError, tasksApi, toast } from "./common.js";

const loading = document.getElementById("loading");
const columns = Object.fromEntries(
    [...document.querySelectorAll(".column")].map((col) => [col.dataset.status, col]),
);

let tasks = [];
let dragId = null;

function replaceTask(updated) {
    tasks = tasks.map((t) => (t.id === updated.id ? updated : t));
}

async function move(task, status, { focus = false } = {}) {
    if (task.status === status) return;
    const before = task;
    replaceTask({ ...task, status });
    render();
    if (focus) focusCard(task.id);
    toast(`Moved “${task.title}” to ${STATUS[status].label}`, { timeout: 2500 });
    try {
        replaceTask(await tasksApi.update(task, { status }));
    } catch (err) {
        replaceTask(before);
        showError(err);
    }
    render();
    if (focus) focusCard(task.id);
}

function focusCard(id) {
    const card = document.querySelector(`.card[data-id="${id}"]`);
    (card?.querySelector(".card__moves button:last-child") ?? card)?.focus();
}

function remove(task) {
    const index = tasks.findIndex((t) => t.id === task.id);
    tasks = tasks.filter((t) => t.id !== task.id);
    render();
    deleteWithUndo(task, {
        restore: () => {
            tasks.splice(Math.min(index, tasks.length), 0, task);
            render();
        },
    });
}

function card(task) {
    const i = STATUS_ORDER.indexOf(task.status);
    const prev = STATUS_ORDER[i - 1];
    const next = STATUS_ORDER[i + 1];
    return h(
        "li",
        {
            class: "card",
            draggable: "true",
            tabindex: "-1",
            dataset: { id: task.id },
            onDragstart: (event) => {
                dragId = task.id;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", task.id);
                event.currentTarget.classList.add("is-dragging");
            },
            onDragend: (event) => {
                dragId = null;
                event.currentTarget.classList.remove("is-dragging");
                Object.values(columns).forEach((c) => c.classList.remove("is-drop-target"));
            },
        },
        h("h3", { text: task.title }),
        task.description ? h("p", { text: task.description }) : null,
        h(
            "div",
            { class: "card__foot" },
            h("span", { class: "mono", text: age(task.created_at) }),
            h(
                "div",
                { class: "card__moves" },
                h("button", { type: "button", class: "icon-btn", "aria-label": `Delete: ${task.title}`, onClick: () => remove(task) }, icon("close", 16)),
                prev
                    ? h("button", { type: "button", class: "icon-btn icon-btn--boxed", "aria-label": `Move “${task.title}” to ${STATUS[prev].label}`, onClick: () => move(task, prev, { focus: true }) }, icon("left", 14))
                    : null,
                next
                    ? h("button", { type: "button", class: `icon-btn icon-btn--boxed chip--${next}`, "aria-label": `Move “${task.title}” to ${STATUS[next].label}`, onClick: () => move(task, next, { focus: true }) }, icon("right", 14))
                    : null,
            ),
        ),
    );
}

function render() {
    for (const status of STATUS_ORDER) {
        const col = columns[status];
        const items = tasks.filter((t) => t.status === status);
        col.querySelector(".column__cards").replaceChildren(...items.map(card));
        col.querySelector("[data-count]").textContent = items.length;
        col.querySelector(".column__empty").hidden = items.length > 0;
    }
}

function addForm(status, button) {
    const id = `add-${status}`;
    const input = h("input", { class: "input", id, type: "text", maxlength: 60, placeholder: "Task title", autocomplete: "off" });
    const close = () => {
        form.replaceWith(button);
        button.focus();
    };
    const form = h(
        "form",
        {
            class: "column__add",
            novalidate: true,
            onKeydown: (event) => event.key === "Escape" && close(),
            onSubmit: async (event) => {
                event.preventDefault();
                const title = input.value.trim();
                if (!title) {
                    input.setAttribute("aria-invalid", "true");
                    input.focus();
                    return;
                }
                try {
                    const task = await tasksApi.create({ title, status });
                    tasks = [task, ...tasks];
                    render();
                    input.value = "";
                    input.removeAttribute("aria-invalid");
                    input.focus();
                } catch (err) {
                    showError(err);
                }
            },
        },
        h("label", { class: "visually-hidden", for: id, text: `New task in ${STATUS[status].label}` }),
        input,
        h("button", { type: "submit", class: "btn btn--accent", text: "Add" }),
    );
    button.replaceWith(form);
    input.focus();
}

for (const [status, col] of Object.entries(columns)) {
    col.addEventListener("dragover", (event) => {
        if (!dragId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        col.classList.add("is-drop-target");
    });
    col.addEventListener("dragleave", (event) => {
        if (!col.contains(event.relatedTarget)) col.classList.remove("is-drop-target");
    });
    col.addEventListener("drop", (event) => {
        event.preventDefault();
        col.classList.remove("is-drop-target");
        const id = event.dataTransfer.getData("text/plain") || dragId;
        const task = tasks.find((t) => t.id === id);
        if (task) move(task, status);
    });
    const button = col.querySelector("[data-add]");
    button.addEventListener("click", () => addForm(status, button));
}

async function load() {
    try {
        tasks = await tasksApi.list();
        loading.hidden = true;
        render();
    } catch (err) {
        loading.textContent = "Couldn’t load your board. Refresh to try again.";
        showError(err);
    }
}

load();
