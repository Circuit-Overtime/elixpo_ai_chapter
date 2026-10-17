import { writeFile } from 'node:fs/promises';

const DIMENSIONS = new Set(['overview', 'timeline', 'posts', 'sources', 'devices', 'countries']);
const RANGES = new Set(['7d', '30d', '90d', '12m', 'custom']);

function normalizedOptions(options = {}) {
  const dimension = options.dimension || 'overview';
  const range = options.range || (options.from || options.to ? 'custom' : '30d');
  if (!DIMENSIONS.has(dimension)) throw new Error(`Unsupported analytics dimension: ${dimension}.`);
  if (!RANGES.has(range)) throw new Error(`Unsupported analytics range: ${range}.`);
  if (range === 'custom' && (!options.from || !options.to)) throw new Error('Custom analytics ranges require --from and --to.');
  return {
    scope: options.scope?.[0] || options.publication || 'personal',
    range,
    from: options.from,
    to: options.to,
    dimension,
    limit: options.limit,
    cursor: options.cursor,
  };
}

export async function analyticsQuery({ client, options }) {
  return client.query(normalizedOptions(options));
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsFromPayload(payload) {
  const values = payload?.data?.values;
  if (Array.isArray(values)) return values;
  if (values?.labels && Array.isArray(values.labels)) {
    return values.labels.map((label, index) => ({ label, views: values.views?.[index] || 0, reads: values.reads?.[index] || 0 }));
  }
  if (values?.totals) return Object.entries(values.totals).map(([metric, value]) => ({ metric, value, previous: values.previous?.[metric], change: values.changes?.[metric] }));
  return [];
}

export async function analyticsExport({ client, options }) {
  if (!options.output) throw new Error('Analytics export requires --output <file>.');
  const format = options.format || 'json';
  if (!['json', 'csv'].includes(format)) throw new Error('Analytics export format must be json or csv.');
  const payload = await client.query(normalizedOptions(options));
  let content;
  if (format === 'json') {
    content = `${JSON.stringify(payload, null, 2)}\n`;
  } else {
    const rows = rowsFromPayload(payload);
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    content = `${columns.map(csvCell).join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
  }
  await writeFile(options.output, content, { encoding: 'utf8', flag: 'wx' });
  return { output: options.output, format, rows: rowsFromPayload(payload).length };
}
