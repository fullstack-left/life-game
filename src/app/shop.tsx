import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/core/theme/tokens';
import { ShopScreen } from '@/features/shop/ShopScreen';

export default function ShopRoute() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.ink900 }} edges={['bottom']}>
      <ShopScreen />
    </SafeAreaView>
  );
}
