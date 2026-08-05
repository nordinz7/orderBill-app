import { useSettings } from '@/contexts/SettingsContext';
import { HeaderHeightContext } from '@react-navigation/elements';
import { useContext, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

interface KeyboardScreenProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Screen shell that keeps its content clear of the software keyboard.
 *
 * Android runs edge-to-edge, so the window no longer resizes for the IME and
 * React Native's own KeyboardAvoidingView is a no-op there — inputs end up
 * hidden behind the keyboard. This uses the keyboard-controller version, which
 * tracks the IME on both platforms.
 *
 * The offset is the header height: the avoiding view measures its frame
 * relative to the stack's content area, which already starts below the header.
 * Read from the context rather than useHeaderHeight() because that hook throws
 * on screens rendered without a header, such as the tab screens.
 */
export default function KeyboardScreen({ children, style }: KeyboardScreenProps) {
  const { colors } = useSettings();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      style={[{ flex: 1, backgroundColor: colors.background }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
