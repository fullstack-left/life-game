import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/core/theme/tokens';
import { ComputerMenu } from '@/features/minigames/ComputerMenu';

export default function ComputerScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink900 }} edges={['bottom']}>
      <ComputerMenu onPick={(id) => router.replace({ pathname: '/minigame/[id]', params: { id } })} />
    </SafeAreaView>
  );
}
