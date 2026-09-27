import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { palette, radii, typography } from '@/core/theme/tokens';

interface Props {
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

const CRITICAL = 20;

/** Animated stat bar; pulses red when critical. Width/colour run on the UI thread. */
export const StatBar = memo(function StatBar({ label, value, color }: Props) {
  const progress = useSharedValue(value / 100);
  const pulse = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(value / 100, { duration: 700 });
  }, [value, progress]);

  const critical = value < CRITICAL;
  useEffect(() => {
    pulse.value = critical
      ? withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0, { duration: 450 })), -1)
      : withTiming(0, { duration: 200 });
  }, [critical, pulse]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(2, progress.value * 100)}%`,
    backgroundColor: interpolateColor(pulse.value, [0, 1], [color, palette.danger]),
  }));

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    >
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, critical && styles.critical]}>{Math.round(value)}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flex: 1, minWidth: 70 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { ...typography.caption, color: palette.mist },
  value: { ...typography.caption, color: palette.white },
  critical: { color: palette.danger },
  track: { height: 8, borderRadius: radii.pill, backgroundColor: palette.ink700, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.pill },
});
