import { deriveMood } from '@/entities/companion';

import { resolveCharacterTarget, walkDurationMs } from './characterMachine';

describe('character state machine', () => {
  const now = 0;

  it('maps activities to anchors and loops', () => {
    expect(resolveCharacterTarget('sleeping', 'sleeping')).toMatchObject({ anchor: 'bed', pose: 'lie', loop: 'sleep' });
    expect(resolveCharacterTarget('eating', 'content')).toMatchObject({ anchor: 'fridge', loop: 'eat' });
    expect(resolveCharacterTarget('showering', 'filthy')).toMatchObject({ anchor: 'shower', loop: 'shower' });
    expect(resolveCharacterTarget('working', 'happy')).toMatchObject({ anchor: 'computer', loop: 'work' });
  });

  it('energy < 20 switches to the exhausted loop, slows walking and droops eyelids', () => {
    const mood = deriveMood({ energy: 15, hunger: 80, hygiene: 80, fun: 80 }, { type: 'idle', since: now });
    expect(mood).toBe('exhausted');
    const t = resolveCharacterTarget('idle', mood);
    expect(t.loop).toBe('idle_exhausted');
    expect(t.walkSpeed).toBeLessThan(0.5);
    expect(t.eyelid).toBeGreaterThan(0.5);
  });

  it('mood priority: sleeping > exhausted > starving > filthy > sad', () => {
    const idle = { type: 'idle' as const, since: now };
    expect(deriveMood({ energy: 10, hunger: 10, hygiene: 10, fun: 10 }, { type: 'sleeping', since: now })).toBe('sleeping');
    expect(deriveMood({ energy: 10, hunger: 10, hygiene: 10, fun: 10 }, idle)).toBe('exhausted');
    expect(deriveMood({ energy: 90, hunger: 10, hygiene: 10, fun: 10 }, idle)).toBe('starving');
    expect(deriveMood({ energy: 90, hunger: 90, hygiene: 10, fun: 10 }, idle)).toBe('filthy');
    expect(deriveMood({ energy: 90, hunger: 90, hygiene: 90, fun: 10 }, idle)).toBe('sad');
    expect(deriveMood({ energy: 90, hunger: 90, hygiene: 90, fun: 90 }, idle)).toBe('happy');
  });

  it('walk duration scales with distance and speed', () => {
    expect(walkDurationMs(0, 110, 1)).toBe(1000);
    expect(walkDurationMs(0, 110, 0.5)).toBe(2000);
  });
});
