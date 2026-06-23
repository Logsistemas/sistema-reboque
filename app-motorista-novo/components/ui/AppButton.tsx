import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';

import {
  buttonBackground,
  buttonStyle,
  buttonText,
  ButtonVariant,
  colors,
} from '../../lib/ui/theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function AppButton({
  label,
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
          backgroundColor:
            disabled || loading
              ? '#CBD5E1'
              : buttonBackground(variant, pressed && !disabled && !loading),
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[buttonText, disabled && styles.labelDisabled]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  labelDisabled: { color: colors.textMuted },
});
