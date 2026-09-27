import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { palette } from '@/core/theme/tokens';
import { useCompanionLifecycle } from '@/features/pet-state/useCompanionLifecycle';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Store is already hydrated synchronously from MMKV at import time; this runs the
  // offline time-jump and wires AppState + sync before the first frame is shown.
  useCompanionLifecycle();

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.ink900 },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="computer" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="shop" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="minigame/[id]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: palette.ink900 } });
