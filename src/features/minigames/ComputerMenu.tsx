import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MINIGAME_IDS, MINIGAME_RULES, type MiniGameId } from '@shared/gameRules';

import { t } from '@/core/i18n';
import { palette, radii, spacing, typography } from '@/core/theme/tokens';
import { useCompanionStore } from '@/store/companion';

import { MINIGAMES } from './registry';

const MIN_ENERGY_TO_WORK = 10;

/** The in-room PC: a retro "desktop" listing the available gigs. */
export const ComputerMenu = memo(function ComputerMenu({ onPick }: { onPick: (id: MiniGameId) => void }) {
  const energy = useCompanionStore((s) => s.stats.energy);
  const tooTired = energy < MIN_ENERGY_TO_WORK;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('pc.title')}</Text>
      <Text style={styles.subtitle}>{t('pc.subtitle')}</Text>
      {tooTired && <Text style={styles.warning}>{t('pc.tooTired')}</Text>}
      {MINIGAME_IDS.map((id) => {
        const def = MINIGAMES[id];
        const rule = MINIGAME_RULES[id];
        return (
          <Pressable
            key={id}
            disabled={tooTired}
            onPress={() => onPick(id)}
            style={({ pressed }) => [styles.card, { borderColor: def.accent }, pressed && styles.pressed, tooTired && styles.disabled]}
            accessibilityRole="button"
          >
            <View style={[styles.icon, { backgroundColor: def.accent }]}>
              <Text style={styles.iconText}>{def.icon}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.name}>{t(`game.${id}`)}</Text>
              <Text style={styles.desc}>{t(`game.${id}.desc`)}</Text>
              <Text style={styles.meta}>
                ≤ {rule.maxCoinsPerSession} · {rule.durationSec}s · −{rule.energyCost} {t('stat.energy')}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.ink900, padding: spacing.lg, gap: spacing.md },
  title: { ...typography.title, color: palette.white },
  subtitle: { ...typography.body, color: palette.mist, marginBottom: spacing.sm },
  warning: { ...typography.body, color: palette.warning },
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.lg, borderRadius: radii.lg, backgroundColor: palette.ink800, borderWidth: 1 },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
  icon: { width: 52, height: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 20, fontWeight: '900', color: palette.ink900 },
  body: { flex: 1, gap: 2 },
  name: { ...typography.body, color: palette.white, fontWeight: '800' },
  desc: { ...typography.caption, color: palette.mist },
  meta: { ...typography.caption, color: palette.coin, marginTop: 4 },
});
