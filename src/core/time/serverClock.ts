/**
 * Tamper-resistant clock.
 *
 * The device wall clock is user-controlled ("time-travel cheat"), so we:
 *  1. Estimate `offset = serverTime - deviceTime` NTP-style (RTT/2 correction),
 *     keeping the lowest-RTT sample of a small window (least network jitter).
 *  2. Inside a process, derive time from a *monotonic* anchor
 *     (`performance.now()`), which is immune to wall-clock edits while running.
 *  3. Across restarts, fall back to `Date.now() + persistedOffset`.
 *  4. Enforce a persisted high-water mark: while unsynced, trusted time never
 *     moves backwards, so rewinding the device clock cannot "undo" decay.
 *     A fresh server sample is authoritative and resets the mark.
 */

export interface ClockPersistence {
  getNumber(key: string): number | undefined;
  set(key: string, value: number): void;
}

export interface ClockDeps {
  storage: ClockPersistence;
  dateNow?: () => number;
  monoNow?: () => number;
}

export interface ClockSample {
  offsetMs: number;
  rttMs: number;
}

const KEY_OFFSET = 'clock.offsetMs';
const KEY_HIGH_WATER = 'clock.highWaterMs';
const MAX_ACCEPTABLE_RTT_MS = 8_000;
const SAMPLE_WINDOW = 5;

const defaultMono = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

export class ServerClock {
  private readonly storage: ClockPersistence;
  private readonly dateNow: () => number;
  private readonly monoNow: () => number;

  private offsetMs: number;
  private highWaterMs: number;
  private samples: ClockSample[] = [];
  private anchor: { serverMs: number; monoMs: number } | undefined;

  constructor({ storage, dateNow = Date.now, monoNow = defaultMono }: ClockDeps) {
    this.storage = storage;
    this.dateNow = dateNow;
    this.monoNow = monoNow;
    this.offsetMs = storage.getNumber(KEY_OFFSET) ?? 0;
    this.highWaterMs = storage.getNumber(KEY_HIGH_WATER) ?? 0;
  }

  /** True once at least one server sample was accepted in this process. */
  get isSynced(): boolean {
    return this.anchor !== undefined;
  }

  get currentOffsetMs(): number {
    return this.offsetMs;
  }

  /**
   * Feed a round-trip measurement.
   * @param requestSentAt   device time (Date.now) right before the request
   * @param serverTimeMs    server-reported epoch ms
   * @param responseAt      device time right after the response
   */
  applySample(requestSentAt: number, serverTimeMs: number, responseAt: number): ClockSample | undefined {
    const rttMs = responseAt - requestSentAt;
    if (!Number.isFinite(serverTimeMs) || rttMs < 0 || rttMs > MAX_ACCEPTABLE_RTT_MS) return undefined;

    const sample: ClockSample = { offsetMs: serverTimeMs + rttMs / 2 - responseAt, rttMs };
    this.samples = [...this.samples, sample].slice(-SAMPLE_WINDOW);
    const best = this.samples.reduce((a, b) => (b.rttMs < a.rttMs ? b : a));

    this.offsetMs = best.offsetMs;
    this.anchor = { serverMs: this.dateNow() + best.offsetMs, monoMs: this.monoNow() };
    this.storage.set(KEY_OFFSET, this.offsetMs);
    // Server time is authoritative: reset the high-water mark to it. This heals a
    // mark that was pushed into the future by a forwarded device clock while offline.
    this.highWaterMs = this.anchor.serverMs;
    this.storage.set(KEY_HIGH_WATER, this.highWaterMs);
    return sample;
  }

  /** Best-estimate trusted epoch milliseconds. Monotonically non-decreasing. */
  now(): number {
    const estimate = this.anchor
      ? this.anchor.serverMs + (this.monoNow() - this.anchor.monoMs)
      : this.dateNow() + this.offsetMs;
    return this.bumpHighWater(estimate);
  }

  private bumpHighWater(candidate: number): number {
    if (candidate > this.highWaterMs) {
      this.highWaterMs = candidate;
      this.storage.set(KEY_HIGH_WATER, candidate);
      return candidate;
    }
    return this.highWaterMs;
  }
}
