import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mockRentals } from '../src/data/mockData';
import { colors, spacing, borderRadius, shadows } from '../src/theme';
import { useAccessChromeInset } from '../src/hooks/useAccessChromeInset';

export default function RentalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chromeInset = useAccessChromeInset();
  const [search, setSearch] = useState('');
  const filtered = mockRentals.filter(
    (r) =>
      r.unit.toLowerCase().includes(search.toLowerCase()) ||
      r.tenant.toLowerCase().includes(search.toLowerCase()),
  );

  const statusColor = (status: string) => {
    if (status === 'Active') return { bg: colors.successLight, color: colors.success };
    if (status === 'Available') return { bg: colors.primaryLight, color: colors.primary };
    return { bg: '#FEF3C7', color: '#B45309' };
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + chromeInset + spacing.md }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.slate800} />
          </Pressable>
          <Text style={styles.title}>Rental Records</Text>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder="Search unit or tenant..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Units</Text>
            <Text style={styles.statValue}>45</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Occupancy</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>92%</Text>
          </View>
        </View>

        <Text style={styles.section}>Properties</Text>
        {filtered.map((r) => {
          const s = statusColor(r.status);
          return (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.unitRow}>
                  <View style={styles.mapIcon}>
                    <Ionicons name="location" size={18} color={colors.textSecondary} />
                  </View>
                  <View>
                    <Text style={styles.unit}>Unit {r.unit}</Text>
                    <Text style={styles.rent}>{r.rent} / month</Text>
                  </View>
                </View>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.color }]}>{r.status}</Text>
                </View>
              </View>
              <View style={styles.tenantRow}>
                <Ionicons name="person-outline" size={14} color={colors.textMuted} />
                <Text style={styles.tenant}>{r.tenant}</Text>
                <Text style={styles.lease}>Lease: {r.leaseEnd}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
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
    zIndex: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
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
  content: { padding: spacing.md, paddingBottom: 40 },
  stats: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '700', color: colors.text },
  section: { fontWeight: '700', color: colors.text, marginBottom: 12, paddingHorizontal: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 12,
    ...shadows.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mapIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unit: { fontWeight: '700', color: colors.text },
  rent: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.full },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  tenantRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tenant: { flex: 1, fontSize: 13, color: colors.textSecondary },
  lease: { fontSize: 11, color: colors.textMuted },
});
