// src/components/documentViewer/TextPageViewer.tsx
// Renders plain-text files as the same white "page" card on a gray
// backdrop the PDF/DOCX/ODT viewers use, for visual consistency across
// every document type this screen handles. Text is read by the caller
// (document.tsx already does this as part of its decrypt pipeline) — this
// component just lays it out.
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// Same fixed light backdrop as the other document viewers — see
// PdfViewer.tsx's CANVAS_BG comment.
const CANVAS_BG = '#E9EDF2';

export function TextPageViewer({ content }: { content: string }) {
  return (
    <ScrollView style={[styles.flex1, { backgroundColor: CANVAS_BG }]} contentContainerStyle={styles.scrollContent}>
      <View style={styles.page}>
        <Text style={styles.text}>{content}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 40, alignItems: 'center' },
  page: {
    width: '100%',
    maxWidth: 700,
    backgroundColor: '#FFFFFF',
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    color: '#1F2937',
  },
});
