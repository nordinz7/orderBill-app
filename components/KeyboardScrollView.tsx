import { Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

interface KeyboardScrollViewProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Scrolling form container that keeps the focused input visible.
 *
 * Padding alone is not enough: an input further down the form is still behind
 * the keyboard once it opens, because nothing scrolls it up. This measures the
 * focused input and scrolls it above the keyboard, which is what actually fixes
 * "I can't see what I'm typing".
 */
export default function KeyboardScrollView({
  children,
  style,
  contentContainerStyle,
}: KeyboardScrollViewProps) {
  const { colors } = useSettings();

  return (
    <KeyboardAwareScrollView
      // Breathing room between the caret and the top of the keyboard.
      bottomOffset={Spacing.xxl}
      keyboardShouldPersistTaps="handled"
      style={[{ flex: 1, backgroundColor: colors.background }, style]}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
