import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  Linking,
  Modal,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader } from '../src/components/PageHeader';
import { PopupHeader } from '../src/components/PopupHeader';
import { Button } from '../src/components/ui';
import { colors, spacing, borderRadius, shadows } from '../src/theme';
import { useAuthStore } from '../src/stores/auth.store';
import {
  bookAmenitySlot,
  cancelAmenityBooking,
  fetchAmenities,
  fetchAmenitySlots,
  updateAmenitySettings,
} from '../src/services/amenities.service';
import { formatSlotTime } from '../src/utils/date';
import {
  AmenityBooking,
  AmenityDateOption,
  AmenitySlot,
  AmenitySlotsResponse,
  AmenitySummary,
  Building,
  canBookAmenities,
  canManageAmenityBookings,
  isAppAdmin,
} from '../src/types';

function iconName(name?: string): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    water: 'water',
    car: 'car-sport',
    'car-sport': 'car-sport',
    balloon: 'balloon',
    tennisball: 'tennisball',
    ellipse: 'ellipse',
    calendar: 'calendar',
  };
  return map[name ?? ''] ?? 'calendar';
}

function bookingResidentName(booking: AmenityBooking) {
  return booking.userName?.trim() || 'Unknown resident';
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function groupBookingsBySlot(bookings: AmenityBooking[]) {
  const groups: { startTime: string; endTime: string; bookings: AmenityBooking[] }[] = [];
  for (const booking of bookings) {
    const last = groups[groups.length - 1];
    if (last && last.startTime === booking.startTime) {
      last.bookings.push(booking);
    } else {
      groups.push({ startTime: booking.startTime, endTime: booking.endTime, bookings: [booking] });
    }
  }
  return groups;
}

const SLOT_MINUTES_MIN = 15;
const SLOT_MINUTES_MAX = 240;

function parseSlotMinutes(value: string): number | null {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < SLOT_MINUTES_MIN || minutes > SLOT_MINUTES_MAX) {
    return null;
  }
  return minutes;
}

const SLOT_CAPACITY_MIN = 1;
const SLOT_CAPACITY_MAX = 50;
const SLOT_CAPACITY_OPTIONS = [1, 2, 4, 6, 8];

function parseSlotCapacity(value: string): number | null {
  const capacity = Number(value);
  if (!Number.isInteger(capacity) || capacity < SLOT_CAPACITY_MIN || capacity > SLOT_CAPACITY_MAX) {
    return null;
  }
  return capacity;
}

