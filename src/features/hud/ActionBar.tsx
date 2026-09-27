import * as Haptics from 'expo-haptics';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t, type TranslationKey } from '@/core/i18n';
import { palette, radii, spacing, typography } from '@/core/theme/tokens';

export type RoomAction = 'sleep' | 'eat' | 'shower' | 'work' | 'shop';

interface Props {
  readonly sleeping: boolean;
  readonly onAction: (action: RoomAction) => void;
}

const ACTIONS: readonly { action: RoomAction; icon: string; color: string }[] = [
  { action: 'sleep', icon: '☾', color: palette.energy },
  { action: 'eat', icon: '◍', color: palette.hunger },
  { action: 'shower', icon: '≋', color: palette.hygiene },
  { action: 'work', icon: '⌨', color: palette.fun },
  { action: 'shop', icon: '★', color: palette.coin },
];

export const ActionBar = memo(function ActionBar({ sleeping, onAction }: Props) {
  const press = useCallback(
    (a: RoomAction) => {
      void Haptics.selectionAsync().catch(() => undefined);
      onAction(a);
    },
    [onAction],
  );

  return (
    <View style={styles.bar}>
      {ACTIONS.map(({ action, icon, color }) => {
        const labelKey: TranslationKey =
          action === 'sleep' ? (sleeping ? 'action.wake' : 'action.sleep') : `action.${action}`;
        const disabled = sleeping && action !== 'sleep' && action !== 'shop';
        return (
          <Pressable
            key={action}
            onPress={() => press(action)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t(labelKey)}
            accessibilityState={{ disabled }}
            style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
          >
            <View style={[styles.icon, { backgroundColor: color }]}>
              <Text style={styles.iconText}>{icon}</Text>
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {t(labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(23,25,51,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.ink600,
  },
  button: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.md, gap: 6 },
  pressed: { backgroundColor: palette.ink700, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.35 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18, color: palette.ink900, fontWeight: '900' },
  label: { ...typography.caption, color: palette.white },
});
