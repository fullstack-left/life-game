import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isMiniGameId } from '@shared/gameRules';

import { palette } from '@/core/theme/tokens';
import { MiniGameHost } from '@/features/minigames/MiniGameHost';

export default function MiniGameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exit = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/')), []);
  if (!isMiniGameId(id)) return <Redirect href="/" />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink900 }}>
      <MiniGameHost gameId={id} onExit={exit} />
    </SafeAreaView>
  );
}
