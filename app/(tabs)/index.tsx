import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { Customer, getActiveCustomers, getAllCustomers, softDeleteCustomer } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: c.background },
    topBar: {
      backgroundColor: c.card,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: Spacing.sm,
    },
    filterRow:   { flexDirection: 'row', gap: Spacing.sm },
    chip: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.filterInactive,
    },
    chipActive:     { backgroundColor: c.primary },
    chipText:       { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    chipTextActive: { color: '#FFFFFF' },
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
    cardDeleted: { opacity: 0.5 },
    cardContent: { flex: 1 },
    nameRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    name:        { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
    deletedBadge: {
      paddingHorizontal: 6, paddingVertical: 1,
      borderRadius: 4,
      backgroundColor: c.danger,
    },
    deletedBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
    sub:         { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 2 },
    actions:     { flexDirection: 'row', gap: 2 },
    callBtn:     { padding: 8 },
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
  const [showAll, setShowAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (all = showAll) => {
    setCustomers(all ? await getAllCustomers(db) : await getActiveCustomers(db));
  }, [db, showAll]);

  useFocusEffect(useCallback(() => { load(showAll); }, [showAll, load]));

  const onRefresh = async () => { setRefreshing(true); await load(showAll); setRefreshing(false); };

  const toggleShowAll = (val: boolean) => { setShowAll(val); load(val); };

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
          await softDeleteCustomer(db, item.id); load(showAll);
        },
      },
    ]);
  };

  const handleCall = (phone: string) => {
    Linking.openURL('tel:+' + phone.replace(/\D/g, ''));
  };

  const renderItem = ({ item }: { item: Customer }) => {
    const isDeleted = item.status === 'deleted';
    return (
      <View style={[S.card, isDeleted && S.cardDeleted]}>
        <View style={S.cardContent}>
          <View style={S.nameRow}>
            <Text style={S.name}>{item.name}</Text>
            {isDeleted && (
              <View style={S.deletedBadge}>
                <Text style={S.deletedBadgeText}>DELETED</Text>
              </View>
            )}
          </View>
          <Text style={S.sub} numberOfLines={1}>
            <MaterialIcons name="location-on" size={13} color={colors.textSecondary} /> {item.place}
            {'   '}
            <MaterialIcons name="phone" size={13} color={colors.textSecondary} /> {item.phone_number}
          </Text>
        </View>
        <View style={S.actions}>
          <TouchableOpacity style={S.callBtn} onPress={() => handleCall(item.phone_number)}>
            <MaterialIcons name="call" size={22} color={colors.success} />
          </TouchableOpacity>
          {!isDeleted && (
            <>
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
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={S.container}>
      <View style={S.topBar}>
        <View style={S.filterRow}>
          <TouchableOpacity style={[S.chip, !showAll && S.chipActive]} onPress={() => toggleShowAll(false)}>
            <Text style={[S.chipText, !showAll && S.chipTextActive]}>{tr.customers}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.chip, showAll && S.chipActive]} onPress={() => toggleShowAll(true)}>
            <Text style={[S.chipText, showAll && S.chipTextActive]}>All</Text>
          </TouchableOpacity>
        </View>
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
