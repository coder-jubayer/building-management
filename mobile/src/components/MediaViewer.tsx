import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

export type MediaViewerItem = {
  url: string;
  kind: 'image' | 'video';
};

type Props = {
  visible: boolean;
  item: MediaViewerItem | null;
  onClose: () => void;
};

function VideoBody({ url }: { url: string }) {
  const { width, height } = useWindowDimensions();
  const player = useVideoPlayer(url, (next) => {
    next.loop = false;
    next.play();
  });

  return (
    <VideoView
      style={{ width, height: Math.min(height * 0.72, width * 1.2) }}
      player={player}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}

export function MediaViewer({ visible, item, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={16} accessibilityLabel="Close media">
          <Ionicons name="close" size={28} color={colors.white} />
        </Pressable>
        <View style={styles.body}>
          {visible && item?.kind === 'image' ? (
            <Image source={{ uri: item.url }} style={styles.image} contentFit="contain" />
          ) : null}
          {visible && item?.kind === 'video' ? <VideoBody key={item.url} url={item.url} /> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  close: {
    alignSelf: 'flex-end',
    marginRight: 16,
    marginBottom: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
