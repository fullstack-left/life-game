import { Group, RoundedRect, Text, type SkFont } from '@shopify/react-native-skia';
import { memo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

interface Props {
  readonly font: SkFont | null;
  readonly width: number;
  readonly score: SharedValue<number>;
  readonly timeLeft: SharedValue<number>;
  readonly lives?: SharedValue<number>;
  readonly accent: string;
}

/** In-canvas HUD: score / timer / lives rendered by Skia from UI-thread values (no React renders). */
export const GameHud = memo(function GameHud({ font, width, score, timeLeft, lives, accent }: Props) {
  const scoreText = useDerivedValue(() => `${Math.floor(score.value)}`);
  const timeText = useDerivedValue(() => `${Math.max(0, Math.ceil(timeLeft.value))}s`);
  const livesText = useDerivedValue(() => (lives ? '♥'.repeat(Math.max(0, lives.value)) : ''));
  const timeColor = useDerivedValue(() => (timeLeft.value < 10 ? '#FF4D6D' : '#FFFFFF'));
  const barWidth = useDerivedValue(() => Math.max(0, (timeLeft.value / 60) * (width - 24)));

  if (!font) return null;
  return (
    <Group>
      <RoundedRect x={12} y={10} width={width - 24} height={4} r={2} color="rgba(255,255,255,0.15)" />
      <RoundedRect x={12} y={10} width={barWidth} height={4} r={2} color={accent} />
      <Text x={14} y={38} text={scoreText} font={font} color="#FFFFFF" />
      <Text x={width / 2 - 14} y={38} text={timeText} font={font} color={timeColor} />
      {lives && <Text x={width - 70} y={38} text={livesText} font={font} color="#FF4D6D" />}
    </Group>
  );
});
