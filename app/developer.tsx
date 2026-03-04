import { AppColors, FontSizes, Radius, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import { addOrder, initDatabase, insertPayment } from '@/services/database';
import { MaterialIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const TABLE_NAMES = ['customers', 'orders', 'transactions', 'statements', 'statement_transactions'];

interface TableStats { name: string; count: number }
interface QueryResult { columns: string[]; rows: Record<string, unknown>[]; time: number; error?: string }

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scrollContent: { padding: Spacing.lg, paddingBottom: 60, gap: Spacing.lg },
    section: { backgroundColor: c.card, borderRadius: Radius.lg, overflow: 'hidden', elevation: 1 },
    sectionHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    sectionTitle: { fontSize: FontSizes.md, fontWeight: '700', color: c.text },
    // Stats
    statRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    statRowLast: { borderBottomWidth: 0 },
    statName: { fontSize: FontSizes.md, color: c.text, fontFamily: 'monospace' },
    statRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statCount: { fontSize: FontSizes.md, fontWeight: '700', color: c.primary, fontFamily: 'monospace' },
    hint: { fontSize: FontSizes.sm, color: c.textMuted, padding: Spacing.xl, fontStyle: 'italic' },
    // SQL
    sqlInput: {
      backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.border, borderRadius: Radius.md,
      margin: Spacing.md, padding: Spacing.md, fontSize: FontSizes.sm, color: c.text,
      fontFamily: 'monospace', minHeight: 80, textAlignVertical: 'top',
    },
    runBtn: {
      backgroundColor: c.primary, borderRadius: Radius.md, paddingVertical: Spacing.md,
      alignItems: 'center', marginHorizontal: Spacing.md, marginBottom: Spacing.md,
    },
    runBtnDisabled: { opacity: 0.5 },
    runBtnText: { color: '#FFFFFF', fontSize: FontSizes.md, fontWeight: '700' },
    resultBox: {
      margin: Spacing.md, marginTop: 0, backgroundColor: c.inputBg,
      borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: c.border,
    },
    resultMeta: { fontSize: FontSizes.xs, color: c.textMuted, marginBottom: 8, fontFamily: 'monospace' },
    errorText: { fontSize: FontSizes.sm, color: c.danger, fontFamily: 'monospace' },
    tableRow: { flexDirection: 'row' },
    tableRowAlt: { backgroundColor: c.separator },
    tableHeader: {
      fontSize: 11, fontWeight: '700', color: c.primary, fontFamily: 'monospace',
      minWidth: 110, paddingHorizontal: 6, paddingVertical: 4,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    tableCell: {
      fontSize: 11, color: c.text, fontFamily: 'monospace',
      minWidth: 110, paddingHorizontal: 6, paddingVertical: 4,
    },
    // Quick queries
    quickRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    quickRowLast: { borderBottomWidth: 0 },
    quickText: { fontSize: FontSizes.md, color: c.text, flex: 1 },
    // Actions
    actionRow: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.lg,
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
      borderBottomWidth: 1, borderBottomColor: c.separator,
    },
    actionRowLast: { borderBottomWidth: 0 },
    actionText: { fontSize: FontSizes.md, color: c.text, fontWeight: '500', flex: 1 },
    // Danger zone
    dangerSection: {
      backgroundColor: c.dangerLight, borderRadius: Radius.lg,
      borderWidth: 1.5, borderColor: c.danger, overflow: 'hidden',
    },
    dangerHeader: {
      paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.danger,
    },
    dangerTitle: { fontSize: FontSizes.md, fontWeight: '700', color: c.danger },
    dangerBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.sm, backgroundColor: c.danger,
      margin: Spacing.md, paddingVertical: Spacing.md, borderRadius: Radius.md,
    },
    dangerBtnText: { color: '#FFFFFF', fontSize: FontSizes.md, fontWeight: '700' },
  });
}

const QUICK_QUERIES = [
  { label: 'Customers with balance', sql: `SELECT c.name, c.place, COALESCE(SUM(CASE WHEN t.type='debit' THEN t.amount ELSE -t.amount END), 0) as balance FROM customers c LEFT JOIN transactions t ON c.id = t.customer_id GROUP BY c.id HAVING balance != 0 ORDER BY balance DESC` },
  { label: 'Recent 20 orders', sql: `SELECT o.*, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.date DESC LIMIT 20` },
  { label: 'Recent 20 payments', sql: `SELECT t.*, c.name as customer_name FROM transactions t JOIN customers c ON t.customer_id = c.id WHERE t.type = 'credit' ORDER BY t.date DESC LIMIT 20` },
  { label: 'Schema info', sql: `SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name` },
];

const SAMPLE_CUSTOMERS = [
  { name: 'Vanavil samsul', phone: '9566753831', place: 'Adirai' },
  { name: 'MM Store', phone: '9363485557', place: 'Pattukkottai' },
];

