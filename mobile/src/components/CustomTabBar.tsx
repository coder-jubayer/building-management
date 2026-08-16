import { useEffect, useRef } from 'react';
import { View, Pressable, StyleSheet, Text, Animated, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, shadows } from '../theme';
import { useAuthStore } from '../stores/auth.store';
import { useGuestsStore } from '../stores/guests.store';

const TABS = [
  { name: 'home', label: 'Home', icon: 'home-outline' as const, iconActive: 'home' as const },
  { name: 'community', label: 'Community', icon: 'people-outline' as const, iconActive: 'people' as const },
  { name: 'services', label: 'Services', icon: 'grid-outline' as const, iconActive: 'grid' as const },
  { name: 'guests', label: 'Guests', icon: 'shield-checkmark-outline' as const, iconActive: 'shield-checkmark' as const },
  { name: 'profile', label: 'Profile', icon: 'person-outline' as const, iconActive: 'person' as const },
];

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pendingCount = useGuestsStore((s) => s.pendingCount);
  const refreshGuests = useGuestsStore((s) => s.refresh);
  const pulse = useRef(new Animated.Value(1)).current;
  const waiting = pendingCount > 0;

  useEffect(() => {
    if (!isAuthenticated) return;
    void refreshGuests();
    const timer = setInterval(() => {
      void refreshGuests();
    }, 8000);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshGuests();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [isAuthenticated, refreshGuests]);

  useEffect(() => {
    if (!waiting) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.15, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [waiting, pulse]);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab, index) => {
        const route = state.routes.find((r: { name: string }) => r.name === tab.name);
        if (!route) return null;

        const isFocused = state.index === state.routes.indexOf(route);
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (index === 2) {
          return (
            <Pressable
              key={tab.name}
              onPress={onPress}
              style={({ pressed }) => [styles.centerBtn, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Ionicons name="grid" size={28} color={colors.white} />
            </Pressable>
          );
        }

        return (
          <Pressable key={tab.name} onPress={onPress} style={styles.tab}>
            <View style={styles.iconWrap}>
              <Ionicons
                name={isFocused ? tab.iconActive : tab.icon}
                size={24}
                color={isFocused ? colors.primary : colors.textSecondary}
              />
              {tab.name === 'guests' && waiting ? (
                <Animated.View style={[styles.alertDot, { opacity: pulse }]} />
              ) : null}
            </View>
            <Text style={[styles.label, isFocused && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 72,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertDot: {
    position: 'absolute',
    top: -2,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.primary,
  },
  centerBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -48,
    borderWidth: 6,
    borderColor: colors.white,
    ...shadows.fab,
  },
});
