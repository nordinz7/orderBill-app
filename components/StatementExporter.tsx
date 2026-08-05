import StatementBill from '@/components/StatementBill';
import { AppColors, FontSizes, Spacing } from '@/constants/theme';
import { useSettings } from '@/contexts/SettingsContext';
import {
    getCustomerBalanceUpToDate,
    getTransactionsByCustomerUpToDate,
    TransactionWithQuantity,
} from '@/services/database';
import {
    describeExportDirectory,
    exportFileName,
    exportKey,
    fingerprint,
    forgetExportDirectory,
    getSavedExportDirectory,
    hasExportFile,
    isFolderExportSupported,
    openExportFolder,
    pickExportDirectory,
    pruneExportKey,
    writePngToFolder,
} from '@/utils/imageExport';
import { endOfDay, format } from 'date-fns';
import { useSQLiteContext } from 'expo-sqlite';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

export interface StatementTarget {
  id: number;
  name: string;
  place: string;
}

export interface StatementExporterHandle {
  /** Save one statement image per target, as of `asOf`. */
  run(targets: StatementTarget[], asOf: Date): Promise<void>;
}

/**
 * Part of every statement's fingerprint. Bump it after changing StatementBill,
 * so already-saved images are re-rendered instead of being taken as current.
 */
const TEMPLATE_VERSION = 1;

interface RenderJob {
  target: StatementTarget;
  transactions: TransactionWithQuantity[];
  balance: { totalDebit: number; totalCredit: number; balance: number };
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    captureLayer:   { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF' },
    captureContent: { alignItems: 'center' },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.background,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
      gap: Spacing.md,
    },
    title: { fontSize: FontSizes.xl, fontWeight: '700', color: c.text, textAlign: 'center' },
    sub:   { fontSize: FontSizes.md, color: c.textSecondary, textAlign: 'center' },
  });
}

/**
 * Renders statement images off to the side of the UI and writes them into the
 * user's chosen folder.
 *
 * Each document is rendered on screen — covered by the progress panel — because
 * a view has to be laid out and drawn before it can be captured. The panel sits
 * on top as a sibling, so it never appears in the captured image.
 */
