import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  ActivityIndicator,
  Modal,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/auth.store';
import {
  claimBuildingTrial,
  fetchPlatformSettings,
  refreshMyAccess,
} from '../services/platform.service';
import { isBuildingAdmin, isAppAdmin, type PlatformSettings } from '../types';
import { subscribeActivationPopup } from '../utils/buildingLock';
import { colors, spacing, borderRadius, typography, shadows } from '../theme';

const POPUP_DELAY_MS = 2800;

function whatsappUrl(raw?: string) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

/** Always derive from numeric days — never trust a stale label string. */
function trialLengthLabel(days?: number) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return 'free trial';
  if (n === 7) return '7 days';
  if (n === 14) return '14 days';
  if (n === 30) return '1 month';
  if (n === 60) return '2 months';
  if (n % 30 === 0) return `${n / 30} month${n / 30 === 1 ? '' : 's'}`;
  return `${n} day${n === 1 ? '' : 's'}`;
}

/**
 * Locked / expired: compact lock chip (top-center) + activation popup.
 * Active trial: same spot shows remaining days (does not span the header).
 */
export function BuildingAccessChrome() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [livePlatform, setLivePlatform] = useState<PlatformSettings | null>(null);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasScheduledPopup = useRef(false);

  const access = user?.buildingAccess;
  const platform = livePlatform ?? user?.platform;
  const canWrite = access?.canWrite ?? true;
  const status = access?.status;
  const locked = Boolean(access) && !canWrite;
  const isAdmin = isBuildingAdmin(user?.role) || isAppAdmin(user?.role);
  const trialOffered = Boolean(platform?.freeTrialEnabled);
  const trialDays = Number(platform?.freeTrialDays) || 0;
  const trialAvailable = trialOffered && !access?.trialClaimed && isAdmin;
  const trialLabel = trialLengthLabel(trialDays);
  const wa = whatsappUrl(platform?.supportWhatsApp);
  const showWhatsApp =
    !trialOffered || status === 'expired' || (Boolean(access?.trialClaimed) && !trialAvailable);

  const clearDelay = () => {
    if (delayTimer.current) {
      clearTimeout(delayTimer.current);
      delayTimer.current = null;
    }
  };

  const openPanel = useCallback(() => {
    clearDelay();
    hasScheduledPopup.current = true;
    setPanelOpen(true);
  }, []);

  const schedulePopup = useCallback(() => {
    if (hasScheduledPopup.current) return;
    hasScheduledPopup.current = true;
    clearDelay();
    delayTimer.current = setTimeout(() => {
      setPanelOpen(true);
    }, POPUP_DELAY_MS);
  }, []);

  const syncAccess = useCallback(async () => {
    try {
      const [next, settings] = await Promise.all([
        refreshMyAccess(),
        fetchPlatformSettings(),
      ]);
      setLivePlatform(settings);

      // Never drop buildingAccess if /auth/me omits it (older API / partial payload).
      const merged = {
        ...next,
        buildingAccess: next.buildingAccess ?? user?.buildingAccess,
        platform: settings,
      };
      setUser(merged);

      const accessInfo = merged.buildingAccess;
      if (!accessInfo) return;

      const nextLocked = !accessInfo.canWrite;
      if (nextLocked && isAdmin) {
        schedulePopup();
      } else if (!nextLocked) {
        clearDelay();
        hasScheduledPopup.current = false;
        setPanelOpen(false);
      }
    } catch {
      // keep cached access — still show popup if we already know we're locked
      if (locked && isAdmin) schedulePopup();
    }
  }, [setUser, schedulePopup, user?.buildingAccess, locked, isAdmin]);

  useEffect(() => {
    if (!isAuthenticated || !user?.buildingId) return;
    void syncAccess();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void syncAccess();
    };
    const sub = AppState.addEventListener('change', onAppState);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void syncAccess();
    }, 5_000);

    return () => {
      sub.remove();
      clearInterval(timer);
      clearDelay();
    };
  }, [isAuthenticated, user?.buildingId, syncAccess]);

  // Signup/login payloads already include buildingAccess — don't wait on sync to open.
  useEffect(() => {
    if (locked && isAdmin) schedulePopup();
  }, [locked, isAdmin, schedulePopup]);

  useEffect(() => {
    return subscribeActivationPopup(() => {
      if (!locked) return;
      openPanel();
      void syncAccess();
    });
  }, [locked, openPanel, syncAccess]);

  const startTrial = async () => {
    if (!user?.buildingId) return;
    setBusy(true);
    setError(null);
    try {
      const latest = await fetchPlatformSettings().catch(() => livePlatform);
      if (latest) setLivePlatform(latest);

      const result = await claimBuildingTrial(user.buildingId);
      if (result.platform) setLivePlatform(result.platform);
      setUser({
        ...user,
        buildingAccess: result.access,
        platform: result.platform ?? latest ?? user.platform,
      });
      setPanelOpen(false);
      hasScheduledPopup.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start free trial');
    } finally {
      setBusy(false);
    }
  };

  const openSupport = () => {
    if (wa) void Linking.openURL(wa);
  };

  const closePanel = () => setPanelOpen(false);

  if (!isAuthenticated || !user?.buildingId) return null;

  const chipTop = { top: insets.top + 6 };

  // Active free trial chip is for building admins only — residents should not see it.
  if (status === 'trial' && canWrite) {
    if (!isAdmin) return null;
    const days = access?.trialDaysRemaining ?? 0;
    return (
      <View style={[styles.chipAnchor, chipTop]} pointerEvents="box-none">
        <View style={styles.trialChip} accessibilityLabel={`Free trial, ${days} days left`}>
          <View style={styles.trialChipIcon}>
            <Ionicons name="gift" size={12} color={colors.white} />
          </View>
          <Text style={styles.trialChipLabel}>Free trial</Text>
          <Text style={styles.trialChipDays}>
            {days}d left
          </Text>
        </View>
      </View>
    );
  }

  if (!locked) return null;

  const title = status === 'expired' ? 'Access ended' : 'Activation required';
  const body =
    status === 'expired'
      ? 'Your free trial or subscription has ended. Contact Barighorr support to reactivate this building.'
      : trialAvailable
        ? `Actions are locked until you start your ${trialLabel} free trial.`
        : trialOffered && !isAdmin
          ? 'Actions are locked. Ask your building admin to start the free trial.'
          : 'Actions are locked until this building is activated by support.';

  return (
    <>
      {isAdmin && !panelOpen ? (
        <View style={[styles.chipAnchor, chipTop]} pointerEvents="box-none">
          <Pressable
            style={({ pressed }) => [styles.lockChip, pressed && styles.lockChipPressed]}
            onPress={() => {
              openPanel();
              void syncAccess();
            }}
            accessibilityLabel="Building locked — activation required"
          >
            <View style={styles.lockChipIcon}>
              <Ionicons name="lock-closed" size={14} color={colors.white} />
            </View>
            <Text style={styles.lockChipText}>Locked</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={panelOpen}
        transparent
        animationType="fade"
        onRequestClose={closePanel}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.dim} onPress={closePanel} />
          <View style={styles.card}>
            <Pressable
              style={styles.closeBtn}
              onPress={closePanel}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>

            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed" size={26} color={colors.primary} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>

            {trialOffered ? (
              <View style={styles.trialPill}>
                <Ionicons name="gift-outline" size={16} color={colors.primary} />
                <Text style={styles.trialPillText}>
                  Free trial · {trialLabel}
                  {access?.trialClaimed ? ' · already claimed' : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.trialPillMuted}>
                <Text style={styles.trialPillMutedText}>Free trial is not offered right now</Text>
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {trialAvailable ? (
              <Pressable
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                onPress={() => void startTrial()}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={18} color={colors.white} />
                    <Text style={styles.primaryBtnText}>Start {trialLabel} free trial</Text>
                  </>
                )}
              </Pressable>
            ) : null}

            {showWhatsApp ? (
              <Pressable
                style={[styles.whatsappBtn, !wa && styles.btnDisabled]}
                onPress={openSupport}
                disabled={!wa}
              >
                <Ionicons name="logo-whatsapp" size={20} color={colors.white} />
                <Text style={styles.whatsappText}>
                  {wa ? 'Contact support on WhatsApp' : 'Support WhatsApp not configured'}
                </Text>
              </Pressable>
            ) : null}

            {!isAdmin && trialOffered ? (
              <Text style={styles.footerHint}>
                Only the building admin can start the free trial for everyone.
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chipAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 70,
    alignItems: 'center',
  },
  lockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    ...shadows.sm,
  },
  lockChipPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  lockChipIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockChipText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  trialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    paddingLeft: 5,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 12,
    ...shadows.sm,
  },
  trialChipIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialChipLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  trialChipDays: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg + 8,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    zIndex: 2,
    ...shadows.md,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', fontSize: 22 },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  trialPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
  },
  trialPillText: { ...typography.bodySmall, color: colors.primary, fontWeight: '700' },
  trialPillMuted: {
    alignSelf: 'center',
    backgroundColor: colors.slate100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
  },
  trialPillMutedText: { ...typography.bodySmall, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  primaryBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  whatsappBtn: {
    backgroundColor: '#25D366',
    borderRadius: borderRadius.md,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  whatsappText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  footerHint: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
});
