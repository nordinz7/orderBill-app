import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, RefreshControl,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getActiveCustomers, softDeleteCustomer, Customer } from '@/services/database';
import { useSettings } from '@/contexts/SettingsContext';
import { AppColors, FontSizes, Spacing, Radius } from '@/constants/theme';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.background },
    listContent:  { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
    emptyOuter:   { flexGrow: 1 },
    card: {
      backgroundColor: c.card,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    cardContent:   { flex: 1 },
    name:          { fontSize: FontSizes.xl, fontWeight: '700', color: c.text, marginBottom: 4 },
    sub:           { fontSize: FontSizes.md, color: c.textSecondary, marginBottom: 2 },
    date:          { fontSize: FontSizes.sm, color: c.textMuted, marginTop: 4 },
    actions:       { flexDirection: 'column', gap: Spacing.xs },
    editBtn:       { padding: Spacing.xs },
    deleteBtn:     { padding: Spacing.xs },
    emptyWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText:     { fontSize: FontSizes.xl, fontWeight: '600', color: c.textSecondary, marginTop: Spacing.lg },
    emptySubText:  { fontSize: FontSizes.md, color: c.textMuted, marginTop: Spacing.sm, textAlign: 'center', paddingHorizontal: Spacing.xl },
    fab: {
      position: 'absolute', bottom: 24, right: 24,
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: c.primary,
      justifyContent: 'center', alignItems: 'center',
      elevation: 6,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 8,
    },
  });
}

export default function CustomersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setCustomers(await getActiveCustomers(db));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleDelete = (item: Customer) => {
    Alert.alert(tr.removeCustomer, tr.removeCustomerMsg(item.name), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.remove, style: 'destructive', onPress: async () => {
          await softDeleteCustomer(db, item.id); load();
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Customer }) => (
    <View style={S.card}>
      <View style={S.cardContent}>
        <Text style={S.name}>{item.name}</Text>
        <Text style={S.sub}>
          <MaterialIcons name="location-on" size={14} color={colors.textSecondary} /> {item.place}
        </Text>
        <Text style={S.sub}>
          <MaterialIcons name="phone" size={14} color={colors.textSecondary} /> {item.phone_number}
        </Text>
        <Text style={S.date}>
          {tr.added} {format(new Date(item.created_date), 'dd MMM yyyy')}
        </Text>
        {item.updated_at && item.updated_at !== item.created_date && (
          <Text style={S.date}>
            {tr.lastUpdated} {format(new Date(item.updated_at), 'dd MMM yyyy, hh:mm a')}
          </Text>
        )}
      </View>
      <View style={S.actions}>
        <TouchableOpacity
          style={S.editBtn}
          onPress={() => router.push({ pathname: '/edit-customer', params: { id: item.id, name: item.name, place: item.place, phone: item.phone_number } })}
          accessibilityLabel={tr.edit}
        >
          <MaterialIcons name="edit" size={24} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={S.deleteBtn} onPress={() => handleDelete(item)} accessibilityLabel={tr.remove}>
          <MaterialIcons name="delete-outline" size={24} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={S.container}>
      <FlatList
        data={customers}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={customers.length === 0 ? S.emptyOuter : S.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={S.emptyWrap}>
            <MaterialIcons name="people-outline" size={72} color={colors.textMuted} />
            <Text style={S.emptyText}>{tr.noCustomersYet}</Text>
            <Text style={S.emptySubText}>{tr.tapToAdd}</Text>
          </View>
        }
      />
      <TouchableOpacity style={S.fab} onPress={() => router.push('/add-customer')} accessibilityLabel={tr.addCustomer}>
        <MaterialIcons name="person-add" size={30} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}
