import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { computeCoinReward, MINIGAME_RULES, type MiniGameId } from '@shared/gameRules';

import { env } from '@/core/config/env';
import { t } from '@/core/i18n';
import { createLogger } from '@/core/logger';
import { ensureSession, initSupabase } from '@/core/network/supabase';
import { palette, radii, spacing, typography } from '@/core/theme/tokens';
import { trustedNow } from '@/core/time';
import { startGameSession } from '@/features/sync/serverApi';
import { companionStore } from '@/store/companion';

import { buildSignedResult, type ServerSession } from './engine/signedResult';
import type { GameResult } from './engine/types';
import { MINIGAMES } from './registry';

const log = createLogger('minigame');
const SESSION_TIMEOUT_MS = 4_000;
const COUNTDOWN_SEC = 3;

type Phase =
  | { kind: 'connecting' }
  | { kind: 'countdown'; n: number }
  | { kind: 'playing' }
  | { kind: 'results'; result: GameResult; coins: number; verified: boolean };

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);

/** Requests a single-use server session (nonce + server start time). `undefined` → practice mode. */
const requestSession = async (gameId: MiniGameId): Promise<ServerSession | undefined> => {
  if (env.economyMode !== 'server') return undefined;
  try {
    const sb = await initSupabase();
    if (!sb || !(await withTimeout(ensureSession(), SESSION_TIMEOUT_MS))) return undefined;
    const res = await withTimeout(startGameSession(sb, gameId), SESSION_TIMEOUT_MS);
    if (res?.kind === 'ok') return res.data;
    log.warn('start-game failed → practice mode', res);
  } catch (e) {
    log.warn('start-game threw → practice mode', e);
  }
  return undefined;
};

interface Props {
  readonly gameId: MiniGameId;
  readonly onExit: () => void;
}

/**
 * Sandbox that hosts one mini-game round:
 *   connecting (server session) → countdown → playing (UI-thread loop) → results.
 * The game component is keyed per round so every round starts from pristine state.
 */
export const MiniGameHost = memo(function MiniGameHost({ gameId, onExit }: Props) {
  const def = MINIGAMES[gameId];
  const rule = MINIGAME_RULES[gameId];
  const [phase, setPhase] = useState<Phase>({ kind: 'connecting' });
  const [round, setRound] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | undefined>();
  const session = useRef<ServerSession | undefined>(undefined);
  const startedAt = useRef(0);
  const seed = useRef(0);
  const finishedRef = useRef(false);

  // ── Round setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    finishedRef.current = false;
    setPhase({ kind: 'connecting' });
    companionStore.getState().beginWork(trustedNow());

    void requestSession(gameId).then((s) => {
      if (cancelled) return;
      session.current = s;
      seed.current = (Math.random() * 2 ** 31) | 0;
      for (let i = 0; i <= COUNTDOWN_SEC; i++) {
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            if (i < COUNTDOWN_SEC) setPhase({ kind: 'countdown', n: COUNTDOWN_SEC - i });
            else {
              startedAt.current = trustedNow();
              setPhase({ kind: 'playing' });
            }
          }, i * 1000),
        );
      }
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [gameId, round]);

  // Leaving mid-round ends the "working" activity without rewards.
  useEffect(
    () => () => {
      if (!finishedRef.current) companionStore.getState().endActivity(trustedNow());
    },
    [],
  );

  const onFinish = useCallback(
    (result: GameResult) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const endedAt = trustedNow();
      const signed = session.current
        ? buildSignedResult(session.current, gameId, result, startedAt.current, endedAt)
        : undefined;
      const { coinsPending } = companionStore.getState().applyMiniGameOutcome(
        { gameId, score: signed?.payload.score ?? Math.round(result.score), performance: result.performance, signed },
        endedAt,
      );
      setPhase({ kind: 'results', result, coins: coinsPending, verified: env.economyMode === 'local' });
    },
    [gameId],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && s.width === width && s.height === height ? s : { width, height }));
  }, []);

  const Game = def.Component;
  const practice = env.economyMode === 'server' && phase.kind !== 'connecting' && !session.current;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={[styles.title, { color: def.accent }]}>{t(`game.${gameId}`)}</Text>
        <Pressable onPress={onExit} style={styles.quit} accessibilityRole="button">
          <Text style={styles.quitText}>{t('game.quit')}</Text>
        </Pressable>
      </View>
      {practice && <Text style={styles.practice}>{t('pc.practice')}</Text>}

      <View style={styles.stage} onLayout={onLayout}>
        {phase.kind === 'playing' && size && (
          <Game
            key={round}
            width={size.width}
            height={size.height}
            seed={seed.current}
            durationSec={rule.durationSec}
            onFinish={onFinish}
          />
        )}

        {phase.kind === 'connecting' && (
          <View style={styles.center}>
            <ActivityIndicator color={def.accent} />
            <Text style={styles.hint}>{t('game.ready')}</Text>
          </View>
        )}

        {phase.kind === 'countdown' && (
          <View style={styles.center}>
            <Animated.Text key={phase.n} entering={ZoomIn.duration(350)} style={[styles.countdown, { color: def.accent }]}>
              {phase.n}
            </Animated.Text>
            <Text style={styles.hint}>{t(`game.${gameId}.desc`)}</Text>
          </View>
        )}

        {phase.kind === 'results' && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.results}>
            <Text style={styles.resultsTitle}>{t('game.over')}</Text>
            <Text style={[styles.score, { color: def.accent }]}>{Math.floor(phase.result.score)}</Text>
            <Text style={styles.hint}>{t('game.score')}</Text>
            <Text style={styles.coins}>
              {phase.coins > 0
                ? t(phase.verified ? 'game.coins' : 'game.coinsPending', { coins: phase.coins })
                : practice && computeCoinReward(gameId, phase.result.score) > 0
                  ? t('pc.practice')
                  : t('game.noCoins')}
            </Text>
            <View style={styles.buttons}>
              <Pressable style={[styles.button, styles.secondary]} onPress={onExit} accessibilityRole="button">
                <Text style={styles.buttonText}>{t('game.back')}</Text>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: def.accent }]}
                onPress={() => setRound((r) => r + 1)}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, styles.dark]}>{t('game.again')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
});

const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.ink900 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  title: { ...typography.title },
  quit: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: palette.ink700 },
  quitText: { ...typography.caption, color: palette.white },
  practice: { ...typography.caption, color: palette.warning, textAlign: 'center', marginBottom: spacing.sm },
  stage: { flex: 1, marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: palette.ink800 },
  center: { ...fill, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  countdown: { fontSize: 96, fontWeight: '900' },
  hint: { ...typography.body, color: palette.mist, textAlign: 'center' },
  results: { ...fill, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl, backgroundColor: 'rgba(15,16,32,0.92)' },
  resultsTitle: { ...typography.title, color: palette.white },
  score: { ...typography.display, fontSize: 64 },
  coins: { ...typography.body, color: palette.coin, fontWeight: '800', marginTop: spacing.md },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  button: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radii.pill },
  secondary: { backgroundColor: palette.ink700 },
  buttonText: { ...typography.body, color: palette.white, fontWeight: '800' },
  dark: { color: palette.ink900 },
});
