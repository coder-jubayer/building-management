import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../src/components/PageHeader';
import { Card, Input, Button } from '../src/components/ui';
import { StatusBadge } from '../src/components/StatusBadge';
import { colors, borderRadius, spacing, typography, shadows } from '../src/theme';
import { useAuthStore } from '../src/stores/auth.store';
import { createUser, deleteUser, fetchUsers, setUserActive } from '../src/services/users.service';
import {
  Building,
  canMutateUser,
  isAppAdmin,
  ROLE_LABELS,
  User,
  UserRole,
} from '../src/types';

type ConfirmAction = { type: 'deactivate' | 'activate' | 'delete'; user: User };

export default function UsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<User[]>([]);
  const [roleOptions, setRoleOptions] = useState<{ value: UserRole; label: string }[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [role, setRole] = useState<UserRole>('resident');
  const [buildingId, setBuildingId] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const appAdmin = isAppAdmin(currentUser?.role);

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchUsers();
      setUsers(data.users);
      setRoleOptions(data.roles);
      setBuildings(data.buildings ?? []);
      setRole((current) =>
        data.roles.some((r) => r.value === current) ? current : (data.roles[0]?.value ?? 'resident'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadUsers();
    }, [loadUsers]),
  );

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setUnitNumber('');
    setRole(roleOptions[0]?.value ?? 'resident');
    setBuildingId(buildings[0]?.id ?? '');
    setBuildingName('');
    setFormError(null);
  };

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setFormError('Name, email, and password are required.');
      return;
    }

    if (appAdmin && role === 'building_admin' && !buildingName.trim()) {
      setFormError('Enter a building / community name.');
      return;
    }

    if (appAdmin && role !== 'building_admin' && !buildingId) {
      setFormError('Select a building for this user.');
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      await createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        phone: phone.trim() || undefined,
        unitNumber: unitNumber.trim() || undefined,
        buildingId: appAdmin && role !== 'building_admin' ? buildingId : undefined,
        buildingName: appAdmin && role === 'building_admin' ? buildingName.trim() : undefined,
      });
      setCreateOpen(false);
      resetForm();
      await loadUsers();
      showToast('User created');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, user } = confirmAction;
    setBusyUserId(user.id);
    try {
      if (type === 'delete') {
        await deleteUser(user.id);
        showToast(`${user.name} deleted`);
      } else {
        await setUserActive(user.id, type === 'activate');
        showToast(type === 'activate' ? `${user.name} activated` : `${user.name} deactivated`);
      }
      setConfirmAction(null);
      await loadUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyUserId(null);
    }
  };

  const subtitle = useMemo(() => {
    if (appAdmin) return `${users.length} users across all buildings`;
    return `${users.length} users in ${currentUser?.buildingName ?? 'your building'}`;
  }, [appAdmin, users.length, currentUser?.buildingName]);

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Manage Users"
        onBack={() => router.back()}
        rightAction={
          <Pressable
            onPress={() => {
              resetForm();
              setCreateOpen(true);
            }}
            style={styles.headerAdd}
          >
            <Ionicons name="person-add-outline" size={20} color={colors.primary} />
          </Pressable>
        }
      >
        <Text style={styles.subtitle}>{subtitle}</Text>
      </PageHeader>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            void loadUsers();
          }} />
        }
      >
        {error ? (
          <Card>
            <Text style={styles.error}>{error}</Text>
            <Button title="Retry" onPress={() => void loadUsers()} />
          </Card>
        ) : null}

        {loading && !users.length ? (
          <Text style={styles.muted}>Loading users…</Text>
        ) : null}

        {users.map((user) => {
          const mutable = canMutateUser(currentUser?.id, currentUser?.role, user);
          return (
            <Card key={user.id}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.name.charAt(0)}</Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.name}>{user.name}</Text>
                  <Text style={styles.email}>{user.email}</Text>
                  <Text style={styles.meta}>
                    {ROLE_LABELS[user.role]}
                    {user.unitNumber ? ` · Apt ${user.unitNumber}` : ''}
                    {user.buildingName ? ` · ${user.buildingName}` : ''}
                  </Text>
                </View>
                <StatusBadge
                  variant={user.isActive === false ? 'error' : 'success'}
                  label={user.isActive === false ? 'Inactive' : 'Active'}
                />
              </View>

              {mutable ? (
                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionBtn, styles.actionGhost]}
                    disabled={busyUserId === user.id}
                    onPress={() =>
                      setConfirmAction({
                        type: user.isActive === false ? 'activate' : 'deactivate',
                        user,
                      })
                    }
                  >
                    <Ionicons
                      name={user.isActive === false ? 'checkmark-circle-outline' : 'pause-circle-outline'}
                      size={16}
                      color={colors.text}
                    />
                    <Text style={styles.actionGhostText}>
                      {user.isActive === false ? 'Activate' : 'Deactivate'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.actionDanger]}
                    disabled={busyUserId === user.id}
                    onPress={() => setConfirmAction({ type: 'delete', user })}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={styles.actionDangerText}>Delete</Text>
                  </Pressable>
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add user</Text>
            <Text style={styles.sheetSubtitle}>
              {appAdmin
                ? 'App admins can create building admins and staff for any community.'
                : 'You can create Committee, Resident, and Security Guard accounts for your building.'}
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Input label="Full name" value={name} onChangeText={setName} placeholder="Name" />
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Min 6 characters"
                secureTextEntry
              />
              <Input label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <Input label="Unit (optional)" value={unitNumber} onChangeText={setUnitNumber} placeholder="A-101" />

              <Text style={styles.fieldLabel}>Role</Text>
              <View style={styles.roleRow}>
                {roleOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setRole(option.value)}
                    style={[styles.roleChip, role === option.value && styles.roleChipActive]}
                  >
                    <Text style={[styles.roleChipText, role === option.value && styles.roleChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {appAdmin && role === 'building_admin' ? (
                <Input
                  label="Building / Community name"
                  value={buildingName}
                  onChangeText={setBuildingName}
                  placeholder="Sunset Apartments"
                />
              ) : null}

              {appAdmin && role !== 'building_admin' ? (
                <>
                  <Text style={styles.fieldLabel}>Building</Text>
                  {buildings.length ? (
                    <View style={styles.roleRow}>
                      {buildings.map((building) => (
                        <Pressable
                          key={building.id}
                          onPress={() => setBuildingId(building.id)}
                          style={[styles.roleChip, buildingId === building.id && styles.roleChipActive]}
                        >
                          <Text
                            style={[
                              styles.roleChipText,
                              buildingId === building.id && styles.roleChipTextActive,
                            ]}
                          >
                            {building.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.muted}>No buildings yet. Create a building admin first.</Text>
                  )}
                </>
              ) : null}

              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <Button title="Create user" loading={creating} onPress={() => void handleCreate()} />
              <Button title="Cancel" variant="outline" onPress={() => setCreateOpen(false)} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!confirmAction} animationType="fade" transparent onRequestClose={() => setConfirmAction(null)}>
        <View style={styles.confirmWrap}>
          <Pressable style={styles.backdrop} onPress={() => setConfirmAction(null)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              {confirmAction?.type === 'delete'
                ? 'Delete user?'
                : confirmAction?.type === 'activate'
                  ? 'Activate user?'
                  : 'Deactivate user?'}
            </Text>
            <Text style={styles.confirmBody}>
              {confirmAction?.type === 'delete'
                ? `${confirmAction.user.name} will be permanently removed.`
                : confirmAction?.type === 'activate'
                  ? `${confirmAction?.user.name} will be able to sign in again.`
                  : `${confirmAction?.user.name} will not be able to sign in.`}
            </Text>
            <View style={styles.confirmActions}>
              <Button title="Cancel" variant="outline" onPress={() => setConfirmAction(null)} />
              <Button
                title={
                  confirmAction?.type === 'delete'
                    ? 'Delete'
                    : confirmAction?.type === 'activate'
                      ? 'Activate'
                      : 'Deactivate'
                }
                variant={confirmAction?.type === 'delete' ? 'danger' : 'primary'}
                loading={!!busyUserId}
                onPress={() => void runConfirmAction()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  content: { padding: spacing.lg, gap: spacing.md },
  headerAdd: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 18 },
  userInfo: { flex: 1 },
  name: { ...typography.body, fontWeight: '700', color: colors.text },
  email: { ...typography.caption, color: colors.textSecondary },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  muted: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  error: { color: colors.error, fontSize: 13, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  actionGhost: { backgroundColor: colors.slate100 },
  actionGhostText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  actionDanger: { backgroundColor: colors.errorLight ?? '#FEE2E2' },
  actionDangerText: { color: colors.error, fontWeight: '600', fontSize: 13 },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.text,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.md,
  },
  toastText: { color: colors.white, textAlign: 'center', fontWeight: '600' },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '90%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetTitle: { ...typography.h3, color: colors.text },
  sheetSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },
  form: { gap: spacing.md, paddingBottom: spacing.lg },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  roleChipActive: { backgroundColor: colors.primary },
  roleChipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  roleChipTextActive: { color: colors.white },
  confirmWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  confirmTitle: { ...typography.h3, color: colors.text },
  confirmBody: { ...typography.body, color: colors.textSecondary },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
});
