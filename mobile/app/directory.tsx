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
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../src/components/PageHeader';
import { PopupHeader } from '../src/components/PopupHeader';
import { Button, Input } from '../src/components/ui';
import { colors, spacing, borderRadius, shadows } from '../src/theme';
import { useAuthStore } from '../src/stores/auth.store';
import {
  createDirectoryContact,
  deleteDirectoryContact,
  fetchDirectory,
} from '../src/services/directory.service';
import {
  Building,
  DirectoryContact,
  DirectoryType,
  DirectoryTypeOption,
  canManageDirectory,
  isAppAdmin,
} from '../src/types';

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  fire: 'flame',
  police: 'shield',
  property_manager: 'briefcase',
  security: 'shield-checkmark',
  gas: 'flame-outline',
  welfare: 'people',
  call: 'call',
};

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  fire: { bg: '#FFF1F2', fg: '#E11D48' },
  police: { bg: '#EEF2FF', fg: '#4F46E5' },
  property_manager: { bg: '#F1F5F9', fg: '#334155' },
  security: { bg: '#ECFDF5', fg: '#059669' },
  gas: { bg: '#FFFBEB', fg: '#D97706' },
  welfare: { bg: '#F0F9FF', fg: '#0284C7' },
};

export default function DirectoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tileWidth = (width - spacing.lg * 2 - 10) / 2;
  const user = useAuthStore((s) => s.user);
  const manager = canManageDirectory(user?.role);
  const appAdmin = isAppAdmin(user?.role);

  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [types, setTypes] = useState<DirectoryTypeOption[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [canManage, setCanManage] = useState(manager);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState<DirectoryType>('');
  const [customTypes, setCustomTypes] = useState<DirectoryTypeOption[]>([]);
  const [typeOpen, setTypeOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [typeFormError, setTypeFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectoryContact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadDirectory = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchDirectory(appAdmin ? buildingId || undefined : undefined);
      setContacts(data.contacts);
      setTypes(data.types);
      setCustomTypes((current) => current.filter((item) => !data.types.some((option) => option.value === item.value)));
      setCanManage(data.canManage);
      setBuildings(data.buildings ?? []);
      setBuildingId((current) => current || data.buildings?.[0]?.id || '');
      setType((current) => (current && data.types.some((item) => item.value === current) ? current : ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appAdmin, buildingId]);

  useFocusEffect(
    useCallback(() => {
      void loadDirectory();
    }, [loadDirectory]),
  );

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const formTypes = useMemo(() => {
    const seen = new Set(types.map((item) => item.value));
    return [...types, ...customTypes.filter((item) => !seen.has(item.value))];
  }, [types, customTypes]);

  const groups = useMemo(() => {
    const known = new Set(types.map((item) => item.value));
    const ordered = types
      .map((item) => ({
        ...item,
        contacts: contacts.filter((contact) => contact.type === item.value),
      }))
      .filter((group) => group.contacts.length > 0);

    const extras = new Map<string, DirectoryTypeOption & { contacts: DirectoryContact[] }>();
    for (const contact of contacts) {
      if (contact.type && known.has(contact.type)) continue;
      const key = contact.type || 'other';
      const existing = extras.get(key);
      if (existing) {
        existing.contacts.push(contact);
        continue;
      }
      extras.set(key, {
        value: key,
        label: contact.typeLabel || 'Other',
        icon: contact.icon || 'call',
        contacts: [contact],
      });
    }

    return [...ordered, ...extras.values()];
  }, [types, contacts]);

  const resetForm = () => {
    setType('');
    setName('');
    setPhone('');
    setNote('');
    setFormError(null);
    setTypeOpen(false);
    setNewTypeName('');
    setTypeFormError(null);
  };

  const slugifyType = (label: string) =>
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `custom_${Date.now()}`;

  const handleAddType = () => {
    const label = newTypeName.trim();
    if (label.length < 2) {
      setTypeFormError('Enter a type name.');
      return;
    }
    const existing = formTypes.find((item) => item.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      setType(existing.value);
      setTypeOpen(false);
      setNewTypeName('');
      setTypeFormError(null);
      return;
    }
    const option: DirectoryTypeOption = {
      value: slugifyType(label),
      label,
      icon: 'call',
      custom: true,
    };
    setCustomTypes((current) => [...current, option]);
    setType(option.value);
    setTypeOpen(false);
    setNewTypeName('');
    setTypeFormError(null);
  };

  const call = async (contact: DirectoryContact) => {
    const tel = `tel:${contact.phone.replace(/[^\d+]/g, '')}`;
    try {
      await Linking.openURL(tel);
    } catch {
      showToast(`${contact.name}: ${contact.phone}`);
    }
  };

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      setFormError('Enter a contact name.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 3) {
      setFormError('Enter a valid phone number.');
      return;
    }
    if (appAdmin && !buildingId) {
      setFormError('Select a building.');
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      const selected = formTypes.find((item) => item.value === type);
      await createDirectoryContact({
        type: selected && !selected.custom ? selected.value : undefined,
        typeLabel: selected?.custom ? selected.label : undefined,
        name: name.trim(),
        phone: phone.trim(),
        note: note.trim() || undefined,
        buildingId: appAdmin ? buildingId : undefined,
      });
      setCreateOpen(false);
      resetForm();
      await loadDirectory();
      showToast('Contact added');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add contact');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDirectoryContact(deleteTarget.id);
      setDeleteTarget(null);
      await loadDirectory();
      showToast('Contact deleted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.root}>
      <PageHeader title="Emergency Directory" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadDirectory();
            }}
          />
        }
      >
        {appAdmin && buildings.length > 0 ? (
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

        {canManage ? (
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            <Ionicons name="add" size={20} color={colors.white} />
            <Text style={styles.addBtnText}>Add contact</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !contacts.length ? <Text style={styles.muted}>Loading contacts…</Text> : null}
        {!loading && !contacts.length && !error ? (
          <Text style={styles.muted}>No emergency contacts yet.</Text>
        ) : null}

        {groups.map((group) => {
          const tone = TYPE_COLORS[group.value] ?? TYPE_COLORS.welfare;
          const icon = TYPE_ICONS[group.icon] ?? TYPE_ICONS[group.value] ?? 'call';
          return (
            <View key={group.value} style={styles.section}>
              <Text style={styles.sectionTitle}>{group.label}</Text>
              {group.contacts.map((contact) => (
                <View key={contact.id} style={styles.card}>
                  <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                    <Ionicons name={icon} size={20} color={tone.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{contact.name}</Text>
                    <Text style={styles.phone}>{contact.phone}</Text>
                    {contact.note ? <Text style={styles.note}>{contact.note}</Text> : null}
                  </View>
                  <Pressable style={styles.callBtn} onPress={() => void call(contact)}>
                    <Ionicons name="call" size={16} color={colors.success} />
                  </Pressable>
                  {canManage ? (
                    <Pressable style={styles.deleteBtn} onPress={() => setDeleteTarget(contact)}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            {typeOpen ? (
              <>
                <PopupHeader title="New type" onClose={() => setCreateOpen(false)} />
                <Text style={styles.sheetSubtitle}>Optional. Use this if none of the presets fit.</Text>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
                  <Input
                    label="Type name"
                    value={newTypeName}
                    onChangeText={(value) => {
                      setNewTypeName(value);
                      setTypeFormError(null);
                    }}
                    placeholder="e.g. Ambulance"
                  />
                  {typeFormError ? <Text style={styles.error}>{typeFormError}</Text> : null}
                  <Button title="Add type" onPress={handleAddType} />
                  <Button title="Back" variant="ghost" onPress={() => setTypeOpen(false)} />
                </ScrollView>
              </>
            ) : (
              <>
            <PopupHeader title="Add contact" onClose={() => setCreateOpen(false)} />
            <Text style={styles.sheetSubtitle}>Residents can tap to call this number.</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Text style={styles.fieldLabel}>Type (optional)</Text>
              <View style={styles.typeGrid}>
                {formTypes.map((option) => {
                  const selected = type === option.value;
                  const tone = TYPE_COLORS[option.value] ?? TYPE_COLORS.welfare;
                  const icon = TYPE_ICONS[option.icon] ?? TYPE_ICONS[option.value] ?? 'call';
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setType(selected ? '' : option.value)}
                      style={[styles.typeTile, { width: tileWidth }, selected && styles.typeTileActive]}
                    >
                      <View style={[styles.typeIcon, { backgroundColor: tone.bg }]}>
                        <Ionicons name={icon} size={18} color={tone.fg} />
                      </View>
                      <Text numberOfLines={2} style={[styles.typeLabel, selected && styles.typeLabelActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => {
                    setTypeFormError(null);
                    setTypeOpen(true);
                  }}
                  style={[styles.typeTile, styles.typeTileAdd, { width: tileWidth }]}
                >
                  <View style={styles.typeAddIcon}>
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.typeAddLabel}>New type</Text>
                </Pressable>
              </View>
              <Input label="Name" value={name} onChangeText={setName} placeholder="Dhaka Fire Service" />
              <Input
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="199"
                keyboardType="phone-pad"
              />
              <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="24/7 control room" />
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <Button title="Save contact" loading={creating} onPress={() => void handleCreate()} />
              <Button title="Cancel" variant="outline" onPress={() => setCreateOpen(false)} />
            </ScrollView>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!deleteTarget} animationType="fade" transparent onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.confirmWrap}>
          <Pressable style={styles.backdrop} onPress={() => setDeleteTarget(null)} />
          <View style={styles.confirmCard}>
            <PopupHeader title="Delete contact?" onClose={() => setDeleteTarget(null)} />
            <Text style={styles.confirmBody}>
              {deleteTarget ? `${deleteTarget.name} (${deleteTarget.phone}) will be removed.` : ''}
            </Text>
            <View style={styles.confirmActions}>
              <Button title="Cancel" variant="outline" onPress={() => setDeleteTarget(null)} />
              <Button title="Delete" variant="danger" loading={deleting} onPress={() => void handleDelete()} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: spacing.md },
  chipRow: { gap: spacing.sm, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: colors.white },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  section: { gap: 10 },
  sectionTitle: { fontWeight: '700', color: colors.text, paddingHorizontal: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontWeight: '700', color: colors.text },
  phone: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  note: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  error: { color: colors.error, fontSize: 13, textAlign: 'center' },
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
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  form: { gap: spacing.md, paddingBottom: spacing.lg },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeTile: {
    height: 88,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    backgroundColor: colors.surface,
    padding: 12,
    justifyContent: 'space-between',
  },
  typeTileActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  typeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: { fontSize: 12, fontWeight: '700', color: colors.text, lineHeight: 16 },
  typeLabelActive: { color: colors.primaryDark },
  typeTileAdd: {
    borderStyle: 'dashed',
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primaryLight,
  },
  typeAddIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeAddLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, lineHeight: 16 },
  confirmWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  confirmBody: { fontSize: 14, color: colors.textSecondary },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
});
