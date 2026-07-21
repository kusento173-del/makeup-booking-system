import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", String(process.pid) + "-" + String(Date.now()));
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the makeup booking prototype", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>妆序｜化妆部预约系统原型<\/title>/);
  assert.match(html, /化妆部预约系统/);
  assert.match(html, /主播端/);
  assert.match(html, /客服后台/);
  assert.match(html, /预约化妆/);
  assert.match(html, /原型模式/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/);
});

test("removes starter-only assets and metadata", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /PrototypeApp/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(layout, /妆序｜化妆部预约系统原型/);
  assert.doesNotMatch(layout, /codex-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  const previewFiles = await readdir(
    new URL("../app/_sites-preview", import.meta.url),
  ).catch((error) => {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  assert.deepEqual(previewFiles, []);
});

test("keeps business copy readable and free of decorative headings", async () => {
  const [prototype, styles] = await Promise.all([
    readFile(new URL("../app/prototype.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(prototype, /eyebrow|7-DAY OVERVIEW|化妆安排，一眼就清楚/);
  assert.doesNotMatch(styles, /font-size:\s*(?:[0-9]|1[01])px/);
});
