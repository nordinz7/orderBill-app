import { KEYBOARD_BOTTOM_OFFSET } from '@/components/KeyboardScrollView';
import type { FlatListProps, ScrollViewProps, SectionListProps } from 'react-native';
import { FlatList, SectionList } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

/** Gap kept between the focused input and the top of the keyboard. */
const DEFAULT_BOTTOM_OFFSET = KEYBOARD_BOTTOM_OFFSET;

/**
 * Lists whose rows contain text inputs.
 *
 * A plain FlatList/SectionList never scrolls a focused row out from behind the
 * keyboard — the IME just covers the bottom of the viewport and the scroll
 * offset stays put. Swapping the underlying scroll container for
 * KeyboardAwareScrollView gives lists the same focused-input tracking that
 * forms get from KeyboardScrollView, so tapping a row halfway down the list
 * lifts it above the keyboard.
 *
 * Use these instead of wrapping a list in KeyboardAvoidingView: padding shrinks
 * the viewport but leaves the scroll offset alone, which is exactly why the
 * focused row stayed hidden.
 */
function keyboardScrollComponent(bottomOffset: number) {
  return function KeyboardScrollComponent(props: ScrollViewProps) {
    return <KeyboardAwareScrollView {...props} bottomOffset={bottomOffset} />;
  };
}

interface KeyboardListViewProps<T> extends FlatListProps<T> {
  bottomOffset?: number;
}

export default function KeyboardListView<T>({
  bottomOffset = DEFAULT_BOTTOM_OFFSET,
  ...props
}: KeyboardListViewProps<T>) {
  return (
    <FlatList
      keyboardShouldPersistTaps="handled"
      {...props}
      renderScrollComponent={keyboardScrollComponent(bottomOffset)}
    />
  );
}

interface KeyboardSectionListProps<T, S> extends SectionListProps<T, S> {
  bottomOffset?: number;
}

export function KeyboardSectionList<T, S>({
  bottomOffset = DEFAULT_BOTTOM_OFFSET,
  ...props
}: KeyboardSectionListProps<T, S>) {
  return (
    <SectionList
      keyboardShouldPersistTaps="handled"
      {...props}
      renderScrollComponent={keyboardScrollComponent(bottomOffset)}
    />
  );
}
