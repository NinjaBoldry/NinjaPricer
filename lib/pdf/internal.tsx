import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { styles, Header, Footer } from './shared';
import { formatCents, formatDate, formatPct } from './format';
import { toBuffer } from './renderer';
import type { RenderArgs } from '@/lib/services/quote';
import type { TabResult } from '@/lib/engine/types';

const meteredStyles = StyleSheet.create({
  block: {
    marginTop: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  blockTitle: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
});

function formatUsdDecimal(v: { toNumber(): number }): string {
  return formatCents(Math.round(v.toNumber() * 100));
}

function meteredInternalDetail({
  tab,
  contractMonths,
}: {
  tab: TabResult;
  contractMonths: number;
}) {
  const m = tab.saasMeta!.metered!;
  const monthlyMarginCents = tab.monthlyRevenueCents - tab.monthlyCostCents;
  const monthlyMarginPct =
    tab.monthlyRevenueCents > 0 ? monthlyMarginCents / tab.monthlyRevenueCents : 0;
  return (
    <View key={`metered-internal-${tab.productId}`} style={meteredStyles.block}>
      <Text style={meteredStyles.blockTitle}>
        Metered: {tab.productId} ({contractMonths}-mo)
      </Text>
      <View style={styles.row}>
        <Text>Committed {m.unitLabel} / mo</Text>
        <Text>{m.committedUnitsPerMonth.toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text>Expected actual {m.unitLabel} / mo</Text>
        <Text>{m.expectedActualUnitsPerMonth.toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text>Overage units / mo</Text>
        <Text>{m.overageUnits.toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text>Cost per {m.unitLabel}</Text>
        <Text>{formatUsdDecimal(m.costPerUnitUsd)}</Text>
      </View>
      <View style={styles.row}>
        <Text>Monthly cost</Text>
        <Text>{formatCents(tab.monthlyCostCents)}</Text>
      </View>
      <View style={styles.row}>
        <Text>Monthly revenue</Text>
        <Text>{formatCents(tab.monthlyRevenueCents)}</Text>
      </View>
      <View style={styles.row}>
        <Text>Monthly margin</Text>
        <Text>
          {formatCents(monthlyMarginCents)} ({formatPct(monthlyMarginPct)})
        </Text>
      </View>
    </View>
  );
}

export async function renderInternalPdf(args: RenderArgs): Promise<Buffer> {
  const { scenario, generatedAt, version, result } = args;
  const meteredTabs = result.perTab.filter(
    (t) => t.kind === 'SAAS_USAGE' && t.saasMeta?.metered,
  );
  return toBuffer(
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Header
          title={`Internal summary — ${scenario.name}`}
          customerName={scenario.customerName}
          quoteVersion={version}
          generatedAt={formatDate(generatedAt)}
        />

        <Text style={styles.h2}>Contract totals</Text>
        <View style={styles.row}>
          <Text>Contract revenue</Text>
          <Text>{formatCents(result.totals.contractRevenueCents)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Contract cost</Text>
          <Text>{formatCents(result.totals.contractCostCents)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Contribution margin</Text>
          <Text>
            {formatCents(result.totals.contributionMarginCents)} (
            {formatPct(result.totals.marginPctContribution)})
          </Text>
        </View>
        <View style={styles.row}>
          <Text>Net margin</Text>
          <Text>
            {formatCents(result.totals.netMarginCents)} ({formatPct(result.totals.marginPctNet)})
          </Text>
        </View>

        {meteredTabs.length > 0 && (
          <>
            <Text style={styles.h2}>Metered subscriptions</Text>
            {meteredTabs.map((t) =>
              meteredInternalDetail({
                tab: t,
                contractMonths: scenario.contractMonths,
              }),
            )}
          </>
        )}

        <Text style={styles.h2}>Commissions</Text>
        <View style={styles.table}>
          <View style={[styles.tr, styles.th]}>
            <Text style={styles.col1}>Rule</Text>
            <Text style={styles.col2}>Base</Text>
            <Text style={styles.col3}>Commission</Text>
          </View>
          {result.commissions.map((c) => (
            <View key={c.ruleId} style={styles.tr}>
              <Text style={styles.col1}>{c.name}</Text>
              <Text style={styles.col2}>{formatCents(c.baseAmountCents)}</Text>
              <Text style={styles.col3}>{formatCents(c.commissionAmountCents)}</Text>
            </View>
          ))}
        </View>

        {result.warnings.length > 0 && (
          <>
            <Text style={styles.h2}>Rail warnings</Text>
            {result.warnings.map((w) => (
              <Text key={w.railId}>
                [{w.severity.toUpperCase()}] {w.message}
              </Text>
            ))}
          </>
        )}

        <Footer text="Internal use only. Do not distribute." />
      </Page>
    </Document>,
  );
}
