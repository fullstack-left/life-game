import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@/core/i18n';
import { palette, radii, spacing, typography } from '@/core/theme/tokens';
import { deriveMood } from '@/entities/companion';
import { selectDisplayedCoins, selectPendingCoins, useCompanionStore } from '@/store/companion';

import { StatBar } from './StatBar';

/** Rounded to integers so the HUD re-renders only when a visible number changes. */
const useRoundedStats = () =>
  useCompanionStore(
    useShallow((s) => ({
      energy: Math.round(s.stats.energy),
      hunger: Math.round(s.stats.hunger),
      hygiene: Math.round(s.stats.hygiene),
      fun: Math.round(s.stats.fun),
    })),
  );

export const StatsHud = memo(function StatsHud({ onCoinsPress }: { onCoinsPress?: () => void }) {
  const stats = useRoundedStats();
  const name = useCompanionStore((s) => s.characterName);
  const mood = useCompanionStore((s) => deriveMood(s.stats, s.activity));
  const coins = useCompanionStore(selectDisplayedCoins);
  const pendingCoins = useCompanionStore(selectPendingCoins);
  const syncing = useCompanionStore((s) => s.pendingOps.length > 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.mood}>{t(`mood.${mood}`)}</Text>
        </View>
        <Pressable onPress={onCoinsPress} style={styles.coins} accessibilityRole="button" accessibilityLabel={`${coins} coins`}>
          <View style={styles.coinDot} />
          <Text style={styles.coinText}>{coins}</Text>
          {pendingCoins > 0 && <Text style={styles.pending}>+{pendingCoins}</Text>}
          {syncing && <Text style={styles.sync}>⟳</Text>}
        </Pressable>
      </View>
      <View style={styles.bars}>
        <StatBar label={t('stat.energy')} value={stats.energy} color={palette.energy} />
        <StatBar label={t('stat.hunger')} value={stats.hunger} color={palette.hunger} />
        <StatBar label={t('stat.hygiene')} value={stats.hygiene} color={palette.hygiene} />
        <StatBar label={t('stat.fun')} value={stats.fun} color={palette.fun} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(23,25,51,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.ink600,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { ...typography.title, color: palette.white },
  mood: { ...typography.caption, color: palette.mist, marginTop: 2 },
  coins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.ink700,
  },
  coinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: palette.coin, borderWidth: 2, borderColor: '#E0A800' },
  coinText: { ...typography.body, color: palette.white, fontWeight: '800' },
  pending: { ...typography.caption, color: palette.success },
  sync: { ...typography.caption, color: palette.mist },
  bars: { flexDirection: 'row', gap: spacing.md },
});
