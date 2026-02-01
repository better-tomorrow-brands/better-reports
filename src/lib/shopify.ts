const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

interface ShopifyAnalyticsResponse {
  data?: {
    shopifyqlQuery?: {
      tableData?: {
        rowData?: Array<{
          rowData?: string[];
        }>;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

export async function getSessionsData(date: string): Promise<{
  visitors: number;
  sessions: number;
}> {
  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Missing Shopify configuration');
  }

  // Use ShopifyQL to query analytics data
  const query = `
    {
      shopifyqlQuery(query: """
        FROM sessions
        WHERE session_date = '${date}'
        GROUP BY ALL
        SHOW total_sessions, total_visitors
      """) {
        tableData {
          rowData {
            rowData
          }
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const result: ShopifyAnalyticsResponse = await response.json();

  if (result.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${result.errors[0].message}`);
  }

  const rowData = result.data?.shopifyqlQuery?.tableData?.rowData?.[0]?.rowData;

  if (!rowData || rowData.length < 2) {
    // No data for this date yet, return zeros
    return { sessions: 0, visitors: 0 };
  }

  return {
    sessions: parseInt(rowData[0], 10) || 0,
    visitors: parseInt(rowData[1], 10) || 0,
  };
}

export function getTodayDateLondon(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/London',
  });
}
