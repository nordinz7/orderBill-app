import { FontSizes } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <MaterialIcons name={name} size={26} color={color} />;
}

export default function TabLayout() {
  const { colors, tr } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          // Fix: add system navigation bar height so tabs don't overlap
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: FontSizes.xs,
          fontWeight: '600',
        },
        headerShown: false,
        sceneStyle: { paddingTop: insets.top },
      }}
    >
      <Tabs.Screen
        name="orders"
        options={{
          title: tr.orders,
          tabBarIcon: ({ color }) => <TabIcon name="receipt-long" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: tr.customers,
          tabBarIcon: ({ color }) => <TabIcon name="people" color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: tr.transactions,
          tabBarIcon: ({ color }) => <TabIcon name="swap-horiz" color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: tr.reports,
          tabBarIcon: ({ color }) => <TabIcon name="assessment" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: tr.settings,
          tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} />,
        }}
      />
      <Tabs.Screen name="backup" options={{ href: null }} />
    </Tabs>
  );
}
