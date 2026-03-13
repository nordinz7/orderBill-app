import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
    CustomerOutstanding,
    DailySummary,
    getCustomersWithOutstandingBalance,
    getDailySummary,
    getTotalOutstanding,
} from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
    FlatList,
    Linking,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    section: {
      backgroundColor: c.card,
      marginHorizontal: Spacing.md,
      marginTop: Spacing.md,
      borderRadius: Radius.lg,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    sectionTitle: {
      fontSize: FontSizes.lg,
      fontWeight: '700',
      color: c.text,
    },
    sectionBadge: {
      backgroundColor: c.danger,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 2,
      borderRadius: 12,
    },
    sectionBadgeText: {
      color: '#FFFFFF',
      fontSize: FontSizes.sm,
      fontWeight: '700',
    },
    // Daily summary
    summaryDateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      backgroundColor: c.inputBg,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    summaryDateText: {
      fontSize: FontSizes.md,
      fontWeight: '600',
      color: c.text,
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    summaryCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: c.primaryLight,
      borderRadius: Radius.md,
      padding: Spacing.md,
      alignItems: 'center',
    },
    summaryCardAlt: {
      backgroundColor: c.successLight,
    },
    summaryValue: {
      fontSize: FontSizes.xxl,
      fontWeight: '800',
      color: c.primary,
    },
    summaryValueAlt: {
      color: c.success,
    },
    summaryLabel: {
      fontSize: FontSizes.sm,
      color: c.textSecondary,
      marginTop: 2,
    },
    // Outstanding total banner
    totalBanner: {
      backgroundColor: c.dangerLight,
      padding: Spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    totalBannerLabel: {
      fontSize: FontSizes.md,
      color: c.danger,
      fontWeight: '600',
    },
    totalBannerValue: {
      fontSize: FontSizes.xxl,
      color: c.danger,
      fontWeight: '800',
    },
    // Customer row
    customerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      gap: Spacing.md,
    },
    customerInfo: {
      flex: 1,
    },
    customerName: {
      fontSize: FontSizes.md,
      fontWeight: '700',
      color: c.text,
    },
    customerSub: {
      fontSize: FontSizes.sm,
      color: c.textSecondary,
      marginTop: 2,
    },
    customerBalance: {
      alignItems: 'flex-end',
    },
    balanceAmount: {
      fontSize: FontSizes.lg,
      fontWeight: '800',
      color: c.danger,
    },
    collectBtn: {
      backgroundColor: c.success,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.md,
    },
    collectBtnText: {
      color: '#FFFFFF',
      fontSize: FontSizes.sm,
      fontWeight: '700',
    },
    callBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.primaryLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyWrap: {
      padding: Spacing.xxl,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: FontSizes.md,
      color: c.textSecondary,
      marginTop: Spacing.md,
      textAlign: 'center',
    },
    listContent: {
      paddingBottom: 100,
    },
  });
}

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr, currencySymbol } = useSettings();
  const S = makeStyles(colors);

  const [outstanding, setOutstanding] = useState<CustomerOutstanding[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [summaryDate, setSummaryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [cust, total, dailySummary] = await Promise.all([
      getCustomersWithOutstandingBalance(db),
      getTotalOutstanding(db),
      getDailySummary(db, summaryDate.toISOString().slice(0, 10)),
    ]);
    setOutstanding(cust);
    setTotalOutstanding(total);
    setSummary(dailySummary);
  }, [db, summaryDate]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (date) setSummaryDate(date);
  };

  const handleCall = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    Linking.openURL(`tel:${cleaned}`);
  };

  const renderCustomer = ({ item }: { item: CustomerOutstanding }) => (
    <View style={S.customerRow}>
      <View style={S.customerInfo}>
        <Text style={S.customerName}>{item.name}</Text>
        <Text style={S.customerSub}>
          {item.place}
          {item.last_order_date && ` · ${tr.lastOrder}: ${format(new Date(item.last_order_date), 'dd MMM')}`}
        </Text>
      </View>
      <View style={S.customerBalance}>
        <Text style={S.balanceAmount}>{currencySymbol}{item.balance.toLocaleString()}</Text>
      </View>
      <TouchableOpacity
        style={S.callBtn}
        onPress={() => handleCall(item.phone_number)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="phone" size={18} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={S.collectBtn}
        onPress={() => router.push({ pathname: '/add-payment', params: { customerId: item.id, customerName: item.name } })}
      >
        <Text style={S.collectBtnText}>{tr.collect}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={S.container}>
      <ScrollView
        contentContainerStyle={S.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        {/* Daily Summary Section */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>{tr.dailySummary}</Text>
            <TouchableOpacity style={S.summaryDateBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={S.summaryDateText}>{format(summaryDate, 'dd MMM yyyy')}</Text>
              <MaterialIcons name="calendar-today" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {summary && (
            <View style={S.summaryGrid}>
              <View style={S.summaryCard}>
                <Text style={S.summaryValue}>{currencySymbol}{summary.total_sales.toLocaleString()}</Text>
                <Text style={S.summaryLabel}>{tr.salesSummary}</Text>
              </View>
              <View style={[S.summaryCard, S.summaryCardAlt]}>
                <Text style={[S.summaryValue, S.summaryValueAlt]}>{currencySymbol}{summary.total_collected.toLocaleString()}</Text>
                <Text style={S.summaryLabel}>{tr.collectionsSummary}</Text>
              </View>
              <View style={S.summaryCard}>
                <Text style={S.summaryValue}>{summary.order_count}</Text>
                <Text style={S.summaryLabel}>{tr.ordersSummary}</Text>
              </View>
              <View style={S.summaryCard}>
                <Text style={S.summaryValue}>{summary.total_qty}</Text>
                <Text style={S.summaryLabel}>{tr.quantitySummary}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Outstanding Balances Section */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>{tr.outstandingBalances}</Text>
            {outstanding.length > 0 && (
              <View style={S.sectionBadge}>
                <Text style={S.sectionBadgeText}>{outstanding.length}</Text>
              </View>
            )}
          </View>
          {totalOutstanding > 0 && (
            <View style={S.totalBanner}>
              <Text style={S.totalBannerLabel}>{tr.totalOutstanding}</Text>
              <Text style={S.totalBannerValue}>{currencySymbol}{totalOutstanding.toLocaleString()}</Text>
            </View>
          )}
          {outstanding.length === 0 ? (
            <View style={S.emptyWrap}>
              <MaterialIcons name="check-circle" size={48} color={colors.success} />
              <Text style={S.emptyText}>{tr.noOutstandingBalances}</Text>
            </View>
          ) : (
            <FlatList
              data={outstanding}
              keyExtractor={item => String(item.id)}
              renderItem={renderCustomer}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={summaryDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          maximumDate={new Date()}
          themeVariant={colors.background === '#000000' || colors.background === '#121212' ? 'dark' : 'light'}
        />
      )}
    </View>
  );
}
