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
import { createExpense, createExpenseCategory, deleteExpense, fetchExpenses } from '../src/services/expenses.service';
import { formatMoney } from '../src/utils/money';
import {
  Building,
  ExpenseBreakdown,
  ExpenseCategory,
  ExpenseCategoryOption,
  ExpenseItem,
  canManageExpenses,
  isAppAdmin,
} from '../src/types';

const now = new Date();

const CATEGORY_COLORS = [
  '#6366F1',
  '#06B6D4',
  '#8B5CF6',
  '#F59E0B',
  '#10B981',
  '#EAB308',
  '#3B82F6',
  '#E11D48',
  '#0EA5E9',
  '#D97706',
  '#059669',
  '#9CA3AF',
];

export default function ExpensesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tileWidth = (width - spacing.lg * 2 - 10) / 2;
  const user = useAuthStore((s) => s.user);
  const manager = canManageExpenses(user?.role);
  const appAdmin = isAppAdmin(user?.role);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthLabel, setMonthLabel] = useState('');
  const [total, setTotal] = useState(0);
  const [canManage, setCanManage] = useState(manager);
  const [breakdown, setBreakdown] = useState<ExpenseBreakdown[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingId, setBuildingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('guard_salary');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchExpenses({
        year,
        month,
        buildingId: appAdmin ? buildingId || undefined : undefined,
      });
      setMonthLabel(data.monthLabel);
      setTotal(data.total);
      setCanManage(data.canManage);
      setBreakdown(data.breakdown);
      setExpenses(data.expenses);
      setCategories(data.categories);
      setBuildings(data.buildings ?? []);
      setBuildingId((current) => current || data.buildings?.[0]?.id || '');
      setCategory((current) =>
        data.categories.some((c) => c.value === current) ? current : (data.categories[0]?.value ?? 'guard_salary'),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, month, appAdmin, buildingId]);

  useFocusEffect(
    useCallback(() => {
      void loadExpenses();
    }, [loadExpenses]),
  );

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  };

  const resetForm = () => {
    setCategory(categories[0]?.value ?? 'guard_salary');
    setAmount('');
    setNote('');
    setFormError(null);
  };

  const openAddCategory = () => {
    const used = new Set(categories.map((item) => item.color.toLowerCase()));
    setNewCategoryColor(CATEGORY_COLORS.find((color) => !used.has(color.toLowerCase())) ?? CATEGORY_COLORS[0]);
    setNewCategoryName('');
    setCategoryFormError(null);
    setCategoryOpen(true);
  };

  const handleCreateCategory = async () => {
    const label = newCategoryName.trim();
    if (label.length < 2) {
      setCategoryFormError('Enter a category name.');
      return;
    }
    if (appAdmin && !buildingId) {
      setCategoryFormError('Select a building first.');
      return;
    }

    setSavingCategory(true);
    setCategoryFormError(null);
    try {
      const created = await createExpenseCategory({
        label,
        color: newCategoryColor,
        buildingId: appAdmin ? buildingId : undefined,
      });
      setCategories((current) => [...current, created]);
      setCategory(created.value);
      setCategoryOpen(false);
      showToast('Category added');
    } catch (err) {
      setCategoryFormError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCreate = async () => {
    const parsed = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFormError('Enter a valid amount greater than 0.');
      return;
    }
    if (appAdmin && !buildingId) {
      setFormError('Select a building.');
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      await createExpense({
        year,
        month,
        category,
        amount: parsed,
        note: note.trim() || undefined,
        buildingId: appAdmin ? buildingId : undefined,
      });
      setCreateOpen(false);
      resetForm();
      await loadExpenses();
      showToast('Expense added');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add expense');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExpense(deleteTarget.id);
      setDeleteTarget(null);
      await loadExpenses();
      showToast('Expense deleted');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const visibleBreakdown = useMemo(
    () => breakdown.filter((item) => item.amount > 0),
    [breakdown],
  );

  return (
    <View style={styles.root}>
      <PageHeader title="Society Expenses" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadExpenses();
            }}
          />
        }
      >
        <View style={styles.monthRow}>
          <Pressable onPress={() => shiftMonth(-1)} style={styles.monthBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel || 'This month'}</Text>
          <Pressable onPress={() => shiftMonth(1)} style={styles.monthBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>

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

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Total Expenses ({monthLabel || 'This month'})</Text>
          <Text style={styles.heroValue}>{formatMoney(total)}</Text>
        </View>

        {canManage ? (
          <Pressable
            style={styles.addBtn}
            onPress={() => {
              resetForm();
              setCategoryOpen(false);
              setCreateOpen(true);
            }}
          >
            <Text style={styles.addBtnText}>+ Add New Expense</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && !expenses.length && !visibleBreakdown.length ? (
          <Text style={styles.muted}>Loading expenses…</Text>
        ) : null}

        <Text style={styles.section}>Expense Breakdown</Text>
        {!loading && visibleBreakdown.length === 0 ? (
          <Text style={styles.muted}>No expenses recorded for this month.</Text>
        ) : null}
        {visibleBreakdown.map((item) => (
          <View key={item.category} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.left}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <Text style={styles.name} numberOfLines={1}>{item.label}</Text>
              </View>
              <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: item.color,
                    width: `${Math.min(100, item.percent)}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.percent}>{item.percent}% of monthly total</Text>
          </View>
        ))}

        {canManage && expenses.length > 0 ? (
          <>
            <Text style={styles.section}>Line items</Text>
            {expenses.map((item) => (
              <View key={item.id} style={styles.lineCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineTitle}>{item.categoryLabel}</Text>
                  <Text style={styles.lineMeta}>
                    {item.addedByName}
                    {item.note ? ` · ${item.note}` : ''}
                  </Text>
                </View>
                <Text style={styles.lineAmount}>{formatMoney(item.amount)}</Text>
                <Pressable onPress={() => setDeleteTarget(item)} hitSlop={8} style={styles.lineDelete}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
            ))}
          </>
        ) : null}
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
            {categoryOpen ? (
              <>
                <PopupHeader title="New category" onClose={() => setCreateOpen(false)} />
                <Text style={styles.sheetSubtitle}>It will appear in this building’s expense list.</Text>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
                  <Input
                    label="Category name"
                    value={newCategoryName}
                    onChangeText={(value) => {
                      setNewCategoryName(value);
                      setCategoryFormError(null);
                    }}
                    placeholder="e.g. Pest Control"
                  />
                  <Text style={styles.fieldLabel}>Color</Text>
                  <View style={styles.colorRow}>
                    {CATEGORY_COLORS.map((color) => (
                      <Pressable
                        key={color}
                        onPress={() => setNewCategoryColor(color)}
                        style={[
                          styles.colorDot,
                          { backgroundColor: color },
                          newCategoryColor === color && styles.colorDotActive,
                        ]}
                      />
                    ))}
                  </View>
                  {categoryFormError ? <Text style={styles.error}>{categoryFormError}</Text> : null}
                  <Button title="Add category" loading={savingCategory} onPress={() => void handleCreateCategory()} />
                  <Button title="Back" variant="ghost" onPress={() => setCategoryOpen(false)} />
                </ScrollView>
              </>
            ) : (
              <>
                <PopupHeader title="Add expense" onClose={() => setCreateOpen(false)} />
                <Text style={styles.sheetSubtitle}>{monthLabel || 'This month'}</Text>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
                  <Text style={styles.fieldLabel}>Category</Text>
                  <View style={styles.catGrid}>
                    {categories.map((option) => {
                      const selected = category === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => setCategory(option.value)}
                          style={[
                            styles.catTile,
                            { width: tileWidth },
                            selected && styles.catTileActive,
                          ]}
                        >
                          <View style={[styles.catSwatch, { backgroundColor: option.color }]} />
                          <Text
                            numberOfLines={2}
                            style={[styles.catTileLabel, selected && styles.catTileLabelActive]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={openAddCategory}
                      style={[styles.catTile, styles.catTileAdd, { width: tileWidth }]}
                    >
                      <View style={styles.catAddIcon}>
                        <Ionicons name="add" size={22} color={colors.primary} />
                      </View>
                      <Text style={styles.catAddLabel}>Add category</Text>
                    </Pressable>
                  </View>
                  <Input
                    label="Amount"
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                  <Input
                    label="Note (optional)"
                    value={note}
                    onChangeText={setNote}
                    placeholder="Invoice #, vendor, etc."
                  />
                  {formError ? <Text style={styles.error}>{formError}</Text> : null}
                  <Button title="Save expense" loading={creating} onPress={() => void handleCreate()} />
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
            <PopupHeader title="Delete expense?" onClose={() => setDeleteTarget(null)} />
            <Text style={styles.confirmBody}>
              {deleteTarget
                ? `${deleteTarget.categoryLabel} · ${formatMoney(deleteTarget.amount)} will be removed.`
                : ''}
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
  content: { padding: spacing.md },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius['3xl'],
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  heroLabel: { color: '#C7D2FE', fontSize: 13, fontWeight: '500', marginBottom: 4 },
  heroValue: { fontSize: 36, fontWeight: '700', color: colors.white },
  addBtn: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  section: { fontWeight: '700', color: colors.text, marginBottom: spacing.md, paddingHorizontal: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    minHeight: 92,
    ...shadows.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8, minHeight: 22 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { fontWeight: '600', color: colors.slate800, flex: 1 },
  amount: { fontWeight: '700', color: colors.text, minWidth: 88, textAlign: 'right' },
  track: {
    height: 8,
    backgroundColor: colors.slate100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  percent: { marginTop: 6, fontSize: 11, color: colors.textMuted },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  lineTitle: { fontWeight: '700', color: colors.text },
  lineMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  lineAmount: { fontWeight: '700', color: colors.text },
  lineDelete: { padding: 4 },
  muted: { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  error: { color: colors.error, fontSize: 13, textAlign: 'center', marginBottom: spacing.md },
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
  chipRow: { gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: colors.white },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  catTile: {
    height: 84,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  catTileActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  catSwatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  catTileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 18,
  },
  catTileLabelActive: {
    color: colors.primaryDark,
  },
  catTileAdd: {
    borderStyle: 'dashed',
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primaryLight,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  catAddIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catAddLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: colors.text,
  },
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
