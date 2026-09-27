import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration, t, type TranslationKey } from '@/core/i18n';
import { palette, radii, spacing, typography } from '@/core/theme/tokens';
import { STAT_KEYS } from '@/entities/companion';
import { useCompanionStore } from '@/store/companion';

const STAT_COLOR = { energy: palette.energy, hunger: palette.hunger, hygiene: palette.hygiene, fun: palette.fun };

/** "While you were away…" — surfaces the offline time-jump so decay feels fair, not hidden. */
export const OfflineReportModal = memo(function OfflineReportModal() {
  const report = useCompanionStore((s) => s.offlineReport);
  const dismiss = useCompanionStore((s) => s.dismissOfflineReport);
  if (!report) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('report.title')}</Text>
          <Text style={styles.subtitle}>{t('report.away', { time: formatDuration(report.awaySec) })}</Text>
          {STAT_KEYS.map((key) => {
            const before = Math.round(report.before[key]);
            const after = Math.round(report.after[key]);
            const delta = after - before;
            return (
              <View key={key} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: STAT_COLOR[key] }]} />
                <Text style={styles.stat}>{t(`stat.${key}`)}</Text>
                <Text style={styles.values}>
                  {before} → {after}
                </Text>
                <Text style={[styles.delta, { color: delta >= 0 ? palette.success : palette.danger }]}>
                  {delta >= 0 ? `+${delta}` : delta}
                </Text>
              </View>
            );
          })}
          {report.events.map((e) => (
            <Text key={e} style={styles.event}>
              • {t(`event.${e}` as TranslationKey)}
            </Text>
          ))}
          <Pressable style={styles.button} onPress={dismiss} accessibilityRole="button">
            <Text style={styles.buttonText}>{t('report.ok')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,6,15,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 380, backgroundColor: palette.ink800, borderRadius: radii.lg, padding: spacing.xl, gap: spacing.sm },
  title: { ...typography.title, color: palette.white },
  subtitle: { ...typography.body, color: palette.mist, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stat: { ...typography.body, color: palette.white, flex: 1 },
  values: { ...typography.body, color: palette.mist },
  delta: { ...typography.body, fontWeight: '800', width: 44, textAlign: 'right' },
  event: { ...typography.caption, color: palette.mist },
  button: { marginTop: spacing.md, backgroundColor: palette.accent, borderRadius: radii.pill, paddingVertical: spacing.md, alignItems: 'center' },
  buttonText: { ...typography.body, color: palette.white, fontWeight: '800' },
});
