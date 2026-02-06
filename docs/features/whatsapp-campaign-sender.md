# WhatsApp Campaign Sender

Send WhatsApp template messages to segmented customer lists via the Meta Business API, with full campaign lifecycle management, real-time send progress, and Shopify timeline integration.

## How It Works

1. Admin enters Meta credentials (Phone Number ID, WABA ID, Access Token) in Settings
2. Credentials are stored encrypted (AES-256-GCM) in the Neon `settings` table
3. On the Campaigns page (WhatsApp tab), admin creates a campaign and selects a template
4. Admin adds customers using a filterable selector (by lapse, tags, date range, order count)
5. Admin reviews and confirms the send via a 3-step modal (preview → confirm → send)
6. Messages are sent sequentially via `/api/campaigns-wa/[id]/send-one`, with real-time per-customer status updates in the UI
7. A Shopify customer note is appended for each successful send (if Shopify is configured)

A separate **Manual WhatsApp** tab retains the original CSV upload flow for one-off sends.

## Pages

| Route | Purpose |
|---|---|
| `/settings` | Enter and save Meta/WhatsApp credentials |
| `/campaigns` | Campaign builder (WhatsApp tab), manual CSV sender (Manual WhatsApp tab) |

## Database Schema

### `campaigns_wa` — Campaign Records

| Column | Type | Details |
|---|---|---|
| `id` | serial | Primary key |
| `name` | text | Campaign display name |
| `templateName` | text | WhatsApp template identifier |
| `customerCount` | integer | Total customers assigned |
| `successCount` | integer | Messages sent successfully |
| `errorCount` | integer | Failed sends |
| `status` | text | `draft`, `sending`, or `completed` |
| `createdAt` | timestamp | Auto-set on creation |
| `sentAt` | timestamp | Set when sending completes |

### `campaigns_wa_customers` — Junction Table

Links campaigns to customers with per-recipient send tracking. Phone and firstName are denormalized (snapshotted at assignment time) so historical records remain accurate even if customer data changes.

| Column | Type | Details |
|---|---|---|
| `id` | serial | Primary key |
| `campaignId` | integer | FK → campaigns_wa.id (cascade delete) |
| `customerId` | integer | FK → customers.id (cascade delete) |
| `phone` | text | Denormalized from customer |
| `firstName` | text | Denormalized from customer |
| `status` | text | `pending`, `sent`, or `failed` |
| `errorMessage` | text | Error detail (if failed) |
| `sentAt` | timestamp | Timestamp of send attempt |

### `campaign_messages` — Audit Log

Records every individual message send for audit/history, linking campaign, customer, template, phone, status, and error messages.

## Campaign Lifecycle

```
Draft → (Add Customers) → Draft → (Send) → Sending → Completed
  |                                                       |
  ↓ (Delete)                                        (Read-only)
Deleted
```

- **Draft:** Campaign can be edited, customers can be added/replaced, campaign can be deleted
- **Sending:** Messages are being sent sequentially; UI shows real-time progress
- **Completed:** Campaign is locked; results are viewable but not editable

Per-customer status within a campaign:

```
pending → sent    (successful WhatsApp API response)
        → failed  (error — stored in errorMessage)
```

## API Routes

### Campaign CRUD

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/campaigns-wa` | List all campaigns with computed counts | Clerk |
| `POST` | `/api/campaigns-wa` | Create campaign (status: draft) | Clerk |
| `PUT` | `/api/campaigns-wa` | Update campaign name/template | Clerk |
| `DELETE` | `/api/campaigns-wa?id={id}` | Delete campaign + cascade junction records | Clerk |
| `GET` | `/api/campaigns-wa/[id]` | Single campaign with all customer details | Clerk |

### Customer Assignment

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/campaigns-wa/[id]/customers` | Append customers to campaign | Clerk |
| `PUT` | `/api/campaigns-wa/[id]/customers` | Replace all customers for campaign | Clerk |

### Sending

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/campaigns-wa/[id]/send` | Server-side batch send (all customers sequentially) | Clerk |
| `POST` | `/api/campaigns-wa/[id]/send-one` | Send to single customer (used by UI send loop) | Clerk |
| `PATCH` | `/api/campaigns-wa/[id]/status` | Update campaign status | Clerk |

### Templates & Manual Send

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/whatsapp/templates` | Fetch approved templates from Facebook Graph API | Clerk |
| `POST` | `/api/whatsapp/send` | Send single manual message (CSV upload flow) | Clerk |