const StatementExporter = forwardRef<StatementExporterHandle>(function StatementExporter(_props, ref) {
  const db = useSQLiteContext();
  const { colors, tr, lang, companyName, companyPlace, companyPhone } = useSettings();
  const S = makeStyles(colors);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [job, setJob] = useState<RenderJob | null>(null);
  const [asOfDate, setAsOfDate] = useState<Date>(() => new Date());

  const shotRef = useRef<ViewShot>(null);
  // Resolved once the job below has painted and is safe to capture.
  const jobReady = useRef<(() => void) | null>(null);
  // A second run would share the single capture view with the first, so the
  // handle ignores calls made while one is already going.
  const busy = useRef(false);

  useEffect(() => {
    if (!job || !jobReady.current) return;
    const resolve = jobReady.current;
    jobReady.current = null;
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(resolve); });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [job]);

  const captureJob = useCallback(async (next: RenderJob): Promise<string> => {
    await new Promise<void>(resolve => {
      jobReady.current = resolve;
      setJob(next);
    });
    if (!shotRef.current?.capture) throw new Error('Capture target is not mounted');
    return shotRef.current.capture();
  }, []);

  const run = useCallback(async (targets: StatementTarget[], asOf: Date) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!isFolderExportSupported) {
        Alert.alert(tr.exportFailed, tr.exportAndroidOnly);
        return;
      }
      if (targets.length === 0) {
        Alert.alert(tr.exportNothing, tr.exportNothingMsg);
        return;
      }

      let root = await getSavedExportDirectory();
      if (!root) {
        try {
          root = await pickExportDirectory();
        } catch {
          Alert.alert(tr.exportFailed, tr.exportFolderFailedMsg);
          return;
        }
        if (!root) return;
      }

      // The folder grant can go stale — the folder may have been deleted or the
      // permission revoked. Find out now rather than failing once per statement.
      try {
        await openExportFolder(root, null);
      } catch {
        await forgetExportDirectory();
        Alert.alert(tr.exportFailed, tr.exportFolderLostMsg);
        return;
      }

      const stamp = format(asOf, 'yyyy-MM-dd');
      // The cutoff has to be the last moment of that day *here*: these queries
      // compare raw ISO strings, so a bare date would drop the day's own
      // entries, and a UTC end-of-day would pull in the next morning's.
      const upTo = endOfDay(asOf).toISOString();

      setAsOfDate(asOf);
      setRunning(true);
      setProgress({ done: 0, total: targets.length, label: '' });

      let written = 0;
      let unchanged = 0;
      let failed = 0;

      try {
        const folder = await openExportFolder(root, stamp);

        for (const [index, target] of targets.entries()) {
          setProgress({ done: index, total: targets.length, label: target.name });
          const key = exportKey('Statement', stamp, target.id);
          try {
            const transactions = await getTransactionsByCustomerUpToDate(db, target.id, upTo);
            // Nothing to show on a statement with no ledger entries — including
            // when an earlier export left one that no longer has any.
            if (transactions.length === 0) {
              await pruneExportKey(folder, key, null);
              continue;
            }
            const balance = await getCustomerBalanceUpToDate(db, target.id, upTo);

            // Everything the rendered image depends on, so that re-exporting an
            // untouched statement matches its own earlier output.
            const fileName = exportFileName(key, target.name, fingerprint([
              TEMPLATE_VERSION, lang, companyName, companyPlace, companyPhone,
              target.name, target.place, stamp,
              balance.totalDebit, balance.totalCredit, balance.balance,
              ...transactions.map(t =>
                `${t.id}|${t.type}|${t.amount}|${t.quantity}|${t.description}|${t.date}`),
            ]));

            if (hasExportFile(folder, fileName)) {
              unchanged++;
              continue;
            }

            const base64 = await captureJob({ target, transactions, balance });
            // Written before the older versions are dropped — the fingerprint
            // keeps the new name distinct, so the statement is never missing.
            await writePngToFolder(folder, fileName, base64);
            await pruneExportKey(folder, key, fileName);
            written++;
          } catch {
            failed++;
          }
        }
      } catch {
        Alert.alert(tr.exportFailed, tr.exportFailedMsg);
        return;
      } finally {
        setJob(null);
        setRunning(false);
      }

      // Statements left untouched are still saved and current, so they count
      // towards what the folder now holds.
      const saved = written + unchanged;
      const where = `${describeExportDirectory(root)}/${stamp}`;
      if (failed > 0) {
        Alert.alert(tr.exportDone, tr.exportPartialMsg(saved, failed, where));
      } else if (saved === 0) {
        Alert.alert(tr.exportNothing, tr.exportNothingMsg);
      } else {
        Alert.alert(tr.exportDone, tr.exportDoneMsg(saved, where));
      }
    } finally {
      busy.current = false;
    }
  }, [db, captureJob, tr, lang, companyName, companyPlace, companyPhone]);

  useImperativeHandle(ref, () => ({ run }), [run]);

  if (!running) return null;

  return (
    <>
      <View style={S.captureLayer} pointerEvents="none">
        {/* A scroll container lets a long statement lay out past the screen
            edge, so the capture is the whole document rather than a crop. */}
        <ScrollView contentContainerStyle={S.captureContent} scrollEnabled={false}>
          <ViewShot ref={shotRef} options={{ format: 'png', quality: 1, result: 'base64' }}>
            {job && (
              <StatementBill
                companyName={companyName}
                companyPlace={companyPlace}
                companyPhone={companyPhone}
                customerName={job.target.name}
                customerPlace={job.target.place}
                date={format(asOfDate, 'dd/MM/yyyy')}
                transactions={job.transactions}
                totalOrders={job.balance.totalDebit}
                totalPaid={job.balance.totalCredit}
                balance={job.balance.balance}
                lang={lang}
              />
            )}
          </ViewShot>
        </ScrollView>
      </View>
      <View style={S.overlay}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={S.title}>{tr.exportProgress(progress.done, progress.total)}</Text>
        {!!progress.label && <Text style={S.sub} numberOfLines={2}>{progress.label}</Text>}
      </View>
    </>
  );
});

export default StatementExporter;
