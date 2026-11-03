import assert from "node:assert/strict";
import test from "node:test";
import { fetchRegistrarText } from "./fetch.ts";

test("rejects non-public registrar URLs before calling fetch", async () => {
  let called = false;
  await assert.rejects(
    () =>
      fetchRegistrarText({
        url: "https://127.0.0.1/status",
        fetchImpl: async () => {
          called = true;
          return new Response("nope");
        },
      }),
    /public https/i,
  );
  assert.equal(called, false);
});

test("refuses redirects that leave the public https boundary", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchRegistrarText({
        url: "https://registrar.example/start",
        fetchImpl: async () => {
          calls += 1;
          return new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/internal" },
          });
        },
      }),
    /blocked host/i,
  );
  assert.equal(calls, 1);
});

test("follows a single public https redirect", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/start")) {
      return new Response(null, { status: 302, headers: { location: "https://registrar.example/final" } });
    }
    return new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } });
  };
  const result = await fetchRegistrarText({ url: "https://registrar.example/start", fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.body.includes("ok"), true);
});
