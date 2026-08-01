import type { Translations } from '@/constants/translations';
import type { Router } from 'expo-router';
import { Alert } from 'react-native';

/**
 * Dead-end guard for screens that require at least one customer: offers to create
 * one, otherwise backs out of the screen.
 */
export function promptAddFirstCustomer(tr: Translations, router: Router): void {
  Alert.alert(tr.noCustomersYet, tr.tapToAdd, [
    { text: tr.cancel, style: 'cancel', onPress: () => router.back() },
    { text: tr.addCustomer, onPress: () => router.replace('/add-customer') },
  ]);
}
