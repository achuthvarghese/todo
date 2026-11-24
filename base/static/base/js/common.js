// Shared helpers: API calls, safe DOM building, toasts and deferred deletes.

export const STATUS = {
    pending: { label: "To do" },
    in_progress: { label: "Doing" },
    done: { label: "Done" },
};
export const STATUS_ORDER = ["pending", "in_progress", "done"];
export const NEXT_STATUS = { pending: "in_progress", in_progress: "done", done: "pending" };

const main = document.getElementById("main");
export const API = {
    tasks: main.dataset.apiTasks,
    stats: main.dataset.apiStats,
};

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? "";

export class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

export async function api(url, { method = "GET", body, keepalive = false } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRFToken"] = csrfToken;
    let response;
    try {
        response = await fetch(url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: "same-origin",
            keepalive,
        });
    } catch {
        throw new ApiError("You appear to be offline. Try again.", 0);
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (response.status === 401 || (response.status === 403 && data?.detail?.includes("credentials"))) {
        // Session expired: send the user to sign in, then back here.
        window.location.assign(`/accounts/login/?next=${encodeURIComponent(location.pathname)}`);
        throw new ApiError("Please sign in again.", response.status);
    }
    if (!response.ok) {
        const first = data && typeof data === "object" ? Object.values(data).flat()[0] : null;
        throw new ApiError(typeof first === "string" ? first : "Something went wrong. Try again.", response.status, data);
    }
    return data;
}

export const tasksApi = {
    list: () => api(API.tasks),
    create: (fields) => api(API.tasks, { method: "POST", body: fields }),
    update: (task, fields) => api(task.url, { method: "PATCH", body: fields }),
    remove: (task, opts = {}) => api(task.url, { method: "DELETE", ...opts }),
};

/** Build an element. Strings become text nodes, never HTML. */
export function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") el.className = value;
        else if (key === "text") el.textContent = value;
        else if (key === "dataset") Object.assign(el.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
        else el.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
    check: '<path d="M3 8.5l3.2 3.2L13 4.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    left: '<path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    right: '<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** Inline SVG icon from a fixed set (never from user data). */
export function icon(name, size = 18) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name];
    return svg;
}

/** Relative age, e.g. "3d ago". */
export function age(iso, now = Date.now()) {
    const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// ---- Toast ---------------------------------------------------------------

const toastEl = document.getElementById("toast");
const toastText = toastEl.querySelector(".toast__text");
const toastBtn = toastEl.querySelector("button");
let toastTimer = null;
let toastAction = null;

toastBtn.addEventListener("click", () => {
    const action = toastAction;
    hideToast();
    action?.();
});

export function hideToast() {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
    toastAction = null;
}

export function toast(message, { actionLabel, onAction, error = false, timeout = 5000, onExpire } = {}) {
    // A new message replaces the old one, so finish any delete waiting on it.
    flushDeletes();
    clearTimeout(toastTimer);
    toastText.textContent = message;
    toastEl.classList.toggle("toast--error", error);
    toastAction = onAction ?? null;
    toastBtn.hidden = !actionLabel;
    toastBtn.textContent = actionLabel ?? "";
    toastEl.hidden = false;
    toastTimer = setTimeout(() => {
        hideToast();
        onExpire?.();
    }, timeout);
}

export function showError(err) {
    toast(err?.message || "Something went wrong. Try again.", { error: true });
}

// ---- Deferred delete with undo ---------------------------------------------

const pendingDeletes = new Map();

/**
 * Hide a task now and delete it on the server after the undo window.
 * `restore` puts it back if the user clicks Undo or the delete fails.
 */
export function deleteWithUndo(task, { restore, onDeleted }) {
    const commit = async (opts) => {
        pendingDeletes.delete(task.id);
        try {
            await tasksApi.remove(task, opts);
            onDeleted?.();
        } catch (err) {
            if (err.status === 404) return; // already gone
            restore();
            showError(err);
        }
    };
    toast(`Deleted “${task.title}”`, {
        actionLabel: "Undo",
        onAction: () => {
            pendingDeletes.delete(task.id);
            restore();
        },
        onExpire: () => pendingDeletes.get(task.id)?.(),
    });
    pendingDeletes.set(task.id, commit);
}

export function flushDeletes(opts) {
    for (const commit of [...pendingDeletes.values()]) commit(opts);
}

// Make sure deletes still reach the server if the user leaves the page.
window.addEventListener("pagehide", () => flushDeletes({ keepalive: true }));

// Close the account menu when clicking elsewhere or pressing Escape.
const account = document.querySelector(".account");
document.addEventListener("click", (event) => {
    if (account?.open && !account.contains(event.target)) account.open = false;
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && account?.open) {
        account.open = false;
        account.querySelector("summary").focus();
    }
});
