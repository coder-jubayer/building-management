import { useCallback, useState } from 'react';
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
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../src/components/PageHeader';
import { MediaViewer, MediaViewerItem } from '../src/components/MediaViewer';
import { Button, Input } from '../src/components/ui';
import { colors, spacing, borderRadius, shadows } from '../src/theme';
import { useAuthStore } from '../src/stores/auth.store';
import {
  addComplaintComment,
  createComplaint,
  fetchComplaint,
  fetchComplaints,
  updateComplaint,
} from '../src/services/complaints.service';
import { formatNoticeDate } from '../src/utils/date';
import {
  Building,
  ComplaintCategoryOption,
  ComplaintComment,
  ComplaintStatus,
  ComplaintStatusOption,
  ComplaintTicket,
  ROLE_LABELS,
  UserRole,
  canCreateComplaint,
  canManageComplaints,
  isAppAdmin,
} from '../src/types';

type LocalMedia = { uri: string; name?: string; type?: string; kind: 'image' | 'video' };

const STATUS_TONE: Record<ComplaintStatus, { bg: string; fg: string }> = {
  open: { bg: '#FEF3C7', fg: '#B45309' },
  in_progress: { bg: '#DBEAFE', fg: '#1D4ED8' },
  resolved: { bg: colors.successLight, fg: colors.success },
};

