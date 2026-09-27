import { ServerClock, type ClockPersistence } from './serverClock';

const memory = (): ClockPersistence & { data: Map<string, number> } => {
  const data = new Map<string, number>();
  return { data, getNumber: (k) => data.get(k), set: (k, v) => void data.set(k, v) };
};

describe('ServerClock', () => {
  it('estimates offset with RTT/2 correction and prefers the lowest-RTT sample', () => {
    let wall = 1_000_000;
    let mono = 0;
    const clock = new ServerClock({ storage: memory(), dateNow: () => wall, monoNow: () => mono });

    // Device is 10s behind the server; RTT 400ms.
    clock.applySample(1_000_000, 1_010_200, 1_000_400);
    expect(clock.currentOffsetMs).toBe(10_000);

    // Noisy sample (RTT 3s) must not override the better one.
    clock.applySample(1_001_000, 1_013_000, 1_004_000);
    expect(clock.currentOffsetMs).toBe(10_000);

    // Anchored at apply-time (wall = 1_000_000) + offset, then advanced monotonically.
    wall = 1_005_000;
    mono = 5_000;
    expect(clock.now()).toBe(1_000_000 + 10_000 + 5_000);
  });

  it('is immune to wall-clock edits while running (monotonic anchor)', () => {
    let wall = 2_000_000;
    let mono = 0;
    const clock = new ServerClock({ storage: memory(), dateNow: () => wall, monoNow: () => mono });
    clock.applySample(2_000_000, 2_000_050, 2_000_100);
    const t0 = clock.now();

    wall += 86_400_000; // player jumps the device clock forward one day
    mono += 1_000;
    expect(clock.now()).toBe(t0 + 1_000);
  });

  it('never moves backwards while unsynced (rewind cheat)', () => {
    let wall = 5_000_000;
    const storage = memory();
    const clock = new ServerClock({ storage, dateNow: () => wall });
    const before = clock.now();
    wall -= 3_600_000; // rewind by an hour
    expect(clock.now()).toBe(before);

    // Persisted high-water survives restarts
    const restarted = new ServerClock({ storage, dateNow: () => wall });
    expect(restarted.now()).toBe(before);
  });

  it('a server sample heals a high-water mark pushed into the future', () => {
    let wall = 9_000_000_000;
    const storage = memory();
    new ServerClock({ storage, dateNow: () => wall }).now(); // forwarded clock recorded
    wall = 1_000_000;
    const clock = new ServerClock({ storage, dateNow: () => wall, monoNow: () => 0 });
    clock.applySample(1_000_000, 1_000_000, 1_000_000);
    expect(clock.now()).toBe(1_000_000);
  });

  it('discards implausible samples', () => {
    const clock = new ServerClock({ storage: memory(), dateNow: () => 0 });
    expect(clock.applySample(0, 100, 20_000)).toBeUndefined(); // RTT too large
    expect(clock.applySample(10, 100, 0)).toBeUndefined(); // negative RTT
    expect(clock.applySample(0, Number.NaN, 10)).toBeUndefined();
    expect(clock.isSynced).toBe(false);
  });
});
