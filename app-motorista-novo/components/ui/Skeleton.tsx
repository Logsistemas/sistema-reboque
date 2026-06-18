import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius } from '../../lib/ui/theme';

type Props = {
  height?: number;
  width?: number | `${number}%`;
  style?: ViewStyle;
};

export function Skeleton({ height = 16, width = '100%', style }: Props) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.base,
        { height, width, opacity: pulse },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton height={20} width="55%" />
      <Skeleton height={14} width="35%" style={{ marginTop: 10 }} />
      <Skeleton height={14} width="80%" style={{ marginTop: 14 }} />
      <Skeleton height={14} width="70%" style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
