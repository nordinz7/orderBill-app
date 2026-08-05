import type { ReactNode } from 'react';
import { Modal } from 'react-native';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';

interface KeyboardModalProps {
  visible: boolean;
  onRequestClose: () => void;
  animationType?: 'slide' | 'fade' | 'none';
  children: ReactNode;
}

/**
 * Transparent slide-up Modal whose content stays above the software keyboard.
 *
 * A React Native Modal is its own Android window, so the KeyboardProvider in
 * the root layout does not reach inside it — it needs its own. The translucent
 * flags let the sheet draw behind the status and navigation bars, which is
 * required for the keyboard insets to be measured correctly under edge-to-edge.
 * Sheets rendered as children still need their own bottom safe-area padding.
 */
export default function KeyboardModal({
  visible,
  onRequestClose,
  animationType = 'slide',
  children,
}: KeyboardModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onRequestClose}
    >
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {children}
        </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
