import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { trustedNow } from '@/core/time';
import { syncEngine } from '@/features/sync/syncEngine';
import { companionStore, DEFAULT_REPORT_THRESHOLD_SEC } from '@/store/companion';

/** Foreground simulation cadence. Decay is closed-form, so the tick only affects UI freshness. */
const FOREGROUND_TICK_MS = 2_000;

/**
 * Drives the companion's life without any background task:
 *  - foreground → time-jump the decay engine over the time spent away,
 *                 start a lightweight UI tick, trigger a sync.
 *  - background → advance to "now", persist (MMKV, synchronous), flush sync queue,
 *                 and stop every timer (zero battery drain while closed).
 */
export const useCompanionLifecycle = (): void => {
  useEffect(() => {
    let tick: ReturnType<typeof setInterval> | undefined;

    const startTicking = () => {
      if (tick) return;
      tick = setInterval(() => companionStore.getState().advance(trustedNow()), FOREGROUND_TICK_MS);
    };
    const stopTicking = () => {
      if (tick) clearInterval(tick);
      tick = undefined;
    };

    const onForeground = () => {
      companionStore.getState().advance(trustedNow(), DEFAULT_REPORT_THRESHOLD_SEC);
      startTicking();
      syncEngine.requestSync('foreground');
    };

    const onBackground = () => {
      stopTicking();
      companionStore.getState().advance(trustedNow());
      void syncEngine.flush();
    };

    // Cold start counts as a foreground transition (covers "app was killed" case).
    onForeground();
    syncEngine.start();

    let current: AppStateStatus = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (current.match(/inactive|background/) && next === 'active') onForeground();
      else if (current === 'active' && next.match(/inactive|background/)) onBackground();
      current = next;
    });

    return () => {
      sub.remove();
      stopTicking();
      syncEngine.stop();
    };
  }, []);
};
