// Fast first, exact last: the Refinement class shared by linalg, analytic and graphics.
import { Refinement, live } from "@ratmath/core/refine";
import { Rational } from "@ratmath/core";

const harmonic = (n) =>
  new Refinement(
    () => ({ value: Math.log(n) + 0.5772156649, trust: "rough" }),
    function* () {
      let s = new Rational(0n);
      for (let k = 1; k <= n; k++) {
        s = s.add(new Rational(1n, BigInt(k)));
        yield { done: k, of: n };
      }
      return { value: s, via: "exact rational sum" };
    },
  );

const h = harmonic(10);
console.log("preview:", h.quick.value, `(${h.quick.trust})`);
console.log("exact:  ", h.exact().toString(), "via", h.exactStage().via);

let ticks = 0;
const big = await harmonic(500).settle({ onProgress: () => ticks++ });
console.log("H(500) has a", big.denominator.toString().length, "digit denominator after", ticks, "ticks");

const update = live(harmonic, (stage) => console.log(" ", stage.stage, stage.exact ? stage.value.toString() : stage.value), { idleMs: 5 });
update(3);
const last = update(4); // the first question is dropped
await last.settle();
await new Promise((r) => setTimeout(r, 30));