export default function ComplaintsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const creator = canCreateComplaint(user?.role);
  const manager = canManageComplaints(user?.role);
  const appAdmin = isAppAdmin(user?.role);

  const [tickets, setTickets] = useState<ComplaintTicket[]>([]);
  const [categories, setCategories] = useState<ComplaintCategoryOption[]>([]);
  const [statuses, setStatuses] = useState<ComplaintStatusOption[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'all'>('all');
  const [canCreate, setCanCreate] = useState(creator);
  const [canManage, setCanManage] = useState(manager);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selected, setSelected] = useState<ComplaintTicket | null>(null);
  const [comments, setComments] = useState<ComplaintComment[]>([]);
  const [draft, setDraft] = useState('');
  const [commentMedia, setCommentMedia] = useState<LocalMedia[]>([]);
  const [viewer, setViewer] = useState<MediaViewerItem | null>(null);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('plumbing');
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const loadTickets = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchComplaints({
        buildingId: appAdmin ? buildingId || undefined : undefined,
        status: statusFilter,
      });
      setTickets(data.complaints);
      setCategories(data.categories);
      setStatuses(data.statuses);
      setCanCreate(data.canCreate);
      setCanManage(data.canManage);
      setBuildings(data.buildings ?? []);
      setBuildingId((current) => current || data.buildings?.[0]?.id || '');
      setCategory((current) => current || data.categories[0]?.value || 'plumbing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load complaints');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appAdmin, buildingId, statusFilter]);

  useFocusEffect(
    useCallback(() => {
      void loadTickets();
    }, [loadTickets]),
  );

  const openTicket = async (ticket: ComplaintTicket) => {
    try {
      const detail = await fetchComplaint(ticket.id);
      setSelected(detail.complaint);
      setComments(detail.comments);
      setDraft('');
      setCommentMedia([]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open ticket');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory(categories[0]?.value ?? 'plumbing');
    setMedia([]);
    setFormError(null);
  };

  const pickMedia = async () => {
    const remaining = 5 - media.length;
    if (remaining <= 0) {
      setFormError('You can add up to 5 files.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.72,
      selectionLimit: remaining,
      videoMaxDuration: 60,
    });
    if (result.canceled) return;
    setMedia((current) =>
      [
        ...current,
        ...result.assets.map((asset, index) => ({
          uri: asset.uri,
          name: asset.fileName || `media-${Date.now()}-${index}${asset.type === 'video' ? '.mp4' : '.jpg'}`,
          type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          kind: (asset.type === 'video' ? 'video' : 'image') as 'image' | 'video',
        })),
      ].slice(0, 5),
    );
    setFormError(null);
  };

  const handleCreate = async () => {
    if (title.trim().length < 2) {
      setFormError('Enter a complaint title.');
      return;
    }
    if (description.trim().length < 2) {
      setFormError('Describe the issue.');
      return;
    }
    if (!category) {
      setFormError('Select a category.');
      return;
    }
    if (appAdmin && !buildingId) {
      setFormError('Select a building.');
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      await createComplaint({
        title: title.trim(),
        description: description.trim(),
        category,
        buildingId: appAdmin ? buildingId : undefined,
        media,
      });
      setCreateOpen(false);
      resetForm();
      await loadTickets();
      showToast('Ticket submitted');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to submit ticket');
    } finally {
      setCreating(false);
    }
  };

  const handleStatus = async (status: ComplaintStatus) => {
    if (!selected || selected.status === status) return;
    setUpdatingStatus(true);
    try {
      const detail = await updateComplaint(selected.id, { status });
      setSelected(detail.complaint);
      setComments(detail.comments);
      setTickets((current) => current.map((item) => (item.id === detail.complaint.id ? detail.complaint : item)));
      showToast(`Status: ${detail.complaint.statusLabel}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const pickCommentMedia = async () => {
    const remaining = 5 - commentMedia.length;
    if (remaining <= 0) {
      showToast('You can add up to 5 files.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.72,
      selectionLimit: remaining,
    });
    if (result.canceled) return;
    setCommentMedia((current) =>
      [
        ...current,
        ...result.assets.map((asset, index) => ({
          uri: asset.uri,
          name: asset.fileName || `media-${Date.now()}-${index}`,
          type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          kind: (asset.type === 'video' || /^video\//i.test(asset.mimeType || '') ? 'video' : 'image') as
            | 'image'
            | 'video',
        })),
      ].slice(0, 5),
    );
  };

  const handleComment = async () => {
    if (!selected || (draft.trim().length < 1 && !commentMedia.length)) return;
    setSending(true);
    try {
      const comment = await addComplaintComment(
        selected.id,
        draft.trim(),
        commentMedia.map((item) => ({ uri: item.uri, name: item.name, type: item.type })),
      );
      setComments((current) => [...current, comment]);
      setDraft('');
      setCommentMedia([]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSending(false);
    }
  };

  if (selected) {
    const tone = STATUS_TONE[selected.status];
    const roleName = selected.createdByRole
      ? ROLE_LABELS[selected.createdByRole as UserRole] ?? selected.createdByRole
      : 'Resident';
    return (
      <View style={styles.root}>
        <PageHeader title="Ticket" onBack={() => setSelected(null)} />
        <ScrollView
          contentContainerStyle={[styles.detail, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void openTicket(selected).finally(() => setRefreshing(false));
              }}
            />
          }
        >
          <View style={styles.ticketCard}>
            <View style={styles.detailTop}>
              <Text style={styles.detailTitle}>{selected.title}</Text>
              <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.badgeText, { color: tone.fg }]}>{selected.statusLabel}</Text>
              </View>
            </View>
            <View style={styles.ticketMetaRow}>
              <View style={styles.ticketMetaChip}>
                <Ionicons name="construct-outline" size={14} color={colors.primary} />
                <Text style={styles.ticketMetaText}>{selected.categoryLabel}</Text>
              </View>
              <View style={styles.ticketMetaChip}>
                <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.ticketMetaText}>{formatNoticeDate(selected.createdAt)}</Text>
              </View>
            </View>
            <Text style={styles.description}>{selected.description}</Text>
            {selected.media.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
                {selected.media.map((item, index) => (
                  <Pressable
                    key={`${item.url}-${index}`}
                    onPress={() => setViewer({ url: item.url, kind: item.kind === 'video' ? 'video' : 'image' })}
                  >
                    {item.kind === 'image' ? (
                      <Image source={{ uri: item.url }} style={styles.mediaThumb} contentFit="cover" />
                    ) : (
                      <View style={styles.videoThumb}>
                        <Ionicons name="play-circle" size={28} color={colors.white} />
                        <Text style={styles.videoLabel}>Video</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>

          <View style={styles.residentCard}>
            <Text style={styles.residentLabel}>Opened by</Text>
            <View style={styles.residentTop}>
              <View style={styles.residentAvatar}>
                <Text style={styles.residentInitial}>
                  {(selected.createdByName || 'R').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.residentName}>{selected.createdByName}</Text>
                <Text style={styles.residentMeta}>
                  {roleName}
                  {selected.unitNumber ? ` · Apt ${selected.unitNumber}` : ''}
                </Text>
              </View>
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Ionicons name="call-outline" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{selected.createdByPhone || 'Not available'}</Text>
                </View>
              </View>
              {selected.createdByEmail ? (
                <View style={styles.infoItem}>
                  <Ionicons name="mail-outline" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Email</Text>
                    <Text style={styles.infoValue}>{selected.createdByEmail}</Text>
                  </View>
                </View>
              ) : null}
              {selected.unitNumber ? (
                <View style={styles.infoItem}>
                  <Ionicons name="home-outline" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Unit</Text>
                    <Text style={styles.infoValue}>Apt {selected.unitNumber}</Text>
                  </View>
                </View>
              ) : null}
            </View>
            {canManage && !selected.isMine ? (
              <View style={styles.residentActions}>
                {selected.createdByPhone ? (
                  <Pressable
                    style={styles.contactBtn}
                    onPress={() => void Linking.openURL(`tel:${selected.createdByPhone!.replace(/[^\d+]/g, '')}`)}
                  >
                    <Ionicons name="call" size={16} color={colors.primary} />
                    <Text style={styles.contactBtnText}>Call</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.contactBtn, styles.contactBtnPrimary]}
                  onPress={() =>
                    router.push({
                      pathname: '/messages',
                      params: { tab: 'inbox', userId: selected.createdBy },
                    })
                  }
                >
                  <Ionicons name="chatbubble-ellipses" size={16} color={colors.white} />
                  <Text style={[styles.contactBtnText, { color: colors.white }]}>Message</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {canManage ? (
            <View style={styles.ticketCard}>
              <Text style={styles.sectionLabel}>Update status</Text>
              <View style={styles.statusRow}>
                {statuses.map((option) => {
                  const active = selected.status === option.value;
                  const optionTone = STATUS_TONE[option.value];
                  return (
                    <Pressable
                      key={option.value}
                      disabled={updatingStatus}
                      onPress={() => void handleStatus(option.value)}
                      style={[styles.statusChip, active && { backgroundColor: optionTone.bg, borderColor: optionTone.fg }]}
                    >
                      <Text style={[styles.statusChipText, active && { color: optionTone.fg }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>Updates</Text>
          {!comments.length ? <Text style={styles.muted}>No comments yet.</Text> : null}
          {comments.map((comment) => (
            <View key={comment.id} style={[styles.commentCard, comment.isSystem && styles.systemCard]}>
              <View style={styles.commentTop}>
                <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                <Text style={styles.commentTime}>{formatNoticeDate(comment.createdAt)}</Text>
              </View>
              {comment.text ? <Text style={styles.commentText}>{comment.text}</Text> : null}
              {comment.media?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
                  {comment.media.map((item, index) => (
                    <Pressable
                      key={`${item.url}-${index}`}
                      onPress={() => setViewer({ url: item.url, kind: item.kind === 'video' ? 'video' : 'image' })}
                    >
                      {item.kind === 'image' ? (
                        <Image source={{ uri: item.url }} style={styles.mediaThumb} contentFit="cover" />
                      ) : (
                        <View style={styles.videoThumb}>
                          <Ionicons name="play-circle" size={28} color={colors.white} />
                          <Text style={styles.videoLabel}>Video</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ))}
        </ScrollView>

        {selected.canComment ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          >
            {commentMedia.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.composerMediaRow}
              >
                {commentMedia.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={styles.composerPreviewWrap}>
                    {item.kind === 'image' ? (
                      <Image source={{ uri: item.uri }} style={styles.composerPreview} contentFit="cover" />
                    ) : (
                      <View style={styles.composerVideoPreview}>
                        <Ionicons name="videocam" size={18} color={colors.primary} />
                      </View>
                    )}
                    <Pressable
                      style={styles.composerRemove}
                      onPress={() => setCommentMedia((current) => current.filter((_, i) => i !== index))}
                    >
                      <Ionicons name="close" size={12} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <Pressable style={styles.attachBtn} onPress={() => void pickCommentMedia()}>
                <Ionicons name="attach" size={22} color={colors.primary} />
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={canManage ? 'Reply with an update…' : 'Add a follow-up…'}
                placeholderTextColor={colors.textMuted}
                style={styles.composerInput}
                multiline
              />
              <Pressable
                style={styles.send}
                onPress={() => void handleComment()}
                disabled={sending || (!draft.trim() && !commentMedia.length)}
              >
                <Ionicons name="send" size={18} color={colors.white} />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        ) : null}

        {toast ? (
          <View style={[styles.toast, { bottom: insets.bottom + 88 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
        <MediaViewer visible={!!viewer} item={viewer} onClose={() => setViewer(null)} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PageHeader title="Complaints & Fixes" onBack={() => router.back()} />
      {canCreate ? (
        <View style={styles.topBar}>
          <Pressable
            style={styles.raiseBtn}
            onPress={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            <Text style={styles.raiseText}>+ Raise New Ticket</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadTickets();
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
                style={[styles.filterChip, buildingId === building.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, buildingId === building.id && styles.filterTextActive]}>
                  {building.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {([{ value: 'all', label: 'All' }, ...statuses] as Array<{ value: 'all' | ComplaintStatus; label: string }>).map(
            (option) => (
              <Pressable
                key={option.value}
                onPress={() => setStatusFilter(option.value)}
                style={[styles.filterChip, statusFilter === option.value && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, statusFilter === option.value && styles.filterTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ),
          )}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !tickets.length ? <Text style={styles.muted}>Loading tickets…</Text> : null}
        {!loading && !tickets.length && !error ? (
          <Text style={styles.muted}>{canCreate ? 'No tickets yet. Raise one above.' : 'No tickets yet.'}</Text>
        ) : null}

        {tickets.map((ticket) => {
          const tone = STATUS_TONE[ticket.status];
          return (
            <Pressable key={ticket.id} style={styles.card} onPress={() => void openTicket(ticket)}>
              <View style={styles.cardTop}>
                <Text style={styles.title}>{ticket.title}</Text>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.badgeText, { color: tone.fg }]}>{ticket.statusLabel}</Text>
                </View>
              </View>
              <View style={styles.meta}>
                <Text style={styles.metaText}>
                  <Ionicons name="construct" size={12} color={colors.textSecondary} /> {ticket.categoryLabel}
                </Text>
                <Text style={styles.metaText}>{formatNoticeDate(ticket.createdAt)}</Text>
              </View>
              {canManage ? (
                <View style={styles.listResident}>
                  <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listResidentName}>
                      {ticket.createdByName}
                      {ticket.unitNumber ? ` · Apt ${ticket.unitNumber}` : ''}
                    </Text>
                    {ticket.createdByPhone ? (
                      <Text style={styles.listResidentPhone}>{ticket.createdByPhone}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </Pressable>
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
            <Text style={styles.sheetTitle}>Raise ticket</Text>
            <Text style={styles.sheetSubtitle}>Committee can track status and reply with updates.</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Input label="Title" value={title} onChangeText={setTitle} placeholder="Leaking pipe in bathroom" />
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.catGrid}>
                {(categories.length ? categories : []).map((option) => {
                  const active = category === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setCategory(option.value)}
                      style={[styles.catTile, active && styles.catTileActive]}
                    >
                      <Text style={[styles.catText, active && styles.catTextActive]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Input
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="What happened, where, and when?"
                multiline
                numberOfLines={4}
                style={styles.multiline}
              />
              <Text style={styles.fieldLabel}>Photos / videos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
                {media.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={styles.previewWrap}>
                    {item.kind === 'image' ? (
                      <Image source={{ uri: item.uri }} style={styles.preview} contentFit="cover" />
                    ) : (
                      <View style={styles.videoPreview}>
                        <Ionicons name="videocam" size={20} color={colors.primary} />
                      </View>
                    )}
                    <Pressable
                      style={styles.removeImg}
                      onPress={() => setMedia((current) => current.filter((_, i) => i !== index))}
                    >
                      <Ionicons name="close" size={14} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
                {media.length < 5 ? (
                  <Pressable style={styles.addImg} onPress={() => void pickMedia()}>
                    <Ionicons name="add" size={22} color={colors.primary} />
                    <Text style={styles.addImgText}>Add</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <Button title="Submit ticket" loading={creating} onPress={() => void handleCreate()} />
              <Button title="Cancel" variant="outline" onPress={() => setCreateOpen(false)} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: { padding: spacing.md, gap: 12 },
  raiseBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    ...shadows.md,
  },
  raiseText: { color: colors.white, fontWeight: '600' },
  list: { paddingHorizontal: spacing.md, gap: 12, paddingBottom: 40 },
  chipRow: { gap: 8, paddingBottom: 4 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  filterChipActive: { backgroundColor: colors.slate800 },
  filterText: { fontWeight: '600', fontSize: 13, color: colors.text },
  filterTextActive: { color: colors.white },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  title: { flex: 1, fontWeight: '600', color: colors.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 13, color: colors.textSecondary },
  reporterLine: { marginTop: 8, fontSize: 12, color: colors.textMuted },
  listResident: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  listResidentName: { fontSize: 12, fontWeight: '700', color: colors.text },
  listResidentPhone: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  residentCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 12,
    ...shadows.sm,
  },
  residentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  residentTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  residentAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  residentInitial: { fontSize: 20, fontWeight: '800', color: colors.primary },
  residentName: { fontSize: 16, fontWeight: '700', color: colors.text },
  residentMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  residentPhone: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },
  residentHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  infoGrid: { gap: 10 },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  residentActions: { flexDirection: 'row', gap: 8 },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
  },
  contactBtnPrimary: { backgroundColor: colors.primary },
  contactBtnText: { fontWeight: '700', color: colors.primary },
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
  detail: { padding: spacing.md, gap: spacing.md },
  ticketCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 12,
    ...shadows.sm,
  },
  detailTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.text },
  ticketMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ticketMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ticketMetaText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  metaLine: { color: colors.textSecondary, marginTop: -8 },
  reporter: { fontSize: 13, color: colors.textMuted, marginTop: -8 },
  description: { fontSize: 15, color: colors.text, lineHeight: 22 },
  mediaRow: { gap: 10, paddingVertical: 4 },
  mediaThumb: { width: 96, height: 96, borderRadius: 12 },
  videoThumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: colors.slate800,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  videoLabel: { color: colors.white, fontSize: 11, fontWeight: '700' },
  sectionLabel: { fontWeight: '700', color: colors.text },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.surface,
  },
  statusChipText: { fontWeight: '700', fontSize: 12, color: colors.textSecondary },
  commentCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  systemCard: { backgroundColor: colors.primaryLight, borderColor: colors.primaryMuted },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  commentAuthor: { fontWeight: '700', color: colors.text },
  commentTime: { fontSize: 11, color: colors.textMuted },
  commentText: { color: colors.textSecondary, lineHeight: 20 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    width: '100%',
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    maxHeight: 120,
  },
  composerMediaRow: {
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  composerPreviewWrap: { width: 56, height: 56 },
  composerPreview: { width: 56, height: 56, borderRadius: 10 },
  composerVideoPreview: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
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
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catTile: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    backgroundColor: colors.surface,
  },
  catTileActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  catText: { fontWeight: '700', fontSize: 13, color: colors.text },
  catTextActive: { color: colors.primaryDark },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  previewWrap: { width: 72, height: 72 },
  preview: { width: 72, height: 72, borderRadius: 12 },
  videoPreview: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeImg: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImg: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImgText: { fontSize: 11, fontWeight: '700', color: colors.primary, marginTop: 2 },
});
