import { google } from 'googleapis';
import { DailyAnalytics } from './posthog';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

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

// Generic helper to find row by date in column A
async function findRowByDate(
  sheetName: string,
  date: string
): Promise<number | null> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:A`,
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

// ============ Sessions Tab (legacy Shopify) ============

export async function upsertSessionsRow(data: {
  date: string;
  visitors: number;
  sessions: number;
}) {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  const sheetName = 'Sessions';
  const sheets = getSheets();
  const existingRow = await findRowByDate(sheetName, data.date);

  if (existingRow) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A${existingRow}:C${existingRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[data.date, data.visitors, data.sessions]],
      },
    });
    return { action: 'updated', row: existingRow };
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:C`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[data.date, data.visitors, data.sessions]],
      },
    });
    return { action: 'appended' };
  }
}

// ============ Daily Analytics Tab (PostHog) ============

const DAILY_ANALYTICS_SHEET = 'PostHog';
const DAILY_ANALYTICS_HEADERS = [
  'date',
  'unique_visitors',
  'total_sessions',
  'pageviews',
  'bounce_rate',
  'avg_session_duration',
  'mobile_sessions',
  'desktop_sessions',
  'top_country',
  'direct_sessions',
  'organic_sessions',
  'paid_sessions',
  'social_sessions',
  'product_views',
  'add_to_cart',
  'checkout_started',
  'purchases',
  'conversion_rate',
];

export async function ensureDailyAnalyticsSheet(): Promise<void> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  const sheets = getSheets();

  // Check if sheet exists (case-insensitive)
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const sheetExists = spreadsheet.data.sheets?.some(
    (s) => s.properties?.title?.toLowerCase() === DAILY_ANALYTICS_SHEET.toLowerCase()
  );

  if (!sheetExists) {
    try {
      // Create the sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: DAILY_ANALYTICS_SHEET,
                },
              },
            },
          ],
        },
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'${DAILY_ANALYTICS_SHEET}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [DAILY_ANALYTICS_HEADERS],
        },
      });
    } catch (error) {
      // Sheet might already exist, ignore the error
      console.log('Sheet creation skipped (may already exist)');
    }
  }
}

export async function appendDailyAnalytics(
  data: DailyAnalytics
): Promise<{ action: string }> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  await ensureDailyAnalyticsSheet();

  const sheets = getSheets();

  // Check if row for this date already exists
  const existingRow = await findRowByDate(DAILY_ANALYTICS_SHEET, data.date);

  const rowData = [
    data.date,
    data.unique_visitors,
    data.total_sessions,
    data.pageviews,
    data.bounce_rate,
    data.avg_session_duration,
    data.mobile_sessions,
    data.desktop_sessions,
    data.top_country,
    data.direct_sessions,
    data.organic_sessions,
    data.paid_sessions,
    data.social_sessions,
    data.product_views,
    data.add_to_cart,
    data.checkout_started,
    data.purchases,
    data.conversion_rate,
  ];

  if (existingRow) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `'${DAILY_ANALYTICS_SHEET}'!A${existingRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData],
      },
    });
    return { action: 'updated' };
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${DAILY_ANALYTICS_SHEET}'!A:R`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData],
      },
    });
    return { action: 'appended' };
  }
}
