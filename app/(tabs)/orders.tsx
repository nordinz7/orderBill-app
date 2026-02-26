import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, RefreshControl, TextInput,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import {
  getAllOrdersWithCustomer,
  getRecentOrdersWithCustomer,
  softDeleteOrder,
  OrderWithCustomer,
} from '@/services/database';
import { sendWhatsAppInvoice } from '@/utils/whatsapp';
import { useSettings } from '@/contexts/SettingsContext';
import { AppColors, FontSizes, Spacing, Radius } from '@/constants/theme';

type FilterMode = 'all' | 'recent';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:      { flex: 1, backgroundColor: c.background },
    topBar: {
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingBottom: Spacing.sm,
    },
    filterRow:      { flexDirection: 'row', padding: Spacing.md, gap: Spacing.sm },
    filterBtn: {
      flex: 1, paddingVertical: Spacing.sm,
      borderRadius: Radius.md, alignItems: 'center',
      backgroundColor: c.filterInactive,
    },
    filterBtnActive:   { backgroundColor: c.primary },
    filterText:        { fontSize: FontSizes.md, fontWeight: '600', color: c.textSecondary },
    filterTextActive:  { color: '#FFFFFF' },
    searchRow:         { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs },
    searchInput: {
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      fontSize: FontSizes.md,
      color: c.text,
    },
    summary: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
      backgroundColor: c.primaryLight,
    },
    summaryText:    { fontSize: FontSizes.md, color: c.primary, fontWeight: '600' },
    summaryAmount:  { fontSize: FontSizes.md, color: c.primary, fontWeight: '700' },
    listContent:    { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
    emptyOuter:     { flexGrow: 1 },
    card: {
      backgroundColor: c.card,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    customerName:   { fontSize: FontSizes.xl, fontWeight: '700', color: c.text, flex: 1 },
    amount:         { fontSize: FontSizes.xl, fontWeight: '800', color: c.success },
    place:          { fontSize: FontSizes.sm, color: c.textSecondary, marginBottom: 4 },
    description:    { fontSize: FontSizes.md, color: c.text, marginVertical: 4 },
    date:           { fontSize: FontSizes.sm, color: c.textMuted, marginBottom: Spacing.md },
    updatedDate:    { fontSize: FontSizes.xs, color: c.textMuted, fontStyle: 'italic' },
    actions:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
    whatsappBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: Spacing.sm,
      backgroundColor: c.whatsapp,
      paddingVertical: Spacing.md, borderRadius: Radius.md,
    },
    whatsappBtnText:  { color: '#FFFFFF', fontSize: FontSizes.md, fontWeight: '700' },
    deleteBtn:        { padding: Spacing.sm },
    emptyWrap:        { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText:        { fontSize: FontSizes.xl, fontWeight: '600', color: c.textSecondary, marginTop: Spacing.lg },
    emptySubText:     { fontSize: FontSizes.md, color: c.textMuted, marginTop: Spacing.sm },
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

export default function OrdersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, lang } = useSettings();
  const S = makeStyles(colors);

  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: FilterMode = filter) => {
    const data = mode === 'recent'
      ? await getRecentOrdersWithCustomer(db)
      : await getAllOrdersWithCustomer(db);
    setOrders(data);
  }, [db, filter]);

  useFocusEffect(useCallback(() => { load(filter); }, [filter, load]));

  const onRefresh = async () => { setRefreshing(true); await load(filter); setRefreshing(false); };

  const handleFilter = (mode: FilterMode) => { setFilter(mode); load(mode); };

  const handleDelete = (order: OrderWithCustomer) => {
    Alert.alert(tr.deleteOrder, tr.deleteOrderMsg(order.customer_name), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await softDeleteOrder(db, order.id); load(filter);
        },
      },
    ]);
  };

  const displayed = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter(o => o.customer_name.toLowerCase().includes(q));
  }, [orders, search]);

  const totalAmount = displayed.reduce((s, o) => s + o.amount, 0);

  const renderItem = ({ item }: { item: OrderWithCustomer }) => (
    <View style={S.card}>
      <View style={S.cardHeader}>
        <Text style={S.customerName}>{item.customer_name}</Text>
        <Text style={S.amount}>&#8377;{item.amount.toFixed(2)}</Text>
      </View>
      <Text style={S.place}>{item.customer_place}</Text>
      <Text style={S.description}>{item.description}</Text>
      <Text style={S.date}>{format(new Date(item.date), 'dd MMM yyyy, hh:mm a')}</Text>
      {item.updated_at && item.updated_at !== item.date && (
        <Text style={S.updatedDate}>
          {tr.lastUpdated}: {format(new Date(item.updated_at), 'dd MMM yyyy, hh:mm a')}
        </Text>
      )}
      <View style={S.actions}>
        <TouchableOpacity style={S.whatsappBtn} onPress={() => sendWhatsAppInvoice(item, lang)}>
          <MaterialCommunityIcons name="whatsapp" size={20} color="#FFFFFF" />
          <Text style={S.whatsappBtnText}>{tr.sendInvoice}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={S.deleteBtn}>
          <MaterialIcons name="delete-outline" size={24} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={S.container}>
      <View style={S.topBar}>
        <View style={S.filterRow}>
          <TouchableOpacity
            style={[S.filterBtn, filter === 'all' && S.filterBtnActive]}
            onPress={() => handleFilter('all')}
          >
            <Text style={[S.filterText, filter === 'all' && S.filterTextActive]}>{tr.allOrders}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.filterBtn, filter === 'recent' && S.filterBtnActive]}
            onPress={() => handleFilter('recent')}
          >
            <Text style={[S.filterText, filter === 'recent' && S.filterTextActive]}>{tr.past6Days}</Text>
          </TouchableOpacity>
        </View>
        <View style={S.searchRow}>
          <TextInput
            style={S.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={tr.searchCustomers}
            placeholderTextColor={colors.textMuted}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {displayed.length > 0 && (
        <View style={S.summary}>
          <Text style={S.summaryText}>
            {displayed.length} {displayed.length === 1 ? tr.order : tr.orders_plural}
          </Text>
          <Text style={S.summaryAmount}>{tr.total}: &#8377;{totalAmount.toFixed(2)}</Text>
        </View>
      )}

      <FlatList
        data={displayed}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={displayed.length === 0 ? S.emptyOuter : S.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <View style={S.emptyWrap}>
            <MaterialIcons name="receipt-long" size={72} color={colors.textMuted} />
            <Text style={S.emptyText}>{tr.noOrdersFound}</Text>
            <Text style={S.emptySubText}>{tr.tapToAddOrder}</Text>
          </View>
        }
      />

      <TouchableOpacity style={S.fab} onPress={() => router.push('/add-order')} accessibilityLabel={tr.addOrder}>
        <MaterialIcons name="add" size={34} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}
