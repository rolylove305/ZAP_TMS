import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
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

test("server-renders the ZAP Dispatch commercial page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>ZAP Dispatch TMS \| Dispatch, Tracking &amp; HOS<\/title>/i);
  assert.match(html, /Run dispatch\./i);
  assert.match(html, /Track every load\./i);
  assert.match(html, /Start free for 30 days/i);
  assert.match(html, /<sup>\$<\/sup><b>29<\/b>/);
  assert.match(html, /https:\/\/app\.zapdispatch\.com/i);
});

test("publishes the commercial metadata and privacy promise", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /property="og:image" content="https:\/\/zapdispatch\.com\/og\.png"/i);
  assert.match(html, /Every subscription is an independent account\./i);
  assert.match(html, /Other dispatchers and carriers cannot access your company records\./i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});
