import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme';
import { useAccessChromeInset } from '../hooks/useAccessChromeInset';

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  /** Extra content below the title (e.g. tabs) — stays fixed with the header */
  children?: React.ReactNode;
}

export function PageHeader({ title, onBack, rightAction, children }: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  const chromeInset = useAccessChromeInset();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + chromeInset + spacing.md,
        },
      ]}
    >
      <View style={styles.titleRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {rightAction ? <View style={styles.right}>{rightAction}</View> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
  },
  backBtn: {
    padding: spacing.sm,
    marginLeft: -spacing.sm,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    flex: 1,
    flexShrink: 1,
  },
  right: {
    marginLeft: spacing.sm,
  },
});
