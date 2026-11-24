import { describe, test, expect } from "bun:test";
import { Refinement, live } from "@ratmath/core/refine";
import { Rational } from "../index.js";

// 1/1 + 1/2 + … + 1/n: a float preview, then the exact sum one term per tick
const harmonic = (n) =>
  new Refinement(
    () => {
      let s = 0;
      for (let k = 1; k <= n; k++) s += 1 / k;
      return { value: s, trust: "good" };
    },
    function* () {
      let s = new Rational(0n);
      for (let k = 1; k <= n; k++) {
        s = s.add(new Rational(1n, BigInt(k)));
        yield { done: k, of: n, step: "term", partial: s };
      }
      return { value: s, via: "exact rational sum" };
    },
  );
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Refinement", () => {
  test("quick is a frozen float stage, computed once", () => {
    let calls = 0;
    const r = new Refinement(() => ({ value: ++calls, trust: "rough" }), function* () { return { value: 1, via: "x" }; });
    expect(r.quick).toEqual({ stage: "float", exact: false, value: 1, trust: "rough" });
    expect(r.quick).toBe(r.quick);
    expect(calls).toBe(1);
    expect(Object.isFrozen(r.quick)).toBe(true);
  });
  test("stages: preview, progress ticks, exact; the exact answer is cached", () => {
    const r = harmonic(4);
    expect(r.settled).toBe(false);
    const s = [...r.stages()];
    expect(s.map((x) => x.stage)).toEqual(["float", "progress", "progress", "progress", "progress", "exact"]);
    expect(s[2]).toMatchObject({ exact: false, done: 2, of: 4, step: "term" });
    expect(s.at(-1).value.toString()).toBe("25/12");
    expect(s.at(-1).via).toBe("exact rational sum");
    expect(r.settled).toBe(true);
    expect([...r.stages()].map((x) => x.stage)).toEqual(["float", "exact"]);
  });
  test("exact() and exactStage() run synchronously", () => {
    const r = harmonic(3);
    expect(r.exact().toString()).toBe("11/6");
    expect(r.exactStage()).toMatchObject({ stage: "exact", exact: true, via: "exact rational sum" });
    expect(r.exact()).toBe(r.exact());
  });
  test("settle reports stages and progress and yields to the event loop", async () => {
    const stages = [];
    let ticks = 0;
    let turns = 0;
    const timer = setInterval(() => turns++, 0);
    const value = await harmonic(600).settle({ sliceMs: 0, onStage: (s) => stages.push(s.stage), onProgress: () => ticks++ });
    clearInterval(timer);
    expect(stages).toEqual(["float", "exact"]);
    expect(ticks).toBe(600);
    expect(value.denominator > 1n).toBe(true);
    expect(await harmonic(2).settle()).toEqual(new Rational(3n, 2n));
  });
  test("settle falls back to setTimeout where there is no MessageChannel", async () => {
    const saved = globalThis.MessageChannel;
    globalThis.MessageChannel = undefined;
    try {
      expect((await harmonic(5).settle({ sliceMs: 0 })).toString()).toBe("137/60");
    } finally {
      globalThis.MessageChannel = saved;
    }
  });
  test("settle rejects with an AbortError: before starting, between stages, after a pause", async () => {
    const before = new AbortController();
    before.abort();
    await expect(harmonic(3).settle({ signal: before.signal })).rejects.toMatchObject({ name: "AbortError" });

    const during = new AbortController();
    await expect(harmonic(50).settle({ signal: during.signal, sliceMs: 1e9, onProgress: (s) => s.done === 3 && during.abort() })).rejects.toMatchObject({ name: "AbortError" });

    const paused = new AbortController();
    const p = harmonic(5000).settle({ signal: paused.signal, sliceMs: 0 });
    paused.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("live", () => {
  test("every update previews at once; only the latest settles", async () => {
    const seen = [];
    const update = live(harmonic, (s, job) => seen.push([s.stage, job]), { idleMs: 20 });
    update(3);
    update(4);
    const last = update(5);
    expect(seen.map((x) => x[0])).toEqual(["float", "float", "float"]);
    await wait(80);
    const exacts = seen.filter((x) => x[0] === "exact");
    expect(exacts.length).toBe(1);
    expect(exacts[0][1]).toBe(last);
    expect(last.exact().toString()).toBe("137/60");
  });
  test("idleMs 0 starts at once; cancel stops pending work; progress is passed on", async () => {
    let ticks = 0;
    const seen = [];
    const update = live(harmonic, (s) => seen.push(s.stage), { idleMs: 0, sliceMs: 0, onProgress: () => ticks++ });
    update(3);
    await wait(30);
    expect(seen).toEqual(["float", "exact"]);
    expect(ticks).toBe(3);
    const slow = live(harmonic, (s) => seen.push(s.stage), { idleMs: 20 });
    slow(3);
    slow.cancel();
    slow.cancel();
    await wait(50);
    expect(seen).toEqual(["float", "exact", "float"]);
    const running = live(harmonic, () => {}, { idleMs: 0, sliceMs: 0 });
    const job = running(4000);
    running.cancel();
    await wait(30);
    expect(job.settled).toBe(false);
  });
  test("errors from the exact stage go to onError", async () => {
    const boom = () => new Refinement(() => ({ value: 0, trust: "unsure" }), function* () { throw new Error("no answer"); });
    const errors = [];
    live(boom, () => {}, { idleMs: 0, onError: (e) => errors.push(e.message) })();
    await wait(20);
    expect(errors).toEqual(["no answer"]);
  });
});
