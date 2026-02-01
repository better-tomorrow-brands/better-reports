import { google } from 'googleapis';
import { DailyAnalytics } from './posthog';
import { FacebookAdRow } from './facebook';

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

// ============ Facebook Tab ============

const FACEBOOK_SHEET = 'Facebook';

export async function ensureFacebookSheet(): Promise<void> {
  // Sheet already exists with user's headers - nothing to do
}

// Find all rows for a given date and delete them
async function deleteRowsForDate(sheetName: string, date: string): Promise<number> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  const sheets = getSheets();

  // Get column B (Day) to find rows with this date
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!B:B`,
  });

  const rows = response.data.values;
  if (!rows) return 0;

  // Find row indices to delete (in reverse order to avoid index shifting)
  const rowsToDelete: number[] = [];
  for (let i = rows.length - 1; i >= 1; i--) { // Skip header row
    if (rows[i][0] === date) {
      rowsToDelete.push(i);
    }
  }

  if (rowsToDelete.length === 0) return 0;

  // Get sheet ID for batch update
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const sheet = spreadsheet.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );

  if (!sheet?.properties?.sheetId) return 0;

  // Delete rows in reverse order
  const requests = rowsToDelete.map((rowIndex) => ({
    deleteDimension: {
      range: {
        sheetId: sheet.properties!.sheetId,
        dimension: 'ROWS',
        startIndex: rowIndex,
        endIndex: rowIndex + 1,
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests },
  });

  return rowsToDelete.length;
}

export async function syncFacebookAds(
  date: string,
  rows: FacebookAdRow[]
): Promise<{ action: string; rowsDeleted: number; rowsAdded: number }> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  await ensureFacebookSheet();

  const sheets = getSheets();

  // Delete existing rows for this date
  const rowsDeleted = await deleteRowsForDate(FACEBOOK_SHEET, date);

  if (rows.length === 0) {
    return { action: 'cleared', rowsDeleted, rowsAdded: 0 };
  }

  // Prepare all rows matching user's column order:
  // Campaign name, Day, Ad Group, Ad, Delivery status, Delivery level, Reach, Impressions,
  // Frequency, Attribution setting, Result Type, Results, Amount spent (GBP), Cost per result,
  // Starts, Ends, Link clicks, CPC, CPM, CTR, Result value type, Results ROAS, Website purchase ROAS,
  // Reporting starts, Reporting ends
  const rowsData = rows.map((row) => [
    row.campaign,                                                    // Campaign name
    row.date,                                                        // Day
    row.adset,                                                       // Ad Group
    row.ad,                                                          // Ad
    '',                                                              // Delivery status (not available)
    'ad',                                                            // Delivery level
    row.reach,                                                       // Reach
    row.impressions,                                                 // Impressions
    row.frequency,                                                   // Frequency
    '',                                                              // Attribution setting (not available)
    row.purchases > 0 ? 'Website purchases' : '',                    // Result Type
    row.purchases || '',                                             // Results
    row.spend,                                                       // Amount spent (GBP)
    row.cost_per_purchase || '',                                     // Cost per result
    '',                                                              // Starts (not available)
    '',                                                              // Ends (not available)
    row.clicks,                                                      // Link clicks
    row.cpc,                                                         // CPC
    row.cpm,                                                         // CPM
    row.ctr,                                                         // CTR
    row.purchase_value > 0 ? 'Website purchases conversion value' : '', // Result value type
    row.roas || '',                                                  // Results ROAS
    row.roas || '',                                                  // Website purchase ROAS
    row.date,                                                        // Reporting starts
    row.date,                                                        // Reporting ends
  ]);

  // Append all rows
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${FACEBOOK_SHEET}'!A:Y`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rowsData,
    },
  });

  return { action: 'synced', rowsDeleted, rowsAdded: rows.length };
}

// Append-only version for backfill (doesn't delete existing rows)
export async function appendFacebookAds(
  rows: FacebookAdRow[]
): Promise<{ action: string; rowsAdded: number }> {
  if (!SHEET_ID) throw new Error('GOOGLE_SHEET_ID not set');

  if (rows.length === 0) {
    return { action: 'skipped', rowsAdded: 0 };
  }

  const sheets = getSheets();

  const rowsData = rows.map((row) => [
    row.campaign,
    row.date,
    row.adset,
    row.ad,
    '',
    'ad',
    row.reach,
    row.impressions,
    row.frequency,
    '',
    row.purchases > 0 ? 'Website purchases' : '',
    row.purchases || '',
    row.spend,
    row.cost_per_purchase || '',
    '',
    '',
    row.clicks,
    row.cpc,
    row.cpm,
    row.ctr,
    row.purchase_value > 0 ? 'Website purchases conversion value' : '',
    row.roas || '',
    row.roas || '',
    row.date,
    row.date,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${FACEBOOK_SHEET}'!A:Y`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rowsData,
    },
  });

  return { action: 'appended', rowsAdded: rows.length };
}
