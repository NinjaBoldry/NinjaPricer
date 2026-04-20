import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles, Header, Footer } from './shared';
import { formatCents, formatDate, formatPct } from './format';
import { toBuffer } from './renderer';
import type { RenderArgs } from '@/lib/services/quote';

export async function renderInternalPdf(args: RenderArgs): Promise<Buffer> {
  const { scenario, generatedAt, version, result } = args;
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
            {formatCents(result.totals.netMarginCents)} (
            {formatPct(result.totals.marginPctNet)})
          </Text>
        </View>

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
