import * as Haptics from 'expo-haptics';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { CATALOG, ITEM_SLOTS, type CatalogItem, type ItemSlot } from '@shared/catalog';

import { localized, t, type TranslationKey } from '@/core/i18n';
import { palette, radii, spacing, typography } from '@/core/theme/tokens';
import { trustedNow } from '@/core/time';
import { companionStore, selectDisplayedCoins, selectOwnedIds, useCompanionStore } from '@/store/companion';

const swatchFor = (item: CatalogItem): string => {
  const v = item.visual;
  const pick = v.glow ?? v.top ?? v.color ?? v.shirt;
  return typeof pick === 'string' ? pick : palette.accent;
};

/** Converts Σ M into the % reduction of the decay coefficient: 1 − 1/(1+M). */
const reductionPct = (m: number | undefined): number => (m ? Math.round((1 - 1 / (1 + m)) * 100) : 0);

const ItemCard = memo(function ItemCard({
  item,
  owned,
  equipped,
  affordable,
  onPress,
}: {
  item: CatalogItem;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
  onPress: (item: CatalogItem) => void;
}) {
  const pct = reductionPct(item.modifiers.fun);
  const label = equipped ? t('shop.equipped') : owned ? t('shop.equip') : `${t('shop.buy')} · ${item.price}`;
  const disabled = equipped || (!owned && !affordable);
  return (
    <Pressable
      onPress={() => onPress(item)}
      disabled={disabled}
      style={({ pressed }) => [styles.card, equipped && styles.cardEquipped, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${localized(item.name)}, ${label}`}
    >
      <View style={[styles.swatch, { backgroundColor: swatchFor(item) }]} />
      <View style={styles.cardBody}>
        <Text style={styles.itemName}>{localized(item.name)}</Text>
        {pct > 0 && <Text style={styles.modifier}>{t('shop.modifier', { pct })}</Text>}
      </View>
      <View style={[styles.cta, disabled && !equipped && styles.ctaDisabled, equipped && styles.ctaEquipped]}>
        <Text style={styles.ctaText}>{!owned && !affordable ? t('shop.insufficient') : label}</Text>
      </View>
    </Pressable>
  );
});

export const ShopScreen = memo(function ShopScreen() {
  const coins = useCompanionStore(selectDisplayedCoins);
  const owned = useCompanionStore(useShallow((s) => [...selectOwnedIds(s)].sort()));
  const equipped = useCompanionStore(useShallow((s) => s.equipped));
  const [message, setMessage] = useState<string | undefined>();

  const ownedSet = useMemo(() => new Set(owned), [owned]);
  const sections = useMemo(
    () =>
      ITEM_SLOTS.map((slot: ItemSlot) => ({
        slot,
        title: t(`shop.slot.${slot}` as TranslationKey),
        data: CATALOG.filter((i) => i.slot === slot),
      })),
    [],
  );

  const onPress = useCallback((item: CatalogItem) => {
    const store = companionStore.getState();
    const now = trustedNow();
    const isOwned = selectOwnedIds(store).has(item.id);
    let res = isOwned ? store.equip(item.id, now) : store.purchase(item.id, now);
    // Buying auto-equips: that's what the player wants 99% of the time.
    if (!isOwned && res.ok) res = companionStore.getState().equip(item.id, now);
    if (res.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setMessage(undefined);
    } else {
      setMessage(t(res.reason === 'insufficient_funds' ? 'error.insufficient_funds' : 'error.busy'));
    }
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('shop.title')}</Text>
        <View style={styles.coins}>
          <View style={styles.coinDot} />
          <Text style={styles.coinText}>{coins}</Text>
        </View>
      </View>
      {message && <Text style={styles.message}>{message}</Text>}
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            owned={ownedSet.has(item.id)}
            equipped={equipped[item.slot] === item.id}
            affordable={coins >= item.price}
            onPress={onPress}
          />
        )}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.ink900 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  title: { ...typography.title, color: palette.white },
  coins: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: palette.ink700 },
  coinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: palette.coin },
  coinText: { ...typography.body, color: palette.white, fontWeight: '800' },
  message: { ...typography.caption, color: palette.danger, textAlign: 'center', marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  section: { ...typography.caption, color: palette.mist, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: palette.ink800, marginBottom: spacing.sm, borderWidth: 1, borderColor: 'transparent' },
  cardEquipped: { borderColor: palette.accent },
  pressed: { opacity: 0.85 },
  swatch: { width: 44, height: 44, borderRadius: radii.sm },
  cardBody: { flex: 1 },
  itemName: { ...typography.body, color: palette.white, fontWeight: '700' },
  modifier: { ...typography.caption, color: palette.success, marginTop: 2 },
  cta: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: palette.accent },
  ctaDisabled: { backgroundColor: palette.ink600 },
  ctaEquipped: { backgroundColor: palette.success },
  ctaText: { ...typography.caption, color: palette.white },
});
