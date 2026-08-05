import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface KeyboardFooterProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Action bar pinned to the bottom of a screen that rides above the keyboard.
 *
 * KeyboardStickyView translates by the full keyboard height, measured from the
 * bottom of the window. Stack screens are already padded by the bottom
 * safe-area inset, so an uncompensated translate would leave a navigation-bar
 * sized gap between the bar and the keyboard — `opened` pushes it back down by
 * exactly that much.
 */
export default function KeyboardFooter({ children, style }: KeyboardFooterProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={style}>
      {children}
    </KeyboardStickyView>
  );
}
