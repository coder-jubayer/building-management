import { Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type Props = {
  title: string;
  onClose: () => void;
};

export function PopupHeader({ title, onClose }: Props) {
  return (
    <>
      <Pressable
        onPress={onClose}
        hitSlop={12}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={28} color={colors.text} />
      </Pressable>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    paddingRight: 32,
    marginBottom: 4,
  },
});
