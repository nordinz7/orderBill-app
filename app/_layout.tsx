import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import { initDatabase } from '@/services/database';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';

function InnerLayout() {
  const { colors, tr } = useSettings();
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
          name="add-payment"
          options={{ title: tr.addPayment, presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="customer-detail"
          options={{ title: tr.customerDetail }}
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
