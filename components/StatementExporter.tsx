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
    findChildFolder,
    forgetExportDirectory,
    getSavedExportDirectory,
    isFolderExportSupported,
    openChildFolder,
    openExportFolder,
    pickExportDirectory,
    removeExportFile,
    removeLegacyExports,
    sanitizeSegment,
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
 * Every statement is filed twice inside the chosen folder — once under the day
 * it covers, and once under the customer it belongs to — so the same export can
 * be browsed either way without hunting.
 */
const BY_DATE_FOLDER = 'by date';
const BY_CUSTOMER_FOLDER = 'customer';

/**
 * What each statement's file is called after the customer's name, keeping the
 * names apart when two customers share one.
 *
 * Two people called Ah Seng would otherwise write to the same file and the
 * second would quietly replace the first, so the place is added to tell them
 * apart, and the customer number if even that matches.
 */
function fileLabels(targets: StatementTarget[]): Map<number, string> {
  const timesSeen = (labels: string[]) => {
    const counts = new Map<string, number>();
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    return counts;
  };

  const plain = targets.map(t => sanitizeSegment(t.name));
  const plainCounts = timesSeen(plain);

  const placed = targets.map((t, i) =>
    plainCounts.get(plain[i])! > 1 && t.place
      ? sanitizeSegment(`${t.name} (${t.place})`)
      : plain[i]);
  const placedCounts = timesSeen(placed);

  const labels = new Map<number, string>();
  targets.forEach((t, i) => {
    labels.set(t.id, placedCounts.get(placed[i])! > 1 ? `${placed[i]} (#${t.id})` : placed[i]);
  });
  return labels;
}

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
      let failed = 0;

      try {
        const byDate = await openExportFolder(root, BY_DATE_FOLDER);
        const dateFolder = await openChildFolder(byDate, stamp);
        const byCustomer = await openExportFolder(root, BY_CUSTOMER_FOLDER);
        // Whatever this day left behind under the old naming, before any of it
        // is written again under the new one.
        await removeLegacyExports(dateFolder, stamp);

        const labels = fileLabels(targets);

        for (const [index, target] of targets.entries()) {
          setProgress({ done: index, total: targets.length, label: target.name });
          const fileName = exportFileName(stamp, labels.get(target.id)!);
          const customerName = sanitizeSegment(target.name);
          try {
            const transactions = await getTransactionsByCustomerUpToDate(db, target.id, upTo);
            // Nothing to show on a statement with no ledger entries — including
            // when an earlier export left one that no longer has any.
            if (transactions.length === 0) {
              await removeExportFile(dateFolder, fileName);
              // Only if the customer already has a folder: a customer with
              // nothing to export should not gain an empty one.
              const stale = await findChildFolder(byCustomer, customerName);
              if (stale) {
                await removeExportFile(stale, fileName);
                await removeLegacyExports(stale, stamp);
              }
              continue;
            }
            const balance = await getCustomerBalanceUpToDate(db, target.id, upTo);

            const customerFolder = await openChildFolder(byCustomer, customerName);
            await removeLegacyExports(customerFolder, stamp);

            // Rendering is what costs — the one capture serves both copies.
            const base64 = await captureJob({ target, transactions, balance });
            await writePngToFolder(dateFolder, fileName, base64);
            await writePngToFolder(customerFolder, fileName, base64);
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

      const saved = written;
      const where = `${describeExportDirectory(root)}/${BY_DATE_FOLDER}/${stamp}`;
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
  }, [db, captureJob, tr]);

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