function DateBar({
  dates,
  date,
  onSelect,
}: {
  dates: AmenityDateOption[];
  date: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
      {dates.map((item) => {
        const active = item.value === date;
        return (
          <Pressable
            key={item.value}
            onPress={() => onSelect(item.value)}
            style={[styles.dateChip, active && styles.dateChipActive]}
          >
            <Text style={[styles.dateLabel, active && styles.dateLabelActive]}>{item.label}</Text>
            <Text style={[styles.dateDay, active && styles.dateDayActive]}>{item.day}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function AmenitiesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const booker = canBookAmenities(user?.role);
  const manager = canManageAmenityBookings(user?.role);
  const appAdmin = isAppAdmin(user?.role);

  const [date, setDate] = useState('');
  const [dates, setDates] = useState<AmenityDateOption[]>([]);
  const [amenities, setAmenities] = useState<AmenitySummary[]>([]);
  const [myBookings, setMyBookings] = useState<AmenityBooking[]>([]);
  const [dayBookings, setDayBookings] = useState<AmenityBooking[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [canBook, setCanBook] = useState(booker);
  const [canManage, setCanManage] = useState(manager);
  const [slotMinuteOptions, setSlotMinuteOptions] = useState<number[]>([30, 45, 60]);
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState('60');
  const [draftCapacity, setDraftCapacity] = useState('1');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slotsData, setSlotsData] = useState<AmenitySlotsResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const loadList = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAmenities({
        date: date || undefined,
        buildingId: appAdmin ? buildingId || undefined : undefined,
      });
      setDate(data.date);
      setDates(data.dates);
      setAmenities(data.amenities);
      setMyBookings(data.myBookings);
      setDayBookings(data.dayBookings ?? []);
      setCanBook(data.canBook);
      setCanManage(Boolean(data.canManage));
      setSlotMinuteOptions(data.slotMinuteOptions?.length ? data.slotMinuteOptions : [30, 45, 60]);
      setBuildings(data.buildings ?? []);
      setBuildingId((current) => current || data.buildings?.[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load amenities');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, appAdmin, buildingId]);

  const loadSlots = useCallback(
    async (amenityId: string, nextDate = date) => {
      setSlotsLoading(true);
      try {
        const data = await fetchAmenitySlots(amenityId, {
          date: nextDate || undefined,
          buildingId: appAdmin ? buildingId || undefined : undefined,
        });
        setSlotsData(data);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to load time slots');
      } finally {
        setSlotsLoading(false);
      }
    },
    [date, appAdmin, buildingId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadList();
    }, [loadList]),
  );

  useEffect(() => {
    if (!selectedId || !date) return;
    void loadSlots(selectedId);
  }, [selectedId, date, loadSlots]);

  const openAmenity = (amenity: AmenitySummary) => {
    setSelectedId(amenity.id);
    setSlotsData(null);
    setDraftMinutes(String(amenity.slotMinutes));
    setDraftCapacity(String(amenity.capacity));
  };

  const closeFacility = useCallback(() => {
    setSettingsOpen(false);
    setSelectedId(null);
    setSlotsData(null);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
      if (!selectedId) return;
      event.preventDefault();
      closeFacility();
    });
    return unsubscribe;
  }, [navigation, selectedId, settingsOpen, closeFacility]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (!selectedId) return false;
      closeFacility();
      return true;
    });
    return () => sub.remove();
  }, [selectedId, settingsOpen, closeFacility]);

  const handleBook = async (slot: AmenitySlot) => {
    if (!selectedId || !canBook || !slot.available) return;
    setBusySlot(slot.startTime);
    try {
      await bookAmenitySlot({
        amenityId: selectedId,
        date,
        startTime: slot.startTime,
        buildingId: appAdmin ? buildingId || undefined : undefined,
      });
      showToast('Slot booked');
      await Promise.all([loadSlots(selectedId), loadList()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to book slot');
      if (selectedId) void loadSlots(selectedId);
    } finally {
      setBusySlot(null);
    }
  };

  const handleCancel = async (bookingId: string) => {
    setCancellingId(bookingId);
    try {
      await cancelAmenityBooking(bookingId);
      showToast('Booking cancelled');
      await loadList();
      if (selectedId) await loadSlots(selectedId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to cancel booking');
    } finally {
      setCancellingId(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedId || savingMinutes) return;
    const slotMinutes = parseSlotMinutes(draftMinutes);
    const capacity = parseSlotCapacity(draftCapacity);
    if (slotMinutes == null) {
      showToast(`Enter ${SLOT_MINUTES_MIN}–${SLOT_MINUTES_MAX} minutes`);
      return;
    }
    if (capacity == null) {
      showToast(`Enter ${SLOT_CAPACITY_MIN}–${SLOT_CAPACITY_MAX} spots per slot`);
      return;
    }
    setSavingMinutes(true);
    try {
      await updateAmenitySettings({
        amenityId: selectedId,
        slotMinutes,
        capacity,
        buildingId: appAdmin ? buildingId || undefined : undefined,
      });
      setDraftMinutes(String(slotMinutes));
      setDraftCapacity(String(capacity));
      setSettingsOpen(false);
      showToast(`Saved ${slotMinutes} min · ${capacity} per slot`);
      await Promise.all([loadList(), loadSlots(selectedId)]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingMinutes(false);
    }
  };

  const callResident = async (phone: string, name: string) => {
    try {
      await Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
    } catch {
      showToast(`${name}: ${phone}`);
    }
  };

  const renderOccupantCard = (booking: AmenityBooking) => {
    const name = bookingResidentName(booking);
    const phone = booking.userPhone?.trim();
    const unit = booking.unitNumber?.trim();
    return (
      <View key={booking.id} style={styles.occupantCard}>
        <View style={styles.occupantTop}>
          <View style={styles.occupantAvatar}>
            <Text style={styles.occupantInitials}>{initialsFromName(name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.occupantNameRow}>
              <Text style={styles.occupantName} numberOfLines={1}>
                {name}
              </Text>
              {booking.mine ? (
                <View style={styles.youChip}>
                  <Text style={styles.youChipText}>You</Text>
                </View>
              ) : null}
            </View>
            {unit ? (
              <View style={styles.occupantMetaRow}>
                <Ionicons name="home-outline" size={13} color={colors.textSecondary} />
                <Text style={styles.occupantMeta}>Apt {unit}</Text>
              </View>
            ) : null}
            {phone ? (
              <Pressable style={styles.occupantMetaRow} onPress={() => void callResident(phone, name)}>
                <Ionicons name="call-outline" size={13} color={colors.primary} />
                <Text style={styles.occupantPhone}>{phone}</Text>
              </Pressable>
            ) : (
              <View style={styles.occupantMetaRow}>
                <Ionicons name="call-outline" size={13} color={colors.textMuted} />
                <Text style={styles.occupantMuted}>No phone on file</Text>
              </View>
            )}
          </View>
          <View style={styles.occupantActions}>
            {phone ? (
              <Pressable style={styles.callBtn} onPress={() => void callResident(phone, name)}>
                <Ionicons name="call" size={16} color={colors.success} />
              </Pressable>
            ) : null}
            {booking.canCancel ? (
              <Pressable
                style={styles.cancelBtn}
                onPress={() => void handleCancel(booking.id)}
                disabled={cancellingId === booking.id}
              >
                {cancellingId === booking.id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={styles.cancelText}>Cancel</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const slotStatus = (slot: AmenitySlot) => {
    if (slot.past) return 'Past';
    if (slot.mine) return 'Yours · Cancel';
    if (slot.available) return slot.capacity > 1 ? `${slot.remaining} left` : 'Book';
    if (canManage && slot.bookedBy[0]) return slot.bookedBy[0].name;
    return 'Booked';
  };

  if (selectedId) {
    const amenity = amenities.find((item) => item.id === selectedId);
    const detail = slotsData?.amenity;
    const name = detail?.name ?? amenity?.name ?? 'Amenity';
    const color = detail?.color ?? amenity?.color ?? colors.primary;
    const hours = detail?.hoursLabel ?? amenity?.hoursLabel ?? '';
    const slots = slotsData?.slots ?? [];
    const currentMinutes = detail?.slotMinutes ?? amenity?.slotMinutes ?? 60;
    const currentCapacity = detail?.capacity ?? amenity?.capacity ?? 1;
    const draftMinutesValue = parseSlotMinutes(draftMinutes);
    const draftCapacityValue = parseSlotCapacity(draftCapacity);
    const settingsDirty =
      draftMinutesValue !== currentMinutes || draftCapacityValue !== currentCapacity;
    const amenityBookings = (slotsData?.dayBookings ?? dayBookings).filter(
      (item) => item.amenityId === selectedId,
    );

    const openSettings = () => {
      setDraftMinutes(String(currentMinutes));
      setDraftCapacity(String(currentCapacity));
      setSettingsOpen(true);
    };

    return (
      <View style={styles.root}>
        <PageHeader
          title={name}
          onBack={closeFacility}
          rightAction={
            canManage ? (
              <Pressable onPress={openSettings} style={styles.headerIconBtn} hitSlop={8}>
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </Pressable>
            ) : undefined
          }
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView
          contentContainerStyle={[styles.detail, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={
            <RefreshControl
              refreshing={slotsLoading && Boolean(slotsData)}
              onRefresh={() => void loadSlots(selectedId)}
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          <DateBar dates={dates} date={date} onSelect={setDate} />
          <View style={styles.detailHero}>
            <View style={[styles.heroIcon, { backgroundColor: `${color}22` }]}>
              <Ionicons name={iconName(detail?.icon ?? amenity?.icon)} size={26} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailTitle}>{name}</Text>
              <Text style={styles.detailMeta}>
                {slotsData?.dateLabel ?? dates.find((item) => item.value === date)?.fullLabel ?? date}
                {hours ? ` · ${hours}` : ''}
              </Text>
              <Text style={styles.detailHint}>
                {currentMinutes} min slots · {currentCapacity} per slot
              </Text>
            </View>
          </View>

          {slotsLoading && !slots.length ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : null}
          {!slotsLoading && !slots.length ? (
            <Text style={styles.muted}>No time slots for this date.</Text>
          ) : null}

          <View style={styles.slotGrid}>
            {slots.map((slot) => {
              const busy = busySlot === slot.startTime;
              const taken = !slot.available && !slot.mine && !slot.past;
              return (
                <Pressable
                  key={slot.startTime}
                  disabled={busy || slot.past || taken || (!slot.mine && !canBook)}
                  onPress={() => {
                    if (slot.mine && slot.myBookingId) void handleCancel(slot.myBookingId);
                    else void handleBook(slot);
                  }}
                  style={[
                    styles.slot,
                    slot.available && styles.slotAvailable,
                    slot.mine && styles.slotMine,
                    (slot.past || taken) && styles.slotDisabled,
                  ]}
                >
                  {busy || (slot.mine && cancellingId === slot.myBookingId) ? (
                    <ActivityIndicator size="small" color={slot.mine ? colors.primary : colors.white} />
                  ) : (
                    <>
                      <Text
                        style={[
                          styles.slotTime,
                          slot.available && styles.slotTimeAvailable,
                          slot.mine && styles.slotTimeMine,
                          (slot.past || taken) && styles.slotTimeDisabled,
                        ]}
                      >
                        {formatSlotTime(slot.startTime)}
                      </Text>
                      <Text
                        style={[
                          styles.slotEnd,
                          slot.available && { color: '#C7D2FE' },
                          slot.mine && { color: colors.primary },
                        ]}
                      >
                        {formatSlotTime(slot.endTime)}
                      </Text>
                      <Text
                        style={[
                          styles.slotStatus,
                          slot.available && styles.slotStatusAvailable,
                          slot.mine && styles.slotStatusMine,
                        ]}
                        numberOfLines={1}
                      >
                        {slotStatus(slot)}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>

          {canManage ? (
            <View style={styles.section}>
              <View style={styles.whoHeader}>
                <Text style={styles.sectionTitle}>Who booked</Text>
                {amenityBookings.length ? (
                  <View style={styles.countChip}>
                    <Text style={styles.countChipText}>{amenityBookings.length}</Text>
                  </View>
                ) : null}
              </View>
              {amenityBookings.length ? (
                groupBookingsBySlot(amenityBookings).map((group) => (
                  <View key={group.startTime} style={styles.whoGroup}>
                    <View style={styles.whoTimeRow}>
                      <Ionicons name="time-outline" size={14} color={colors.primary} />
                      <Text style={styles.whoTime}>
                        {formatSlotTime(group.startTime)}–{formatSlotTime(group.endTime)}
                      </Text>
                      <Text style={styles.whoCount}>
                        {group.bookings.length} {group.bookings.length === 1 ? 'resident' : 'residents'}
                      </Text>
                    </View>
                    {group.bookings.map((booking) => renderOccupantCard(booking))}
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>No bookings for this date.</Text>
              )}
            </View>
          ) : !canBook ? (
            <Text style={styles.muted}>Only residents and building staff can book amenity slots.</Text>
          ) : (
            <Text style={styles.hint}>Tap an open slot to book. Taken slots cannot be double-booked.</Text>
          )}
        </ScrollView>
        {toast ? (
          <View style={[styles.toast, { bottom: insets.bottom + 24 }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}
        </KeyboardAvoidingView>

        <Modal
          visible={settingsOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setSettingsOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable style={styles.backdrop} onPress={() => setSettingsOpen(false)} />
            <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
              <View style={styles.sheetHandle} />
              <PopupHeader title="Settings" onClose={() => setSettingsOpen(false)} />
              <Text style={styles.sheetSubtitle}>{name}</Text>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
                <View style={styles.settingsPanel}>
                  <View style={styles.settingsPanelHead}>
                    <View style={styles.settingsIconWrap}>
                      <Ionicons name="time-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingsLabel}>Slot length</Text>
                      <Text style={styles.settingsHint}>How long each booking lasts.</Text>
                    </View>
                  </View>
                  <View style={styles.durationRow}>
                    {slotMinuteOptions.map((minutes) => {
                      const active = draftMinutesValue === minutes;
                      return (
                        <Pressable
                          key={minutes}
                          disabled={savingMinutes}
                          onPress={() => setDraftMinutes(String(minutes))}
                          style={[styles.durationChip, active && styles.durationChipActive]}
                        >
                          <Text style={[styles.durationText, active && styles.durationTextActive]}>
                            {minutes} min
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.customRow}>
                    <TextInput
                      style={styles.customInput}
                      keyboardType="number-pad"
                      value={draftMinutes}
                      onChangeText={setDraftMinutes}
                      placeholder="Custom minutes"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={styles.customSuffix}>min</Text>
                  </View>
                  {draftMinutes.trim() && draftMinutesValue == null ? (
                    <Text style={styles.settingsError}>
                      Use a whole number from {SLOT_MINUTES_MIN} to {SLOT_MINUTES_MAX}.
                    </Text>
                  ) : null}
                </View>

                <View style={styles.settingsPanel}>
                  <View style={styles.settingsPanelHead}>
                    <View style={styles.settingsIconWrap}>
                      <Ionicons name="people-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingsLabel}>Bookings per slot</Text>
                      <Text style={styles.settingsHint}>
                        How many people can book the same time, e.g. parking spots.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.durationRow}>
                    {SLOT_CAPACITY_OPTIONS.map((spots) => {
                      const active = draftCapacityValue === spots;
                      return (
                        <Pressable
                          key={spots}
                          disabled={savingMinutes}
                          onPress={() => setDraftCapacity(String(spots))}
                          style={[styles.durationChip, active && styles.durationChipActive]}
                        >
                          <Text style={[styles.durationText, active && styles.durationTextActive]}>{spots}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.customRow}>
                    <TextInput
                      style={styles.customInput}
                      keyboardType="number-pad"
                      value={draftCapacity}
                      onChangeText={setDraftCapacity}
                      placeholder="Custom spots"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={styles.customSuffix}>per slot</Text>
                  </View>
                  {draftCapacity.trim() && draftCapacityValue == null ? (
                    <Text style={styles.settingsError}>
                      Use a whole number from {SLOT_CAPACITY_MIN} to {SLOT_CAPACITY_MAX}.
                    </Text>
                  ) : null}
                </View>

                <Text style={styles.settingsFooterHint}>
                  Changes apply only after you tap Save.
                </Text>
                <Button
                  title="Save settings"
                  loading={savingMinutes}
                  disabled={savingMinutes || draftMinutesValue == null || draftCapacityValue == null || !settingsDirty}
                  onPress={() => void handleSaveSettings()}
                />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PageHeader title="Book Amenity" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadList();
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

        <DateBar dates={dates} date={date} onSelect={setDate} />

        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {myBookings.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>My bookings</Text>
            {myBookings.map((booking) => (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={[styles.iconBox, { backgroundColor: `${booking.amenityColor}22` }]}>
                  <Ionicons name={iconName(booking.amenityIcon)} size={20} color={booking.amenityColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{booking.amenityName}</Text>
                  <Text style={styles.bookingMeta}>
                    {booking.dateLabel ?? booking.date} · {formatSlotTime(booking.startTime)}–
                    {formatSlotTime(booking.endTime)}
                  </Text>
                </View>
                {booking.canCancel ? (
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => void handleCancel(booking.id)}
                    disabled={cancellingId === booking.id}
                  >
                    {cancellingId === booking.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Text style={styles.cancelText}>Cancel</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Facilities</Text>
        {amenities.map((amenity) => {
          const available = amenity.availableSlots > 0;
          const closed = amenity.totalSlots === 0;
          return (
            <Pressable key={amenity.id} style={styles.card} onPress={() => openAmenity(amenity)}>
              <View style={styles.left}>
                <View style={[styles.iconBox, { backgroundColor: `${amenity.color}18` }]}>
                  <Ionicons name={iconName(amenity.icon)} size={24} color={amenity.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{amenity.name}</Text>
                  <Text
                    style={{
                      color: available ? colors.success : closed ? colors.textMuted : colors.error,
                      fontWeight: '500',
                      fontSize: 13,
                    }}
                  >
                    {closed
                      ? 'No more slots today'
                      : available
                        ? `${amenity.availableSlots} slot${amenity.availableSlots === 1 ? '' : 's'} open`
                        : 'Fully booked'}
                  </Text>
                  <Text style={styles.hours}>
                    {amenity.hoursLabel} · {amenity.slotMinutes} min · {amenity.capacity} / slot
                  </Text>
                </View>
              </View>
              <View style={[styles.bookBtn, !available && styles.bookDisabled]}>
                <Text style={[styles.bookText, !available && { color: colors.textMuted }]}>
                  {available ? 'View' : closed ? 'Hours' : 'Full'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 24 }]}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, gap: 12 },
  detail: { padding: spacing.md, gap: 16 },
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
  dateRow: { gap: 8, paddingBottom: 4 },
  dateChip: {
    minWidth: 58,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  dateLabelActive: { color: '#C7D2FE' },
  dateDay: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  dateDayActive: { color: colors.white },
  section: { gap: 8 },
  sectionTitle: { fontWeight: '700', color: colors.text, marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  whoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countChip: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countChipText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  whoGroup: { gap: 8 },
  whoTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  whoTime: { fontSize: 13, fontWeight: '700', color: colors.text },
  whoCount: { fontSize: 12, color: colors.textMuted, marginLeft: 'auto' },
  occupantCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    ...shadows.sm,
  },
  occupantTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  occupantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  occupantInitials: { fontWeight: '800', color: colors.primary, fontSize: 15 },
  occupantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  occupantName: { fontWeight: '700', fontSize: 15, color: colors.text, flexShrink: 1 },
  youChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  youChipText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  occupantMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  occupantMeta: { fontSize: 13, color: colors.textSecondary },
  occupantPhone: { fontSize: 13, fontWeight: '600', color: colors.primary },
  occupantMuted: { fontSize: 12, color: colors.textMuted },
  occupantActions: { alignItems: 'flex-end', gap: 8 },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontWeight: '600', color: colors.text, marginBottom: 2 },
  hours: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  bookingMeta: { fontSize: 12, color: colors.textSecondary },
  bookBtn: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bookDisabled: { backgroundColor: colors.slate100 },
  bookText: { fontWeight: '600', fontSize: 13, color: colors.primary },
  cancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.errorLight,
  },
  cancelText: { color: colors.error, fontWeight: '700', fontSize: 12 },
  detailHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  detailMeta: { marginTop: 4, fontSize: 13, color: colors.textSecondary },
  detailHint: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: {
    width: '31%',
    minWidth: 96,
    flexGrow: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    minHeight: 88,
    justifyContent: 'center',
  },
  slotAvailable: { backgroundColor: colors.primary },
  slotMine: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  slotDisabled: { backgroundColor: colors.slate100, opacity: 0.72 },
  slotTime: { fontWeight: '700', color: colors.text, fontSize: 14 },
  slotTimeAvailable: { color: colors.white },
  slotTimeMine: { color: colors.primary },
  slotTimeDisabled: { color: colors.textMuted },
  slotEnd: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  slotStatus: { marginTop: 8, fontSize: 11, fontWeight: '700', color: colors.textMuted },
  slotStatusAvailable: { color: colors.white },
  slotStatusMine: { color: colors.primary },
  muted: { color: colors.textSecondary, textAlign: 'center' },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  error: { color: colors.error, textAlign: 'center', fontSize: 13 },
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
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate200,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  sheetSubtitle: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: { gap: 12, paddingBottom: spacing.md },
  settingsPanel: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 10,
  },
  settingsPanelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 2 },
  settingsIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  settingsFooterHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  settingsLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.slate100,
  },
  durationChipActive: { backgroundColor: colors.primary },
  durationText: { fontWeight: '700', fontSize: 13, color: colors.text },
  durationTextActive: { color: colors.white },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
  },
  customInput: {
    flex: 1,
    minHeight: 46,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  customSuffix: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  settingsError: { fontSize: 12, color: colors.error },
});
