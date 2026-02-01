const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const API_VERSION = '2024-10';

interface ShopifyQLResponse {
  data?: {
    shopifyqlQuery?: {
      __typename?: string;
      tableData?: {
        columns?: Array<{ name: string; dataType: string }>;
        rowData?: string[][];
      };
      parseErrors?: Array<{ message: string }>;
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

  // ShopifyQL query for sessions data
  const shopifyqlQuery = `
    FROM sessions
    SINCE ${date}
    UNTIL ${date}
    SHOW total_sessions, total_visitors
  `.trim();

  const query = `
    query {
      shopifyqlQuery(query: "${shopifyqlQuery.replace(/\n/g, ' ').replace(/"/g, '\\"')}") {
        __typename
        ... on TableResponse {
          tableData {
            columns {
              name
              dataType
            }
            rowData
          }
        }
        ... on PolarisVizResponse {
          data {
            key
            data {
              key
              value
            }
          }
        }
        parseErrors {
          message
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`,
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
    const text = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${text}`);
  }

  const result: ShopifyQLResponse = await response.json();

  if (result.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${result.errors[0].message}`);
  }

  if (result.data?.shopifyqlQuery?.parseErrors?.length) {
    throw new Error(
      `ShopifyQL parse error: ${result.data.shopifyqlQuery.parseErrors[0].message}`
    );
  }

  const tableData = result.data?.shopifyqlQuery?.tableData;
  const rowData = tableData?.rowData?.[0];

  if (!rowData || rowData.length < 2) {
    return { sessions: 0, visitors: 0 };
  }

  // Find column indices
  const columns = tableData?.columns || [];
  const sessionsIdx = columns.findIndex((c) =>
    c.name.toLowerCase().includes('sessions')
  );
  const visitorsIdx = columns.findIndex((c) =>
    c.name.toLowerCase().includes('visitors')
  );

  return {
    sessions: parseInt(rowData[sessionsIdx] || '0', 10) || 0,
    visitors: parseInt(rowData[visitorsIdx] || '0', 10) || 0,
  };
}

export function getTodayDateLondon(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/London',
  });
}
