import { API, STATUS, STATUS_ORDER, api, h, showError } from "./common.js";

const bento = document.getElementById("bento");
const meta = document.getElementById("stats-meta");

const longDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const parseDay = (iso) => new Date(`${iso}T00:00:00Z`);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Round the axis maximum up so both gridlines land on whole numbers. */
function niceMax(value) {
    if (value <= 4) return 4;
    if (value <= 10) return Math.ceil(value / 2) * 2;
    return Math.ceil(value / 10) * 10;
}

const monthOnly = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone: "UTC" });

function setText(selector, text) {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
}

function renderKpis(s) {
    setText('[data-kpi="completion_rate"]', s.completion_rate);
    setText('[data-kpi-note="completion_rate"]', `${s.counts.done} of ${plural(s.total, "task")} done`);
    setText('[data-kpi="open"]', s.open);
    setText('[data-kpi-note="open"]', `${s.counts.in_progress} in progress`);
    setText('[data-kpi="done_this_week"]', s.done_this_week);
    const diff = s.done_this_week - s.done_last_week;
    setText(
        '[data-kpi-note="done_this_week"]',
        diff === 0 ? "Same as last week" : `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than last week`,
    );
    const avg = s.avg_days_to_done;
    setText('[data-kpi="avg_days_to_done"]', avg === null ? "–" : avg);
    setText('[data-kpi-unit="avg_days_to_done"]', avg === null ? "" : avg === 1 ? " day" : " days");
}

/** Vertical bar chart built from HTML so it reflows at any width. */
function barChart(container, rows, { tip, describe, labelAll = false, peak = true } = {}) {
    const top = Math.max(0, ...rows.map((r) => r.value));
    // Leave headroom above the tallest bar for its value label.
    const max = niceMax(Math.ceil(top * 1.15));
    const lastIndex = rows.length - 1;
    const axis = h("div", { class: "vchart__axis", "aria-hidden": "true" });
    const plot = h("div", { class: "vchart__plot" });
    for (const tick of [max / 2, max]) {
        const pct = (tick / max) * 100;
        const line = h("div", { class: "vchart__grid", "aria-hidden": "true" });
        line.style.bottom = `${pct}%`;
        plot.append(line);
        const label = h("span", { text: tick });
        label.style.bottom = `${pct}%`;
        axis.append(label);
    }
    rows.forEach((row, i) => {
        const fill = h("span", { class: "vchart__fill" });
        fill.style.height = `${(row.value / max) * 100}%`;
        const labelled = labelAll || (row.value > 0 && row.value === top) || i === lastIndex;
        const bar = h(
            "button",
            {
                type: "button",
                class: `vchart__bar${labelled ? " is-labelled" : ""}${peak && row.value === top && top > 0 ? " is-peak" : ""}`,
                "aria-label": describe(row),
            },
            h("span", { class: "vchart__value", text: row.value }),
            fill,
        );
        if (tip) {
            const show = () => (tip.textContent = describe(row));
            bar.addEventListener("mouseenter", show);
            bar.addEventListener("focus", show);
        }
        plot.append(bar);
    });
    if (tip) {
        const reset = tip.textContent;
        plot.addEventListener("mouseleave", () => (tip.textContent = reset));
    }
    const labels = h("div", { class: "vchart__labels", "aria-hidden": "true" }, rows.map((r) => h("span", { text: r.label })));
    container.replaceChildren(axis, plot, labels);
}

function renderWeekly(s) {
    const rows = s.weekly.map((w, i) => ({
        // Day number, with the month above it where it changes, so labels fit on phones.
        label: `${
            i === 0 || parseDay(w.week_start).getUTCMonth() !== parseDay(s.weekly[i - 1].week_start).getUTCMonth()
                ? monthOnly.format(parseDay(w.week_start))
                : ""
        }\n${dayOnly.format(parseDay(w.week_start))}`,
        long: `${longDate.format(parseDay(w.week_start))}${i === s.weekly.length - 1 ? " (this week)" : ""}`,
        value: w.count,
    }));
    barChart(document.getElementById("weekly-chart"), rows, {
        tip: document.getElementById("weekly-tip"),
        describe: (r) => `Week of ${r.long}: ${plural(r.value, "task")} completed`,
    });
    document.querySelector("#weekly-table tbody").replaceChildren(
        ...rows.map((r) => h("tr", {}, h("td", { text: r.long }), h("td", { text: r.value }))),
    );
}

