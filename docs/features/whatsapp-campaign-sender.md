# WhatsApp Campaign Sender

Send WhatsApp template messages in bulk via the Meta Business API, with CSV upload and live status tracking.

## How It Works

1. Admin enters Meta credentials (Phone Number ID, WABA ID, Access Token) in Settings
2. Credentials are stored encrypted (AES-256-GCM) in the Neon `settings` table
3. On the WhatsApp page, approved templates are fetched live from the Facebook Graph API
4. Admin selects a template, uploads a CSV with contact data, and hits Send
5. Messages are sent sequentially (one at a time) via `/api/whatsapp/send`
6. Each row shows real-time status: Pending → Sending → Sent / Failed

## Pages

| Route | Purpose |
|---|---|
| `/settings` | Enter and save Meta/WhatsApp credentials |
| `/campaign-sender` | Template selection, CSV upload, send, and results |

## API Routes

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/settings` | Load saved settings (token masked) | Clerk |
| `POST` | `/api/settings` | Save settings (encrypted to DB) | Clerk |
| `GET` | `/api/whatsapp/templates` | Fetch approved templates from Facebook | Clerk |
| `POST` | `/api/whatsapp/send` | Send a single WhatsApp message | Clerk |

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

## Phone Number Formatting

The API route automatically formats UK phone numbers:

| Input | Output |
|---|---|
| `07495291692` | `447495291692` |
| `+447495291692` | `447495291692` |
| `447495291692` | `447495291692` |
| `7495291692` | `447495291692` |

Strips spaces, dashes, and parentheses before formatting.

## CSV Format

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
| `src/app/campaign-sender/page.tsx` | Campaign sender UI (client component) |
| `src/app/settings/page.tsx` | Settings page UI (client component) |
| `src/app/api/whatsapp/send/route.ts` | Send single message to WhatsApp API |
| `src/app/api/whatsapp/templates/route.ts` | Fetch approved templates from Facebook |
| `src/app/api/settings/route.ts` | GET/POST settings (encrypted) |
| `src/lib/settings.ts` | Settings read/write helpers (Drizzle + encryption) |
| `src/lib/crypto.ts` | AES-256-GCM encrypt/decrypt utilities |
| `src/lib/db/schema.ts` | Drizzle schema (settings table) |
| `public/whatsapp-bg.png` | WhatsApp chat background for template preview |

## Future Enhancements

- **Campaign audit logging:** Write to `campaigns` and `campaign_messages` tables (schema exists, not yet wired)
- **Role-based access:** Restrict WhatsApp page to `super_admin` and `admin` roles
- **Batch sending:** Server-side queue for larger campaigns
- **Delivery status webhooks:** Track message delivery/read status from WhatsApp
