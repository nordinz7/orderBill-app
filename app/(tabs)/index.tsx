import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, RefreshControl, TextInput,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { getActiveCustomers, softDeleteCustomer, Customer } from '@/services/database';
import { useSettings } from '@/contexts/SettingsContext';
import { AppColors, FontSizes, Spacing, Radius } from '@/constants/theme';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: c.background },
    topBar: {
      backgroundColor: c.card,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    searchInput: {
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      fontSize: FontSizes.md,
      color: c.text,
    },
    listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },
    emptyOuter:  { flexGrow: 1 },
    card: {
      backgroundColor: c.card,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },
    cardContent: { flex: 1 },
    name:        { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
    sub:         { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 2 },
    actions:     { flexDirection: 'row', gap: 2 },
    iconBtn:     { padding: 8 },
    emptyWrap:   { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText:   { fontSize: FontSizes.xl, fontWeight: '600', color: c.textSecondary, marginTop: Spacing.lg },
    emptySubText:{ fontSize: FontSizes.md, color: c.textMuted, marginTop: Spacing.sm, textAlign: 'center', paddingHorizontal: Spacing.xl },
    fab: {
      position: 'absolute', bottom: 24, right: 24,
      width: 60, height: 60, borderRadius: 30,
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
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setCustomers(await getActiveCustomers(db));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const displayed = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.trim().toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.place.toLowerCase().includes(q) ||
      c.phone_number.includes(q)
    );
  }, [customers, search]);

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
        <Text style={S.sub} numberOfLines={1}>
          <MaterialIcons name="location-on" size={13} color={colors.textSecondary} /> {item.place}
          {'   '}
          <MaterialIcons name="phone" size={13} color={colors.textSecondary} /> {item.phone_number}
        </Text>
      </View>
      <View style={S.actions}>
        <TouchableOpacity
          style={S.iconBtn}
          onPress={() => router.push({ pathname: '/edit-customer', params: { id: item.id, name: item.name, place: item.place, phone: item.phone_number } })}
          accessibilityLabel={tr.edit}
        >
          <MaterialIcons name="edit" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={S.iconBtn} onPress={() => handleDelete(item)} accessibilityLabel={tr.remove}>
          <MaterialIcons name="delete-outline" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={S.container}>
      <View style={S.topBar}>
        <TextInput
          style={S.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={tr.searchCustomers}
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={displayed}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={displayed.length === 0 ? S.emptyOuter : S.listContent}
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
