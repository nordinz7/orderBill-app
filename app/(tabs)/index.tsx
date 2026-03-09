import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { bulkDeleteCustomers, bulkImportContacts, CustomerWithBalance, deleteCustomer, getCustomersWithBalance } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Modal,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
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
    summaryBar: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg, paddingVertical: 6,
      backgroundColor: c.primaryLight,
    },
    summaryText: { fontSize: FontSizes.sm, color: c.primary, fontWeight: '600' },
    summaryOverdue: { fontSize: FontSizes.sm, color: c.danger, fontWeight: '700' },
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
    nameRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    name:        { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
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
    importBtn: {
      position: 'absolute', bottom: 24, right: 96,
      width: 60, height: 60, borderRadius: 30,
      backgroundColor: c.success,
      justifyContent: 'center', alignItems: 'center',
      elevation: 6,
      shadowColor: c.success,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 8,
    },
    // Selection mode
    selectionBar: {
      backgroundColor: c.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    selectionBarText: { color: '#FFFFFF', fontSize: FontSizes.md, fontWeight: '600' },
    selectionBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    selectionBarBtnText: { color: '#FFFFFF', fontSize: FontSizes.sm, fontWeight: '600' },
    checkbox: {
      width: 24, height: 24, borderRadius: 4,
      borderWidth: 2, borderColor: c.border,
      justifyContent: 'center', alignItems: 'center',
      marginRight: Spacing.sm,
    },
    checkboxSelected: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    cardSelected: {
      borderWidth: 2,
      borderColor: c.primary,
    },
    // Contact picker modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContainer: {
      flex: 1,
      marginTop: 60,
      backgroundColor: c.background,
      borderTopLeftRadius: Radius.lg,
      borderTopRightRadius: Radius.lg,
      overflow: 'hidden',
    },
    modalHeader: {
      backgroundColor: c.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    modalTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: c.text },
    modalSearchInput: {
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 8,
      fontSize: FontSizes.md,
      color: c.text,
      marginHorizontal: Spacing.md,
      marginVertical: Spacing.sm,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    contactItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    contactInfo: { flex: 1 },
    contactName: { fontSize: FontSizes.md, fontWeight: '600', color: c.text },
    contactPhone: { fontSize: FontSizes.sm, color: c.textSecondary, marginTop: 1 },
    importBar: {
      backgroundColor: c.card,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    importBarBtn: {
      backgroundColor: c.primary,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
    },
    importBarBtnDisabled: { opacity: 0.5 },
    importBarBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: FontSizes.md },
  });
}

