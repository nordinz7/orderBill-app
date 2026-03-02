import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { initDatabase } from '@/services/database';
import { saveLocalBackup } from '@/utils/backup';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, View } from 'react-native';

function InnerLayout() {
  const { colors, tr } = useSettings();
  const db = useSQLiteContext();
  const appState = useRef(AppState.currentState);

  // Auto-save local backup when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current === 'active' && (next === 'inactive' || next === 'background')) {
        saveLocalBackup(db);
      }
      appState.current = next;
    });
    // Also save once on mount
    saveLocalBackup(db);
    return () => sub.remove();
  }, [db]);

  return (
    <>
      <StatusBar style={colors.statusBar} backgroundColor={colors.headerBg} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.headerBg },
          headerTintColor: colors.headerText,
          headerTitleStyle: { fontSize: 20, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-customer"
          options={{ title: tr.addCustomer, presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="edit-customer"
          options={{ title: tr.editCustomer, presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="add-order"
          options={{ title: tr.newOrder, presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="bulk-orders"
          options={{ title: tr.bulkOrders, presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="edit-order"
          options={{ title: tr.editOrder, presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="add-payment"
          options={{ title: tr.addPayment, presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="customer-detail"
          options={{ title: tr.customerDetail }}
        />
        <Stack.Screen
          name="view-statement"
          options={{ title: tr.viewStatement }}
        />
        <Stack.Screen
          name="view-invoice"
          options={{ title: tr.sendInvoice }}
        />
        <Stack.Screen
          name="preview-statement"
          options={{ title: tr.previewStatement }}
        />
        <Stack.Screen
          name="developer"
          options={{ title: 'Developer Tools' }}
        />
      </Stack>
    </>
  );
}

function LoadingFallback() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Suspense fallback={<LoadingFallback />}>
        <SQLiteProvider databaseName="mfc.db" onInit={initDatabase}>
          <InnerLayout />
        </SQLiteProvider>
      </Suspense>
    </SettingsProvider>
  );
}
