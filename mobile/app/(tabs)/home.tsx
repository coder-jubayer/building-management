import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/stores/auth.store';
import { fetchNotices } from '../../src/services/notices.service';
import { fetchExpenses } from '../../src/services/expenses.service';
import { fetchAmenities } from '../../src/services/amenities.service';
import { fetchGuests } from '../../src/services/guests.service';
import { formatNoticeDate, formatSlotTime } from '../../src/utils/date';
import { formatMoney } from '../../src/utils/money';
import { AmenityBooking, GuestVisit, Notice, isResident } from '../../src/types';
import { colors, spacing, borderRadius, typography, shadows } from '../../src/theme';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [recentNotices, setRecentNotices] = useState<Notice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [monthTotal, setMonthTotal] = useState<number | null>(null);
  const [monthLabel, setMonthLabel] = useState('');
  const [nextBooking, setNextBooking] = useState<AmenityBooking | null>(null);
  const [pendingGuests, setPendingGuests] = useState<GuestVisit[]>([]);
  const resident = isResident(user?.role);

  useFocusEffect(
    useCallback(() => {
      const today = new Date();
      void fetchNotices()
        .then((data) => {
          setRecentNotices(data.notices.slice(0, 2));
          setUnreadCount(resident ? (data.unreadCount ?? 0) : 0);
        })
        .catch(() => {
          setRecentNotices([]);
          setUnreadCount(0);
        });
      void fetchExpenses({ year: today.getFullYear(), month: today.getMonth() + 1 })
        .then((data) => {
          setMonthTotal(data.total);
          setMonthLabel(data.monthLabel);
        })
        .catch(() => {
          setMonthTotal(null);
          setMonthLabel('');
        });
      void fetchAmenities()
        .then((data) => {
          setNextBooking(data.nextBooking ?? null);
        })
        .catch(() => {
          setNextBooking(null);
        });
      if (resident) {
        void fetchGuests()
          .then((data) => {
            setPendingGuests(data.visits.filter((item) => item.status === 'pending'));
          })
          .catch(() => setPendingGuests([]));
      } else {
        setPendingGuests([]);
      }
    }, [resident]),
  );
  const firstName = user?.name?.split(' ')[0] ?? 'Resident';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.welcome}>Welcome back,</Text>
          <Text style={styles.name}>{firstName}</Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatarWrap}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarBlank]}>
              <Ionicons name="person" size={18} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.dot} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >

      {/* Summary cards */}
      <View style={styles.cardsRow}>
        <Pressable
          style={[styles.summaryCard, { backgroundColor: colors.rose }]}
          onPress={() => router.push('/expenses')}
        >
          <Text style={styles.cardLabel}>MONTHLY EXPENSES</Text>
          <Text style={styles.cardValue}>
            {monthTotal == null ? '—' : formatMoney(monthTotal)}
          </Text>
          <View style={styles.cardBadge}>
            <Text style={styles.cardBadgeText}>{monthLabel || 'This month'}</Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.summaryCard, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/amenities')}
        >
          <Text style={styles.cardLabel}>AMENITY SLOT</Text>
          <Text style={styles.cardValue} numberOfLines={1}>
            {nextBooking ? formatSlotTime(nextBooking.startTime) : 'Open'}
          </Text>
          <View style={[styles.cardBadge, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
            <Text style={styles.cardBadgeText} numberOfLines={1}>
              {nextBooking ? nextBooking.amenityName : 'Book a slot'}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Guest alert */}
      {pendingGuests.length > 0 && (
        <View style={styles.guestAlert}>
          <View style={styles.guestIcon}>
            <Ionicons name="person-circle" size={28} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.guestTitle}>GUEST AT MAIN GATE</Text>
            <Text style={styles.guestDesc} numberOfLines={1}>
              {pendingGuests[0].visitorName} ({pendingGuests[0].purpose})
            </Text>
          </View>
          <Pressable style={styles.approveBtn} onPress={() => router.push('/(tabs)/guests')}>
            <Text style={styles.approveText}>Approve</Text>
          </Pressable>
        </View>
      )}

      {/* Quick actions */}
      <View style={styles.actionsGrid}>
        <ActionItem
          icon="calendar"
          label="Booking"
          onPress={() => router.push('/amenities')}
        />
        <ActionItem
          icon="notifications"
          label="Notices"
          badge={resident ? unreadCount : 0}
          onPress={() => router.push('/notices')}
        />
        <ActionItem
          icon="people"
          label="Community"
          onPress={() => router.push('/(tabs)/community')}
        />
        <ActionItem
          icon="construct"
          label="Support"
          onPress={() => router.push('/complaints')}
        />
      </View>

      {/* Recent notices */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Notices</Text>
          <Pressable onPress={() => router.push('/notices')}>
            <Text style={styles.viewAll}>View All</Text>
          </Pressable>
        </View>
        {recentNotices.length === 0 ? (
          <Text style={styles.noticeMeta}>No notices yet</Text>
        ) : null}
        {recentNotices.map((notice, i) => (
          <Pressable
            key={notice.id}
            style={[styles.noticeRow, i > 0 && { opacity: 0.6 }]}
            onPress={() => router.push('/notices')}
          >
            <View
              style={[
                styles.noticeAvatar,
                { backgroundColor: i === 0 ? colors.primaryLight : colors.emeraldLight },
              ]}
            >
              <Text
                style={{
                  color: i === 0 ? colors.primary : colors.success,
                  fontWeight: '700',
                  fontSize: 11,
                }}
              >
                {notice.title.slice(0, 3).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle} numberOfLines={1}>
                {notice.title}
              </Text>
              <Text style={styles.noticeMeta}>
                {formatNoticeDate(notice.date || notice.createdAt)} • {notice.author}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.slate200} />
          </Pressable>
        ))}
      </View>
      </ScrollView>
    </View>
  );
}

function ActionItem({
  icon,
  label,
  onPress,
  badge = 0,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <View style={styles.actionItem}>
      <Pressable style={styles.actionBtn} onPress={onPress}>
        <Ionicons name={icon} size={24} color={colors.slate800} />
        {badge > 0 ? (
          <View style={styles.actionBadge}>
            <Text style={styles.actionBadgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </Pressable>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 20,
  },
  welcome: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  name: { fontSize: 18, fontWeight: '700', color: colors.text },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.slate100,
    overflow: 'hidden',
  },
  avatarBlank: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: colors.white,
  },
  cardsRow: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: borderRadius['2xl'],
    padding: spacing.md,
    ...shadows.sm,
  },
  pingDot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DC2626',
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
    marginTop: 4,
  },
  cardBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardBadgeText: { fontSize: 9, color: colors.white, fontWeight: '600' },
  guestAlert: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guestIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#78350F',
    letterSpacing: -0.3,
  },
  guestDesc: { fontSize: 13, color: '#92400E', marginTop: 2 },
  approveBtn: {
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    ...shadows.sm,
  },
  approveText: { fontSize: 12, fontWeight: '700', color: '#D97706' },
  actionsGrid: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionItem: { width: '22%', alignItems: 'center', gap: 6 },
  actionBtn: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.slate100,
    borderRadius: borderRadius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  actionBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  actionBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  actionLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  viewAll: { fontSize: 12, fontWeight: '600', color: colors.primary },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius['2xl'],
    marginBottom: 10,
  },
  noticeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
  noticeMeta: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
});
