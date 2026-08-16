import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, shadows } from '../src/theme';
import { Button, Input } from '../src/components/ui';
import {
  addInboxGroupMembers,
  createInboxGroup,
  fetchInboxDirectory,
  fetchInboxGroup,
  openInboxThread,
} from '../src/services/inbox.service';
import { InboxCategory, InboxContact } from '../src/types';

const CATEGORIES: Array<{ value: InboxCategory; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'committee', label: 'Committee', icon: 'people' },
  { value: 'resident', label: 'Resident', icon: 'home' },
  { value: 'guard', label: 'Security Guard', icon: 'shield-checkmark' },
];

function firstParam(value?: string | string[]): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

export default function MessagesContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string; groupId?: string }>();
  const mode = (firstParam(params.mode) || 'inbox') as 'inbox' | 'group' | 'group-members';
  const groupId = firstParam(params.groupId);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<InboxCategory>('committee');
  const [contacts, setContacts] = useState<Record<InboxCategory, InboxContact[]>>({
    committee: [],
    resident: [],
    guard: [],
  });
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [saving, setSaving] = useState(false);

  const multi = mode === 'group' || mode === 'group-members';
  const title =
    mode === 'group' ? 'New group' : mode === 'group-members' ? 'Add members' : 'Add contact';

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const directory = await fetchInboxDirectory();
      setContacts(directory.contacts);
      if (mode === 'group-members' && groupId) {
        const detail = await fetchInboxGroup(groupId);
        setExcludeIds(new Set(detail.group.memberIds ?? []));
      } else {
        setExcludeIds(new Set());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load people');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, groupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (contacts[category] ?? []).filter((person) => !excludeIds.has(person.id));
    if (!q) return list;
    return list.filter((person) =>
      [person.name, person.roleLabel, person.phone, person.unitNumber, person.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [contacts, category, search, excludeIds]);

  const toggleSelect = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const addToInbox = async (person: InboxContact) => {
    if (person.inInbox || addingId) return;
    setAddingId(person.id);
    try {
      await openInboxThread(person.id);
      setContacts((current) => ({
        ...current,
        [category]: (current[category] ?? []).map((item) =>
          item.id === person.id ? { ...item, inInbox: true } : item,
        ),
      }));
      showToast(`${person.name} added to inbox`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add contact');
    } finally {
      setAddingId(null);
    }
  };

  const finishGroup = async () => {
    if (!selected.length) {
      showToast('Select at least one person');
      return;
    }
    if (mode === 'group-members') {
      if (!groupId) return;
      setSaving(true);
      try {
        await addInboxGroupMembers(groupId, selected);
        router.replace({ pathname: '/messages', params: { tab: 'groups', groupId } });
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to add members');
      } finally {
        setSaving(false);
      }
      return;
    }
    const picked = Object.values(contacts)
      .flat()
      .filter((person) => selected.includes(person.id));
    setGroupName(picked.slice(0, 3).map((person) => person.name.split(' ')[0]).join(', '));
    setNameOpen(true);
  };

  const createGroup = async () => {
    if (groupName.trim().length < 2) {
      showToast('Enter a group name');
      return;
    }
    setSaving(true);
    try {
      const detail = await createInboxGroup(groupName.trim(), selected);
      setNameOpen(false);
      router.replace({ pathname: '/messages', params: { tab: 'groups', groupId: detail.group.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.slate800} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder="Search by name..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {CATEGORIES.map((item) => {
            const active = category === item.value;
            const count = (contacts[item.value] ?? []).filter((person) => !excludeIds.has(person.id)).length;
            return (
              <Pressable
                key={item.value}
                onPress={() => setCategory(item.value)}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
              >
                <Ionicons name={item.icon} size={14} color={active ? colors.white : colors.primary} />
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{item.label}</Text>
                <View style={[styles.countPill, active && styles.countPillActive]}>
                  <Text style={[styles.countText, active && styles.countTextActive]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + (multi ? 100 : 40) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !filtered.length ? <Text style={styles.muted}>Loading people…</Text> : null}
        {!loading && !filtered.length ? (
          <Text style={styles.muted}>
            {mode === 'group-members'
              ? 'Everyone in this category is already in the group.'
              : 'No people in this category.'}
          </Text>
        ) : null}

        {filtered.map((person) => {
          const checked = selected.includes(person.id);
          return (
            <Pressable
              key={person.id}
              style={[styles.card, checked && styles.cardSelected]}
              onPress={() => (multi ? toggleSelect(person.id) : void addToInbox(person))}
            >
              <View style={styles.avatar}>
                <Text style={styles.initial}>{(person.name || 'U').trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{person.name}</Text>
                <Text style={styles.meta}>
                  {person.roleLabel}
                  {person.unitNumber ? ` · Apt ${person.unitNumber}` : ''}
                </Text>
                {person.phone ? <Text style={styles.phone}>{person.phone}</Text> : null}
              </View>
              {multi ? (
                <View style={[styles.check, checked && styles.checkOn]}>
                  {checked ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
                </View>
              ) : person.inInbox ? (
                <View style={styles.added}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  <Text style={styles.addedText}>In inbox</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.addBtn}
                  onPress={() => void addToInbox(person)}
                  disabled={addingId === person.id}
                >
                  <Ionicons name="person-add" size={16} color={colors.white} />
                  <Text style={styles.addText}>{addingId === person.id ? 'Adding' : 'Add'}</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {multi ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.footerHint}>{selected.length} selected</Text>
          <Button
            title={mode === 'group-members' ? 'Add to group' : 'Next'}
            loading={saving}
            onPress={() => void finishGroup()}
          />
        </View>
      ) : null}

      <Modal visible={nameOpen} animationType="fade" transparent onRequestClose={() => setNameOpen(false)}>
        <View style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setNameOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Name this group</Text>
            <Input value={groupName} onChangeText={setGroupName} placeholder="Committee chat" autoFocus />
            <Button title="Create group" loading={saving} onPress={() => void createGroup()} />
            <Button title="Cancel" variant="outline" onPress={() => setNameOpen(false)} />
          </View>
        </View>
      </Modal>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + (multi ? 96 : 24) }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { padding: 8, marginLeft: -8 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 12, zIndex: 1 },
  search: {
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    paddingLeft: 40,
    paddingRight: 14,
    fontSize: 14,
    color: colors.text,
  },
  categoryRow: { gap: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  categoryChipActive: { backgroundColor: colors.primary },
  categoryText: { fontWeight: '700', fontSize: 13, color: colors.primary },
  categoryTextActive: { color: colors.white },
  countPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countPillActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  countText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  countTextActive: { color: colors.white },
  list: { padding: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius['2xl'],
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontWeight: '800', color: colors.primary, fontSize: 18 },
  name: { fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  phone: { fontSize: 12, color: colors.text, marginTop: 2, fontWeight: '600' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  added: { alignItems: 'center', gap: 2 },
  addedText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  muted: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  error: { color: colors.error, textAlign: 'center', marginBottom: 8 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: 8,
  },
  footerHint: { textAlign: 'center', fontWeight: '700', color: colors.textSecondary },
  modalWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
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
});
