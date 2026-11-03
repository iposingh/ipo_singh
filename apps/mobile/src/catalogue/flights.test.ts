import assert from "node:assert/strict";
import test from "node:test";
import { shareFlight } from "./flights.ts";

test("shareFlight reuses one in-flight promise per key", async () => {
  const flights = new Map<string, Promise<number>>();
  let starts = 0;
  let release: (value: number) => void = () => undefined;
  const gate = new Promise<number>((resolve) => {
    release = resolve;
  });
  const start = () => {
    starts += 1;
    return gate;
  };
  const first = shareFlight(flights, "a", start);
  const second = shareFlight(flights, "a", start);
  assert.equal(starts, 1);
  release(42);
  assert.deepEqual(await Promise.all([first, second]), [42, 42]);
  assert.equal(flights.size, 0);

  const third = shareFlight(flights, "a", async () => 7);
  assert.equal(await third, 7);
  assert.equal(starts, 1);
});
