// Browser-only backend for the static demo (GitHub Pages): tasks live in
// localStorage, are seeded with sample data, and statistics are computed here
// with the same rules as base/stats.py.

const STORAGE_KEY = "todo-demo-tasks-v1";
const DAY = 86400000;

const SAMPLE_TASKS = [
    ["Renew car insurance", "Compare the two quotes in the inbox before Friday."],
    ["Book dentist appointment", ""],
    ["Write project README", "Setup steps, environment variables and API overview."],
    ["Plan weekend groceries", "Vegetables, rice, coffee beans, dish soap."],
    ["Send invoice to client", "Attach the timesheet for last month."],
    ["Fix bike brakes", "Front pads are worn; order a new set."],
    ["Return library books", ""],
    ["Sort out old photo backups", "Move everything from the old drive to the NAS."],
    ["Pay electricity bill", ""],
    ["Back up laptop", "External drive is in the desk drawer."],
    ["Call the plumber", "Kitchen tap is dripping again."],
    ["Update CV", "Add the last two projects."],
    ["Water the plants", ""],
    ["Research new phone plan", "Need more data, same price or less."],
    ["Clean out the garage", ""],
    ["Order birthday present for Sam", "Board game or a nice notebook."],
    ["Prepare slides for Monday", "Ten slides max, one chart per slide."],
    ["Book flights for the holidays", "Compare morning and evening departures."],
    ["Cancel unused streaming service", ""],
    ["Change the smoke alarm batteries", ""],
    ["Reply to the landlord", "About the lease renewal."],
    ["Learn 20 new Spanish words", ""],
    ["Fix the wobbly chair", ""],
    ["Bake bread for the weekend", "Start the dough on Friday night."],
];

/** Small seeded random number generator so the demo looks the same each time. */
function mulberry32(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function newId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function sampleTasks(count = 60, seed = 7, now = Date.now()) {
    const rand = mulberry32(seed);
    const uniform = (a, b) => a + (b - a) * rand();
    const tasks = [];
    for (let i = 0; i < count; i++) {
        const [title, description] = SAMPLE_TASKS[i % SAMPLE_TASKS.length];
        const recent = i < Math.max(1, Math.floor(count / 8));
        const created = now - (recent ? uniform(0, 3) : uniform(0, 84)) * DAY - uniform(0, 12) * 3600000;
        const ageDays = Math.floor((now - created) / DAY);
        const doneChance = ageDays > 21 ? 0.85 : ageDays > 3 ? 0.55 : 0.2;
        const roll = rand();
        const status = roll < doneChance ? "done" : roll < doneChance + (1 - doneChance) / 2 ? "in_progress" : "pending";
        let completed = null;
        if (status === "done") {
            const choices = [0, 0, 1, 1, 2, 3, 5, 8];
            const days = recent ? 0 : choices[Math.floor(rand() * choices.length)];
            completed = Math.min(now, created + days * DAY + uniform(1, 10) * 3600000);
        }
        const id = newId();
        tasks.push({
            id,
            url: `local:${id}`,
            title,
            description,
            status,
            created_at: new Date(created).toISOString(),
            updated_at: new Date(completed ?? created).toISOString(),
            completed_at: completed ? new Date(completed).toISOString() : null,
        });
    }
    return tasks.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (Array.isArray(saved)) return saved;
    } catch {
        // Fall through to fresh sample data.
    }
    const tasks = sampleTasks();
    save(tasks);
    return tasks;
}

function save(tasks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
        // Private mode or storage full: the demo still works until reload.
    }
}

let cache = null;
const all = () => (cache ??= load());
const commit = (tasks) => {
    cache = tasks;
    save(tasks);
};

class LocalError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

function clean(fields, { creating = false } = {}) {
    const out = {};
    if ("title" in fields || creating) {
        const title = String(fields.title ?? "").trim();
        if (!title) throw new LocalError("Title cannot be blank.", 400);
        if (title.length > 60) throw new LocalError("Ensure this field has no more than 60 characters.", 400);
        out.title = title;
    }
    if ("description" in fields) out.description = String(fields.description ?? "");
    if ("status" in fields) {
        if (!["pending", "in_progress", "done"].includes(fields.status)) throw new LocalError("Not a valid status.", 400);
        out.status = fields.status;
    }
    return out;
}

const copy = (task) => ({ ...task });

