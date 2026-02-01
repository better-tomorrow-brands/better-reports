const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const API_VERSION = '2024-10';

interface ShopifyResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

// Test what fields are available
export async function testShopifyAccess(): Promise<Record<string, unknown>> {
  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Missing Shopify configuration');
  }

  // Simple introspection query to see available fields
  const query = `
    query {
      shop {
        name
        plan {
          displayName
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

  const result: ShopifyResponse = await response.json();
  return result;
}

export async function getSessionsData(date: string): Promise<{
  visitors: number;
  sessions: number;
}> {
  if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Missing Shopify configuration');
  }

  // Try REST API for analytics
  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/reports.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
    }
  );

  if (!response.ok) {
    // If reports API not available, return error with details
    const text = await response.text();
    throw new Error(`Shopify Reports API: ${response.status} - ${text.slice(0, 200)}`);
  }

  const data = await response.json();

  // Log available reports for debugging
  console.log('Available Shopify reports:', JSON.stringify(data, null, 2));

  // For now, return zeros - we need to see what's available
  return { sessions: 0, visitors: 0 };
}

export function getTodayDateLondon(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/London',
  });
}
