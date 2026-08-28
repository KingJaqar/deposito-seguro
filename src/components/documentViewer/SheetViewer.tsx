// src/components/documentViewer/SheetViewer.tsx
// Renders a decrypted local .xlsx as a native, Sheets/Excel-style grid —
// synthetic A/B/C column letters and 1/2/3 row numbers, a frozen header
// row + frozen row-number column, and a bottom sheet-tab bar when the
// workbook has more than one sheet. Parsed with SheetJS in
// xlsxParser.ts; this component only lays the result out. Pure RN views
// (no WebView) — SheetJS's parser has no DOM dependency, and a native grid
// scrolls far more smoothly than an HTML <table> would inside a WebView.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { parseXlsx, columnLabel, ParsedWorkbook } from '../../services/documentViewers/xlsxParser';
import { Chip } from '../primitives/Chip';
import { useTheme } from '../../contexts/ThemeContext';

// Fixed light "spreadsheet" palette, deliberately theme-independent — same
// rationale as PdfViewer/FlowDocViewer's CANVAS_BG: this mirrors Sheets'
// own always-light grid rather than the host app's light/dark/amoled mode.
const CANVAS_BG = '#E9EDF2';
const GRID_BG = '#FFFFFF';
const GRID_LINE = '#E1E5EA';
const HEADER_BG = '#F8F9FA';
const HEADER_TEXT = '#5F6368';
const CELL_TEXT = '#1F2937';

const CELL_WIDTH = 112;
const ROW_NUM_WIDTH = 44;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 34;

export function SheetViewer({ localUri }: { localUri: string }) {
  const { colors, space } = useTheme();
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const headerScrollRef = useRef<ScrollView>(null);
  const lastOffsetX = useRef(0);

  useEffect(() => {
    let mounted = true;
    parseXlsx(localUri)
      .then((wb) => { if (mounted) setWorkbook(wb); })
      .catch((err) => { if (mounted) setError(String(err?.message || err)); });
    return () => { mounted = false; };
  }, [localUri]);

  const onBodyScrollX = (x: number) => {
    if (Math.abs(x - lastOffsetX.current) < 1) return;
    lastOffsetX.current = x;
    headerScrollRef.current?.scrollTo({ x, animated: false });
  };

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: CANVAS_BG }]}>
        <AlertCircle size={32} color={colors.error} strokeWidth={1.75} />
        <Text style={styles.errorText}>Couldn&apos;t open this spreadsheet</Text>
      </View>
    );
  }

  if (!workbook) {
    return (
      <View style={[styles.center, { backgroundColor: CANVAS_BG }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const sheet = workbook.sheets[activeSheet];
  const gridWidth = sheet.columnCount * CELL_WIDTH;

  return (
    <View style={[styles.flex1, { backgroundColor: CANVAS_BG }]}>
      <View style={styles.sheetCard}>
        {/* Header row: blank corner + frozen-vertically, horizontally mirrors the body's scrollX */}
        <View style={[styles.headerRow, { backgroundColor: HEADER_BG, borderColor: GRID_LINE }]}>
          <View style={[styles.corner, { width: ROW_NUM_WIDTH, height: HEADER_HEIGHT, borderColor: GRID_LINE }]} />
          <ScrollView ref={headerScrollRef} horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', width: gridWidth }}>
              {Array.from({ length: sheet.columnCount }).map((_, c) => (
                <View key={c} style={[styles.headerCell, { width: CELL_WIDTH, height: HEADER_HEIGHT, borderColor: GRID_LINE }]}>
                  <Text style={[styles.headerCellText, { color: HEADER_TEXT }]}>{columnLabel(c)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Body: row-number column (scrolls vertically with the grid for free, same outer ScrollView) + horizontally-scrollable data grid */}
        <ScrollView style={styles.flex1} showsVerticalScrollIndicator>
          <View style={{ flexDirection: 'row' }}>
            <View>
              {sheet.rows.map((_, r) => (
                <View key={r} style={[styles.rowNumCell, { width: ROW_NUM_WIDTH, height: ROW_HEIGHT, backgroundColor: HEADER_BG, borderColor: GRID_LINE }]}>
                  <Text style={[styles.headerCellText, { color: HEADER_TEXT }]}>{r + 1}</Text>
                </View>
              ))}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              onScroll={(e) => onBodyScrollX(e.nativeEvent.contentOffset.x)}
              scrollEventThrottle={16}
            >
              <View style={{ width: gridWidth }}>
                {sheet.rows.map((row, r) => (
                  <View key={r} style={{ flexDirection: 'row' }}>
                    {row.map((cell, c) => (
                      <View key={c} style={[styles.dataCell, { width: CELL_WIDTH, height: ROW_HEIGHT, borderColor: GRID_LINE, backgroundColor: GRID_BG }]}>
                        <Text numberOfLines={1} style={[styles.dataCellText, { color: CELL_TEXT }]}>{cell}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      </View>

      {workbook.sheets.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.borderLight }]}
          contentContainerStyle={{ paddingHorizontal: space(3), paddingVertical: space(2), gap: space(2) }}
        >
          {workbook.sheets.map((s, i) => (
            <Chip key={s.name + i} label={s.name} selected={i === activeSheet} onPress={() => setActiveSheet(i)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  errorText: { fontSize: 14, fontWeight: '600', color: '#617187' },
  sheetCard: { flex: 1, margin: 10, borderRadius: 6, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerRow: { flexDirection: 'row', borderBottomWidth: 1 },
  corner: { borderRightWidth: 1 },
  headerCell: { alignItems: 'center', justifyContent: 'center', borderRightWidth: 1 },
  headerCellText: { fontSize: 12, fontWeight: '700' },
  rowNumCell: { alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderBottomWidth: 1 },
  dataCell: { justifyContent: 'center', paddingHorizontal: 8, borderRightWidth: 1, borderBottomWidth: 1 },
  dataCellText: { fontSize: 13, fontWeight: '500' },
  tabBar: { flexGrow: 0, borderTopWidth: StyleSheet.hairlineWidth },
});
