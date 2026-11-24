/** A float preview, known at once. */
export interface FloatStage<Q = unknown> { readonly stage: "float"; readonly exact: false; readonly value: Q; readonly trust: "good" | "rough" | "unsure" | (string & {}); }
/** A tick from the exact computation; extra fields (such as `partial`) are whatever the computation yields. */
export interface ProgressStage { readonly stage: "progress"; readonly exact: false; done?: number; of?: number; step?: string; [key: string]: unknown; }
/** The exact answer and the name of the method that produced it. */
export interface ExactStage<T = unknown> { readonly stage: "exact"; readonly exact: true; readonly value: T; readonly via: string; }
export type Stage<T = unknown, Q = unknown> = FloatStage<Q> | ProgressStage | ExactStage<T>;

export interface SettleOptions<T = unknown, Q = unknown> {
  signal?: AbortSignal;
  /** Milliseconds of work between turns of the event loop (default 8). */
  sliceMs?: number;
  onStage?: (stage: FloatStage<Q> | ExactStage<T>) => void;
  onProgress?: (stage: ProgressStage) => void;
}

/** A computation that answers fast first (a float preview) and exactly last. */
export class Refinement<T = unknown, Q = unknown> {
  constructor(
    quick: () => { value: Q; trust: string },
    exact: () => Generator<Record<string, unknown>, { value: T; via: string }, unknown>,
  );
  /** The float preview, computed on first read. */
  readonly quick: FloatStage<Q>;
  /** True once the exact answer is known (it is cached). */
  readonly settled: boolean;
  /** Every stage in order: the float preview, progress ticks, the exact answer. */
  stages(): Generator<Stage<T, Q>, void, unknown>;
  /** The exact answer's stage record, computed synchronously. */
  exactStage(): ExactStage<T>;
  /** The exact answer, computed synchronously. */
  exact(): T;
  /** Run to the exact answer in time slices; rejects with an AbortError if `signal` aborts first. */
  settle(options?: SettleOptions<T, Q>): Promise<T>;
}

export interface LiveOptions {
  /** Exact work starts after the input has been still this long (default 30 ms; 0 starts at once). */
  idleMs?: number;
  sliceMs?: number;
  onProgress?: (stage: ProgressStage) => void;
  onError?: (error: unknown) => void;
}

/** Wire a computation to a control that changes often; a newer update cancels older unfinished work. */
export function live<A extends unknown[], T, Q>(
  compute: (...args: A) => Refinement<T, Q>,
  onStage: (stage: FloatStage<Q> | ExactStage<T>, job: Refinement<T, Q>) => void,
  options?: LiveOptions,
): { (...args: A): Refinement<T, Q>; cancel(): void };
