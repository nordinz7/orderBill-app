import { getBulkDraftCount } from '@/app/bulk-orders';
import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
    deleteOrder,
    getAllOrdersWithCustomer,
    getCustomersWithOrders,
    getOrdersByDateRange,
    isLocked,
    OrderWithCustomer,
    setOrderLock,
    unitRate,
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
    Platform,
    Pressable,
    RefreshControl,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import KeyboardModal from '@/components/KeyboardModal';

interface DropdownItem { id: string; label: string }

function makeStyles(c: AppColors, bottomInset: number) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: c.background },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      gap: Spacing.sm,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      flexShrink: 0,
      paddingHorizontal: Spacing.md, paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.filterInactive,
    },
    filterChipActive: { backgroundColor: c.primary },
    filterChipText: { fontSize: FontSizes.sm, fontWeight: '700', color: c.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },
    filterSpacer: { flex: 1 },
    summary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: 6,
      backgroundColor: c.primaryLight,
    },
    summaryText:   { fontSize: FontSizes.sm, color: c.primary, fontWeight: '600', flex: 1 },
    summaryAmount: { fontSize: FontSizes.sm, color: c.primary, fontWeight: '800', marginRight: Spacing.sm },
    summaryShare:  { padding: 4 },
    listContent:   { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },
    emptyOuter:    { flexGrow: 1 },
    card: {
      backgroundColor: c.card,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      elevation: 1,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
    },
    cardContent:  { flex: 1 },
    cardRow1:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
    customerName: { fontSize: FontSizes.md, fontWeight: '700', color: c.text, flexShrink: 1 },
    cardRight:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
    amount:       { fontSize: FontSizes.md, fontWeight: '800', color: c.success },
    amountZero:   { color: c.textMuted },
    qtyText:      { fontSize: FontSizes.sm, fontWeight: '700', color: c.primary },
    nameWrap:     { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
    cardSub:      { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 1 },
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
      paddingBottom: bottomInset + Spacing.lg,
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
  const { colors, tr, defaultOrderDescription, currencySymbol } = useSettings();
  const insets = useSafeAreaInsets();
  const S = makeStyles(colors, insets.bottom);

  const [orders, setOrders] = useState<OrderWithCustomer[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
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
    let results: OrderWithCustomer[];
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().slice(0, 10);
      results = await getOrdersByDateRange(db, dateStr, dateStr);
    } else {
      results = await getAllOrdersWithCustomer(db);
    }
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

  const dateChipLabel = selectedDate ? format(selectedDate, 'dd MMM yyyy') : null;

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
          try {
            await deleteOrder(db, order.id);
            load();
          } catch {
            Alert.alert(tr.locked, tr.cannotEditLocked);
          }
        },
      },
    ]);
  };

  const handleToggleLock = (order: OrderWithCustomer) => {
    const locked = isLocked(order.date, order.locked);
    Alert.alert(
      locked ? tr.unlockConfirm : tr.lockConfirm,
      locked ? tr.unlockConfirmMsg : tr.lockConfirmMsg,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: locked ? tr.unlock : tr.lock, onPress: async () => {
            await setOrderLock(db, order.id, !locked);
            load();
          },
        },
      ],
    );
  };

  const handleOpen = (order: OrderWithCustomer) => {
    if (isLocked(order.date, order.locked)) {
      Alert.alert(tr.locked, tr.cannotEditLocked, [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.unlock, onPress: () => handleToggleLock(order) },
      ]);
      return;
    }
    router.push({ pathname: '/edit-order', params: { orderId: String(order.id) } });
  };

  /** Long press is the way in to everything destructive or unusual. */
  const handleLongPress = (order: OrderWithCustomer) => {
    const locked = isLocked(order.date, order.locked);
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: locked ? tr.unlock : tr.lock, onPress: () => handleToggleLock(order) },
    ];
    if (!locked) options.push({ text: tr.delete, style: 'destructive', onPress: () => handleDelete(order) });
    options.push({ text: tr.cancel, style: 'cancel' });
    Alert.alert(
      order.customer_name,
      `${format(new Date(order.date), 'dd MMM yyyy')} · ${currencySymbol}${order.amount}`,
      options,
    );
  };

  const handleShareOrders = async () => {
    if (!displayed.length) return;
    const ordersByDate = new Map<string, OrderWithCustomer[]>();
    for (const order of displayed) {
      const date = order.date.slice(0, 10);
      const dateOrders = ordersByDate.get(date) ?? [];
      dateOrders.push(order);
      ordersByDate.set(date, dateOrders);
    }
    const text = Array.from(ordersByDate.entries())
      .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
      .flatMap(([date, dateOrders]) => [
        `*${format(new Date(`${date}T00:00:00`), 'dd MMM yyyy')}*`,
        ...dateOrders.map(order => {
          const description = order.description !== defaultOrderDescription ? ` - ${order.description}` : '';
          const quantity = order.quantity > 0 ? ` (x${Math.round(order.quantity)})` : '';
          return `${order.customer_name}${description}${quantity}`;
        }),
      ])
      .join('\n');
    try {
      await Share.share({ message: text });
    } catch { /* dismissed */ }
  };

  const displayed = orders;
  const totalAmount = displayed.reduce((s, o) => s + o.amount, 0);

  const customerChipLabel = selectedCustomerId
    ? customerOptions.find(c => c.id === selectedCustomerId)?.label ?? null
    : null;

  const renderItem = ({ item }: { item: OrderWithCustomer }) => {
    const locked = isLocked(item.date, item.locked);
    return (
      <TouchableOpacity
        style={S.card}
        activeOpacity={0.7}
        onPress={() => handleOpen(item)}
        onLongPress={() => handleLongPress(item)}
      >
        <View style={S.cardContent}>
          <View style={S.cardRow1}>
            <View style={S.nameWrap}>
              <Text style={S.customerName} numberOfLines={1}>{item.customer_name}</Text>
              {locked && <MaterialIcons name="lock" size={14} color={colors.textMuted} />}
            </View>
            <View style={S.cardRight}>
              {item.quantity > 0 && <Text style={S.qtyText}>x{item.quantity}</Text>}
              <Text style={[S.amount, item.amount === 0 && S.amountZero]}>
                {currencySymbol}{item.amount}
              </Text>
            </View>
          </View>
          <Text style={S.cardSub} numberOfLines={1}>
            {format(new Date(item.date), 'dd MMM')}
            {unitRate(item.amount, item.quantity) > 0
              ? ` · ${currencySymbol}${unitRate(item.amount, item.quantity)} ${tr.perUnit}`
              : ''}
            {item.description !== defaultOrderDescription ? ` · ${item.description}` : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.container}>
      {/* Filter row: date chip + customer chip */}
      <View style={S.filterRow}>
        {/* Date filter chip */}
        <TouchableOpacity
          style={[S.filterChip, selectedDate ? S.filterChipActive : undefined]}
          onPress={() => {
            if (selectedDate) {
              setSelectedDate(null);
            } else {
              setShowDatePicker(true);
            }
          }}
        >
          <MaterialIcons
            name={selectedDate ? 'close' : 'calendar-today'}
            size={16}
            color={selectedDate ? '#FFFFFF' : colors.textSecondary}
          />
          {dateChipLabel ? (
            <Text style={[S.filterChipText, S.filterChipTextActive]} numberOfLines={1}>
              {dateChipLabel}
            </Text>
          ) : (
            <Text style={S.filterChipText}>{tr.selectDate}</Text>
          )}
        </TouchableOpacity>

        {/* Customer filter chip */}
        <TouchableOpacity
          style={[S.filterChip, selectedCustomerId ? S.filterChipActive : undefined]}
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
            <Text style={[S.filterChipText, S.filterChipTextActive]} numberOfLines={1}>
              {customerChipLabel}
            </Text>
          ) : (
            <Text style={S.filterChipText}>{tr.selectCustomer}</Text>
          )}
        </TouchableOpacity>

        <View style={S.filterSpacer} />
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate ?? new Date()}
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
          <Text style={S.summaryAmount}>{currencySymbol}{totalAmount}</Text>
          <TouchableOpacity style={S.summaryShare} onPress={handleShareOrders} accessibilityLabel={tr.shareOrders}>
            <MaterialIcons name="share" size={18} color={colors.primary} />
          </TouchableOpacity>
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

      <TouchableOpacity style={S.fab} onPress={() => router.push({ pathname: '/add-order', params: { defaultDate: (selectedDate ?? new Date()).toISOString().slice(0, 10) } })} accessibilityLabel={tr.addOrder}>
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
      <KeyboardModal visible={showCustomerModal} onRequestClose={() => { setShowCustomerModal(false); setCustomerSearch(''); }}>
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
      </KeyboardModal>
    </View>
  );
}
