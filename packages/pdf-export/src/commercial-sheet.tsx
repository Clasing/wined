import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';

export type CommercialSheetData = {
  brand: { name: string; logoText?: string };
  wine: {
    producer: string;
    name: string;
    vintage?: number | null;
    doAppellation?: string | null;
    region?: string | null;
    wineType?: string;
    grapeVarieties?: string[];
    technicalNotes?: string;
    tastingNotes?: string;
  };
  citations: Array<{ id: string; label: string; body: string }>;
  generatedAt: string;
  generatedFor?: string;
};

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 11 },
  header: { borderBottom: '2 solid #6e0f24', paddingBottom: 12, marginBottom: 20 },
  brand: { fontSize: 24, color: '#6e0f24', fontWeight: 'bold' },
  title: { fontSize: 20, marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#666' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 6, color: '#6e0f24' },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 100, fontWeight: 'bold' },
  value: { flex: 1 },
  paragraph: { lineHeight: 1.5 },
  citation: {
    fontSize: 9,
    color: '#444',
    borderLeft: '2 solid #ccc',
    paddingLeft: 6,
    marginBottom: 6,
  },
  citationLabel: { fontWeight: 'bold' },
  techNotes: { marginTop: 6 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#888',
    textAlign: 'center',
  },
});

const CommercialSheet: React.FC<{ data: CommercialSheetData }> = ({ data }) => {
  const subtitleParts = [data.wine.vintage, data.wine.doAppellation, data.wine.region]
    .filter((p): p is string | number => p !== null && p !== undefined && p !== '')
    .map(String);

  const footerText =
    `Generado por Wined · ${data.generatedAt}` +
    (data.generatedFor ? ` · para ${data.generatedFor}` : '') +
    ' · Las citas son verificables en el corpus técnico.';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>{data.brand.logoText ?? data.brand.name}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>
            {data.wine.producer} — {data.wine.name}
          </Text>
          {subtitleParts.length > 0 && (
            <Text style={styles.subtitle}>{subtitleParts.join(' · ')}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ficha técnica</Text>
          {data.wine.wineType ? (
            <View style={styles.row}>
              <Text style={styles.label}>Tipo:</Text>
              <Text style={styles.value}>{data.wine.wineType}</Text>
            </View>
          ) : null}
          {data.wine.grapeVarieties && data.wine.grapeVarieties.length > 0 ? (
            <View style={styles.row}>
              <Text style={styles.label}>Variedades:</Text>
              <Text style={styles.value}>{data.wine.grapeVarieties.join(', ')}</Text>
            </View>
          ) : null}
          {data.wine.technicalNotes ? (
            <Text style={[styles.paragraph, styles.techNotes]}>
              {data.wine.technicalNotes}
            </Text>
          ) : null}
        </View>

        {data.wine.tastingNotes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notas de cata</Text>
            <Text style={styles.paragraph}>{data.wine.tastingNotes}</Text>
          </View>
        ) : null}

        {data.citations.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Referencias técnicas</Text>
            {data.citations.map((c) => (
              <View key={c.id} style={styles.citation}>
                <Text style={styles.citationLabel}>{c.label}</Text>
                <Text>{c.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.footer}>{footerText}</Text>
      </Page>
    </Document>
  );
};

export async function renderCommercialSheet(
  data: CommercialSheetData,
): Promise<Buffer> {
  return await renderToBuffer(<CommercialSheet data={data} />);
}