export const localTasks = {
    async list() {
        return all().map(copy);
    },
    async create(fields) {
        const now = new Date().toISOString();
        const values = clean(fields, { creating: true });
        const id = newId();
        const task = {
            id,
            url: `local:${id}`,
            description: "",
            status: "pending",
            ...values,
            created_at: now,
            updated_at: now,
            completed_at: values.status === "done" ? now : null,
        };
        commit([task, ...all()]);
        return copy(task);
    },
    async update(task, fields) {
        const current = all().find((t) => t.id === task.id);
        if (!current) throw new LocalError("Not found.", 404);
        const values = clean(fields);
        const now = new Date().toISOString();
        const updated = { ...current, ...values, updated_at: now };
        if (updated.status === "done") updated.completed_at = current.completed_at ?? now;
        else updated.completed_at = null;
        commit(all().map((t) => (t.id === task.id ? updated : t)));
        return copy(updated);
    },
    async remove(task) {
        if (!all().some((t) => t.id === task.id)) throw new LocalError("Not found.", 404);
        commit(all().filter((t) => t.id !== task.id));
        return null;
    },
};

export function resetDemo() {
    commit(sampleTasks());
}

// ---- Statistics (same rules as base/stats.py, in the browser's time zone) ----

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AGE_BUCKETS = [
    ["lt_1d", "< 1 day", 1],
    ["1_7d", "1–7 days", 7],
    ["1_4w", "1–4 weeks", 28],
    ["gt_4w", "> 4 weeks", null],
];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayIndex = (d) => (d.getDay() + 6) % 7;

export function computeStats(tasks, nowMs = Date.now()) {
    const now = new Date(nowMs);
    const today = startOfDay(now);
    const thisWeek = addDays(today, -mondayIndex(today));
    const counts = { pending: 0, in_progress: 0, done: 0 };
    for (const t of tasks) counts[t.status] += 1;
    const completed = tasks.filter((t) => t.status === "done" && t.completed_at);
    const open = tasks.filter((t) => t.status !== "done");

    const doneDays = new Map();
    for (const t of completed) {
        const key = dayKey(new Date(t.completed_at));
        doneDays.set(key, (doneDays.get(key) ?? 0) + 1);
    }
    const countBetween = (list, start, end) =>
        list.filter((iso) => {
            const d = startOfDay(new Date(iso));
            return d >= start && d < end;
        }).length;
    const doneIsos = completed.map((t) => t.completed_at);
    const createdIsos = tasks.map((t) => t.created_at);

    const weekly = [];
    for (let i = 7; i >= 0; i--) {
        const start = addDays(thisWeek, -7 * i);
        weekly.push({ week_start: dayKey(start), count: countBetween(doneIsos, start, addDays(start, 7)) });
    }

    const heatStart = addDays(thisWeek, -7 * 11);
    const daily = [];
    for (let i = 0; i < 84; i++) {
        const day = addDays(heatStart, i);
        daily.push({ date: dayKey(day), count: doneDays.get(dayKey(day)) ?? 0, future: day > today });
    }

    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    for (const iso of doneIsos) byWeekday[mondayIndex(new Date(iso))] += 1;

    const ages = Object.fromEntries(AGE_BUCKETS.map(([key]) => [key, 0]));
    for (const t of open) {
        const ageDays = (nowMs - new Date(t.created_at).getTime()) / DAY;
        const bucket = AGE_BUCKETS.find(([, , limit]) => limit === null || ageDays < limit);
        ages[bucket[0]] += 1;
    }

    const durations = completed.map((t) => new Date(t.completed_at) - new Date(t.created_at));
    const avg = durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length / DAY) * 10) / 10 : null;

    const total = tasks.length;
    return {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local time",
        generated_at: now.toISOString(),
        total,
        counts,
        open: open.length,
        completion_rate: total ? Math.round((counts.done / total) * 100) : 0,
        done_this_week: countBetween(doneIsos, thisWeek, addDays(thisWeek, 7)),
        done_last_week: countBetween(doneIsos, addDays(thisWeek, -7), thisWeek),
        created_this_week: countBetween(createdIsos, thisWeek, addDays(thisWeek, 7)),
        avg_days_to_done: avg,
        weekly,
        daily,
        weekdays: WEEKDAYS.map((day, i) => ({ day, count: byWeekday[i] })),
        open_ages: AGE_BUCKETS.map(([key, label]) => ({ key, label, count: ages[key] })),
        oldest_open: [...open]
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .slice(0, 5)
            .map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
                created_at: t.created_at,
                age_days: Math.floor((nowMs - new Date(t.created_at).getTime()) / DAY),
            })),
    };
}

export const localStats = {
    async get() {
        return computeStats(all());
    },
};