function renderStatus(s) {
    setText("#status-total", `${plural(s.total, "task")} in total`);
    const stack = document.getElementById("status-stack");
    const parts = STATUS_ORDER.map((key) => {
        const count = s.counts[key];
        return { key, count, pct: s.total ? Math.round((count / s.total) * 100) : 0 };
    });
    stack.replaceChildren(
        ...parts
            .filter((p) => p.count > 0)
            .map((p) => {
                const seg = h("span", { class: `swatch--${p.key}` });
                seg.style.flex = `${p.count} 1 0`;
                return seg;
            }),
    );
    if (!s.total) stack.replaceChildren(h("span", { class: "swatch--pending" }));
    stack.setAttribute("aria-label", parts.map((p) => `${STATUS[p.key].label} ${p.count} (${p.pct}%)`).join(", "));
    document.getElementById("status-legend").replaceChildren(
        ...parts.map((p) =>
            h(
                "li",
                {},
                h("span", { class: `swatch swatch--${p.key}`, "aria-hidden": "true" }),
                h("span", { class: "legend__label", text: STATUS[p.key].label }),
                h("span", { class: "legend__num", text: p.count }),
                h("span", { class: "legend__pct", text: `${p.pct}%` }),
            ),
        ),
    );
    setText("#status-note", `Created this week: ${s.created_this_week} · completed: ${s.done_this_week}`);
}

function renderHeatmap(s) {
    const grid = document.getElementById("heatmap");
    const tip = document.getElementById("heat-tip");
    const reset = tip.textContent;
    const max = Math.max(1, ...s.daily.map((d) => d.count));
    let total = 0;
    let activeDays = 0;
    grid.replaceChildren(
        ...s.daily.map((d) => {
            total += d.count;
            if (d.count) activeDays += 1;
            const level = d.count ? Math.max(1, Math.ceil((d.count / max) * 4)) : 0;
            const label = d.future
                ? `${longDate.format(parseDay(d.date))}: upcoming`
                : `${longDate.format(parseDay(d.date))}: ${plural(d.count, "task")} completed`;
            const cell = h("span", { class: "heatmap__cell", dataset: { level: String(level) }, title: label });
            if (d.future) cell.dataset.future = "";
            cell.addEventListener("mouseenter", () => (tip.textContent = label));
            return cell;
        }),
    );
    grid.addEventListener("mouseleave", () => (tip.textContent = reset));
    grid.setAttribute("aria-label", `${plural(total, "task")} completed on ${plural(activeDays, "day")} in the last 12 weeks`);
}

function renderWeekdays(s) {
    const max = Math.max(1, ...s.weekdays.map((d) => d.count));
    const top = Math.max(...s.weekdays.map((d) => d.count));
    document.getElementById("weekdays").replaceChildren(
        ...s.weekdays.map((d) => {
            const fill = h("span", { class: `hbars__fill${d.count === top && top > 0 ? " is-peak" : ""}` });
            fill.style.width = `${(d.count / max) * 100}%`;
            return h(
                "li",
                { "aria-label": `${d.day}: ${plural(d.count, "task")} completed` },
                h("span", { "aria-hidden": "true", text: d.day }),
                h("span", { class: "hbars__track", "aria-hidden": "true" }, fill),
                h("span", { "aria-hidden": "true", text: d.count }),
            );
        }),
    );
}

function renderAges(s) {
    setText("#age-sub", `${plural(s.open, "open task")} by time since created`);
    barChart(
        document.getElementById("ages-chart"),
        s.open_ages.map((a) => ({ label: a.label, value: a.count })),
        { describe: (r) => `${r.label}: ${plural(r.value, "open task")}`, labelAll: true, peak: false },
    );
}

function renderOldest(s) {
    const list = document.getElementById("oldest");
    list.replaceChildren(
        ...s.oldest_open.map((t) =>
            h(
                "li",
                {},
                h("span", { class: "oldest__title", text: t.title }),
                h("span", { class: `chip chip--${t.status}`, text: STATUS[t.status].label }),
                h("span", { class: "oldest__age", text: `${t.age_days}d`, "aria-label": plural(t.age_days, "day") + " old" }),
            ),
        ),
    );
    document.getElementById("oldest-empty").hidden = s.oldest_open.length > 0;
}

const tableToggle = document.getElementById("weekly-table-toggle");
tableToggle.addEventListener("click", () => {
    const showTable = tableToggle.getAttribute("aria-pressed") !== "true";
    tableToggle.setAttribute("aria-pressed", String(showTable));
    tableToggle.textContent = showTable ? "Show chart" : "Show table";
    document.getElementById("weekly-chart").hidden = showTable;
    document.getElementById("weekly-tip").hidden = showTable;
    document.getElementById("weekly-table").hidden = !showTable;
});

async function load() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const url = new URL(API.stats, location.origin);
    if (tz) url.searchParams.set("tz", tz);
    try {
        let stats;
        try {
            stats = await api(url);
        } catch (err) {
            // Fall back to the server's time zone if the browser's is unknown.
            if (err.status !== 400) throw err;
            stats = await api(API.stats);
        }
        renderKpis(stats);
        renderWeekly(stats);
        renderStatus(stats);
        renderHeatmap(stats);
        renderWeekdays(stats);
        renderAges(stats);
        renderOldest(stats);
        meta.textContent = `All time · ${stats.timezone}`;
        bento.setAttribute("aria-busy", "false");
    } catch (err) {
        meta.textContent = "Couldn’t load statistics.";
        showError(err);
    }
}

load();
