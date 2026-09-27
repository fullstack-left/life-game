import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/core/i18n';
import { palette, radii, spacing, typography } from '@/core/theme/tokens';
import { trustedNow } from '@/core/time';
import { ActionBar, type RoomAction } from '@/features/hud/ActionBar';
import { FoodSheet } from '@/features/hud/FoodSheet';
import { OfflineReportModal } from '@/features/hud/OfflineReportModal';
import { StatsHud } from '@/features/hud/StatsHud';
import { DynamicRoom } from '@/features/room-renderer/DynamicRoom';
import type { InteractionZone } from '@/features/room-renderer/layout';
import { companionStore, useCompanionStore, type ActionResult } from '@/store/companion';

export default function RoomScreen() {
  const sleeping = useCompanionStore((s) => s.activity.type === 'sleeping');
  const [foodOpen, setFoodOpen] = useState(false);
  const [toast, setToast] = useState<string | undefined>();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(undefined), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const report = useCallback((res: ActionResult) => {
    if (!res.ok) setToast(t(res.reason === 'insufficient_funds' ? 'error.insufficient_funds' : 'error.busy'));
  }, []);

  const handle = useCallback(
    (action: RoomAction) => {
      const store = companionStore.getState();
      const now = trustedNow();
      switch (action) {
        case 'sleep':
          report(store.activity.type === 'sleeping' ? store.wakeUp(now) : store.sleep(now));
          break;
        case 'eat':
          setFoodOpen(true);
          break;
        case 'shower':
          report(store.shower(now));
          break;
        case 'work':
          router.push('/computer');
          break;
        case 'shop':
          router.push('/shop');
          break;
      }
    },
    [report],
  );

  const onZone = useCallback(
    (zone: InteractionZone) => {
      const map: Record<InteractionZone, RoomAction> = { bed: 'sleep', computer: 'work', fridge: 'eat', shower: 'shower' };
      if (sleeping && zone !== 'bed') return;
      handle(map[zone]);
    },
    [handle, sleeping],
  );

  const onPickFood = useCallback(
    (foodId: string) => {
      setFoodOpen(false);
      report(companionStore.getState().eat(foodId, trustedNow()));
    },
    [report],
  );

  return (
    <View style={styles.root}>
      <DynamicRoom onZonePress={onZone} />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none" edges={['top', 'bottom']}>
        <StatsHud onCoinsPress={() => router.push('/shop')} />
        <View style={styles.spacer} pointerEvents="none">
          {toast && (
            <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.toast}>
              <Text style={styles.toastText}>{toast}</Text>
            </Animated.View>
          )}
        </View>
        <ActionBar sleeping={sleeping} onAction={handle} />
      </SafeAreaView>
      <FoodSheet visible={foodOpen} onClose={() => setFoodOpen(false)} onPick={onPickFood} />
      <OfflineReportModal />
    </View>
  );
}

const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.ink900 },
  overlay: { ...fill, justifyContent: 'space-between', paddingVertical: spacing.sm },
  spacer: { flex: 1, alignItems: 'center', paddingTop: spacing.lg },
  toast: { backgroundColor: 'rgba(255,77,109,0.92)', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill },
  toastText: { ...typography.body, color: palette.white, fontWeight: '700' },
});
