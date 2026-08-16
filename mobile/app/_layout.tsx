import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/stores/auth.store';
import { listenForNoticeTap, initNotifications, registerPushToken } from '../src/services/push.service';
import { colors } from '../src/theme';

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isHydrated, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isHydrated) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated, isHydrated, segments, router]);

  useEffect(() => {
    void initNotifications();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void registerPushToken();
    let unsubscribe: (() => void) | undefined;
    void listenForNoticeTap((data) => {
      if (data?.type === 'guest') router.push('/(tabs)/guests');
      else router.push('/notices');
    }).then((stop) => {
      unsubscribe = stop;
    });
    return () => unsubscribe?.();
  }, [isAuthenticated, router]);

  if (!isHydrated) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notices" />
          <Stack.Screen name="marketplace" />
          <Stack.Screen name="voting" />
          <Stack.Screen name="amenities" />
          <Stack.Screen name="complaints" />
          <Stack.Screen name="directory" />
          <Stack.Screen name="expenses" />
          <Stack.Screen name="messages" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="messages-contacts" />
          <Stack.Screen name="rentals" />
          <Stack.Screen name="users" />
        </Stack>
      </AuthGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
