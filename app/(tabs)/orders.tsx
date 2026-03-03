import { getBulkDraftCount } from '@/app/bulk-orders';
import { DateStrip } from '@/components/DateStrip';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
  deleteOrder,
  getCustomerBalance,
  getCustomersWithOrders,
  getOrdersByDateRange,
  OrderWithCustomer,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface DropdownItem { id: string; label: string }

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.background },
    dateStripWrap: {
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      paddingVertical: Spacing.xs,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.sm,
      gap: Spacing.sm,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    filterLabel: {
      fontSize: FontSizes.sm,
      fontWeight: '700',
      color: c.textMuted,
      flex: 1,
    },
    calBtn: {
      padding: 4,
      borderRadius: Radius.sm,
    },
    customerChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: Spacing.md, paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.filterInactive,
    },
    customerChipActive: { backgroundColor: c.primary },
    customerChipText: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    customerChipTextActive: { color: '#FFFFFF' },
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
    whatsappBtn:  {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: c.whatsapp,
      justifyContent: 'center', alignItems: 'center',
      marginLeft: Spacing.sm,
    },
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
    bulkFab: {
      position: 'absolute', bottom: 92, right: 28,
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: c.success,
      justifyContent: 'center', alignItems: 'center',
      elevation: 5,
      shadowColor: c.success,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3, shadowRadius: 6,
    },
    badge: {
      position: 'absolute', top: -4, right: -4,
      minWidth: 20, height: 20, borderRadius: 10,
      backgroundColor: c.danger,
      justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 4,
    },
    badgeText: {
      color: '#FFFFFF', fontSize: 11, fontWeight: '800',
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
  const params = useLocalSearchParams<{ filterDate?: string }>();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (params.filterDate) {
      const d = new Date(params.filterDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Customer filter (AND — combined with date)
  const [customerOptions, setCustomerOptions] = useState<DropdownItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [draftCount, setDraftCount] = useState(0);

  // Update date when navigating with filterDate param
  useEffect(() => {
    if (params.filterDate) {
      const d = new Date(params.filterDate);
      if (!isNaN(d.getTime())) setSelectedDate(d);
    }
  }, [params.filterDate]);

  const loadDropdownData = useCallback(async () => {
    const customers = await getCustomersWithOrders(db);
    setCustomerOptions(customers.map(c => ({
      id: String(c.id),
      label: c.name,
    })));
  }, [db]);

  const load = useCallback(async () => {
    // Always filter by selected date; customer is an AND filter on top
    const dateStr = selectedDate.toISOString().slice(0, 10);
    let results = await getOrdersByDateRange(db, dateStr, dateStr);
    if (selectedCustomerId) {
      results = results.filter(o => String(o.customer_id) === selectedCustomerId);
    }
    setOrders(results);
  }, [db, selectedDate, selectedCustomerId]);

  useFocusEffect(useCallback(() => {
    loadDropdownData();
    load();
    getBulkDraftCount().then(setDraftCount);
  }, [load, loadDropdownData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDropdownData();
    await load();
    setRefreshing(false);
  };

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  // Customer is an AND filter alongside date
  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    setShowCustomerModal(false);
    setCustomerSearch('');
  };

  const handleDelete = (order: OrderWithCustomer) => {
    Alert.alert(tr.deleteOrder, tr.deleteOrderMsg(order.customer_name), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await deleteOrder(db, order.id);
          load();
        },
      },
    ]);
  };

  const handleSend = async (item: OrderWithCustomer) => {
    const bal = await getCustomerBalance(db, item.customer_id);
    if (bal.balance > 0) {
      // Customer has pending balance, show statement
      router.push({ pathname: '/view-statement', params: { id: String(item.customer_id) } });
    } else {
      // No pending balance, show invoice for this order
      router.push({
        pathname: '/view-invoice',
        params: {
          customerName: item.customer_name,
          customerPlace: item.customer_place,
          customerPhone: item.customer_phone,
          amount: String(item.amount),
          description: item.description,
          quantity: String(item.quantity),
          date: item.date,
        },
      });
    }
  };

  const displayed = orders;
  const totalAmount = displayed.reduce((s, o) => s + o.amount, 0);

  const customerChipLabel = selectedCustomerId
    ? customerOptions.find(c => c.id === selectedCustomerId)?.label ?? null
    : null;

  const renderItem = ({ item }: { item: OrderWithCustomer }) => (
    <TouchableOpacity
      style={S.card}
      activeOpacity={0.7}
      onPress={() => router.push({ pathname: '/edit-order', params: { orderId: item.id, customerName: `${item.customer_name} — ${item.customer_place}`, amount: String(item.amount), description: item.description, quantity: String(item.quantity), date: item.date } })}
      onLongPress={() => handleDelete(item)}
    >
      <View style={S.qtyBadge}>
        <Text style={S.qtyNum}>{item.quantity || 0}</Text>
        <Text style={S.qtyUnit}>pkt</Text>
      </View>
      <View style={S.cardContent}>
        <View style={S.cardRow1}>
          <Text style={S.customerName} numberOfLines={1}>{item.customer_name}</Text>
          {item.amount > 0 && <Text style={S.amount}>&#8377;{item.amount}</Text>}
        </View>
        <Text style={S.cardSub} numberOfLines={1}>
          {item.customer_place} · {format(new Date(item.date), 'dd MMM')}{item.description !== 'Kuboos' ? `  ·  ${item.description}` : ''}
        </Text>
      </View>
      {item.amount > 0 && (
        <TouchableOpacity
          style={S.whatsappBtn}
          onPress={() => handleSend(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="send" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={S.container}>
      {/* Swipeable date strip */}
      <View style={S.dateStripWrap}>
        <DateStrip value={selectedDate} onChange={setSelectedDate} colors={colors} />
      </View>

      {/* Filter row: date label + calendar jump + customer AND chip */}
      <View style={S.filterRow}>
        <MaterialIcons name="calendar-today" size={16} color={colors.primary} />
        <Text style={S.filterLabel}>{format(selectedDate, 'dd MMM yyyy, EEE')}</Text>

        {/* Jump to date via native picker */}
        <TouchableOpacity style={S.calBtn} onPress={() => setShowDatePicker(true)}>
          <MaterialIcons name="today" size={22} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Customer AND-filter chip */}
        <TouchableOpacity
          style={[S.customerChip, selectedCustomerId ? S.customerChipActive : undefined]}
          onPress={() => {
            if (selectedCustomerId) {
              setSelectedCustomerId(null);
            } else {
              setShowCustomerModal(true);
            }
          }}
        >
          <MaterialIcons
            name={selectedCustomerId ? 'close' : 'person'}
            size={16}
            color={selectedCustomerId ? '#FFFFFF' : colors.textSecondary}
          />
          {customerChipLabel ? (
            <Text style={[S.customerChipText, S.customerChipTextActive]} numberOfLines={1}>
              {customerChipLabel}
            </Text>
          ) : (
            <MaterialIcons name="arrow-drop-down" size={18} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onDateChange}
          themeVariant={colors.background === '#000000' || colors.background === '#121212' ? 'dark' : 'light'}
        />
      )}

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

      <TouchableOpacity style={S.fab} onPress={() => router.push({ pathname: '/add-order', params: { defaultDate: selectedDate.toISOString().slice(0, 10) } })} accessibilityLabel={tr.addOrder}>
        <MaterialIcons name="add" size={34} color="#FFFFFF" />
      </TouchableOpacity>

      <TouchableOpacity style={S.bulkFab} onPress={() => router.push('/bulk-orders')} accessibilityLabel={tr.bulkOrders}>
        <MaterialIcons name="playlist-add" size={28} color="#FFFFFF" />
        {draftCount > 0 && (
          <View style={S.badge}>
            <Text style={S.badgeText}>{draftCount}</Text>
          </View>
        )}
      </TouchableOpacity>

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
                  onPress={() => handleCustomerSelect(item.id)}
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
