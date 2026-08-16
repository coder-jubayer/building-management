import { useCallback, useEffect, useState } from 'react';
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
  Switch,
  BackHandler,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../src/components/PageHeader';
import { Button, Input } from '../src/components/ui';
import { colors, spacing, borderRadius, shadows } from '../src/theme';
import { useAuthStore } from '../src/stores/auth.store';
import {
  addCandidate,
  castVote,
  createElection,
  deleteCandidate,
  deleteElection,
  fetchElection,
  fetchElections,
  updateElection,
} from '../src/services/elections.service';
import {
  Building,
  ElectionCandidate,
  ElectionStatus,
  ElectionSummary,
  canManageElections,
  isAppAdmin,
} from '../src/types';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toYmd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toHm(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function combineLocal(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year || 0, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const STATUS_STYLE: Record<ElectionStatus, { bg: string; fg: string; label: string }> = {
  upcoming: { bg: colors.warningLight, fg: colors.warning, label: 'Upcoming' },
  open: { bg: colors.emeraldLight, fg: '#065F46', label: 'Open' },
  closed: { bg: colors.slate100, fg: colors.textSecondary, label: 'Closed' },
};

export default function VotingScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const manager = canManageElections(user?.role);
  const appAdmin = isAppAdmin(user?.role);

  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [canManage, setCanManage] = useState(manager);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selected, setSelected] = useState<ElectionSummary | null>(null);
  const [candidates, setCandidates] = useState<ElectionCandidate[]>([]);
  const [votingId, setVotingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [position, setPosition] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(toYmd(new Date()));
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState(toYmd(new Date(Date.now() + 7 * 86_400_000)));
  const [endTime, setEndTime] = useState('23:59');
  const [showResults, setShowResults] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [candidateOpen, setCandidateOpen] = useState(false);
  const [savingCandidate, setSavingCandidate] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [candidateUnit, setCandidateUnit] = useState('');
  const [candidateImage, setCandidateImage] = useState<{ uri: string; name?: string; type?: string } | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<'election' | ElectionCandidate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [voteTarget, setVoteTarget] = useState<ElectionCandidate | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const applyDetail = (election: ElectionSummary, nextCandidates: ElectionCandidate[]) => {
    setSelected(election);
    setCandidates(nextCandidates);
    setElections((current) => current.map((item) => (item.id === election.id ? election : item)));
  };

  const loadElections = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchElections(appAdmin ? buildingId || undefined : undefined);
      setElections(data.elections);
      setCanManage(data.canManage);
      setBuildings(data.buildings ?? []);
      setBuildingId((current) => current || data.buildings?.[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load elections');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appAdmin, buildingId]);

  useFocusEffect(
    useCallback(() => {
      void loadElections();
    }, [loadElections]),
  );

  const closeElection = useCallback(() => {
    setSelected(null);
    setCandidates([]);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!selected) return;
      event.preventDefault();
      closeElection();
    });
    return unsubscribe;
  }, [navigation, selected, closeElection]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!selected) return false;
      closeElection();
      return true;
    });
    return () => sub.remove();
  }, [selected, closeElection]);

  const resetCreateForm = () => {
    const now = new Date();
    setTitle('Committee Election');
    setPosition('President');
    setDescription('');
    setStartDate(toYmd(now));
    setStartTime(toHm(now));
    setEndDate(toYmd(new Date(now.getTime() + 7 * 86_400_000)));
    setEndTime('23:59');
    setShowResults(false);
    setFormError(null);
  };

  const openElection = async (election: ElectionSummary) => {
    try {
      const detail = await fetchElection(election.id);
      applyDetail(detail.election, detail.candidates);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open election');
    }
  };

  const handleCreate = async () => {
    if (title.trim().length < 2) {
      setFormError('Enter an election title.');
      return;
    }
    if (position.trim().length < 2) {
      setFormError('Enter the position, e.g. President.');
      return;
    }
    const startsAt = combineLocal(startDate, startTime);
    const endsAt = combineLocal(endDate, endTime);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      setFormError('Use dates like 2026-08-15 and times like 18:00.');
      return;
    }
    if (endsAt <= startsAt) {
      setFormError('End date must be after the start date.');
      return;
    }
    if (appAdmin && !buildingId) {
      setFormError('Select a building.');
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      const detail = await createElection({
        title: title.trim(),
        position: position.trim(),
        description: description.trim() || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        showResults,
        buildingId: appAdmin ? buildingId : undefined,
      });
      setCreateOpen(false);
      await loadElections();
      applyDetail(detail.election, detail.candidates);
      showToast('Election created');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create election');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = () => {
    if (!selected) return;
    const start = new Date(selected.startsAt);
    const end = new Date(selected.endsAt);
    setTitle(selected.title);
    setPosition(selected.position);
    setDescription(selected.description ?? '');
    setStartDate(toYmd(start));
    setStartTime(toHm(start));
    setEndDate(toYmd(end));
    setEndTime(toHm(end));
    setShowResults(selected.showResults);
    setFormError(null);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!selected) return;
    if (title.trim().length < 2 || position.trim().length < 2) {
      setFormError('Title and position are required.');
      return;
    }
    const startsAt = combineLocal(startDate, startTime);
    const endsAt = combineLocal(endDate, endTime);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      setFormError('Check the voting period dates.');
      return;
    }
    setSavingEdit(true);
    setFormError(null);
    try {
      const detail = await updateElection(selected.id, {
        title: title.trim(),
        position: position.trim(),
        description: description.trim() || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        showResults,
      });
      setEditOpen(false);
      applyDetail(detail.election, detail.candidates);
      showToast('Election updated');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update election');
    } finally {
      setSavingEdit(false);
    }
  };

  const pickCandidatePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setCandidateError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.72,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setCandidateImage({
      uri: asset.uri,
      name: asset.fileName || `candidate-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    });
    setCandidateError(null);
  };

  const handleAddCandidate = async () => {
    if (!selected) return;
    if (candidateName.trim().length < 2) {
      setCandidateError('Enter the candidate name.');
      return;
    }
    setSavingCandidate(true);
    setCandidateError(null);
    try {
      const detail = await addCandidate({
        electionId: selected.id,
        name: candidateName.trim(),
        unitNumber: candidateUnit.trim() || undefined,
        image: candidateImage ?? undefined,
      });
      setCandidateOpen(false);
      setCandidateName('');
      setCandidateUnit('');
      setCandidateImage(null);
      applyDetail(detail.election, detail.candidates);
      showToast('Candidate added');
    } catch (err) {
      setCandidateError(err instanceof Error ? err.message : 'Failed to add candidate');
    } finally {
      setSavingCandidate(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !selected) return;
    setDeleting(true);
    try {
      if (deleteTarget === 'election') {
        await deleteElection(selected.id);
        setDeleteTarget(null);
        setSelected(null);
        setCandidates([]);
        await loadElections();
        showToast('Election deleted');
      } else {
        const detail = await deleteCandidate(selected.id, deleteTarget.id);
        setDeleteTarget(null);
        applyDetail(detail.election, detail.candidates);
        showToast('Candidate removed');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleVote = async () => {
    if (!selected || !voteTarget) return;
    setVotingId(voteTarget.id);
    try {
      const detail = await castVote(selected.id, voteTarget.id);
      setVoteTarget(null);
      applyDetail(detail.election, detail.candidates);
      showToast(`Vote recorded for ${voteTarget.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Vote failed');
    } finally {
      setVotingId(null);
    }
  };

  if (selected) {
    const tone = STATUS_STYLE[selected.status];
    return (
      <View style={styles.root}>
        <PageHeader title="Election" onBack={closeElection} />
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void openElection(selected).finally(() => setRefreshing(false));
              }}
            />
          }
        >
          <View style={styles.banner}>
            <View style={styles.bannerTop}>
              <Text style={styles.bannerTitle}>{selected.title}</Text>
              <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.badgeText, { color: tone.fg }]}>{tone.label}</Text>
              </View>
            </View>
            <Text style={styles.bannerText}>
              {selected.description || `Select one candidate for ${selected.position}.`} {selected.periodLabel}.
            </Text>
          </View>

          {selected.canManage ? (
            <View style={styles.manageRow}>
              <Pressable style={styles.manageBtn} onPress={openEdit}>
                <Ionicons name="calendar-outline" size={16} color={colors.primaryDark} />
                <Text style={styles.manageText}>Period & results</Text>
              </Pressable>
              <Pressable
                style={styles.manageBtn}
                onPress={() => {
                  setCandidateName('');
                  setCandidateUnit('');
                  setCandidateImage(null);
                  setCandidateError(null);
                  setCandidateOpen(true);
                }}
              >
                <Ionicons name="person-add-outline" size={16} color={colors.primaryDark} />
                <Text style={styles.manageText}>Add candidate</Text>
              </Pressable>
              <Pressable style={styles.manageDanger} onPress={() => setDeleteTarget('election')}>
                <Ionicons name="trash-outline" size={16} color={colors.error} />
              </Pressable>
            </View>
          ) : null}

          {!candidates.length ? (
            <Text style={styles.muted}>
              {selected.canManage ? 'Add candidates so residents can vote.' : 'No candidates yet.'}
            </Text>
          ) : null}

          {selected.resultsVisible && typeof selected.totalVotes === 'number' ? (
            <Text style={styles.resultsLabel}>{selected.totalVotes} vote{selected.totalVotes === 1 ? '' : 's'} counted</Text>
          ) : null}

          {candidates.map((candidate) => {
            const selectedVote = selected.myCandidateId === candidate.id;
            const locked = selected.hasVoted && !selectedVote;
            return (
              <View key={candidate.id} style={[styles.card, selectedVote && styles.cardSelected]}>
                {candidate.image ? (
                  <Image source={{ uri: candidate.image }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>{initials(candidate.name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{candidate.name}</Text>
                  <Text style={styles.apt}>{candidate.unitNumber ? `Apt ${candidate.unitNumber}` : selected.position}</Text>
                  {selected.resultsVisible && candidate.votes !== undefined ? (
                    <View style={styles.resultRow}>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width: `${Math.max(candidate.percent ?? 0, candidate.votes > 0 ? 6 : 0)}%` }]} />
                      </View>
                      <Text style={styles.percent}>{candidate.percent ?? 0}% · {candidate.votes}</Text>
                    </View>
                  ) : null}
                </View>
                {selected.canVote ? (
                  <Pressable
                    disabled={locked || votingId === candidate.id}
                    onPress={() => setVoteTarget(candidate)}
                    style={[styles.voteBtn, selectedVote && styles.voteBtnSelected, locked && styles.voteBtnLocked]}
                  >
                    <Text style={[styles.voteText, selectedVote && { color: colors.white }, locked && { color: colors.textMuted }]}>
                      {selectedVote ? 'Voted' : 'Vote'}
                    </Text>
                  </Pressable>
                ) : selected.hasVoted ? (
                  <View style={[styles.voteBtn, selectedVote ? styles.voteBtnSelected : styles.voteBtnLocked]}>
                    <Text style={[styles.voteText, selectedVote && { color: colors.white }, !selectedVote && { color: colors.textMuted }]}>
                      {selectedVote ? 'Voted' : '—'}
                    </Text>
                  </View>
                ) : null}
                {selected.canManage ? (
                  <Pressable style={styles.iconDanger} onPress={() => setDeleteTarget(candidate)}>
                    <Ionicons name="close" size={16} color={colors.error} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
        {toast ? (
          <View style={[styles.toast, { bottom: insets.bottom + 24 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
        {sheetModals()}
      </View>
    );
  }

  function sheetModals() {
    return (
      <>
        <Modal visible={createOpen || editOpen} animationType="slide" transparent onRequestClose={() => { setCreateOpen(false); setEditOpen(false); }}>
          <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.backdrop} onPress={() => { setCreateOpen(false); setEditOpen(false); }} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>{editOpen ? 'Edit election' : 'Create election'}</Text>
              <Text style={styles.sheetSubtitle}>Set the position and voting period. Residents can vote once.</Text>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
                <Input label="Title" value={title} onChangeText={setTitle} placeholder="Committee Election 2026" />
                <Input label="Position" value={position} onChangeText={setPosition} placeholder="President" />
                <Input
                  label="Description (optional)"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Select one candidate for President."
                />
                <View style={styles.dateRow}>
                  <View style={{ flex: 1 }}>
                    <Input label="Start date" value={startDate} onChangeText={setStartDate} placeholder="2026-08-15" />
                  </View>
                  <View style={{ width: 110 }}>
                    <Input label="Time" value={startTime} onChangeText={setStartTime} placeholder="09:00" />
                  </View>
                </View>
                <View style={styles.dateRow}>
                  <View style={{ flex: 1 }}>
                    <Input label="End date" value={endDate} onChangeText={setEndDate} placeholder="2026-08-22" />
                  </View>
                  <View style={{ width: 110 }}>
                    <Input label="Time" value={endTime} onChangeText={setEndTime} placeholder="23:59" />
                  </View>
                </View>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchTitle}>Show results to residents</Text>
                    <Text style={styles.switchHint}>If off, only committee can see vote counts.</Text>
                  </View>
                  <Switch value={showResults} onValueChange={setShowResults} trackColor={{ true: colors.primary }} />
                </View>
                {formError ? <Text style={styles.error}>{formError}</Text> : null}
                <Button
                  title={editOpen ? 'Save changes' : 'Create election'}
                  loading={editOpen ? savingEdit : creating}
                  onPress={() => void (editOpen ? handleEdit() : handleCreate())}
                />
                <Button title="Cancel" variant="outline" onPress={() => { setCreateOpen(false); setEditOpen(false); }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal visible={candidateOpen} animationType="slide" transparent onRequestClose={() => setCandidateOpen(false)}>
          <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.backdrop} onPress={() => setCandidateOpen(false)} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Add candidate</Text>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
                <Input label="Name" value={candidateName} onChangeText={setCandidateName} placeholder="Sarah Jenkins" />
                <Input label="Apt / unit (optional)" value={candidateUnit} onChangeText={setCandidateUnit} placeholder="B-204" />
                <Text style={styles.fieldLabel}>Photo (optional)</Text>
                <Pressable style={styles.photoBtn} onPress={() => void pickCandidatePhoto()}>
                  {candidateImage ? (
                    <Image source={{ uri: candidateImage.uri }} style={styles.photoPreview} contentFit="cover" />
                  ) : (
                    <Ionicons name="camera-outline" size={22} color={colors.primary} />
                  )}
                  <Text style={styles.photoText}>{candidateImage ? 'Change photo' : 'Choose photo'}</Text>
                </Pressable>
                {candidateError ? <Text style={styles.error}>{candidateError}</Text> : null}
                <Button title="Add candidate" loading={savingCandidate} onPress={() => void handleAddCandidate()} />
                <Button title="Cancel" variant="outline" onPress={() => setCandidateOpen(false)} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal visible={!!voteTarget} animationType="fade" transparent onRequestClose={() => setVoteTarget(null)}>
          <View style={styles.confirmWrap}>
            <Pressable style={styles.backdrop} onPress={() => setVoteTarget(null)} />
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Cast your vote?</Text>
              <Text style={styles.confirmBody}>
                {voteTarget ? `Vote for ${voteTarget.name}. You can only vote once.` : ''}
              </Text>
              <View style={styles.confirmActions}>
                <Button title="Cancel" variant="outline" onPress={() => setVoteTarget(null)} />
                <Button title="Vote" loading={!!votingId} onPress={() => void handleVote()} />
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={!!deleteTarget} animationType="fade" transparent onRequestClose={() => setDeleteTarget(null)}>
          <View style={styles.confirmWrap}>
            <Pressable style={styles.backdrop} onPress={() => setDeleteTarget(null)} />
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>
                {deleteTarget === 'election' ? 'Delete election?' : 'Remove candidate?'}
              </Text>
              <Text style={styles.confirmBody}>
                {deleteTarget === 'election'
                  ? `${selected?.title ?? 'This election'} and all votes will be removed.`
                  : deleteTarget
                    ? `${deleteTarget.name} will be removed.`
                    : ''}
              </Text>
              <View style={styles.confirmActions}>
                <Button title="Cancel" variant="outline" onPress={() => setDeleteTarget(null)} />
                <Button title="Delete" variant="danger" loading={deleting} onPress={() => void handleDelete()} />
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <View style={styles.root}>
      <PageHeader title="Elections" onBack={() => router.back()} />
      {canManage ? (
        <View style={styles.composerBar}>
          <Pressable
            style={styles.composerBtn}
            onPress={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            <Text style={styles.composerText}>+ Create election</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadElections();
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
                <Text style={[styles.chipText, buildingId === building.id && styles.chipTextActive]}>{building.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !elections.length ? <Text style={styles.muted}>Loading elections…</Text> : null}
        {!loading && !elections.length && !error ? (
          <Text style={styles.muted}>{canManage ? 'Create an election to get started.' : 'No elections yet.'}</Text>
        ) : null}

        {elections.map((election) => {
          const tone = STATUS_STYLE[election.status];
          return (
            <Pressable key={election.id} style={styles.listCard} onPress={() => void openElection(election)}>
              <View style={styles.listTop}>
                <Text style={styles.listTitle}>{election.title}</Text>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.badgeText, { color: tone.fg }]}>{tone.label}</Text>
                </View>
              </View>
              <Text style={styles.listMeta}>{election.position} · {election.candidateCount} candidate{election.candidateCount === 1 ? '' : 's'}</Text>
              <Text style={styles.listPeriod}>{election.periodLabel}</Text>
              {election.hasVoted ? <Text style={styles.votedHint}>You voted</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
      {sheetModals()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
  composerText: { color: colors.white, fontWeight: '700' },
  content: { padding: spacing.md, gap: spacing.md },
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
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  listTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  listTitle: { flex: 1, fontWeight: '700', fontSize: 16, color: colors.text },
  listMeta: { marginTop: 6, color: colors.textSecondary, fontSize: 13 },
  listPeriod: { marginTop: 2, color: colors.success, fontSize: 13, fontWeight: '600' },
  votedHint: { marginTop: 8, color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  banner: {
    backgroundColor: colors.emeraldLight,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius['2xl'],
    padding: spacing.md,
    gap: 8,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerTitle: { flex: 1, fontWeight: '700', color: '#065F46' },
  bannerText: { fontSize: 13, color: '#059669' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  manageRow: { flexDirection: 'row', gap: 8 },
  manageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
  },
  manageText: { color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
  manageDanger: {
    width: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsLabel: { fontWeight: '700', color: colors.textSecondary },
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
  cardSelected: { borderColor: colors.primary, borderWidth: 1.5 },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: colors.slate200 },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontWeight: '700', color: colors.primaryDark },
  name: { fontWeight: '700', color: colors.text },
  apt: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  resultRow: { marginTop: 8, gap: 4 },
  track: { height: 6, backgroundColor: colors.slate100, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  percent: { fontSize: 11, color: colors.textMuted },
  voteBtn: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  voteBtnSelected: { backgroundColor: colors.primary },
  voteBtnLocked: { backgroundColor: colors.slate100, opacity: 0.5 },
  voteText: { fontWeight: '600', fontSize: 13, color: colors.primaryDark },
  iconDanger: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
  dateRow: { flexDirection: 'row', gap: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { fontWeight: '700', color: colors.text },
  switchHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: 10,
  },
  photoPreview: { width: 48, height: 48, borderRadius: 24 },
  photoText: { fontWeight: '600', color: colors.primaryDark },
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
