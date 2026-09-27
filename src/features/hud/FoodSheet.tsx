import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FOODS } from '@shared/catalog';

import { localized, t } from '@/core/i18n';
import { palette, radii, spacing, typography } from '@/core/theme/tokens';
import { selectDisplayedCoins, useCompanionStore } from '@/store/companion';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onPick: (foodId: string) => void;
}

export const FoodSheet = memo(function FoodSheet({ visible, onClose, onPick }: Props) {
  const coins = useCompanionStore(selectDisplayedCoins);
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={styles.sheet}>
        <Text style={styles.title}>{t('shop.food')}</Text>
        {FOODS.map((f) => {
          const affordable = coins >= f.price;
          return (
            <Pressable
              key={f.id}
              disabled={!affordable}
              onPress={() => onPick(f.id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed, !affordable && styles.disabled]}
              accessibilityRole="button"
            >
              <View style={[styles.swatch, { backgroundColor: f.color }]} />
              <View style={styles.info}>
                <Text style={styles.name}>{localized(f.name)}</Text>
                <Text style={styles.meta}>
                  +{f.hungerRestore} {t('stat.hunger')}
                  {f.funBonus > 0 ? ` · +${f.funBonus} ${t('stat.fun')}` : ''}
                </Text>
              </View>
              <Text style={styles.price}>{f.price}</Text>
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,6,15,0.55)' },
  sheet: {
    backgroundColor: palette.ink800,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
    gap: spacing.sm,
  },
  title: { ...typography.title, color: palette.white, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: palette.ink700 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  info: { flex: 1 },
  name: { ...typography.body, color: palette.white, fontWeight: '700' },
  meta: { ...typography.caption, color: palette.mist, marginTop: 2 },
  price: { ...typography.body, color: palette.coin, fontWeight: '800' },
});
