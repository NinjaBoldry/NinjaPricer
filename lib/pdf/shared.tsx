import React from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

export const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  h1: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 14, fontWeight: 700, marginTop: 16, marginBottom: 6 },
  muted: { color: '#6b7280' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  table: { marginTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 4,
  },
  th: { fontWeight: 700 },
  col1: { flex: 3 },
  col2: { flex: 2, textAlign: 'right' },
  col3: { flex: 2, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 8,
  },
});

export function Header({
  title,
  customerName,
  quoteVersion,
  generatedAt,
}: {
  title: string;
  customerName: string;
  quoteVersion: number;
  generatedAt: string;
}) {
  return (
    <View>
      <Text style={styles.h1}>{title}</Text>
      <View style={styles.row}>
        <Text>{customerName}</Text>
        <Text style={styles.muted}>
          Quote v{quoteVersion} · {generatedAt}
        </Text>
      </View>
    </View>
  );
}

export function Footer({ text }: { text: string }) {
  return <Text style={styles.footer}>{text}</Text>;
}