const ITEMS = ['Kuboos'];

export default function DeveloperScreen() {
  const db = useSQLiteContext();
  const { colors } = useSettings();
  const S = makeStyles(colors);

  const [tableStats, setTableStats] = useState<TableStats[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [runningQuery, setRunningQuery] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const stats: TableStats[] = [];
      for (const name of TABLE_NAMES) {
        try {
          const result = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM ${name}`);
          stats.push({ name, count: result?.count ?? 0 });
        } catch {
          stats.push({ name, count: -1 });
        }
      }
      setTableStats(stats);
    } finally {
      setLoadingStats(false);
    }
  }, [db]);

  const runQuery = useCallback(async () => {
    if (!sqlQuery.trim()) return;
    setRunningQuery(true);
    setQueryResult(null);
    const start = performance.now();
    try {
      const isSelect = sqlQuery.trim().toUpperCase().startsWith('SELECT') || sqlQuery.trim().toUpperCase().startsWith('PRAGMA');
      if (isSelect) {
        const rows = await db.getAllAsync<Record<string, unknown>>(sqlQuery);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        setQueryResult({ columns, rows, time: Math.round(performance.now() - start) });
      } else {
        const result = await db.runAsync(sqlQuery);
        setQueryResult({
          columns: ['changes', 'lastInsertRowId'],
          rows: [{ changes: result.changes, lastInsertRowId: result.lastInsertRowId }],
          time: Math.round(performance.now() - start),
        });
      }
    } catch (e: unknown) {
      setQueryResult({ columns: [], rows: [], time: Math.round(performance.now() - start), error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunningQuery(false);
    }
  }, [sqlQuery, db]);

  const seedSampleData = useCallback(() => {
    Alert.alert('Seed Sample Data', 'This will insert fake customers, orders, and payments. Existing data will NOT be deleted. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Seed', style: 'destructive',
        onPress: async () => {
          setSeeding(true);
          try {
            const now = new Date().toISOString();
            for (const c of SAMPLE_CUSTOMERS) {
              try {
                const result = await db.runAsync(
                  `INSERT INTO customers (name, place, phone_number, created_date, updated_at) VALUES (?, ?, ?, ?, ?)`,
                  [c.name, c.place, c.phone, now, now]
                );
                const customerId = result.lastInsertRowId;
                const orderCount = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < orderCount; i++) {
                  const daysAgo = Math.floor(Math.random() * 30);
                  const date = new Date();
                  date.setDate(date.getDate() - daysAgo);
                  const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
                  const qty = 1 + Math.floor(Math.random() * 5);
                  await addOrder(db, customerId, item, qty, date.toISOString());
                }
                const paymentCount = 1 + Math.floor(Math.random() * 2);
                for (let i = 0; i < paymentCount; i++) {
                  const payAmount = [500, 1000, 1500, 2000][Math.floor(Math.random() * 4)];
                  await insertPayment(db, customerId, payAmount, 'Cash');
                }
              } catch { /* skip duplicates */ }
            }
            Alert.alert('Done', 'Sample data seeded successfully.');
            loadStats();
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : String(e));
          } finally {
            setSeeding(false);
          }
        },
      },
    ]);
  }, [db, loadStats]);

  const resetDatabase = useCallback(() => {
    Alert.alert('⚠️ Reset Database', 'This will DELETE ALL DATA permanently. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Everything', style: 'destructive',
        onPress: () => {
          Alert.alert('⚠️ Final Confirmation', 'ALL customers, orders, payments, and statements will be permanently erased.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Reset', style: 'destructive',
              onPress: async () => {
                try {
                  await db.execAsync(`
                    DELETE FROM statement_transactions;
                    DELETE FROM statements;
                    DELETE FROM transactions;
                    DELETE FROM orders;
                    DELETE FROM customers;
                  `);
                  Alert.alert('Done', 'All data has been deleted.');
                  loadStats();
                } catch (e: unknown) {
                  Alert.alert('Error', e instanceof Error ? e.message : String(e));
                }
              },
            },
          ]);
        },
      },
    ]);
  }, [db, loadStats]);

  return (
    <ScrollView style={S.container} contentContainerStyle={S.scrollContent} keyboardShouldPersistTaps="handled">
      {/* Database Stats */}
      <View style={S.section}>
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>📊 Database Stats</Text>
          <TouchableOpacity onPress={loadStats}>
            {loadingStats ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="refresh" size={22} color={colors.primary} />}
          </TouchableOpacity>
        </View>
        {tableStats.length === 0 ? (
          <Text style={S.hint}>Tap refresh to load stats</Text>
        ) : (
          tableStats.map((t, i) => (
            <TouchableOpacity key={t.name} style={[S.statRow, i === tableStats.length - 1 && S.statRowLast]} onPress={() => setSqlQuery(`SELECT * FROM ${t.name} ORDER BY rowid DESC LIMIT 50`)}>
              <Text style={S.statName}>{t.name}</Text>
              <View style={S.statRight}>
                <Text style={[S.statCount, t.count === -1 && { color: colors.danger }]}>{t.count === -1 ? 'ERR' : t.count}</Text>
                <MaterialIcons name="chevron-right" size={18} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Raw SQL */}
      <View style={S.section}>
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>🗄 Raw SQL Query</Text>
        </View>
        <TextInput
          style={S.sqlInput}
          value={sqlQuery}
          onChangeText={setSqlQuery}
          placeholder="SELECT * FROM customers LIMIT 10"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity style={[S.runBtn, (!sqlQuery.trim() || runningQuery) && S.runBtnDisabled]} onPress={runQuery} disabled={!sqlQuery.trim() || runningQuery}>
          {runningQuery ? <ActivityIndicator size="small" color="#fff" /> : <Text style={S.runBtnText}>▶ Run Query</Text>}
        </TouchableOpacity>

        {queryResult && (
          <View style={S.resultBox}>
            {queryResult.error ? (
              <Text style={S.errorText}>❌ {queryResult.error}</Text>
            ) : (
              <>
                <Text style={S.resultMeta}>{queryResult.rows.length} row(s) • {queryResult.time}ms</Text>
                <ScrollView horizontal>
                  <View>
                    {queryResult.columns.length > 0 && (
                      <View style={S.tableRow}>
                        {queryResult.columns.map(col => <Text key={col} style={S.tableHeader}>{col}</Text>)}
                      </View>
                    )}
                    {queryResult.rows.slice(0, 50).map((row, i) => (
                      <View key={i} style={[S.tableRow, i % 2 === 0 && S.tableRowAlt]}>
                        {queryResult.columns.map(col => (
                          <Text key={col} style={S.tableCell}>{row[col] === null ? 'NULL' : String(row[col]).substring(0, 40)}</Text>
                        ))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        )}
      </View>

      {/* Quick Queries */}
      <View style={S.section}>
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>⚡ Quick Queries</Text>
        </View>
        {QUICK_QUERIES.map((q, i) => (
          <TouchableOpacity key={q.label} style={[S.quickRow, i === QUICK_QUERIES.length - 1 && S.quickRowLast]} onPress={() => setSqlQuery(q.sql)}>
            <Text style={S.quickText}>{q.label}</Text>
            <MaterialIcons name="code" size={18} color={colors.primary} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Actions */}
      <View style={S.section}>
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>⚙️ Actions</Text>
        </View>
        <TouchableOpacity style={S.actionRow} onPress={seedSampleData} disabled={seeding}>
          <MaterialIcons name="group-add" size={22} color={colors.primary} />
          <Text style={S.actionText}>{seeding ? 'Seeding...' : 'Seed Sample Data'}</Text>
          {seeding && <ActivityIndicator size="small" color={colors.primary} />}
        </TouchableOpacity>
        <TouchableOpacity style={S.actionRow} onPress={async () => {
          try { await initDatabase(db); Alert.alert('Done', 'Migrations re-run successfully.'); }
          catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : String(e)); }
        }}>
          <MaterialIcons name="build" size={22} color={colors.primary} />
          <Text style={S.actionText}>Re-run Migrations</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.actionRow} onPress={async () => {
          try {
            const pages = await db.getFirstAsync<{ page_count: number }>('PRAGMA page_count');
            const size = await db.getFirstAsync<{ page_size: number }>('PRAGMA page_size');
            const journal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
            const sizeKB = Math.round(((pages?.page_count ?? 0) * (size?.page_size ?? 0)) / 1024);
            Alert.alert('Database Info', `Size: ${sizeKB} KB\nPages: ${pages?.page_count ?? 0}\nPage size: ${size?.page_size ?? 0}\nJournal: ${journal?.journal_mode ?? 'unknown'}`);
          } catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : String(e)); }
        }}>
          <MaterialIcons name="info-outline" size={22} color={colors.primary} />
          <Text style={S.actionText}>Database Info</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.actionRow, S.actionRowLast]} onPress={async () => {
          try { await db.execAsync('VACUUM'); Alert.alert('Done', 'Database vacuumed (compacted) successfully.'); }
          catch (e: unknown) { Alert.alert('Error', e instanceof Error ? e.message : String(e)); }
        }}>
          <MaterialIcons name="compress" size={22} color={colors.primary} />
          <Text style={S.actionText}>Vacuum Database</Text>
        </TouchableOpacity>
      </View>

      {/* Danger Zone */}
      <View style={S.dangerSection}>
        <View style={S.dangerHeader}>
          <Text style={S.dangerTitle}>🔴 Danger Zone</Text>
        </View>
        <TouchableOpacity style={S.dangerBtn} onPress={resetDatabase}>
          <MaterialIcons name="delete-forever" size={22} color="#fff" />
          <Text style={S.dangerBtnText}>Reset Entire Database</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
