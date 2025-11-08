import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SHEET_ID = process.env.SHEET_ID;
const CREDS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const RANGE_PENDING = process.env.SHEET_RANGE_PENDING || 'ServiceSlips!A1:ZZ';
const RANGE_COMPLETED = process.env.SHEET_RANGE_COMPLETED || 'Completed!A1:ZZ';

if (!SHEET_ID) {
  console.error('Missing SHEET_ID environment variable.');
  process.exit(1);
}
if (!CREDS) {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS environment variable.');
  process.exit(1);
}

function mapRows(values = []) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const [header, ...rows] = values;
  return rows
    .filter((row) => row.some((cell) => cell && String(cell).trim().length > 0))
    .map((row) => {
      const record = {};
      header.forEach((key, index) => {
        if (!key) return;
        record[String(key).trim()] = row[index] ?? '';
      });
      return record;
    });
}

async function fetchSheet(range) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    keyFile: CREDS
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return response.data.values || [];
}

async function main() {
  console.log('Fetching pending range:', RANGE_PENDING);
  const pendingValues = await fetchSheet(RANGE_PENDING);
  console.log('Fetching completed range:', RANGE_COMPLETED);
  const completedValues = await fetchSheet(RANGE_COMPLETED);

  const payload = {
    pending: mapRows(pendingValues),
    completed: mapRows(completedValues),
    fetchedAt: new Date().toISOString()
  };

  const outputPath = path.join(projectRoot, 'src', 'data', 'serviceSlips.sample.json');
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  console.log('Wrote sample data to', outputPath);
}

main().catch((error) => {
  console.error('Failed to fetch Google Sheet data:', error.message);
  process.exit(1);
});
