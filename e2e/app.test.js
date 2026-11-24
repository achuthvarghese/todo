// End-to-end browser tests. Start the app first, then:
//   BASE_URL=http://127.0.0.1:8000 npm test
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { chromium } from "playwright";

const BASE = (process.env.BASE_URL || "").replace(/\/$/, "");
// Needs the Django app running; skipped when only the static site is tested.
const SKIP = !BASE && "BASE_URL not set";
const PASSWORD = "a-Strong-pass-123";
const WIDTHS = [320, 375, 768, 1024, 1440, 1920];

let browser;
let counter = 0;

before(async () => {
    if (!SKIP) browser = await chromium.launch();
});

after(async () => {
    await browser?.close();
});

/** New browser context with a freshly signed-up user. */
async function signedInPage(viewport = { width: 1280, height: 900 }) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("dialog", (dialog) => {
        errors.push(`unexpected dialog: ${dialog.message()}`);
        dialog.dismiss();
    });
    const username = `user${Date.now()}${counter++}`;
    await page.goto(`${BASE}/accounts/signup/`);
    await page.fill("#id_username", username);
    await page.fill("#id_password1", PASSWORD);
    await page.fill("#id_password2", PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForURL(`${BASE}/tasks/`);
    await page.waitForSelector("#loading", { state: "hidden" });
    return { context, page, errors, username };
}

async function addTask(page, title) {
    await page.fill("#new-task", title);
    await page.press("#new-task", "Enter");
    await page.locator(".task__title", { hasText: title }).first().waitFor();
}

const row = (page, title) => page.locator("#task-list li", { has: page.locator(".task__title", { hasText: title }) });

