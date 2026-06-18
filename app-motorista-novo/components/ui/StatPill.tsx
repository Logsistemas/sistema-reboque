import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadowSoft } from '../../lib/ui/theme';

type Props = {
  label: string;
  value: number | string;
  accent?: string;
};

export function StatPill({ label, value, accent = colors.royal }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowSoft,
  },
  value: {
    fontSize: 22,
    fontWeight: '900',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 4,
    textAlign: 'center',
  },
});