### Supporting

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/customers` | Fetch customers with pagination and computed fields | Clerk |
| `GET` | `/api/settings` | Load saved settings (token masked) | Clerk |
| `POST` | `/api/settings` | Save settings (encrypted to DB) | Clerk |

## Template Fetching

Templates are pulled from the Facebook Graph API:

```
GET https://graph.facebook.com/v22.0/{WABA_ID}/message_templates?fields=name,status,language,components&limit=100
```

Only `APPROVED` templates are shown. The response includes:
- Template name
- Header text (if present)
- Body text with `{{parameter}}` placeholders
- Parameter names extracted from the body

A WhatsApp-style preview bubble is shown when a template is selected, using a custom background image (`public/whatsapp-bg.png`).

## Message Sending

Each message is sent via the WhatsApp Cloud API:

```
POST https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages
```

**Payload format:**
```json
{
  "messaging_product": "whatsapp",
  "to": "447123456789",
  "type": "template",
  "template": {
    "name": "order_delay",
    "language": { "code": "en" },
    "components": [{
      "type": "body",
      "parameters": [{
        "type": "text",
        "parameter_name": "first_name",
        "text": "Lee"
      }]
    }]
  }
}
```

**Important:** The `parameter_name` field is required by the WhatsApp API — omitting it causes a `(#100) Invalid parameter` error.

### Sending Flows

**Campaign Send (UI modal — primary flow):**
1. User clicks "Send" on a draft campaign with customers assigned
2. 3-step modal: Preview → Confirm (shows all recipients) → Sending
3. UI calls `POST /api/campaigns-wa/[id]/send-one` sequentially for each customer
4. Each customer row shows real-time status: pending → sending → sent/failed
5. User can cancel mid-send (sets abort flag)
6. Campaign status updated to `completed` after all sends finish

**Batch Send (API — alternative):**
1. Single call to `POST /api/campaigns-wa/[id]/send`
2. Server processes all customers sequentially
3. Returns aggregate results: `{ total, sent, failed }`
4. Campaign status set to `completed` with `sentAt` timestamp

**Manual CSV Send (separate tab):**
1. User selects template and uploads CSV
2. CSV must include `phone` column + any template parameter columns
3. Preview table shows first 10 rows
4. Sends sequentially via `POST /api/whatsapp/send`
5. Real-time per-row status with stop button

## Customer Selection

The campaign customer modal provides advanced filtering:

| Filter | Options |
|---|---|
| Date range | Customer `createdAt` range |
| Lapse | Days since last order: New, Due Reorder, Lapsed, Lost |
| Tags | Multi-select from customer tags |
| Orders count | Min/max range |
| Search | By name or email |
| Show selected only | Toggle to review current selection |

**Sorting options:** Total spent, orders count, last order date, lapse, customer since

**Computed customer fields:**
- `lapse` — days since `lastOrderAt` (null if no orders)
- `lastWhatsappAt` — most recent successful WhatsApp send (from junction table)

## Phone Number Formatting

The API routes automatically format UK phone numbers:

| Input | Output |
|---|---|
| `07495291692` | `447495291692` |
| `+447495291692` | `447495291692` |
| `447495291692` | `447495291692` |
| `7495291692` | `447495291692` |

Strips spaces, dashes, and parentheses before formatting.

## Shopify Integration

After each successful WhatsApp send, a note is appended to the customer's Shopify timeline:

```
[15 Jan 2024 10:30] WhatsApp campaign "Spring Sale" sent (template: spring_template)
---
```

- Prepended to any existing customer note
- Uses en-GB date locale
- Non-blocking — Shopify errors do not fail the WhatsApp send
- Only runs if Shopify settings are configured and customer has a `shopifyCustomerId`

## CSV Format (Manual Tab)

The CSV must include a `phone` column and any parameter columns required by the selected template.

**Example for `order_delay` template (param: first_name):**
```csv
phone,first_name
07495291692,Lee
07712345678,Sarah
```

**Example for `delivery_day` template (params: first_name, delivery_day):**
```csv
phone,first_name,delivery_day
07495291692,Lee,Wednesday
07712345678,Sarah,Thursday
```

If the CSV is missing a required column, a warning is shown and the Send button is disabled.

## Settings (Encrypted Storage)

Meta credentials are stored in the `settings` table as a single encrypted JSON blob under the key `meta`.

**Fields:**
| Field | Description | Example |
|---|---|---|
| Phone Number ID | Meta's ID for your WhatsApp number | `998388253356786` |
| WABA ID | WhatsApp Business Account ID | `754146657303542` |
| Access Token | Meta System User token | `EAAeSCE94i...` |

**Encryption:** AES-256-GCM with a random 12-byte IV per write. The encryption key is stored in the `CONFIG_ENCRYPTION_KEY` environment variable (32-byte hex string).

The access token is masked in the API response (first 10 + last 4 characters shown). If a masked value is submitted back, the existing token is preserved.

## Environment Variables

```
CONFIG_ENCRYPTION_KEY=<64-char hex string>
DATABASE_URL=<Neon connection string>
```

No WhatsApp-specific env vars needed — credentials are stored in the database via the Settings page.

**Generate an encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Key Files

| File | Purpose |
|---|---|
| `src/app/campaigns/page.tsx` | Campaign builder UI — WhatsApp tab, Manual tab, customer modal, send modal |
| `src/app/settings/page.tsx` | Settings page UI (client component) |
| `src/app/api/campaigns-wa/route.ts` | Campaign CRUD (list, create, update, delete) |
| `src/app/api/campaigns-wa/[id]/route.ts` | Single campaign detail with customers |
| `src/app/api/campaigns-wa/[id]/customers/route.ts` | Add/replace customers for a campaign |
| `src/app/api/campaigns-wa/[id]/send/route.ts` | Batch send (server-side sequential) |
| `src/app/api/campaigns-wa/[id]/send-one/route.ts` | Single message send (used by UI loop) |
| `src/app/api/campaigns-wa/[id]/status/route.ts` | Update campaign status |
| `src/app/api/whatsapp/send/route.ts` | Manual single message send (CSV flow) |
| `src/app/api/whatsapp/templates/route.ts` | Fetch approved templates from Facebook |
| `src/app/api/customers/route.ts` | Customer list with pagination + computed fields |
| `src/app/api/settings/route.ts` | GET/POST settings (encrypted) |
| `src/lib/settings.ts` | Settings read/write helpers (Drizzle + encryption) |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt utilities |
| `src/lib/db/schema.ts` | Drizzle schema (campaigns_wa, campaigns_wa_customers, campaign_messages) |
| `public/whatsapp-bg.png` | WhatsApp chat background for template preview |

## Future Enhancements

- **Delivery status webhooks:** Track message delivery/read status from WhatsApp
- **Role-based access:** Restrict campaign features to `super_admin` and `admin` roles
- **Server-side queue:** Replace browser-side sequential sending with a background job queue for larger campaigns
- **Retry failed sends:** UI button to retry all failed recipients in a campaign
