import { Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import type { ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

interface KeyboardScrollViewProps extends ScrollViewProps {
  /** Gap kept between the focused input and the top of the keyboard. */
  bottomOffset?: number;
}

/**
 * Scrolling form container that keeps the focused input visible.
 *
 * Padding alone is not enough: an input further down the form is still behind
 * the keyboard once it opens, because nothing scrolls it up. This measures the
 * focused input and scrolls it above the keyboard, which is what actually fixes
 * "I can't see what I'm typing".
 *
 * For lists whose rows contain inputs use KeyboardListView instead — it gives a
 * FlatList/SectionList the same behaviour.
 */
export default function KeyboardScrollView({
  bottomOffset = Spacing.xxl,
  style,
  ...props
}: KeyboardScrollViewProps) {
  const { colors } = useSettings();

  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps="handled"
      {...props}
      style={[{ flex: 1, backgroundColor: colors.background }, style]}
    />
  );
}
