/**
 * Customer-facing quote PDF.
 *
 * Business rule: this document MUST NOT contain the words "cost" or "margin"
 * (case-insensitive) anywhere in the serialized React tree — not in text
 * content and not in CSS property names.  All layout spacing therefore uses
 * padding/gap instead of CSS margin.
 */
import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatCents, formatDate } from './format';
import { toBuffer } from './renderer';
import type { RenderArgs } from '@/lib/services/quote';

// All styles use padding/gap — never margin — so the serialized tree stays
// free of the word "margin" (see business rule above).
const s = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  h1: { fontSize: 20, fontWeight: 700, paddingBottom: 4 },
  h2: { fontSize: 14, fontWeight: 700, paddingTop: 16, paddingBottom: 6 },
  muted: { color: '#6b7280' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 2 },
  table: { paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
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

export async function renderCustomerPdf(args: RenderArgs): Promise<Buffer> {
  const { scenario, generatedAt, version, result } = args;
  return toBuffer(
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View>
          <Text style={s.h1}>{`Quote — ${scenario.name}`}</Text>
          <View style={s.row}>
            <Text>{scenario.customerName}</Text>
            <Text style={s.muted}>
              Quote v{version} · {formatDate(generatedAt)}
            </Text>
          </View>
        </View>

        {/* Summary */}
        <Text style={s.h2}>Summary</Text>
        <View style={s.row}>
          <Text>Contract length</Text>
          <Text>{scenario.contractMonths} months</Text>
        </View>
        <View style={s.row}>
          <Text>Total contract value</Text>
          <Text>{formatCents(result.totals.contractRevenueCents)}</Text>
        </View>

        {/* Line items */}
        <Text style={s.h2}>Line items</Text>
        <View style={s.table}>
          <View style={[s.tr, s.th]}>
            <Text style={s.col1}>Item</Text>
            <Text style={s.col2}>Monthly</Text>
            <Text style={s.col3}>Contract</Text>
          </View>
          {result.perTab.map((t) => (
            <View key={`${t.productId}-${t.kind}`} style={s.tr}>
              <Text style={s.col1}>
                {t.kind === 'SAAS_USAGE'
                  ? `Subscription (${t.productId})`
                  : t.kind === 'PACKAGED_LABOR'
                    ? `Training & White-glove`
                    : `Professional Services`}
              </Text>
              <Text style={s.col2}>{formatCents(t.monthlyRevenueCents)}</Text>
              <Text style={s.col3}>{formatCents(t.contractRevenueCents)}</Text>
            </View>
          ))}
          <View style={[s.tr, s.th]}>
            <Text style={s.col1}>Total</Text>
            <Text style={s.col2}>{formatCents(result.totals.monthlyRevenueCents)}</Text>
            <Text style={s.col3}>{formatCents(result.totals.contractRevenueCents)}</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          Pricing valid for 30 days. All figures USD. Questions: your Ninja Concepts contact.
        </Text>
      </Page>
    </Document>,
  );
}
