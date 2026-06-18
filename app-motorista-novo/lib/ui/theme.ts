import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  navy: '#0B1F44',
  navyPressed: '#16336B',
  navyDark: '#071428',
  royal: '#2563EB',
  royalDark: '#1D4ED8',
  waze: '#33CCFF',
  wazePressed: '#2BB8E6',
  orange: '#F97316',
  orangeDark: '#EA580C',
  success: '#16A34A',
  successDark: '#15803D',
  successDiscreet: '#15803D',
  danger: '#DC2626',
  dangerDark: '#B91C1C',
  bg: '#F5F7FA',
  bgCard: '#FFFFFF',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  text: '#0F172A',
  textMuted: '#64748B',
  textSoft: '#475569',
  warningBg: '#FFF7ED',
  warningBorder: '#FDBA74',
  warningText: '#9A3412',
  marcadoBg: '#FFF1F2',
  marcadoBorder: '#FECACA',
  glass: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.55)',
  badgeAceitoBg: '#DBEAFE',
  badgeAceitoText: '#2563EB',
  badgeOperacaoBg: '#E8EDF5',
  badgeOperacaoText: '#0B1F44',
  badgeFinalizadoBg: '#DCFCE7',
  badgeFinalizadoText: '#15803D',
  badgeRecusadoBg: '#FEE2E2',
  badgeRecusadoText: '#DC2626',
  badgePendenteBg: '#F1F5F9',
  badgePendenteText: '#475569',
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
};

export const shadow = Platform.select({
  ios: {
    shadowColor: '#0B1F44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  android: { elevation: 5 },
  default: {},
}) as ViewStyle;

export const shadowSoft = Platform.select({
  ios: {
    shadowColor: '#0B1F44',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
  default: {},
}) as ViewStyle;

export const screen: ViewStyle = {
  flex: 1,
  backgroundColor: colors.bg,
};

export const card: ViewStyle = {
  backgroundColor: colors.bgCard,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.border,
  padding: spacing.md,
  ...shadow,
};

export const input: ViewStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.sm,
  paddingHorizontal: 14,
  paddingVertical: 14,
  backgroundColor: colors.bgCard,
};

export const title: TextStyle = {
  fontSize: 26,
  fontWeight: '800',
  color: colors.navy,
};

export const subtitle: TextStyle = {
  fontSize: 15,
  color: colors.textMuted,
};

export type ButtonVariant =
  | 'primary'
  | 'orange'
  | 'success'
  | 'danger'
  | 'navy'
  | 'secondary'
  | 'waze';

const buttonColors: Record<ButtonVariant, string> = {
  primary: colors.royal,
  orange: colors.orange,
  success: colors.success,
  danger: colors.danger,
  navy: colors.navy,
  secondary: '#64748B',
  waze: colors.waze,
};

export const buttonPressedColors: Partial<Record<ButtonVariant, string>> = {
  navy: colors.navyPressed,
  waze: colors.wazePressed,
  danger: colors.dangerDark,
  primary: colors.royalDark,
};

export function buttonStyle(variant: ButtonVariant = 'primary'): ViewStyle {
  return {
    backgroundColor: buttonColors[variant],
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    minHeight: 50,
    justifyContent: 'center',
  };
}

export function buttonBackground(variant: ButtonVariant, pressed: boolean): string {
  if (pressed && buttonPressedColors[variant]) {
    return buttonPressedColors[variant]!;
  }
  return buttonColors[variant];
}

export const buttonText: TextStyle = {
  color: '#fff',
  fontWeight: '800',
  fontSize: 15,
  textAlign: 'center',
};
