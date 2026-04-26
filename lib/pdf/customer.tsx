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
import { formatCents, formatDate, formatPct } from './format';
import { toBuffer } from './renderer';
import type { RenderArgs } from '@/lib/services/quote';
import type { TabResult } from '@/lib/engine/types';
import { d } from '@/lib/utils/money';

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
  h3: { fontSize: 11, fontWeight: 700, paddingTop: 8, paddingBottom: 2 },
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
  meteredBlock: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
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

function formatUsdDecimal(v: { toNumber(): number } | number): string {
  const n = typeof v === 'number' ? v : v.toNumber();
  return formatCents(Math.round(n * 100));
}

function meteredLineItem({
  tab,
  productName,
  contractMonths,
}: {
  tab: TabResult;
  productName: string;
  contractMonths: number;
}) {
  const m = tab.saasMeta!.metered!;
  const unitLabel = m.unitLabel;
  const committedAfterDiscount = m.committedMonthlyUsd.mul(d(1).minus(m.contractDiscountPct));
  return (
    <View key={`metered-${tab.productId}`} style={s.meteredBlock}>
      <Text style={s.h3}>
        {productName} — {contractMonths}-month term
      </Text>
      <View style={s.row}>
        <Text>
          Monthly base ({m.includedUnitsPerMonth.toLocaleString()} {unitLabel} included)
        </Text>
        <Text>{formatUsdDecimal(m.committedMonthlyUsd)}</Text>
      </View>
      <View style={s.row}>
        <Text>Overage rate</Text>
        <Text>
          {formatUsdDecimal(m.overageRatePerUnitUsd)} / {unitLabel}
        </Text>
      </View>
      {m.contractDiscountPct.gt(0) && (
        <View style={s.row}>
          <Text>Contract discount ({contractMonths}-mo)</Text>
          <Text>-{formatPct(m.contractDiscountPct.toNumber())}</Text>
        </View>
      )}
      <View style={s.row}>
        <Text>Effective monthly base</Text>
        <Text>{formatUsdDecimal(committedAfterDiscount)}</Text>
      </View>
      <View style={s.row}>
        <Text>Expected monthly total</Text>
        <Text>{formatCents(tab.monthlyRevenueCents)}</Text>
      </View>
      <View style={s.row}>
        <Text>Contract total</Text>
        <Text>{formatCents(tab.contractRevenueCents)}</Text>
      </View>
    </View>
  );
}

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

        {/* Metered subscription detail blocks (if any) */}
        {result.perTab.some((t) => t.kind === 'SAAS_USAGE' && t.saasMeta?.metered) && (
          <>
            <Text style={s.h2}>Subscription detail</Text>
            {result.perTab
              .filter((t) => t.kind === 'SAAS_USAGE' && t.saasMeta?.metered)
              .map((t) =>
                meteredLineItem({
                  tab: t,
                  productName: `Subscription (${t.productId})`,
                  contractMonths: scenario.contractMonths,
                }),
              )}
          </>
        )}

        {/* Footer */}
        <Text style={s.footer}>
          Pricing valid for 30 days. All figures USD. Questions: your Ninja Concepts contact.
        </Text>
      </Page>
    </Document>,
  );
}
