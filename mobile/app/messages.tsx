import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Linking,
  Image,
  Modal,
  BackHandler,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, shadows } from '../src/theme';
import { MediaViewer, MediaViewerItem } from '../src/components/MediaViewer';
import { Button, Input } from '../src/components/ui';
import {
  contactSeller,
  fetchMarketplaceChats,
  fetchMarketplaceThread,
  sendMarketplaceMessage,
} from '../src/services/marketplace.service';
import {
  fetchInboxGroup,
  fetchInboxGroups,
  fetchInboxThread,
  fetchInboxThreads,
  openInboxThread,
  renameInboxGroup,
  sendInboxGroupMessage,
  sendInboxMessage,
  uploadInboxGroupPhoto,
} from '../src/services/inbox.service';
import { formatChatTime } from '../src/utils/date';
import {
  InboxChatMessage,
  InboxGroup,
  InboxGroupMessage,
  InboxThread,
  MarketplaceChatMessage,
  MarketplaceThread,
  ROLE_LABELS,
  UserRole,
} from '../src/types';

type TabKey = 'marketplace' | 'inbox' | 'groups';
type ChatKind = TabKey;

function firstParam(value?: string | string[]): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function roleLabel(role?: string) {
  if (!role) return '';
  return ROLE_LABELS[role as UserRole] ?? role.replace(/_/g, ' ');
}

function recency(item: { lastMessageAt?: string; updatedAt?: string }) {
  const iso = item.lastMessageAt || item.updatedAt;
  return iso ? new Date(iso).getTime() : 0;
}

function sortByRecency<T extends { lastMessageAt?: string; updatedAt?: string }>(items: T[]) {
  return [...items].sort((a, b) => recency(b) - recency(a));
}

function SeenTicks({ seen }: { seen?: boolean }) {
  return (
    <Ionicons
      name={seen ? 'checkmark-done' : 'checkmark'}
      size={14}
      color={seen ? '#93C5FD' : '#C7D2FE'}
      style={{ marginLeft: 4 }}
    />
  );
}

function TabBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={styles.tabBadge}>
      <Text style={styles.tabBadgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

export default function MessagesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    tab?: string;
    listingId?: string;
    userId?: string;
    threadId?: string;
    groupId?: string;
  }>();
  const scrollRef = useRef<ScrollView>(null);
  const openedKey = useRef('');

  const initialTab = firstParam(params.tab);
  const [tab, setTab] = useState<TabKey>(
    initialTab === 'marketplace' || initialTab === 'groups' ? initialTab : 'inbox',
  );
  const [marketSearch, setMarketSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [marketThreads, setMarketThreads] = useState<MarketplaceThread[]>([]);
  const [inboxThreads, setInboxThreads] = useState<InboxThread[]>([]);
  const [groups, setGroups] = useState<InboxGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [chatKind, setChatKind] = useState<ChatKind | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState('');
  const [chatSubtitle, setChatSubtitle] = useState('');
  const [chatImage, setChatImage] = useState<string | undefined>();
  const [chatPhone, setChatPhone] = useState<string | undefined>();
  const [activeGroup, setActiveGroup] = useState<InboxGroup | null>(null);
  const [messages, setMessages] = useState<Array<MarketplaceChatMessage | InboxChatMessage | InboxGroupMessage>>([]);
  const [draft, setDraft] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; name?: string; type?: string } | null>(null);
  const [viewer, setViewer] = useState<MediaViewerItem | null>(null);
  const [sending, setSending] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const loadLists = useCallback(async () => {
    setError(null);
    try {
      const [market, inbox, groupList] = await Promise.all([
        fetchMarketplaceChats(),
        fetchInboxThreads(),
        fetchInboxGroups(),
      ]);
      setMarketThreads(sortByRecency(market));
      setInboxThreads(sortByRecency(inbox));
      setGroups(sortByRecency(groupList));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const applyMarketThread = (thread: MarketplaceThread, nextMessages: MarketplaceChatMessage[]) => {
    setChatKind('marketplace');
    setChatId(thread.id);
    setActiveGroup(null);
    setChatTitle(thread.listingTitle);
    setChatSubtitle(thread.isSeller ? `Buyer · ${thread.otherName}` : `Seller · ${thread.otherName}`);
    setChatImage(thread.listingImage);
    setChatPhone(undefined);
    setMessages(nextMessages);
    setMarketThreads((current) => sortByRecency([thread, ...current.filter((item) => item.id !== thread.id)]));
  };

  const applyInboxThread = (
    thread: InboxThread,
    nextMessages: InboxChatMessage[],
    phone?: string,
  ) => {
    setChatKind('inbox');
    setChatId(thread.id);
    setActiveGroup(null);
    setChatTitle(thread.otherName);
    setChatSubtitle(roleLabel(thread.otherRole));
    setChatImage(undefined);
    setChatPhone(phone);
    setMessages(nextMessages);
    setInboxThreads((current) => sortByRecency([{ ...thread, unread: 0 }, ...current.filter((item) => item.id !== thread.id)]));
  };

  const applyGroup = (group: InboxGroup, nextMessages: InboxGroupMessage[]) => {
    setChatKind('groups');
    setChatId(group.id);
    setActiveGroup(group);
    setChatTitle(group.name);
    setChatSubtitle(`${group.memberCount} members`);
    setChatImage(group.photo);
    setChatPhone(undefined);
    setMessages(nextMessages);
    setGroups((current) => sortByRecency([{ ...group, unread: 0 }, ...current.filter((item) => item.id !== group.id)]));
  };

  const openMarketChat = async (threadId: string, silent = false) => {
    try {
      const detail = await fetchMarketplaceThread(threadId);
      applyMarketThread(detail.thread, detail.messages);
    } catch (err) {
      if (!silent) showToast(err instanceof Error ? err.message : 'Failed to open chat');
    }
  };

  const openListingChat = async (listingId: string) => {
    try {
      setTab('marketplace');
      const detail = await contactSeller(listingId);
      applyMarketThread(detail.thread, detail.messages);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to contact seller');
    }
  };

  const openUserChat = async (userId: string, phone?: string) => {
    try {
      setTab('inbox');
      const detail = await openInboxThread(userId);
      applyInboxThread(detail.thread, detail.messages, phone);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to open inbox');
    }
  };

  const openInboxChat = async (threadId: string, phone?: string, silent = false) => {
    try {
      const detail = await fetchInboxThread(threadId);
      applyInboxThread(detail.thread, detail.messages, phone);
    } catch (err) {
      if (!silent) showToast(err instanceof Error ? err.message : 'Failed to open chat');
    }
  };

  const openGroupChat = async (groupId: string, silent = false) => {
    try {
      setTab('groups');
      const detail = await fetchInboxGroup(groupId);
      applyGroup(detail.group, detail.messages);
    } catch (err) {
      if (!silent) showToast(err instanceof Error ? err.message : 'Failed to open group');
    }
  };

  useFocusEffect(
    useCallback(() => {
      void loadLists();
      const listingId = firstParam(params.listingId);
      const userId = firstParam(params.userId);
      const threadId = firstParam(params.threadId);
      const groupId = firstParam(params.groupId);
      const nextTab = firstParam(params.tab);
      if (nextTab === 'marketplace' || nextTab === 'inbox' || nextTab === 'groups') setTab(nextTab);
      const key = `${nextTab}|${listingId}|${userId}|${threadId}|${groupId}`;
      if (!listingId && !userId && !threadId && !groupId) return;
      if (openedKey.current === key) return;
      openedKey.current = key;
      if (listingId) void openListingChat(listingId);
      else if (userId) void openUserChat(userId);
      else if (groupId) void openGroupChat(groupId);
      else if (threadId && nextTab === 'marketplace') void openMarketChat(threadId);
      else if (threadId) void openInboxChat(threadId);
    }, [loadLists, params.listingId, params.userId, params.threadId, params.groupId, params.tab]),
  );

  useEffect(() => {
    if (!chatId || !chatKind) return;
    const timer = setInterval(() => {
      if (chatKind === 'marketplace') void openMarketChat(chatId, true);
      else if (chatKind === 'inbox') void openInboxChat(chatId, chatPhone, true);
      else void openGroupChat(chatId, true);
    }, 4000);
    return () => clearInterval(timer);
  }, [chatId, chatKind, chatPhone]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, chatId]);

  const marketUnread = marketThreads.filter((item) => item.unread > 0).length;
  const inboxUnread = inboxThreads.filter((item) => item.unread > 0).length;
  const groupUnread = groups.filter((item) => item.unread > 0).length;

  const filteredMarket = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    if (!q) return marketThreads;
    return marketThreads.filter(
      (thread) =>
        thread.listingTitle.toLowerCase().includes(q) || thread.otherName.toLowerCase().includes(q),
    );
  }, [marketThreads, marketSearch]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  const pickChatPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.78,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPendingPhoto({
      uri: asset.uri,
      name: asset.fileName || 'photo.jpg',
      type: asset.mimeType || 'image/jpeg',
    });
  };

  const handleSend = async () => {
    if (!chatId || !chatKind || sending) return;
    if (!draft.trim() && !pendingPhoto) return;
    setSending(true);
    const text = draft.trim();
    const photo = pendingPhoto;
    setDraft('');
    setPendingPhoto(null);
    try {
      if (chatKind === 'marketplace') {
        const result = await sendMarketplaceMessage(chatId, text, photo || undefined);
        setMessages((current) => [...current, result.message]);
        setMarketThreads((current) =>
          sortByRecency([result.thread, ...current.filter((item) => item.id !== result.thread.id)]),
        );
      } else if (chatKind === 'inbox') {
        const result = await sendInboxMessage(chatId, text, photo || undefined);
        setMessages((current) => [...current, result.message]);
        setInboxThreads((current) =>
          sortByRecency([result.thread, ...current.filter((item) => item.id !== result.thread.id)]),
        );
      } else {
        const result = await sendInboxGroupMessage(chatId, text, photo || undefined);
        setMessages((current) => [...current, result.message]);
        setActiveGroup(result.group);
        setChatTitle(result.group.name);
        setGroups((current) =>
          sortByRecency([result.group, ...current.filter((item) => item.id !== result.group.id)]),
        );
      }
    } catch (err) {
      setDraft(text);
      setPendingPhoto(photo);
      showToast(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const callNumber = async (phone?: string) => {
    if (!phone) return;
    try {
      await Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
    } catch {
      showToast(phone);
    }
  };

  const pickGroupPhoto = async () => {
    if (!activeGroup || uploadingPhoto) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast('Photo library permission is required.');
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
    setUploadingPhoto(true);
    try {
      const group = await uploadInboxGroupPhoto(activeGroup.id, {
        uri: asset.uri,
        name: asset.fileName || 'group.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      setActiveGroup(group);
      setChatImage(group.photo);
      setGroups((current) => current.map((item) => (item.id === group.id ? group : item)));
      showToast('Group photo updated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const closeChat = useCallback(() => {
    setChatKind(null);
    setChatId(null);
    setActiveGroup(null);
    setMessages([]);
    setDraft('');
    setPendingPhoto(null);
    setMenuOpen(false);
    setMembersOpen(false);
    setRenameOpen(false);
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (renameOpen || membersOpen || menuOpen) {
        event.preventDefault();
        setRenameOpen(false);
        setMembersOpen(false);
        setMenuOpen(false);
        return;
      }
      if (!chatId) return;
      event.preventDefault();
      closeChat();
    });
    return unsubscribe;
  }, [navigation, chatId, closeChat, renameOpen, membersOpen, menuOpen]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (renameOpen || membersOpen || menuOpen) {
        setRenameOpen(false);
        setMembersOpen(false);
        setMenuOpen(false);
        return true;
      }
      if (!chatId) return false;
      closeChat();
      return true;
    });
    return () => sub.remove();
  }, [chatId, closeChat, renameOpen, membersOpen, menuOpen]);

  const saveRename = async () => {
    if (!activeGroup || renameValue.trim().length < 2) {
      showToast('Enter a group name');
      return;
    }
    setRenaming(true);
    try {
      const group = await renameInboxGroup(activeGroup.id, renameValue.trim());
      setActiveGroup(group);
      setChatTitle(group.name);
      setGroups((current) => current.map((item) => (item.id === group.id ? group : item)));
      setRenameOpen(false);
      showToast('Group renamed');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setRenaming(false);
    }
  };

  if (chatKind && chatId) {
    return (
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.chatHeader, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={closeChat} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.slate800} />
          </Pressable>
          {chatImage ? (
            <Image source={{ uri: chatImage }} style={styles.chatListingImage} />
          ) : (
            <View style={styles.chatAvatar}>
              <Ionicons
                name={chatKind === 'marketplace' ? 'storefront' : chatKind === 'groups' ? 'people' : 'person'}
                size={18}
                color={colors.primary}
              />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.chatName} numberOfLines={1}>
              {chatTitle}
            </Text>
            <Text style={styles.chatRole} numberOfLines={1}>
              {chatSubtitle}
            </Text>
          </View>
          {chatKind === 'groups' && activeGroup ? (
            <Pressable style={styles.headerCall} onPress={() => setMenuOpen(true)}>
              <Ionicons name="ellipsis-vertical" size={18} color={colors.slate800} />
            </Pressable>
          ) : null}
          {chatPhone ? (
            <Pressable style={styles.headerCall} onPress={() => void callNumber(chatPhone)}>
              <Ionicons name="call" size={18} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
          {!messages.length ? (
            <Text style={styles.emptyChat}>
              {chatKind === 'marketplace'
                ? 'Say hello about this listing.'
                : chatKind === 'groups'
                  ? 'Start the group conversation.'
                  : 'Start the conversation.'}
            </Text>
          ) : null}
          {messages.map((item) => (
            <View key={item.id} style={item.mine ? styles.bubbleRight : styles.bubbleLeft}>
              {chatKind === 'groups' && !item.mine ? (
                <Text style={styles.senderName}>{item.senderName}</Text>
              ) : null}
              {'image' in item && item.image ? (
                <Pressable onPress={() => setViewer({ url: item.image!, kind: 'image' })}>
                  <Image source={{ uri: item.image }} style={styles.bubbleImage} />
                </Pressable>
              ) : null}
              {item.text && !('image' in item && item.image && item.text === 'Sent a photo') ? (
                <Text style={item.mine ? styles.bubbleRightText : styles.bubbleLeftText}>{item.text}</Text>
              ) : null}
              <View style={styles.metaRow}>
                <Text style={item.mine ? styles.timeRight : styles.timeLeft}>{formatChatTime(item.createdAt)}</Text>
                {item.mine ? <SeenTicks seen={item.seen} /> : null}
              </View>
            </View>
          ))}
        </ScrollView>
        {pendingPhoto ? (
          <View style={styles.pendingPhotoRow}>
            <Image source={{ uri: pendingPhoto.uri }} style={styles.pendingPhoto} />
            <Pressable style={styles.pendingRemove} onPress={() => setPendingPhoto(null)}>
              <Ionicons name="close" size={14} color={colors.white} />
            </Pressable>
          </View>
        ) : null}
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable style={styles.attachBtn} onPress={() => void pickChatPhoto()}>
            <Ionicons name="image" size={22} color={colors.primary} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            style={styles.send}
            onPress={() => void handleSend()}
            disabled={sending || (!draft.trim() && !pendingPhoto)}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
        <Modal visible={menuOpen} animationType="fade" transparent onRequestClose={() => setMenuOpen(false)}>
          <View style={styles.modalWrap}>
            <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} />
            <View style={styles.menuSheet}>
              <Text style={styles.sheetTitle}>Group options</Text>
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  if (!activeGroup) return;
                  setMenuOpen(false);
                  setRenameValue(activeGroup.name);
                  setRenameOpen(true);
                }}
              >
                <Ionicons name="pencil" size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>Rename</Text>
              </Pressable>
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  setMembersOpen(true);
                }}
              >
                <Ionicons name="people" size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>Members</Text>
              </Pressable>
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  if (!activeGroup) return;
                  setMenuOpen(false);
                  router.push({
                    pathname: '/messages-contacts',
                    params: { mode: 'group-members', groupId: activeGroup.id },
                  });
                }}
              >
                <Ionicons name="person-add" size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>Add</Text>
              </Pressable>
              <Pressable
                style={styles.menuRow}
                onPress={() => {
                  setMenuOpen(false);
                  void pickGroupPhoto();
                }}
              >
                <Ionicons name="image" size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>{uploadingPhoto ? 'Uploading…' : 'Add photo'}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal visible={membersOpen} animationType="slide" transparent onRequestClose={() => setMembersOpen(false)}>
          <View style={styles.membersWrap}>
            <Pressable style={styles.backdrop} onPress={() => setMembersOpen(false)} />
            <View style={[styles.membersSheet, { paddingBottom: insets.bottom + spacing.md }]}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Members</Text>
              <Text style={styles.membersHint}>{activeGroup?.memberCount ?? 0} people in this group</Text>
              <ScrollView style={styles.membersList}>
                {(activeGroup?.members ?? []).map((member) => (
                  <View key={member.id} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberInitial}>{(member.name || 'U').trim().charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>
                        {member.name}
                        {member.id === activeGroup?.createdBy ? ' · Admin' : ''}
                      </Text>
                      <Text style={styles.memberMeta}>
                        {roleLabel(member.role)}
                        {member.unitNumber ? ` · Apt ${member.unitNumber}` : ''}
                      </Text>
                      {member.phone ? <Text style={styles.memberPhone}>{member.phone}</Text> : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
              <Button title="Close" variant="ghost" onPress={() => setMembersOpen(false)} />
            </View>
          </View>
        </Modal>
        <Modal visible={renameOpen} animationType="fade" transparent onRequestClose={() => setRenameOpen(false)}>
          <View style={styles.modalWrap}>
            <Pressable style={styles.backdrop} onPress={() => setRenameOpen(false)} />
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Rename group</Text>
              <Input value={renameValue} onChangeText={setRenameValue} placeholder="Group name" />
              <Button title="Save" loading={renaming} onPress={() => void saveRename()} />
              <Button title="Cancel" variant="outline" onPress={() => setRenameOpen(false)} />
            </View>
          </View>
        </Modal>
        {toast ? (
          <View style={[styles.toast, { bottom: insets.bottom + 88 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
        <MediaViewer visible={!!viewer} item={viewer} onClose={() => setViewer(null)} />
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.listHeader, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.listHeaderRow}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.slate800} />
          </Pressable>
          <Text style={styles.title}>
            {tab === 'marketplace' ? 'Marketplace' : tab === 'groups' ? 'Groups' : 'Inbox'}
          </Text>
        </View>
        {tab === 'marketplace' ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.search}
              placeholder="Search listings or sellers..."
              placeholderTextColor={colors.textMuted}
              value={marketSearch}
              onChangeText={setMarketSearch}
            />
          </View>
        ) : null}
        {tab === 'inbox' ? (
          <Pressable
            style={styles.searchWrap}
            onPress={() => router.push({ pathname: '/messages-contacts', params: { mode: 'inbox' } })}
          >
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <Text style={styles.searchFake}>Search or add people...</Text>
          </Pressable>
        ) : null}
        {tab === 'groups' ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.search}
              placeholder="Search groups..."
              placeholderTextColor={colors.textMuted}
              value={groupSearch}
              onChangeText={setGroupSearch}
            />
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 140 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadLists();
            }}
          />
        }
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {tab === 'marketplace' ? (
          <>
            {loading && !marketThreads.length ? <Text style={styles.muted}>Loading marketplace chats…</Text> : null}
            {!loading && !filteredMarket.length ? (
              <Text style={styles.muted}>No listing chats yet. Contact a seller from Marketplace.</Text>
            ) : null}
            {filteredMarket.map((thread) => (
              <Pressable key={thread.id} style={styles.chatRow} onPress={() => void openMarketChat(thread.id)}>
                {thread.listingImage ? (
                  <Image source={{ uri: thread.listingImage }} style={styles.rowImage} />
                ) : (
                  <View style={styles.rowAvatar}>
                    <Ionicons name="storefront" size={20} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {thread.listingTitle}
                    </Text>
                    <Text style={styles.rowTime}>{formatChatTime(thread.lastMessageAt)}</Text>
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {thread.isSeller ? `Buyer · ${thread.otherName}` : `Seller · ${thread.otherName}`}
                  </Text>
                  <Text style={styles.rowMsg} numberOfLines={1}>
                    {thread.lastMessage || 'Tap to open this listing inbox'}
                  </Text>
                </View>
                {thread.unread > 0 ? (
                  <View style={styles.unread}>
                    <Text style={styles.unreadText}>1</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </>
        ) : null}

        {tab === 'inbox' ? (
          <>
            {loading && !inboxThreads.length ? <Text style={styles.muted}>Loading inbox…</Text> : null}
            {!loading && !inboxThreads.length ? (
              <Text style={styles.muted}>No conversations yet. Tap search to add people.</Text>
            ) : null}
            {inboxThreads.map((thread) => (
              <Pressable key={thread.id} style={styles.chatRow} onPress={() => void openInboxChat(thread.id)}>
                <View style={styles.rowAvatar}>
                  <Text style={styles.rowInitial}>{(thread.otherName || 'U').trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {thread.otherName}
                    </Text>
                    <Text style={styles.rowTime}>{formatChatTime(thread.lastMessageAt || thread.updatedAt)}</Text>
                  </View>
                  <Text style={styles.rowSub}>{roleLabel(thread.otherRole)}</Text>
                  <Text style={styles.rowMsg} numberOfLines={1}>
                    {thread.lastMessage || 'Say hello'}
                  </Text>
                </View>
                {thread.unread > 0 ? (
                  <View style={styles.unread}>
                    <Text style={styles.unreadText}>1</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </>
        ) : null}

        {tab === 'groups' ? (
          <>
            {loading && !groups.length ? <Text style={styles.muted}>Loading groups…</Text> : null}
            {!loading && !filteredGroups.length ? (
              <Text style={styles.muted}>No groups yet. Tap + to create one.</Text>
            ) : null}
            {filteredGroups.map((group) => (
              <Pressable key={group.id} style={styles.chatRow} onPress={() => void openGroupChat(group.id)}>
                {group.photo ? (
                  <Image source={{ uri: group.photo }} style={styles.rowImage} />
                ) : (
                  <View style={styles.rowAvatar}>
                    <Ionicons name="people" size={20} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {group.name}
                    </Text>
                    <Text style={styles.rowTime}>{formatChatTime(group.lastMessageAt || group.updatedAt)}</Text>
                  </View>
                  <Text style={styles.rowSub}>
                    {group.memberCount} members{group.isOwner ? ' · You created this' : ''}
                  </Text>
                  <Text style={styles.rowMsg} numberOfLines={1}>
                    {group.lastMessage || 'No messages yet'}
                  </Text>
                </View>
                {group.unread > 0 ? (
                  <View style={styles.unread}>
                    <Text style={styles.unreadText}>1</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      {tab === 'inbox' || tab === 'groups' ? (
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            { bottom: Math.max(insets.bottom, 10) + 72 },
            pressed && styles.fabPressed,
          ]}
          onPress={() =>
            router.push({
              pathname: '/messages-contacts',
              params: { mode: tab === 'groups' ? 'group' : 'inbox' },
            })
          }
        >
          <Ionicons name="add" size={28} color={colors.white} />
        </Pressable>
      ) : null}

      <View style={[styles.bottomSwitch, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          style={[styles.bottomTab, tab === 'marketplace' && styles.bottomTabActive]}
          onPress={() => setTab('marketplace')}
        >
          <View>
            <Ionicons name="storefront" size={20} color={tab === 'marketplace' ? colors.primary : colors.textMuted} />
            <TabBadge count={marketUnread} />
          </View>
          <Text style={[styles.bottomLabel, tab === 'marketplace' && styles.bottomLabelActive]}>Marketplace</Text>
        </Pressable>
        <Pressable style={[styles.bottomTab, tab === 'inbox' && styles.bottomTabActive]} onPress={() => setTab('inbox')}>
          <View>
            <Ionicons name="chatbubbles" size={20} color={tab === 'inbox' ? colors.primary : colors.textMuted} />
            <TabBadge count={inboxUnread} />
          </View>
          <Text style={[styles.bottomLabel, tab === 'inbox' && styles.bottomLabelActive]}>Inbox</Text>
        </Pressable>
        <Pressable
          style={[styles.bottomTab, tab === 'groups' && styles.bottomTabActive]}
          onPress={() => setTab('groups')}
        >
          <View>
            <Ionicons name="people" size={20} color={tab === 'groups' ? colors.primary : colors.textMuted} />
            <TabBadge count={groupUnread} />
          </View>
          <Text style={[styles.bottomLabel, tab === 'groups' && styles.bottomLabelActive]}>Groups</Text>
        </Pressable>
      </View>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 88 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  listHeader: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 20,
    gap: 12,
  },
  listHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { padding: 8, marginLeft: -8 },
  title: { flex: 1, fontSize: 22, fontWeight: '700', color: colors.text },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    ...shadows.fab,
  },
  fabPressed: { transform: [{ scale: 0.95 }] },
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
  searchFake: {
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    paddingLeft: 40,
    paddingRight: 14,
    fontSize: 14,
    color: colors.textMuted,
  },
  list: { padding: spacing.md, gap: 4 },
  chatRow: {
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
  rowAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInitial: { fontWeight: '800', color: colors.primary, fontSize: 18 },
  rowImage: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.slate100 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowName: { flex: 1, fontWeight: '700', color: colors.text },
  rowTime: { fontSize: 11, color: colors.textMuted },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowMsg: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  unread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  muted: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.md },
  error: { color: colors.error, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  emptyChat: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  senderName: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    zIndex: 20,
  },
  chatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatListingImage: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.slate100 },
  chatName: { fontWeight: '700', color: colors.text },
  chatRole: { fontSize: 11, color: colors.textSecondary },
  headerCall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messages: { padding: spacing.md, gap: 12, flexGrow: 1, justifyContent: 'flex-end' },
  bubbleLeft: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: borderRadius['2xl'],
    borderTopLeftRadius: 4,
    padding: 12,
    ...shadows.sm,
  },
  bubbleLeftText: { color: colors.text, fontSize: 14 },
  timeLeft: { fontSize: 10, color: colors.textMuted },
  bubbleRight: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius['2xl'],
    borderTopRightRadius: 4,
    padding: 12,
  },
  bubbleRightText: { color: colors.white, fontSize: 14 },
  bubbleImage: {
    width: 180,
    height: 180,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: colors.slate100,
  },
  timeRight: { fontSize: 10, color: '#C7D2FE' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, justifyContent: 'flex-end' },
  pendingPhotoRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
  },
  pendingPhoto: { width: 72, height: 72, borderRadius: 12 },
  pendingRemove: {
    position: 'absolute',
    top: 4,
    left: spacing.md + 56,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    maxHeight: 120,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSwitch: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: borderRadius.lg,
  },
  bottomTabActive: { backgroundColor: colors.primaryLight },
  bottomLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  bottomLabelActive: { color: colors.primary },
  tabBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: colors.white, fontSize: 9, fontWeight: '800' },
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
  menuSheet: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: 4,
    ...shadows.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  membersWrap: { flex: 1, justifyContent: 'flex-end' },
  membersSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    maxHeight: '80%',
    gap: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  membersHint: { color: colors.textSecondary, marginBottom: spacing.sm },
  membersList: { maxHeight: 360 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { fontWeight: '800', color: colors.primary },
  memberName: { fontWeight: '700', color: colors.text },
  memberMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  memberPhone: { fontSize: 12, color: colors.text, marginTop: 2, fontWeight: '600' },
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