async function overflow(page) {
    return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

describe("public pages", { skip: SKIP }, () => {
    test("landing page has search metadata", async () => {
        const page = await browser.newPage();
        await page.goto(`${BASE}/`);
        assert.match(await page.title(), /todo\./);
        assert.equal(await page.getAttribute('meta[name="robots"]', "content"), "index, follow");
        assert.ok((await page.getAttribute('meta[name="description"]', "content")).length > 50);
        assert.equal(await page.getAttribute('link[rel="canonical"]', "href"), `${BASE}/`);
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(await page.getAttribute("html", "lang"), "en");
        await page.close();
    });

    test("robots.txt and sitemap.xml", async () => {
        const page = await browser.newPage();
        const robots = await page.request.get(`${BASE}/robots.txt`);
        assert.equal(robots.status(), 200);
        assert.match(await robots.text(), /Disallow: \/api\//);
        const sitemap = await page.request.get(`${BASE}/sitemap.xml`);
        assert.equal(sitemap.status(), 200);
        assert.match(await sitemap.text(), /\/accounts\/signup\//);
        await page.close();
    });

    test("sign-up validates and creates a regular user", async () => {
        const page = await browser.newPage();
        await page.goto(`${BASE}/accounts/signup/`);
        await page.fill("#id_username", `weak${Date.now()}`);
        await page.fill("#id_password1", "123");
        await page.fill("#id_password2", "123");
        await page.click("button[type=submit]");
        assert.ok((await page.locator('[aria-invalid="true"]').count()) > 0);
        await page.close();

        const { context, page: app } = await signedInPage();
        // Regular users can't use the admin site.
        await app.goto(`${BASE}/admin/`);
        assert.match(app.url(), /\/admin\/login\//);
        await context.close();
    });

    test("app pages need a login", async () => {
        const page = await browser.newPage();
        for (const path of ["/tasks/", "/board/", "/stats/"]) {
            await page.goto(`${BASE}${path}`);
            assert.match(page.url(), /\/accounts\/login\/\?next=/);
        }
        await page.close();
    });
});

describe("task list", { skip: SKIP }, () => {
    test("add, complete, cycle status, edit, filter", async () => {
        const { context, page, errors } = await signedInPage();
        await addTask(page, "Buy milk");
        await addTask(page, "Call mum");

        await row(page, "Buy milk").locator(".check").click();
        await page.waitForFunction(() => document.querySelector('[data-tile="done"]').textContent === "1");
        assert.equal(await row(page, "Buy milk").locator(".check").getAttribute("aria-pressed"), "true");

        await row(page, "Call mum").locator("button.chip").click();
        await page.waitForTimeout(300);
        assert.equal(await row(page, "Call mum").locator("button.chip").innerText(), "DOING");

        await row(page, "Call mum").locator(".task__title").click();
        await page.fill(".task-edit input", "Call mum back");
        await page.fill(".task-edit textarea", "About Sunday");
        await page.click(".task-edit button[type=submit]");
        await row(page, "Call mum back").waitFor();

        await page.click('[data-filter="done"]');
        assert.match(page.url(), /\?status=done$/);
        assert.equal(await page.locator("#task-list li").count(), 1);

        // Everything survives a reload.
        await page.reload();
        await page.waitForSelector("#loading", { state: "hidden" });
        assert.equal(await page.locator("#task-list li").count(), 1);
        await page.click('[data-filter="all"]');
        assert.equal(await row(page, "Call mum back").locator(".task__desc").innerText(), "About Sunday");
        assert.deepEqual(errors, []);
        await context.close();
    });

    test("blank titles are rejected", async () => {
        const { context, page } = await signedInPage();
        await page.click("#add-form button");
        assert.ok(await page.locator("#add-error").isVisible());
        assert.equal(await page.getAttribute("#new-task", "aria-invalid"), "true");
        await context.close();
    });

    test("task text is shown as text, never run as HTML", async () => {
        const { context, page, errors } = await signedInPage();
        const evil = '<img src=x onerror="window.__pwned=1">';
        await addTask(page, evil);
        assert.equal(await row(page, evil).locator(".task__title").innerText(), evil);
        assert.equal(await page.evaluate(() => window.__pwned), undefined);
        assert.equal(await page.locator("#task-list img").count(), 0);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test("delete can be undone, and otherwise sticks", async () => {
        const { context, page } = await signedInPage();
        await addTask(page, "Keep me");
        await addTask(page, "Delete me");

        await row(page, "Keep me").getByRole("button", { name: "Delete: Keep me" }).click();
        assert.match(await page.locator("#toast").innerText(), /Deleted “Keep me”/);
        await page.click("#toast button");
        await row(page, "Keep me").waitFor();

        await row(page, "Delete me").getByRole("button", { name: "Delete: Delete me" }).click();
        await page.waitForSelector("#toast", { state: "hidden", timeout: 8000 });
        await page.reload();
        await page.waitForSelector("#loading", { state: "hidden" });
        assert.equal(await row(page, "Delete me").count(), 0);
        assert.equal(await row(page, "Keep me").count(), 1);
        await context.close();
    });

    test("works with the keyboard alone", async () => {
        const { context, page } = await signedInPage();
        await page.focus("#new-task");
        await page.keyboard.type("Keyboard task");
        await page.keyboard.press("Enter");
        await row(page, "Keyboard task").waitFor();
        await row(page, "Keyboard task").locator(".check").focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => document.querySelector('[data-tile="done"]').textContent === "1");
        await context.close();
    });
});

describe("board", { skip: SKIP }, () => {
    test("move with buttons, drag and drop, and add to a column", async () => {
        const { context, page, errors } = await signedInPage();
        await addTask(page, "Board card");
        await page.goto(`${BASE}/board/`);
        const column = (status) => page.locator(`.column[data-status="${status}"]`);
        await column("pending").locator(".card", { hasText: "Board card" }).waitFor();

        await page.getByRole("button", { name: "Move “Board card” to Doing" }).click();
        await column("in_progress").locator(".card", { hasText: "Board card" }).waitFor();

        await column("in_progress").locator(".card", { hasText: "Board card" }).dragTo(column("done").locator(".column__head"));
        await column("done").locator(".card", { hasText: "Board card" }).waitFor();

        await column("pending").locator("[data-add]").click();
        await page.fill("#add-pending", "From the board");
        await page.press("#add-pending", "Enter");
        await column("pending").locator(".card", { hasText: "From the board" }).waitFor();

        await page.reload();
        await column("done").locator(".card", { hasText: "Board card" }).waitFor();
        assert.deepEqual(errors, []);
        await context.close();
    });
});

describe("statistics", { skip: SKIP }, () => {
    test("numbers match the user's tasks", async () => {
        const { context, page, errors } = await signedInPage();
        for (const title of ["One", "Two", "Three"]) await addTask(page, title);
        await row(page, "One").locator(".check").click();
        await page.waitForFunction(() => document.querySelector('[data-tile="done"]').textContent === "1");

        await page.goto(`${BASE}/stats/`);
        await page.waitForSelector('#bento[aria-busy="false"]');
        assert.equal(await page.locator('[data-kpi="completion_rate"]').innerText(), "33");
        assert.equal(await page.locator('[data-kpi="open"]').innerText(), "2");
        assert.equal(await page.locator('[data-kpi="done_this_week"]').innerText(), "1");
        assert.equal(await page.locator("#weekly-chart .vchart__bar").count(), 8);
        assert.equal(await page.locator("#heatmap .heatmap__cell").count(), 84);
        assert.equal(await page.locator("#oldest li").count(), 2);

        await page.click("#weekly-table-toggle");
        assert.equal(await page.locator("#weekly-table tbody tr").count(), 8);
        assert.ok(await page.locator("#weekly-chart").isHidden());
        assert.deepEqual(errors, []);
        await context.close();
    });
});

describe("responsive layout", { skip: SKIP }, () => {
    test("no sideways scrolling from 320px phones to 1920px screens", async () => {
        const { context, page } = await signedInPage();
        await addTask(page, "A task with a fairly long title to test wrapping");
        const problems = [];
        for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            for (const path of ["/", "/tasks/", "/board/", "/stats/"]) {
                await page.goto(`${BASE}${path}`);
                await page.waitForLoadState("networkidle");
                const extra = await overflow(page);
                if (extra > 0) problems.push(`${path} at ${width}px overflows by ${extra}px`);
            }
        }
        for (const width of [320, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            for (const path of ["/accounts/login/", "/accounts/signup/"]) {
                const anon = await browser.newPage({ viewport: { width, height: 900 } });
                await anon.goto(`${BASE}${path}`);
                const extra = await overflow(anon);
                if (extra > 0) problems.push(`${path} at ${width}px overflows by ${extra}px`);
                await anon.close();
            }
        }
        assert.deepEqual(problems, []);
        await context.close();
    });

    test("phones get the bottom tab bar, desktops the header nav", async () => {
        const { context, page } = await signedInPage({ width: 375, height: 812 });
        assert.ok(await page.locator(".bottom-nav").isVisible());
        assert.ok(await page.locator(".main-nav").isHidden());
        await page.locator(".bottom-nav a", { hasText: "Board" }).click();
        await page.waitForURL(`${BASE}/board/`);
        await page.setViewportSize({ width: 1280, height: 900 });
        assert.ok(await page.locator(".main-nav").isVisible());
        assert.ok(await page.locator(".bottom-nav").isHidden());
        await context.close();
    });
});
