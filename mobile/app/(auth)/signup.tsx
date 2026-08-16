import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, Card } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { colors, spacing, typography } from '../../src/theme';

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signup, isAuthenticated, isLoading, isHydrated } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      router.replace('/(tabs)/home');
    }
  }, [isHydrated, isAuthenticated, router]);

  if (isHydrated && isAuthenticated) {
    return <Redirect href="/(tabs)/home" />;
  }

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password || !buildingName.trim()) {
      setError('Name, email, password, and building name are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    try {
      await signup({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        buildingName: buildingName.trim(),
        phone: phone.trim() || undefined,
      });
      router.replace('/(tabs)/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>BG</Text>
        </View>
        <Text style={styles.appName}>Building Admin</Text>
        <Text style={styles.tagline}>Create your community account</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.formWrap,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <View style={styles.form}>
            <Input
              label="Full name"
              placeholder="Your name"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
            />
            <Input
              label="Building / Community name"
              placeholder="Sunset Apartments"
              value={buildingName}
              onChangeText={(value) => {
                setBuildingName(value);
                setError(null);
              }}
            />
            <Input
              label="Email"
              placeholder="you@email.com"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Input
              label="Phone (optional)"
              placeholder="+880..."
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Input
              label="Password"
              placeholder="Min 6 characters"
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setError(null);
              }}
              secureTextEntry
            />
            <Input
              label="Confirm password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={(value) => {
                setConfirmPassword(value);
                setError(null);
              }}
              secureTextEntry
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Create Account" fullWidth loading={isLoading} onPress={handleSignup} />
          </View>
        </Card>

        <Pressable onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.switchText}>
            Already have an account? <Text style={styles.switchLink}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  scroll: { flex: 1 },
  formWrap: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 28, fontWeight: '800', color: colors.white },
  appName: { ...typography.h2, color: colors.text },
  tagline: { ...typography.bodySmall, color: colors.textSecondary },
  form: { gap: spacing.md },
  error: { color: colors.error, fontSize: 13, textAlign: 'center' },
  switchText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  switchLink: { color: colors.primary, fontWeight: '700' },
});
