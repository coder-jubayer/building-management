import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
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
import { PopupHeader } from '../src/components/PopupHeader';
import { Button, Input } from '../src/components/ui';
import { colors, spacing, borderRadius, shadows } from '../src/theme';
import { useAuthStore } from '../src/stores/auth.store';
import { createNotice, deleteNotice, fetchNotices, markNoticesRead } from '../src/services/notices.service';
import { formatNoticeDate } from '../src/utils/date';
import { Building, Notice, canPostNotices, isAppAdmin, isResident } from '../src/types';

export default function NoticesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const poster = canPostNotices(user?.role);
  const appAdmin = isAppAdmin(user?.role);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [canPost, setCanPost] = useState(poster);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadNotices = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchNotices();
      setNotices(data.notices);
      setCanPost(data.canPost);
      setBuildings(data.buildings ?? []);
      setBuildingId((current) => current || data.buildings?.[0]?.id || '');
      if (isResident(user?.role) && data.notices.some((n) => n.unread)) {
        await markNoticesRead(data.notices.filter((n) => n.unread).map((n) => n.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notices');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role]);

  useFocusEffect(
    useCallback(() => {
      void loadNotices();
    }, [loadNotices]),
  );

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setFormError(null);
    setBuildingId(buildings[0]?.id ?? '');
  };

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      setFormError('Title and notice text are required.');
      return;
    }
    if (appAdmin && !buildingId) {
      setFormError('Select a building for this notice.');
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      await createNotice({
        title: title.trim(),
        content: content.trim(),
        buildingId: appAdmin ? buildingId : undefined,
      });
      setCreateOpen(false);
      resetForm();
      await loadNotices();
      showToast('Notice posted');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to post notice');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteNotice(deleteTarget.id);
      setDeleteTarget(null);
      await loadNotices();
      showToast('Notice deleted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.root}>
      <PageHeader
        title="Notices"
        onBack={() => router.back()}
        rightAction={
          canPost ? (
            <Pressable
              onPress={() => {
                resetForm();
                setCreateOpen(true);
              }}
              style={styles.headerAdd}
            >
              <Ionicons name="add" size={22} color={colors.primary} />
            </Pressable>
          ) : undefined
        }
      />

      {canPost ? (
        <View style={styles.composerBar}>
          <Pressable
            style={styles.composerBtn}
            onPress={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            <Text style={styles.composerText}>+ New Notice</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadNotices();
            }}
          />
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !notices.length ? <Text style={styles.muted}>Loading notices…</Text> : null}
        {!loading && !notices.length && !error ? (
          <Text style={styles.muted}>No notices yet.</Text>
        ) : null}

        {notices.map((notice) => (
          <View key={notice.id} style={styles.card}>
            <View style={styles.top}>
              <View style={styles.authorRow}>
                <Text style={styles.author}>{notice.author}</Text>
                {notice.isNew ? (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>New</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.date}>{formatNoticeDate(notice.date || notice.createdAt)}</Text>
            </View>
            <Text style={styles.title}>{notice.title}</Text>
            <Text style={styles.content}>{notice.content}</Text>
            {canPost ? (
              <Pressable style={styles.deleteBtn} onPress={() => setDeleteTarget(notice)}>
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
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
            <PopupHeader title="New notice" onClose={() => setCreateOpen(false)} />
            <Text style={styles.sheetSubtitle}>Residents in this building will be notified.</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Input label="Title" value={title} onChangeText={setTitle} placeholder="Water supply update" />
              <Input
                label="Notice"
                value={content}
                onChangeText={setContent}
                placeholder="Write the announcement…"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                style={styles.multiline}
              />
              {appAdmin ? (
                <>
                  <Text style={styles.fieldLabel}>Building</Text>
                  {buildings.length ? (
                    <View style={styles.chipRow}>
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
                    </View>
                  ) : (
                    <Text style={styles.muted}>No buildings yet.</Text>
                  )}
                </>
              ) : null}
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <Button title="Post notice" loading={creating} onPress={() => void handleCreate()} />
              <Button title="Cancel" variant="outline" onPress={() => setCreateOpen(false)} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!deleteTarget} animationType="fade" transparent onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.confirmWrap}>
          <Pressable style={styles.backdrop} onPress={() => setDeleteTarget(null)} />
          <View style={styles.confirmCard}>
            <PopupHeader title="Delete notice?" onClose={() => setDeleteTarget(null)} />
            <Text style={styles.confirmBody}>{deleteTarget?.title} will be removed for everyone.</Text>
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
  headerAdd: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  composerBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  composerText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  list: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...shadows.sm,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: spacing.sm },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  author: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  newBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  newBadgeText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  date: { fontSize: 12, color: colors.textMuted },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  content: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  deleteText: { color: colors.error, fontWeight: '600', fontSize: 13 },
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
  multiline: { minHeight: 120, paddingTop: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: colors.white },
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
