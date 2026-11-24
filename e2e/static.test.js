// Browser tests for the static GitHub Pages build. Build and serve it, then:
//   STATIC_BASE_URL=http://127.0.0.1:8080/todo/ npm test
// Skipped when STATIC_BASE_URL isn't set.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { chromium } from "playwright";

const BASE = process.env.STATIC_BASE_URL?.replace(/\/?$/, "/");

describe("static demo site", { skip: !BASE && "STATIC_BASE_URL not set" }, () => {
    let browser;

    before(async () => {
        browser = await chromium.launch();
    });

    after(async () => {
        await browser?.close();
    });

    async function openPage(path = "", viewport = { width: 1280, height: 900 }) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors = [];
        const apiCalls = [];
        page.on("pageerror", (err) => errors.push(err.message));
        page.on("request", (req) => {
            if (new URL(req.url()).pathname.includes("/api/")) apiCalls.push(req.url());
        });
        await page.goto(BASE + path);
        return { context, page, errors, apiCalls };
    }

    test("landing page links into the demo, with no sign-in", async () => {
        const { context, page, errors } = await openPage();
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(await page.locator('a[href*="/accounts/"]').count(), 0);
        await page.locator(".hero__actions a", { hasText: "Open the demo" }).click();
        await page.waitForURL(`${BASE}tasks/`);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test("list starts with sample tasks and keeps changes after reload", async () => {
        const { context, page, errors, apiCalls } = await openPage("tasks/");
        await page.waitForSelector("#loading", { state: "hidden" });
        assert.equal(await page.locator("#task-list li").count(), 60);
        assert.equal(await page.getAttribute("#main", "data-mode"), "static");

        await page.fill("#new-task", "Static demo task");
        await page.press("#new-task", "Enter");
        const row = page.locator("#task-list li", { hasText: "Static demo task" });
        await row.waitFor();
        await row.locator(".check").click();
        await page.waitForTimeout(200);

        await page.reload();
        await page.waitForSelector("#loading", { state: "hidden" });
        assert.equal(await page.locator("#task-list li").count(), 61);
        assert.equal(await row.locator(".check").getAttribute("aria-pressed"), "true");

        const evil = '<img src=x onerror="window.__pwned=1">';
        await page.fill("#new-task", evil);
        await page.press("#new-task", "Enter");
        await page.locator(".task__title", { hasText: evil }).waitFor();
        assert.equal(await page.evaluate(() => window.__pwned), undefined);

        assert.deepEqual(apiCalls, []);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test("board moves cards and statistics reflect the data", async () => {
        const { context, page, errors } = await openPage("board/");
        await page.waitForSelector(".card");
        const pending = () => page.locator('.column[data-status="pending"] .card').count();
        const before = await pending();
        await page.locator('.column[data-status="pending"] .card').first().locator(".card__moves button").last().click();
        await page.waitForTimeout(200);
        assert.equal(await pending(), before - 1);

        await page.goto(`${BASE}stats/`);
        await page.waitForSelector('#bento[aria-busy="false"]');
        const total = Number((await page.locator("#status-total").innerText()).split(" ")[0]);
        assert.equal(total, 60);
        assert.equal(await page.locator("#weekly-chart .vchart__bar").count(), 8);
        assert.equal(await page.locator("#heatmap .heatmap__cell").count(), 84);
        assert.ok(Number(await page.locator('[data-kpi="completion_rate"]').innerText()) > 0);
        assert.deepEqual(errors, []);
        await context.close();
    });

    test("reset restores the sample data", async () => {
        const { context, page } = await openPage("tasks/");
        await page.waitForSelector("#loading", { state: "hidden" });
        await page.fill("#new-task", "Temporary");
        await page.press("#new-task", "Enter");
        await page.locator(".task__title", { hasText: "Temporary" }).waitFor();
        await page.click(".account summary");
        await page.click("#reset-demo");
        await page.waitForLoadState("load");
        await page.waitForSelector("#loading", { state: "hidden" });
        assert.equal(await page.locator(".task__title", { hasText: "Temporary" }).count(), 0);
        assert.equal(await page.locator("#task-list li").count(), 60);
        await context.close();
    });

    test("fits every screen from 320px to 1920px, unknown paths get the 404 page", async () => {
        const { context, page } = await openPage();
        const problems = [];
        for (const width of [320, 375, 768, 1024, 1440, 1920]) {
            await page.setViewportSize({ width, height: 900 });
            for (const path of ["", "tasks/", "board/", "stats/"]) {
                await page.goto(BASE + path);
                await page.waitForLoadState("networkidle");
                const extra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                if (extra > 0) problems.push(`${path || "/"} at ${width}px overflows by ${extra}px`);
            }
        }
        assert.deepEqual(problems, []);
        const missing = await page.goto(`${BASE}does-not-exist/`);
        assert.equal(missing.status(), 404);
        await context.close();
    });
});
