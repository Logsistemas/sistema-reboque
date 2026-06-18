import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {
  buttonBackground,
  buttonStyle,
  buttonText,
  ButtonVariant,
} from '../../lib/ui/theme';

type Props = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function IconAppButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        buttonStyle(variant),
        {
          backgroundColor: buttonBackground(variant, pressed && !disabled && !loading),
        },
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={styles.row}>
          <Ionicons name={icon} size={20} color="#fff" style={styles.icon} />
          <Text style={buttonText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.65 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { marginRight: 8 },
});
