import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
    getAllOrdersWithCustomer,
    getThisMonthOrdersWithCustomer,
    getThisWeekOrdersWithCustomer,
    getTodayOrdersWithCustomer,
    getYesterdayOrdersWithCustomer,
    OrderWithCustomer,
    softDeleteOrder,
} from '@/services/database';
import { sendWhatsAppInvoice } from '@/utils/whatsapp';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type FilterMode = 'today' | 'yesterday' | 'week' | 'month' | 'all';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.background },
    topBar: {
      backgroundColor: c.card,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: Spacing.sm,
    },
    filterRow:    { flexDirection: 'row', gap: Spacing.sm },
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
    summary: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: 6,
      backgroundColor: c.primaryLight,
    },
    summaryText:   { fontSize: FontSizes.sm, color: c.primary, fontWeight: '600' },
    summaryAmount: { fontSize: FontSizes.sm, color: c.primary, fontWeight: '800' },
    listContent:   { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },
    emptyOuter:    { flexGrow: 1 },
    card: {
      backgroundColor: c.card,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },
    row1:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    customerName: { fontSize: FontSizes.md, fontWeight: '700', color: c.text, flex: 1, marginRight: Spacing.sm },
    amount:       { fontSize: FontSizes.lg, fontWeight: '800', color: c.success },
    row2:         { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    row2Text:     { fontSize: FontSizes.sm, color: c.textSecondary, flex: 1 },
    dateText:     { fontSize: FontSizes.xs, color: c.textMuted },
    actionRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: Spacing.sm },
    waBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.whatsapp,
      paddingVertical: 5, paddingHorizontal: Spacing.md,
      borderRadius: Radius.sm, flex: 1, justifyContent: 'center',
    },
    waBtnText:    { color: '#FFFFFF', fontSize: FontSizes.sm, fontWeight: '700' },
    deleteBtn:    { padding: 6 },
    emptyWrap:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText:    { fontSize: FontSizes.xl, fontWeight: '600', color: c.textSecondary, marginTop: Spacing.lg },
    emptySubText: { fontSize: FontSizes.md, color: c.textMuted, marginTop: Spacing.sm },
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

export default function OrdersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, lang } = useSettings();
  const S = makeStyles(colors);

  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [filter, setFilter] = useState<FilterMode>('today');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: FilterMode = filter) => {
    if (mode === 'today')     return setOrders(await getTodayOrdersWithCustomer(db));
    if (mode === 'yesterday') return setOrders(await getYesterdayOrdersWithCustomer(db));
    if (mode === 'week')      return setOrders(await getThisWeekOrdersWithCustomer(db));
    if (mode === 'month')     return setOrders(await getThisMonthOrdersWithCustomer(db));
    setOrders(await getAllOrdersWithCustomer(db));
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
    return orders.filter(o =>
      o.customer_name.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q)
    );
  }, [orders, search]);

  const totalAmount = displayed.reduce((s, o) => s + o.amount, 0);

  const filters: { key: FilterMode; label: string }[] = [
    { key: 'today',     label: tr.today },
    { key: 'yesterday', label: tr.yesterday },
    { key: 'week',      label: tr.thisWeek },
    { key: 'month',     label: tr.thisMonth },
    { key: 'all',       label: tr.allOrders },
  ];

  const renderItem = ({ item }: { item: OrderWithCustomer }) => (
    <View style={S.card}>
      <View style={S.row1}>
        <Text style={S.customerName} numberOfLines={1}>{item.customer_name}</Text>
        <Text style={S.amount}>&#8377;{item.amount.toFixed(2)}</Text>
      </View>
      <View style={S.row2}>
        <Text style={S.row2Text} numberOfLines={1}>{item.customer_place}  ·  {item.description}</Text>
        <Text style={S.dateText}>{format(new Date(item.date), 'dd MMM')}</Text>
      </View>
      <View style={S.actionRow}>
        <TouchableOpacity style={S.waBtn} onPress={() => sendWhatsAppInvoice(item, lang)}>
          <MaterialCommunityIcons name="whatsapp" size={16} color="#FFFFFF" />
          <Text style={S.waBtnText}>{tr.sendInvoice}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={S.deleteBtn}>
          <MaterialIcons name="delete-outline" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={S.container}>
      <View style={S.topBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterRow}>
          {filters.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[S.chip, filter === key && S.chipActive]}
              onPress={() => handleFilter(key)}
            >
              <Text style={[S.chipText, filter === key && S.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput
          style={S.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={tr.searchCustomers}
          placeholderTextColor={colors.textMuted}
          clearButtonMode="while-editing"
        />
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
