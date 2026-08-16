import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { PageHeader } from '../../src/components/PageHeader';
import { Button, Input } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { updateMyProfile } from '../../src/services/auth.service';
import { canManageUsers, ROLE_LABELS } from '../../src/types';
import { colors, spacing, borderRadius, shadows } from '../../src/theme';

function fallbackAvatar(email?: string) {
  return `https://i.pravatar.cc/150?u=${email ?? 'user'}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, setUser } = useAuthStore();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState<{ uri: string; name?: string; type?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const avatarUri = useMemo(
    () => avatar?.uri || user?.avatar || fallbackAvatar(user?.email),
    [avatar?.uri, user?.avatar, user?.email],
  );

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const openEdit = () => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
    setUnitNumber(user?.unitNumber ?? '');
    setCurrentPassword('');
    setPassword('');
    setAvatar(null);
    setFormError(null);
    setEditOpen(true);
  };

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.78,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAvatar({
      uri: asset.uri,
      name: asset.fileName || 'avatar.jpg',
      type: asset.mimeType || 'image/jpeg',
    });
    setFormError(null);
  };

  const handleSave = async () => {
    if (name.trim().length < 2) {
      setFormError('Enter your name');
      return;
    }
    if (password && password.length < 6) {
      setFormError('New password must be at least 6 characters');
      return;
    }
    if (password && !currentPassword) {
      setFormError('Enter your current password to change it');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const updated = await updateMyProfile({
        name: name.trim(),
        phone: phone.trim(),
        unitNumber: unitNumber.trim(),
        password: password || undefined,
        currentPassword: password ? currentPassword : undefined,
        avatar,
      });
      setUser(updated);
      setEditOpen(false);
      showToast('Profile updated');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setLogoutOpen(false);
      router.replace('/(auth)/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const menu = [
    ...(canManageUsers(user?.role)
      ? [
          {
            icon: 'people-outline' as const,
            label: 'Manage Users',
            onPress: () => router.push('/users'),
          },
        ]
      : []),
    {
      icon: 'person-outline' as const,
      label: 'Edit Profile',
      onPress: openEdit,
    },
    {
      icon: 'settings-outline' as const,
      label: 'Preferences',
      onPress: () => showToast('Coming in a later phase'),
    },
    {
      icon: 'help-circle-outline' as const,
      label: 'Help & Support',
      onPress: () => showToast('Coming in a later phase'),
    },
  ];

  return (
    <View style={styles.root}>
      <PageHeader title="Profile" />

      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Pressable style={styles.avatarRing} onPress={openEdit}>
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.white} />
            </View>
          </Pressable>
          <Text style={styles.name}>{user?.name ?? 'User'}</Text>
          <Text style={styles.meta}>
            {user?.unitNumber ? `Apt ${user.unitNumber} • ` : ''}
            {user?.role ? ROLE_LABELS[user.role] : 'Account'}
            {user?.buildingName ? ` • ${user.buildingName}` : ''}
          </Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.phone ? <Text style={styles.phone}>{user.phone}</Text> : null}
          <Pressable style={styles.editChip} onPress={openEdit}>
            <Ionicons name="create-outline" size={14} color={colors.primary} />
            <Text style={styles.editChipText}>Edit profile</Text>
          </Pressable>
        </View>

        <View style={styles.menuCard}>
          {menu.map((item, i) => (
            <View key={item.label}>
              <Pressable style={styles.menuRow} onPress={item.onPress}>
                <Ionicons name={item.icon} size={22} color={colors.textMuted} />
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.slate200} />
              </Pressable>
              {i < menu.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <Pressable style={styles.logout} onPress={() => setLogoutOpen(true)}>
          <View style={styles.logoutIcon}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
          </View>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>

        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>

      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalDismiss} onPress={() => setEditOpen(false)} />
          <View style={[styles.editSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Edit profile</Text>
            <Text style={styles.modalSub}>Update your name, photo, phone, and unit details.</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editForm}>
              <Pressable style={styles.editAvatarWrap} onPress={() => void pickAvatar()}>
                <Image source={{ uri: avatarUri }} style={styles.editAvatar} />
                <View style={styles.editAvatarBadge}>
                  <Ionicons name="camera" size={16} color={colors.white} />
                </View>
              </Pressable>
              <Text style={styles.photoHint}>Tap to change photo</Text>
              <Input label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
              <Input
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="017XXXXXXXX"
                keyboardType="phone-pad"
              />
              <Input
                label="Unit / Apt"
                value={unitNumber}
                onChangeText={setUnitNumber}
                placeholder="A-101"
              />
              <Input label="Email" value={user?.email ?? ''} editable={false} />
              <Input
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Only if changing password"
                secureTextEntry
              />
              <Input
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="Leave blank to keep current"
                secureTextEntry
              />
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <Button title="Save changes" loading={saving} onPress={() => void handleSave()} />
              <Button title="Cancel" variant="outline" onPress={() => setEditOpen(false)} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={logoutOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalDismiss} onPress={() => setLogoutOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.handle} />

            <View style={styles.confirmIconWrap}>
              <Ionicons name="log-out" size={28} color={colors.error} />
            </View>

            <Text style={styles.modalTitle}>Log out?</Text>
            <Text style={styles.modalSub}>
              You’ll need to sign in again to access your building account.
            </Text>

            <View style={styles.selectedPreview}>
              <View style={styles.previewAvatar}>
                <Image source={{ uri: user?.avatar || fallbackAvatar(user?.email) }} style={styles.previewImage} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewName}>{user?.name}</Text>
                <Text style={styles.previewEmail}>{user?.email}</Text>
                <Text style={styles.previewMeta}>
                  {user?.role ? ROLE_LABELS[user.role] : 'Account'}
                </Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setLogoutOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Log Out"
                variant="danger"
                loading={loggingOut}
                onPress={handleLogout}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  toast: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.slate800,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toastText: { color: colors.white, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  content: { padding: spacing.md, paddingBottom: 120, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['3xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.sm,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: colors.primaryMuted,
    padding: 4,
    marginBottom: spacing.md,
  },
  avatar: { width: '100%', height: '100%', borderRadius: 44 },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  name: { fontSize: 24, fontWeight: '700', color: colors.text },
  meta: { color: colors.textSecondary, fontWeight: '500', marginTop: 4, textAlign: 'center' },
  email: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  phone: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 4 },
  editChip: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editChipText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['3xl'],
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  menuLabel: { flex: 1, fontWeight: '500', color: colors.slate800, fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius['3xl'],
    borderWidth: 1,
    borderColor: '#FFE4E6',
    padding: spacing.md,
    ...shadows.sm,
  },
  logoutIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: { fontWeight: '600', color: colors.error, fontSize: 15 },
  version: { textAlign: 'center', fontSize: 12, color: colors.textMuted },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalDismiss: { flex: 1 },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  editSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '92%',
  },
  editForm: { gap: spacing.md, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  editAvatarWrap: { alignSelf: 'center', width: 96, height: 96 },
  editAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.slate100 },
  editAvatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  photoHint: { textAlign: 'center', color: colors.textSecondary, fontSize: 13, marginTop: -4 },
  error: { color: colors.error, fontSize: 13, textAlign: 'center' },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate200,
    marginBottom: 4,
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  modalSub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginTop: -4 },
  selectedPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  previewAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.primaryLight,
  },
  previewImage: { width: '100%', height: '100%' },
  previewName: { fontWeight: '700', color: colors.text },
  previewEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  previewMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
