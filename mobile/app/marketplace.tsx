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
  Linking,
  BackHandler,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
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
  createListing,
  deleteListing,
  fetchMarketplace,
} from '../src/services/marketplace.service';
import { formatMoney } from '../src/utils/money';
import { formatNoticeDate } from '../src/utils/date';
import {
  Building,
  MarketplaceListing,
  canCreateListing,
  isAppAdmin,
} from '../src/types';

type LocalImage = { uri: string; name?: string; type?: string };

export default function MarketplaceScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const creator = canCreateListing(user?.role);
  const appAdmin = isAppAdmin(user?.role);

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [canCreate, setCanCreate] = useState(creator);
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selected, setSelected] = useState<MarketplaceListing | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [viewer, setViewer] = useState<MediaViewerItem | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [sellerPhone, setSellerPhone] = useState(user?.phone ?? '');
  const [sellerEmail, setSellerEmail] = useState(user?.email ?? '');
  const [images, setImages] = useState<LocalImage[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MarketplaceListing | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadListings = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchMarketplace({
        buildingId: appAdmin ? buildingId || undefined : undefined,
        mine: mineOnly,
      });
      setListings(data.listings);
      setCanCreate(data.canCreate);
      setBuildings(data.buildings ?? []);
      setBuildingId((current) => current || data.buildings?.[0]?.id || '');
      setSelected((current) => (current ? data.listings.find((item) => item.id === current.id) ?? current : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appAdmin, buildingId, mineOnly]);

  useFocusEffect(
    useCallback(() => {
      void loadListings();
    }, [loadListings]),
  );

  const closeListing = useCallback(() => {
    setViewer(null);
    setDeleteTarget(null);
    setSelected(null);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (viewer) {
        event.preventDefault();
        setViewer(null);
        return;
      }
      if (!selected) return;
      event.preventDefault();
      closeListing();
    });
    return unsubscribe;
  }, [navigation, selected, viewer, closeListing]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewer) {
        setViewer(null);
        return true;
      }
      if (!selected) return false;
      closeListing();
      return true;
    });
    return () => sub.remove();
  }, [selected, viewer, closeListing]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPrice('');
    setSellerPhone(user?.phone ?? '');
    setSellerEmail(user?.email ?? '');
    setImages([]);
    setFormError(null);
  };

  const pickImages = async () => {
    const remaining = 5 - images.length;
    if (remaining <= 0) {
      setFormError('You can add up to 5 images.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.72,
      selectionLimit: remaining,
    });
    if (result.canceled) return;
    setImages((current) =>
      [
        ...current,
        ...result.assets.map((asset, index) => ({
          uri: asset.uri,
          name: asset.fileName || `photo-${Date.now()}-${index}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        })),
      ].slice(0, 5),
    );
    setFormError(null);
  };

  const handleCreate = async () => {
    if (title.trim().length < 2) {
      setFormError('Enter an item title.');
      return;
    }
    if (description.trim().length < 2) {
      setFormError('Enter a description.');
      return;
    }
    const amount = Number(price.replace(/,/g, '').trim());
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError('Enter a valid price.');
      return;
    }
    if (sellerPhone.replace(/\D/g, '').length < 3 && !sellerEmail.trim()) {
      setFormError('Add a phone number or email.');
      return;
    }
    if (appAdmin && !buildingId) {
      setFormError('Select a building.');
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      await createListing({
        title: title.trim(),
        description: description.trim(),
        price: amount,
        sellerPhone: sellerPhone.trim() || undefined,
        sellerEmail: sellerEmail.trim() || undefined,
        buildingId: appAdmin ? buildingId : undefined,
        images,
      });
      setCreateOpen(false);
      resetForm();
      await loadListings();
      showToast('Listing posted');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteListing(deleteTarget.id);
      setDeleteTarget(null);
      setSelected(null);
      await loadListings();
      showToast('Listing deleted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const contactSeller = (listing: MarketplaceListing) => {
    router.push({
      pathname: '/messages',
      params: { tab: 'marketplace', listingId: listing.id },
    });
  };

  const callSeller = async (phone?: string) => {
    if (!phone) return;
    try {
      await Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
    } catch {
      showToast(phone);
    }
  };

  if (selected) {
    const photos = selected.images ?? [];
    const photo = photos[imageIndex] ?? photos[0];
    return (
      <View style={styles.root}>
        <PageHeader title="Listing" onBack={closeListing} />
        <ScrollView contentContainerStyle={[styles.detail, { paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.heroImage}>
            {photo ? (
              <Pressable style={styles.heroImg} onPress={() => setViewer({ url: photo, kind: 'image' })}>
                <Image source={{ uri: photo }} style={styles.heroImg} contentFit="cover" />
              </Pressable>
            ) : (
              <View style={styles.heroEmpty}>
                <Ionicons name="image-outline" size={36} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.priceTag}>
              <Text style={styles.price}>{formatMoney(selected.price)}</Text>
            </View>
          </View>
          {photos.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {photos.map((uri, index) => (
                <Pressable key={`${uri}-${index}`} onPress={() => setImageIndex(index)}>
                  <Image
                    source={{ uri }}
                    style={[styles.thumb, index === imageIndex && styles.thumbActive]}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Text style={styles.detailTitle}>{selected.title}</Text>
          <Text style={styles.meta}>{formatNoticeDate(selected.createdAt)}</Text>
          <Text style={styles.description}>{selected.description}</Text>
          <View style={styles.sellerCard}>
            <View style={styles.sellerTop}>
              <View style={styles.sellerAvatar}>
                <Text style={styles.sellerInitial}>
                  {(selected.sellerName || 'S').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sellerLabel}>Seller</Text>
                <Text style={styles.sellerName}>{selected.sellerName}</Text>
                {selected.sellerPhone ? (
                  <Text style={styles.sellerPhone}>{selected.sellerPhone}</Text>
                ) : null}
                {selected.sellerEmail ? <Text style={styles.sellerHint}>{selected.sellerEmail}</Text> : null}
              </View>
            </View>
            {selected.isMine ? (
              <View style={styles.ownBanner}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={styles.ownNote}>This is your listing</Text>
              </View>
            ) : (
              <View style={styles.sellerActions}>
                {selected.sellerPhone ? (
                  <Pressable style={styles.sellerBtn} onPress={() => void callSeller(selected.sellerPhone)}>
                    <Ionicons name="call" size={16} color={colors.primary} />
                    <Text style={styles.sellerBtnText}>Call</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.sellerBtn, styles.sellerBtnPrimary]}
                  onPress={() => contactSeller(selected)}
                >
                  <Ionicons name="chatbubble-ellipses" size={16} color={colors.white} />
                  <Text style={[styles.sellerBtnText, { color: colors.white }]}>Contact</Text>
                </Pressable>
              </View>
            )}
          </View>
          {selected.canDelete ? (
            <Button title="Delete listing" variant="danger" onPress={() => setDeleteTarget(selected)} />
          ) : null}
        </ScrollView>
        {toast ? (
          <View style={[styles.toast, { bottom: insets.bottom + 24 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
        <DeleteModal
          listing={deleteTarget}
          deleting={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
        <MediaViewer visible={!!viewer} item={viewer} onClose={() => setViewer(null)} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PageHeader title="Marketplace" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + (canCreate ? 108 : 40) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadListings();
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

        {canCreate ? (
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setMineOnly(false)}
              style={[styles.filterChip, !mineOnly && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, !mineOnly && styles.filterTextActive]}>All</Text>
            </Pressable>
            <Pressable
              onPress={() => setMineOnly(true)}
              style={[styles.filterChip, mineOnly && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, mineOnly && styles.filterTextActive]}>My listings</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !listings.length ? <Text style={styles.muted}>Loading listings…</Text> : null}
        {!loading && !listings.length && !error ? (
          <Text style={styles.muted}>{mineOnly ? 'You have not posted a listing yet.' : 'No listings yet.'}</Text>
        ) : null}

        <View style={styles.cards}>
          {listings.map((item) => {
            const cover = item.images[0];
            return (
              <Pressable key={item.id} style={styles.card} onPress={() => { setSelected(item); setImageIndex(0); }}>
                <View style={styles.imageWrap}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.image} contentFit="cover" />
                  ) : (
                    <View style={styles.imageEmpty}>
                      <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.priceTag}>
                    <Text style={styles.price}>{formatMoney(item.price)}</Text>
                  </View>
                </View>
                <View style={styles.body}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={styles.cardSeller}>
                    <View style={styles.cardAvatar}>
                      <Text style={styles.cardInitial}>
                        {(item.sellerName || 'S').trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.seller} numberOfLines={1}>
                      {item.sellerName}
                    </Text>
                  </View>
                  {item.isMine ? (
                    <View style={styles.ownChipWrap}>
                      <Text style={styles.ownChip}>Your listing</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.contact}
                      onPress={(event) => {
                        event.stopPropagation();
                        contactSeller(item);
                      }}
                    >
                      <Ionicons name="chatbubble-ellipses" size={14} color={colors.white} />
                      <Text style={styles.contactText}>Contact</Text>
                    </Pressable>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {canCreate ? (
        <Pressable
          style={({ pressed }) => [styles.fab, { bottom: insets.bottom + 24 }, pressed && styles.fabPressed]}
          onPress={() => {
            resetForm();
            setCreateOpen(true);
          }}
        >
          <Ionicons name="add" size={28} color={colors.white} />
        </Pressable>
      ) : null}

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + (canCreate ? 96 : 24) }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setCreateOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Create listing</Text>
            <Text style={styles.sheetSubtitle}>Buyers in your building can contact you here.</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Input label="Title" value={title} onChangeText={setTitle} placeholder="Wooden dining table" />
              <Input
                label="Description"
                value={description}
                onChangeText={setDescription}
                placeholder="Condition, pickup details, etc."
                multiline
                numberOfLines={4}
                style={styles.multiline}
              />
              <Input
                label="Price (Tk)"
                value={price}
                onChangeText={setPrice}
                placeholder="4500"
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldLabel}>Images</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
                {images.map((image, index) => (
                  <View key={`${image.uri}-${index}`} style={styles.previewWrap}>
                    <Image source={{ uri: image.uri }} style={styles.preview} contentFit="cover" />
                    <Pressable
                      style={styles.removeImg}
                      onPress={() => setImages((current) => current.filter((_, i) => i !== index))}
                    >
                      <Ionicons name="close" size={14} color={colors.white} />
                    </Pressable>
                  </View>
                ))}
                {images.length < 5 ? (
                  <Pressable style={styles.addImg} onPress={() => void pickImages()}>
                    <Ionicons name="add" size={22} color={colors.primary} />
                    <Text style={styles.addImgText}>Add</Text>
                  </Pressable>
                ) : null}
              </ScrollView>
              <Input
                label="Seller phone"
                value={sellerPhone}
                onChangeText={setSellerPhone}
                placeholder="017XXXXXXXX"
                keyboardType="phone-pad"
              />
              <Input
                label="Seller email"
                value={sellerEmail}
                onChangeText={setSellerEmail}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <Button title="Post listing" loading={creating} onPress={() => void handleCreate()} />
              <Button title="Cancel" variant="outline" onPress={() => setCreateOpen(false)} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DeleteModal
        listing={deleteTarget}
        deleting={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </View>
  );
}

function DeleteModal({
  listing,
  deleting,
  onClose,
  onConfirm,
}: {
  listing: MarketplaceListing | null;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={!!listing} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.confirmWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Delete listing?</Text>
          <Text style={styles.confirmBody}>{listing ? `${listing.title} will be removed.` : ''}</Text>
          <View style={styles.confirmActions}>
            <Button title="Cancel" variant="outline" onPress={onClose} />
            <Button title="Delete" variant="danger" loading={deleting} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    ...shadows.fab,
  },
  fabPressed: { transform: [{ scale: 0.95 }] },
  grid: { padding: spacing.md, gap: spacing.md },
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
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  filterChipActive: { backgroundColor: colors.slate800 },
  filterText: { fontWeight: '600', fontSize: 13, color: colors.text },
  filterTextActive: { color: colors.white },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  imageWrap: { height: 128, backgroundColor: colors.slate200, position: 'relative' },
  image: { width: '100%', height: '100%' },
  imageEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  priceTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  price: { fontWeight: '700', fontSize: 13, color: colors.text },
  body: { padding: 12, gap: 8 },
  title: { fontWeight: '600', fontSize: 13, color: colors.text },
  cardSeller: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInitial: { fontSize: 10, fontWeight: '800', color: colors.primary },
  seller: { flex: 1, fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  ownChipWrap: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  ownChip: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  contact: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  contactText: { fontSize: 12, fontWeight: '700', color: colors.white },
  muted: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, width: '100%' },
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
  heroImage: {
    height: 240,
    borderRadius: borderRadius['2xl'],
    overflow: 'hidden',
    backgroundColor: colors.slate200,
    position: 'relative',
  },
  heroImg: { width: '100%', height: '100%' },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbs: { gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: colors.primary },
  detailTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: -8 },
  description: { fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  sellerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 12,
    ...shadows.sm,
  },
  sellerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sellerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitial: { fontSize: 20, fontWeight: '800', color: colors.primary },
  sellerLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  sellerName: { fontWeight: '700', color: colors.text, fontSize: 16, marginTop: 2 },
  sellerPhone: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },
  sellerHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sellerActions: { flexDirection: 'row', gap: 8 },
  sellerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primaryLight,
  },
  sellerBtnPrimary: { backgroundColor: colors.primary },
  sellerBtnText: { fontWeight: '700', color: colors.primary },
  ownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
  },
  ownNote: { color: colors.primaryDark, fontWeight: '700' },
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
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  imageRow: { gap: 10, paddingVertical: 4 },
  previewWrap: { width: 72, height: 72 },
  preview: { width: 72, height: 72, borderRadius: 12 },
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
