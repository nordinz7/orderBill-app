import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  deleteOrder,
  getCustomersWithOrders,
  getDistinctOrderDates,
  getOrdersByDateRange,
  getTodayOrdersWithCustomer,
  getTomorrowOrdersWithCustomer,
  getYesterdayOrdersWithCustomer,
  OrderWithCustomer,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type FilterMode = 'tomorrow' | 'today' | 'yesterday' | 'date' | 'customer';

interface DropdownItem { id: string; label: string }

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
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    chipActive:     { backgroundColor: c.primary },
    chipText:       { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    chipTextActive: { color: '#FFFFFF' },
    chipIcon:       { marginLeft: 2 },
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
      padding: Spacing.sm,
      paddingHorizontal: Spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },
    qtyBadge: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: c.primaryLight,
      justifyContent: 'center', alignItems: 'center',
    },
    qtyNum:       { fontSize: FontSizes.xl, fontWeight: '800', color: c.primary, lineHeight: FontSizes.xl + 2 },
    qtyUnit:      { fontSize: 10, fontWeight: '600', color: c.primary, marginTop: -2 },
    cardContent:  { flex: 1 },
    cardRow1:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    customerName: { fontSize: FontSizes.md, fontWeight: '700', color: c.text, flex: 1, marginRight: Spacing.sm },
    amount:       { fontSize: FontSizes.lg, fontWeight: '800', color: c.success },
    cardSub:      { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 2 },
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
    // Modal / dropdown styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '60%',
      paddingBottom: 30,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: {
      fontSize: FontSizes.lg,
      fontWeight: '700',
      color: c.text,
    },
    modalClose: {
      fontSize: FontSizes.lg,
      color: c.primary,
      fontWeight: '600',
    },
    modalItem: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    modalItemActive: {
      backgroundColor: c.primaryLight,
    },
    modalItemText: {
      fontSize: FontSizes.md,
      color: c.text,
    },
    modalItemTextActive: {
      color: c.primary,
      fontWeight: '700',
    },
    searchInput: {
      backgroundColor: c.inputBg, borderWidth: 1.5,
      borderColor: c.border, borderRadius: Radius.md,
      padding: Spacing.md, fontSize: FontSizes.md, color: c.text,
      marginHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs,
    },
  });
}