export default function CustomersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors, tr } = useSettings();
  const S = makeStyles(colors);

  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [importingContacts, setImportingContacts] = useState(false);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Contact picker modal state
  type ContactEntry = { name: string; phone: string; key: string };
  const [contactPickerVisible, setContactPickerVisible] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<ContactEntry[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(false);

  const load = useCallback(async () => {
    setCustomers(await getCustomersWithBalance(db));
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const overdueCount = useMemo(() => customers.filter(c => c.balance > 0).length, [customers]);
  const overdueAmount = useMemo(() => customers.reduce((sum, c) => c.balance > 0 ? sum + c.balance : sum, 0), [customers]);

  const displayed = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.trim().toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.place.toLowerCase().includes(q) ||
      c.phone_number.includes(q)
    );
  }, [customers, search]);

  // ── Bulk selection helpers ────────────────────────────────────────────────

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectAllDisplayed = () => {
    setSelectedIds(new Set(displayed.map(c => c.id)));
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(tr.bulkDeleteConfirm, tr.bulkDeleteMsg(selectedIds.size), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          const { deleted, skipped } = await bulkDeleteCustomers(db, Array.from(selectedIds));
          exitSelectionMode();
          load();
          if (skipped > 0) {
            Alert.alert(tr.bulkDeleteConfirm, tr.bulkDeleteSkipped(deleted, skipped));
          }
        },
      },
    ]);
  };

  // ── Single delete ─────────────────────────────────────────────────────────

  const handleDelete = async (item: CustomerWithBalance) => {
    Alert.alert(tr.removeCustomer, tr.removeCustomerMsg(item.name), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await deleteCustomer(db, item.id); load();
        },
      },
    ]);
  };

  const handleCall = (phone: string) => {
    Linking.openURL('tel:+' + phone.replace(/\D/g, ''));
  };

  // ── Contact picker ────────────────────────────────────────────────────────

  const openContactPicker = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(tr.contactsPermission, tr.contactsPermissionMsg);
        return;
      }
      setLoadingContacts(true);
      setContactPickerVisible(true);
      setContactSearch('');
      setSelectedContacts(new Set());

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      const contactList: ContactEntry[] = [];
      let idx = 0;
      for (const c of data) {
        if (!c.phoneNumbers?.length) continue;
        const name = c.name || c.firstName || '';
        if (!name) continue;
        for (const ph of c.phoneNumbers) {
          if (ph.number) {
            const key = `${idx++}:${name}:${ph.number}`;
            contactList.push({ name, phone: ph.number, key });
          }
        }
      }
      contactList.sort((a, b) => a.name.localeCompare(b.name));
      setDeviceContacts(contactList);
      setLoadingContacts(false);
    } catch {
      setLoadingContacts(false);
      setContactPickerVisible(false);
      Alert.alert('Error', 'Could not load contacts.');
    }
  };

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return deviceContacts;
    const q = contactSearch.trim().toLowerCase();
    return deviceContacts.filter(c =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [deviceContacts, contactSearch]);

  const toggleContactSelection = (key: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllContacts = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.key)));
    }
  };

  const handleImportSelected = async () => {
    const toImport = deviceContacts.filter(c => selectedContacts.has(c.key));
    if (toImport.length === 0) return;
    setImportingContacts(true);
    try {
      const imported = await bulkImportContacts(db, toImport.map(c => ({ name: c.name, phone: c.phone })));
      setImportingContacts(false);
      setContactPickerVisible(false);
      if (imported > 0) {
        Alert.alert(tr.importSuccess, tr.importSuccessMsg(imported));
        load();
      } else {
        Alert.alert(tr.importSuccess, tr.importNone);
      }
    } catch {
      setImportingContacts(false);
      Alert.alert('Error', 'Could not import contacts.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: CustomerWithBalance }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[S.card, isSelected && S.cardSelected]}
        onPress={() => {
          if (selectionMode) {
            toggleSelection(item.id);
          } else {
            router.push({ pathname: '/customer-detail', params: { id: item.id } });
          }
        }}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            setSelectedIds(new Set([item.id]));
          }
        }}
        activeOpacity={0.7}
      >
        {selectionMode && (
          <View style={[S.checkbox, isSelected && S.checkboxSelected]}>
            {isSelected && <MaterialIcons name="check" size={18} color="#FFFFFF" />}
          </View>
        )}
        <View style={S.cardContent}>
          <View style={S.nameRow}>
            <Text style={S.name}>{item.name}</Text>
          </View>
          {!!item.place?.trim() && (
            <Text style={S.sub} numberOfLines={1}>
              <MaterialIcons name="location-on" size={13} color={colors.textSecondary} /> {item.place}
            </Text>
          )}
          {item.balance > 0 && (
            <Text style={{ fontSize: FontSizes.sm, color: colors.danger, fontWeight: '700', marginTop: 2 }}>
              ₹{item.balance.toFixed(2)} {tr.due}
            </Text>
          )}
        </View>
        {!selectionMode && (
          <View style={S.actions}>
            <TouchableOpacity style={S.callBtn} onPress={() => handleCall(item.phone_number)}>
              <MaterialIcons name="call" size={22} color={colors.success} />
            </TouchableOpacity>
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
        )}
      </TouchableOpacity>
    );
  };

  const renderContactItem = ({ item }: { item: ContactEntry }) => {
    const isSelected = selectedContacts.has(item.key);
    return (
      <TouchableOpacity style={S.contactItem} onPress={() => toggleContactSelection(item.key)} activeOpacity={0.7}>
        <View style={[S.checkbox, isSelected && S.checkboxSelected]}>
          {isSelected && <MaterialIcons name="check" size={18} color="#FFFFFF" />}
        </View>
        <View style={S.contactInfo}>
          <Text style={S.contactName}>{item.name}</Text>
          <Text style={S.contactPhone}>{item.phone}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.container}>
      {/* Selection mode bar */}
      {selectionMode && (
        <View style={S.selectionBar}>
          <TouchableOpacity onPress={exitSelectionMode}>
            <MaterialIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={S.selectionBarText}>{tr.selectedCount(selectedIds.size)}</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <TouchableOpacity style={S.selectionBarBtn} onPress={selectAllDisplayed}>
              <MaterialIcons name="select-all" size={20} color="#FFFFFF" />
              <Text style={S.selectionBarBtnText}>{tr.selectAll}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.selectionBarBtn} onPress={handleBulkDelete}>
              <MaterialIcons name="delete" size={20} color="#FFFFFF" />
              <Text style={S.selectionBarBtnText}>{tr.delete}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!selectionMode && (
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
      )}

      {!selectionMode && customers.length > 0 && (
        <View style={S.summaryBar}>
          <Text style={S.summaryText}>{tr.totalCustomers(customers.length)}</Text>
          {overdueCount > 0 && (
            <Text style={S.summaryOverdue}>{tr.totalOverdue(overdueCount)} · {tr.totalOverdueAmount(overdueAmount)}</Text>
          )}
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
            <MaterialIcons name="people-outline" size={72} color={colors.textMuted} />
            <Text style={S.emptyText}>{tr.noCustomersYet}</Text>
            <Text style={S.emptySubText}>{tr.tapToAdd}</Text>
          </View>
        }
      />

      {!selectionMode && (
        <>
          <TouchableOpacity
            style={S.importBtn}
            onPress={openContactPicker}
            disabled={importingContacts}
            accessibilityLabel={tr.importContacts}
          >
            {importingContacts
              ? <ActivityIndicator color="#FFFFFF" />
              : <MaterialIcons name="contacts" size={28} color="#FFFFFF" />
            }
          </TouchableOpacity>
          <TouchableOpacity style={S.fab} onPress={() => router.push('/add-customer')} accessibilityLabel={tr.addCustomer}>
            <MaterialIcons name="person-add" size={30} color="#FFFFFF" />
          </TouchableOpacity>
        </>
      )}

      {/* Contact Picker Modal */}
      <Modal visible={contactPickerVisible} animationType="slide" transparent>
        <View style={S.modalOverlay}>
          <View style={S.modalContainer}>
            <View style={S.modalHeader}>
              <TouchableOpacity onPress={() => setContactPickerVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={S.modalTitle}>{tr.selectContacts}</Text>
              <View style={{ width: 24 }} />
            </View>

            <TextInput
              style={S.modalSearchInput}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder={tr.searchContacts}
              placeholderTextColor={colors.textMuted}
              clearButtonMode="while-editing"
            />

            {!loadingContacts && (
              <View style={S.modalActions}>
                <TouchableOpacity onPress={selectAllContacts}>
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: FontSizes.sm }}>
                    {selectedContacts.size === filteredContacts.length ? tr.deselectAll : tr.selectAll}
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textSecondary, fontSize: FontSizes.sm }}>
                  {tr.selectedCount(selectedContacts.size)}
                </Text>
              </View>
            )}

            {loadingContacts ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.textSecondary, marginTop: Spacing.md }}>{tr.loadingContacts}</Text>
              </View>
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={item => item.key}
                renderItem={renderContactItem}
                ListEmptyComponent={
                  <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontSize: FontSizes.md }}>{tr.noContactsFound}</Text>
                  </View>
                }
              />
            )}

            <View style={S.importBar}>
              <Text style={{ color: colors.textSecondary, fontSize: FontSizes.sm }}>
                {tr.selectedCount(selectedContacts.size)}
              </Text>
              <TouchableOpacity
                style={[S.importBarBtn, selectedContacts.size === 0 && S.importBarBtnDisabled]}
                onPress={handleImportSelected}
                disabled={selectedContacts.size === 0 || importingContacts}
              >
                {importingContacts
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text style={S.importBarBtnText}>{tr.importSelected}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
