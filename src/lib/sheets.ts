import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Sessions';

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Missing Google service account credentials');
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

export async function findRowByDate(date: string): Promise<number | null> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:A`,
  });

  const rows = response.data.values;
  if (!rows) return null;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === date) {
      return i + 1; // Sheets are 1-indexed
    }
  }

  return null;
}

export async function updateRow(
  rowNumber: number,
  data: { date: string; visitors: number; sessions: number }
) {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A${rowNumber}:C${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[data.date, data.visitors, data.sessions]],
    },
  });
}

export async function appendRow(data: {
  date: string;
  visitors: number;
  sessions: number;
}) {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:C`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[data.date, data.visitors, data.sessions]],
    },
  });
}

export async function upsertSessionsRow(data: {
  date: string;
  visitors: number;
  sessions: number;
}) {
  const existingRow = await findRowByDate(data.date);

  if (existingRow) {
    await updateRow(existingRow, data);
    return { action: 'updated', row: existingRow };
  } else {
    await appendRow(data);
    return { action: 'appended' };
  }
}
