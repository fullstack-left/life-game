import * as Haptics from 'expo-haptics';

/** JS-thread haptic helpers, invoked from worklets via `scheduleOnRN`. Failures are non-fatal. */
export const hapticHit = (): void => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
};

export const hapticMiss = (): void => {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
};

export const hapticEnd = (): void => {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
};
