import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../../src/components/PageHeader';
import { PopupHeader } from '../../src/components/PopupHeader';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, borderRadius, shadows } from '../../src/theme';
import { useAuthStore } from '../../src/stores/auth.store';
import { createGuestVisit, decideGuestVisit, fetchGuests } from '../../src/services/guests.service';
import { formatRelativeTime } from '../../src/utils/date';
import { useGuestsStore } from '../../src/stores/guests.store';
import {
  Building,
  GuestHost,
  GuestVisit,
  canCreateGuestVisits,
  isAppAdmin,
} from '../../src/types';

const FALLBACK_PURPOSES = ['Guest', 'Delivery', 'Family', 'Cab / Ride', 'Maintenance', 'Other'];

export default function GuestsScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const creator = canCreateGuestVisits(user?.role);
  const appAdmin = isAppAdmin(user?.role);

  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [visits, setVisits] = useState<GuestVisit[]>([]);
  const [residents, setResidents] = useState<GuestHost[]>([]);
  const [purposes, setPurposes] = useState<string[]>(FALLBACK_PURPOSES);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [canCreate, setCanCreate] = useState(creator);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [purpose, setPurpose] = useState('Guest');
  const [customPurpose, setCustomPurpose] = useState('');
  const [residentId, setResidentId] = useState('');
  const [residentQuery, setResidentQuery] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const pending = visits.filter((item) => item.status === 'pending');
  const history = visits.filter((item) => item.status !== 'pending');

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const loadGuests = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchGuests(appAdmin ? buildingId || undefined : undefined);
      setVisits(data.visits);
      setResidents(data.residents ?? []);
      setPurposes(data.purposes?.length ? data.purposes : FALLBACK_PURPOSES);
      setCanCreate(data.canCreate);
      setBuildings(data.buildings ?? []);
      setBuildingId((current) => current || data.buildingId || data.buildings?.[0]?.id || '');
      useGuestsStore.getState().sync(data.visits, Boolean(data.canDecide));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load guests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appAdmin, buildingId]);

  useFocusEffect(
    useCallback(() => {
      void loadGuests();
    }, [loadGuests]),
  );

  const resetForm = () => {
    setVisitorName('');
    setVisitorPhone('');
    setPurpose('Guest');
    setCustomPurpose('');
    setResidentId('');
    setResidentQuery('');
    setFormError(null);
  };

  const selectedResident = residents.find((item) => item.id === residentId);
  const filteredResidents = useMemo(() => {
    const query = residentQuery.trim().toLowerCase();
    if (!query) return residents;
    return residents.filter((item) => {
      const haystack = `${item.name} ${item.unitNumber ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [residentQuery, residents]);

  const handleCreate = async () => {
    const name = visitorName.trim();
    const phone = visitorPhone.trim();
    const reason = purpose === 'Other' ? customPurpose.trim() : purpose;
    if (name.length < 2) {
      setFormError('Enter the visitor name.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 3) {
      setFormError('Enter a valid phone number.');
      return;
    }
    if (reason.length < 2) {
      setFormError('Enter the visit purpose.');
      return;
    }
    if (!residentId) {
      setFormError('Select the resident to notify.');
      return;
    }
    if (appAdmin && !buildingId) {
      setFormError('Select a building.');
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      await createGuestVisit({
        name,
        phone,
        purpose: reason,
        residentId,
        buildingId: appAdmin ? buildingId : undefined,
      });
      setCreateOpen(false);
      resetForm();
      await loadGuests();
      showToast(`Request sent to ${selectedResident?.name ?? 'resident'}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setCreating(false);
    }
  };

  const handleDecide = async (visit: GuestVisit, status: 'approved' | 'denied') => {
    setBusyId(visit.id);
    try {
      await decideGuestVisit(visit.id, status);
      await loadGuests();
      showToast(status === 'approved' ? 'Visitor approved' : 'Visitor denied');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const callPhone = async (phone: string) => {
    try {
      await Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
    } catch {
      showToast(phone);
    }
  };

  const list = tab === 'pending' ? pending : history;

  return (
    <View style={styles.root}>
      <PageHeader title="Guest Approvals">
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, tab === 'pending' && styles.tabActive]}
            onPress={() => setTab('pending')}
          >
            <Text style={[styles.tabText, tab === 'pending' && styles.tabTextActive]}>
              {canCreate ? 'Waiting' : 'Pending'} ({pending.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === 'history' && styles.tabActive]}
            onPress={() => setTab('history')}
          >
            <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
          </Pressable>
        </View>
      </PageHeader>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + (canCreate ? 120 : 40) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadGuests();
            }}
          />
        }
      >
        {appAdmin && buildings.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {buildings.map((building) => (
              <Pressable
                key={building.id}
                onPress={() => setBuildingId(building.id)}
                style={[styles.chip, buildingId === building.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, buildingId === building.id && styles.chipTextActive]}>
                  {building.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && list.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="shield-checkmark" size={32} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyText}>
              {tab === 'pending'
                ? canCreate
                  ? 'No visitors waiting on a resident'
                  : 'No pending approvals'
                : 'No guest history yet'}
            </Text>
          </View>
        ) : null}

        {list.map((visit) => (
          <View key={visit.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.guestName}>{visit.visitorName}</Text>
                <Text style={styles.guestTime}>
                  {formatRelativeTime(visit.createdAt)}
                  {visit.createdByName ? ` · ${visit.createdByName}` : ''}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  visit.status === 'pending' && styles.waitingBadge,
                  visit.status === 'approved' && { backgroundColor: colors.successLight },
                  visit.status === 'denied' && { backgroundColor: colors.errorLight },
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    visit.status === 'pending' && styles.waitingText,
                    visit.status === 'approved' && { color: colors.success },
                    visit.status === 'denied' && { color: colors.error },
                  ]}
                >
                  {visit.status === 'pending' ? 'Waiting' : visit.status}
                </Text>
              </View>
            </View>
            <View style={styles.metaBox}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Purpose</Text>
                <Text style={styles.metaValue}>{visit.purpose}</Text>
              </View>
              <Pressable style={styles.metaRow} onPress={() => void callPhone(visit.visitorPhone)}>
                <Text style={styles.metaLabel}>Phone</Text>
                <Text style={[styles.metaValue, { color: colors.primary }]}>{visit.visitorPhone}</Text>
              </Pressable>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Resident</Text>
                <Text style={styles.metaValue}>
                  {visit.residentName}
                  {visit.unitNumber ? ` · Apt ${visit.unitNumber}` : ''}
                </Text>
              </View>
            </View>
            {visit.canDecide ? (
              <View style={styles.actions}>
                <Pressable
                  style={[styles.actionBtn, styles.allowBtn]}
                  onPress={() => void handleDecide(visit, 'approved')}
                  disabled={busyId === visit.id}
                >
                  {busyId === visit.id ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={16} color={colors.success} />
                      <Text style={[styles.actionText, { color: colors.success }]}>Allow</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.denyBtn]}
                  onPress={() => void handleDecide(visit, 'denied')}
                  disabled={busyId === visit.id}
                >
                  <Ionicons name="close" size={16} color={colors.error} />
                  <Text style={[styles.actionText, { color: colors.error }]}>Deny</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {canCreate ? (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 88 }]}
          onPress={() => {
            resetForm();
            setCreateOpen(true);
          }}
        >
          <Ionicons name="add" size={28} color={colors.white} />
        </Pressable>
      ) : null}

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + (canCreate ? 160 : 24) }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal
        visible={createOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOpen(false)} />
          <KeyboardAvoidingView
            style={styles.modalWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
          >
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <View style={styles.sheetHandle} />
              <PopupHeader title="Add visitor" onClose={() => setCreateOpen(false)} />
              <Text style={styles.sheetSubtitle}>Send an approval request to the resident.</Text>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Text style={styles.fieldLabel}>Host resident</Text>
              <Input
                placeholder="Search name or unit"
                value={residentQuery}
                onChangeText={setResidentQuery}
              />
              <ScrollView
                nestedScrollEnabled
                style={styles.residentList}
                contentContainerStyle={{ gap: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                {filteredResidents.length ? (
                  filteredResidents.map((resident) => {
                    const active = resident.id === residentId;
                    return (
                      <Pressable
                        key={resident.id}
                        onPress={() => setResidentId(resident.id)}
                        style={[styles.residentRow, active && styles.residentRowActive]}
                      >
                        <View style={styles.residentAvatar}>
                          <Text style={styles.residentInitial}>
                            {(resident.name || 'R').trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.residentName}>{resident.name}</Text>
                          <Text style={styles.residentMeta}>
                            {resident.unitNumber ? `Apt ${resident.unitNumber}` : 'No unit'}
                          </Text>
                        </View>
                        {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.muted}>No residents found.</Text>
                )}
              </ScrollView>

              <Input
                label="Visitor name"
                value={visitorName}
                onChangeText={setVisitorName}
                placeholder="Full name"
              />
              <Input
                label="Phone number"
                value={visitorPhone}
                onChangeText={setVisitorPhone}
                placeholder="01XXXXXXXXX"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Purpose</Text>
              <View style={styles.purposeRow}>
                {purposes.map((item) => {
                  const active = purpose === item;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setPurpose(item)}
                      style={[styles.purposeChip, active && styles.purposeChipActive]}
                    >
                      <Text style={[styles.purposeText, active && styles.purposeTextActive]}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {purpose === 'Other' ? (
                <Input
                  value={customPurpose}
                  onChangeText={setCustomPurpose}
                  placeholder="Describe the purpose"
                />
              ) : null}

              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <Button title="Send request" loading={creating} onPress={() => void handleCreate()} />
              <Button title="Cancel" variant="outline" onPress={() => setCreateOpen(false)} />
            </ScrollView>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.md,
    padding: 4,
    marginTop: spacing.md,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.white, ...shadows.sm },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.text },
  list: { padding: spacing.md, gap: spacing.md },
  chipRow: { gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  chipActive: { backgroundColor: colors.slate800 },
  chipText: { fontWeight: '600', fontSize: 13, color: colors.text },
  chipTextActive: { color: colors.white },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyText: { color: colors.textSecondary, fontWeight: '500', textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...shadows.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  guestName: { fontSize: 18, fontWeight: '700', color: colors.text },
  guestTime: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  waitingBadge: { backgroundColor: '#FEF3C7' },
  waitingText: { color: '#B45309' },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: 6,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaLabel: { fontSize: 13, color: colors.textSecondary },
  metaValue: { fontSize: 13, fontWeight: '500', color: colors.slate800, flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  allowBtn: { backgroundColor: colors.successLight, borderColor: '#A7F3D0' },
  denyBtn: { backgroundColor: colors.errorLight, borderColor: '#FECDD3' },
  actionText: { fontWeight: '600', fontSize: 14 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  error: { color: colors.error, fontSize: 13, textAlign: 'center' },
  muted: { color: colors.textSecondary, textAlign: 'center', paddingVertical: 8 },
  toast: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.text,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.md,
  },
  toastText: { color: colors.white, textAlign: 'center', fontWeight: '600' },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '92%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  form: { gap: spacing.md, paddingBottom: spacing.lg },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  residentList: { maxHeight: 180 },
  residentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  residentRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  residentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  residentInitial: { fontWeight: '800', color: colors.primary },
  residentName: { fontWeight: '700', color: colors.text },
  residentMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  purposeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  purposeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  purposeChipActive: { backgroundColor: colors.primary },
  purposeText: { fontWeight: '600', fontSize: 13, color: colors.text },
  purposeTextActive: { color: colors.white },
});