export default function OrdersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [filter, setFilter] = useState<FilterMode>('today');
  const [refreshing, setRefreshing] = useState(false);

  // Dropdown states
  const [dateOptions, setDateOptions] = useState<DropdownItem[]>([]);
  const [customerOptions, setCustomerOptions] = useState<DropdownItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const loadDropdownData = useCallback(async () => {
    const [dates, customers] = await Promise.all([
      getDistinctOrderDates(db),
      getCustomersWithOrders(db),
    ]);
    setDateOptions(dates.map(d => ({
      id: d,
      label: format(parseISO(d), 'dd/MM/yyyy'),
    })));
    setCustomerOptions(customers.map(c => ({
      id: String(c.id),
      label: c.name,
    })));
  }, [db]);

  const load = useCallback(async (mode: FilterMode = filter) => {
    if (mode === 'tomorrow')  return setOrders(await getTomorrowOrdersWithCustomer(db));
    if (mode === 'today')     return setOrders(await getTodayOrdersWithCustomer(db));
    if (mode === 'yesterday') return setOrders(await getYesterdayOrdersWithCustomer(db));
    if (mode === 'date' && selectedDate) {
      return setOrders(await getOrdersByDateRange(db, selectedDate, selectedDate));
    }
    if (mode === 'customer' && selectedCustomerId) {
      // Load all orders then filter by customer
      const all = await getTodayOrdersWithCustomer(db);
      const allOrders = await getOrdersByDateRange(db, '2000-01-01', '2099-12-31');
      return setOrders(allOrders.filter(o => String(o.customer_id) === selectedCustomerId));
    }
    // fallback
    setOrders(await getTodayOrdersWithCustomer(db));
  }, [db, filter, selectedDate, selectedCustomerId]);

  useFocusEffect(useCallback(() => {
    loadDropdownData();
    load(filter);
  }, [filter, load, loadDropdownData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDropdownData();
    await load(filter);
    setRefreshing(false);
  };

  const handleFilter = (mode: FilterMode) => {
    if (mode === 'tomorrow' || mode === 'today' || mode === 'yesterday') {
      setSelectedDate(null);
      setSelectedCustomerId(null);
    }
    setFilter(mode);
    if (mode !== 'date' && mode !== 'customer') {
      load(mode);
    }
  };

  const handleDateSelect = (dateId: string) => {
    setSelectedDate(dateId);
    setSelectedCustomerId(null);
    setFilter('date');
    setShowDateModal(false);
    // Load with the new date
    getOrdersByDateRange(db, dateId, dateId).then(setOrders);
  };

  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    setSelectedDate(null);
    setFilter('customer');
    setShowCustomerModal(false);
    // Load all orders for this customer
    getOrdersByDateRange(db, '2000-01-01', '2099-12-31').then(all =>
      setOrders(all.filter(o => String(o.customer_id) === custId))
    );
  };

  const handleDelete = (order: OrderWithCustomer) => {
    Alert.alert(tr.deleteOrder, tr.deleteOrderMsg(order.customer_name), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await deleteOrder(db, order.id);
          load(filter);
        },
      },
    ]);
  };

  const displayed = orders;
  const totalAmount = displayed.reduce((s, o) => s + o.amount, 0);

  // Active label for date chip (short when selected, no text when idle)
  const dateChipLabel = selectedDate && filter === 'date'
    ? format(parseISO(selectedDate), 'dd/MM')
    : null;

  // Active label for customer chip (short when selected, no text when idle)
  const customerChipLabel = selectedCustomerId && filter === 'customer'
    ? customerOptions.find(c => c.id === selectedCustomerId)?.label ?? null
    : null;

  const renderItem = ({ item }: { item: OrderWithCustomer }) => (
    <TouchableOpacity
      style={S.card}
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/customer-detail', params: { id: String(item.customer_id) } })}
      onLongPress={() => handleDelete(item)}
    >
      <View style={S.qtyBadge}>
        <Text style={S.qtyNum}>{item.quantity || 0}</Text>
        <Text style={S.qtyUnit}>pkt</Text>
      </View>
      <View style={S.cardContent}>
        <View style={S.cardRow1}>
          <Text style={S.customerName} numberOfLines={1}>{item.customer_name}</Text>
          <Text style={S.amount}>&#8377;{item.amount}</Text>
        </View>
        <Text style={S.cardSub} numberOfLines={1}>
          {item.customer_place} · {format(new Date(item.date), 'dd MMM')}{item.description !== 'Kuboos' ? `  ·  ${item.description}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderDropdownModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    items: DropdownItem[],
    selectedId: string | null,
    onSelect: (id: string) => void,
  ) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={S.modalOverlay} onPress={onClose}>
        <Pressable style={S.modalContent} onPress={() => {}}>
          <View style={S.modalHeader}>
            <Text style={S.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={S.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            keyExtractor={i => i.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[S.modalItem, item.id === selectedId && S.modalItemActive]}
                onPress={() => onSelect(item.id)}
              >
                <Text style={[
                  S.modalItemText,
                  item.id === selectedId && S.modalItemTextActive,
                ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <View style={S.container}>
      <View style={S.topBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterRow}>
          {/* Tomorrow chip */}
          <TouchableOpacity
            style={[S.chip, filter === 'tomorrow' && S.chipActive]}
            onPress={() => handleFilter('tomorrow')}
          >
            <Text style={[S.chipText, filter === 'tomorrow' && S.chipTextActive]}>{tr.tomorrow}</Text>
          </TouchableOpacity>

          {/* Today chip */}
          <TouchableOpacity
            style={[S.chip, filter === 'today' && S.chipActive]}
            onPress={() => handleFilter('today')}
          >
            <Text style={[S.chipText, filter === 'today' && S.chipTextActive]}>{tr.today}</Text>
          </TouchableOpacity>

          {/* Yesterday chip */}
          <TouchableOpacity
            style={[S.chip, filter === 'yesterday' && S.chipActive]}
            onPress={() => handleFilter('yesterday')}
          >
            <Text style={[S.chipText, filter === 'yesterday' && S.chipTextActive]}>{tr.yesterday}</Text>
          </TouchableOpacity>

          {/* Date dropdown chip (icon-based) */}
          <TouchableOpacity
            style={[S.chip, filter === 'date' && S.chipActive]}
            onPress={() => setShowDateModal(true)}
          >
            <MaterialIcons
              name="calendar-today"
              size={16}
              color={filter === 'date' ? '#FFFFFF' : colors.textSecondary}
            />
            {dateChipLabel && (
              <Text style={[S.chipText, filter === 'date' && S.chipTextActive]} numberOfLines={1}>
                {dateChipLabel}
              </Text>
            )}
            <MaterialIcons
              name="arrow-drop-down"
              size={18}
              color={filter === 'date' ? '#FFFFFF' : colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Customer dropdown chip (icon-based) */}
          <TouchableOpacity
            style={[S.chip, filter === 'customer' && S.chipActive]}
            onPress={() => setShowCustomerModal(true)}
          >
            <MaterialIcons
              name="person"
              size={16}
              color={filter === 'customer' ? '#FFFFFF' : colors.textSecondary}
            />
            {customerChipLabel && (
              <Text style={[S.chipText, filter === 'customer' && S.chipTextActive]} numberOfLines={1}>
                {customerChipLabel}
              </Text>
            )}
            <MaterialIcons
              name="arrow-drop-down"
              size={18}
              color={filter === 'customer' ? '#FFFFFF' : colors.textSecondary}
            />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {displayed.length > 0 && (
        <View style={S.summary}>
          <Text style={S.summaryText}>
            {displayed.length} {displayed.length === 1 ? tr.order : tr.orders_plural}
          </Text>
          <Text style={S.summaryAmount}>{tr.total}: &#8377;{totalAmount}</Text>
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

      {/* Date picker modal */}
      {renderDropdownModal(
        showDateModal,
        () => setShowDateModal(false),
        tr.filterByDate,
        dateOptions,
        selectedDate,
        handleDateSelect,
      )}

      {/* Customer picker modal with search */}
      <Modal visible={showCustomerModal} transparent animationType="slide" onRequestClose={() => { setShowCustomerModal(false); setCustomerSearch(''); }}>
        <Pressable style={S.modalOverlay} onPress={() => { setShowCustomerModal(false); setCustomerSearch(''); }}>
          <Pressable style={S.modalContent} onPress={() => {}}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>{tr.filterByCustomer}</Text>
              <TouchableOpacity onPress={() => { setShowCustomerModal(false); setCustomerSearch(''); }}>
                <Text style={S.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={S.searchInput}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder={tr.searchCustomers}
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <FlatList
              data={customerOptions.filter(c => {
                if (!customerSearch.trim()) return true;
                return c.label.toLowerCase().includes(customerSearch.toLowerCase());
              })}
              keyExtractor={i => i.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[S.modalItem, item.id === selectedCustomerId && S.modalItemActive]}
                  onPress={() => { handleCustomerSelect(item.id); setCustomerSearch(''); }}
                >
                  <Text style={[
                    S.modalItemText,
                    item.id === selectedCustomerId && S.modalItemTextActive,
                  ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
