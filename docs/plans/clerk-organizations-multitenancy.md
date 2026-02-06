# Plan: Clerk Organizations Multi-Tenancy

## Context

Before pushing to production, we need organization-based multi-tenancy so you can associate your account with a company and invite admin/user members. Currently all 11 data tables are single-tenant with no `organizationId` scoping. We'll use Clerk Organizations (built into your existing Clerk plan) for org management, invitations, and roles.

## Manual Step: Clerk Dashboard (you do this before/during implementation)

1. Go to Clerk Dashboard → **Organizations** → Enable
2. Configure: disallow user-created orgs, set default role to `org:member`
3. Add webhook events: `organization.created/updated/deleted`, `organizationMembership.created/updated/deleted`
4. **Create your first org** (e.g. "Better Tomorrow") — note down the org ID (`org_xxx`)
5. Add yourself as admin/owner

## Step 1: Schema changes (`src/lib/db/schema.ts`)

**New table:**
- `organizations` — id (text PK, Clerk org ID), name, slug, createdAt, updatedAt

**Add `organizationId` (text, NOT NULL, FK → organizations) to all data tables:**
- `customers`, `orders`, `campaignsFcb`, `campaignsWa`, `campaignsWaCustomers`, `campaignMessages`, `syncLogs`, `posthogAnalytics`, `facebookAds`
- `settings` — change PK from `key` to composite `(organizationId, key)`

**Add to `users`:**
- `organizationId` (text, nullable, FK → organizations)
- `orgRole` (text, nullable) — mirrors Clerk org role for local lookups

**Update unique constraints to be per-org:**
- `customers.email` → `(organizationId, email)`
- `orders.shopifyId` → `(organizationId, shopifyId)`
- `posthogAnalytics.date` → `(organizationId, date)`
- `facebookAds` unique index → include `organizationId`

## Step 2: Migration

Generate with `pnpm db:generate`, then manually edit the SQL to:
1. Create `organizations` table
2. Insert your default org row
3. Add `organizationId` columns as **nullable**
4. Backfill all existing rows with default org ID
5. Set columns to NOT NULL
6. Drop old unique constraints, create new composite ones
7. Refactor settings PK

## Step 3: Auth helper (`src/lib/auth.ts` — new file)

Create `requireAuth()` returning `{ userId, orgId }` from Clerk's `auth()`. Returns 401 if no user, 403 if no org selected. Every authenticated API route uses this.

## Step 4: Refactor settings (`src/lib/settings.ts`)

Add `orgId` as first param to all functions:
- `getSetting(orgId, key)`, `setSetting(orgId, key, value)`
- `getMetaSettings(orgId)`, `saveMetaSettings(orgId, ...)`, etc.

Update `onConflictDoUpdate` target to `[settings.organizationId, settings.key]`.

## Step 5: Update all authenticated API routes (~20 routes)

Replace `auth()` with `requireAuth()`, add org filtering to queries, include `organizationId` in inserts.

**Routes:** `/api/users/me`, `/api/settings`, `/api/settings/lifecycle`, `/api/customers` (also fix missing auth!), `/api/orders`, `/api/campaigns`, `/api/campaigns-wa` + all sub-routes, `/api/whatsapp/send`, `/api/whatsapp/templates`, `/api/shopify/products`, `/api/shopify/discounts`

## Step 6: Cron/backfill/webhook routes

- **Cron routes**: Use `DEFAULT_ORG_ID` env var for now (single org). Full multi-org iteration later.
- **Backfill routes**: Accept `orgId` query param.
- **Shopify webhook**: Look up org by `X-Shopify-Shop-Domain` header against settings table.
- **Clerk webhook**: Extend to handle org create/update/delete and membership events.
- `src/lib/shopify-orders.ts` — accept `orgId` param.

## Step 7: Users page (`src/app/users/page.tsx` — new file)

Use Clerk's `<OrganizationProfile />` component for member list, invitations, and role management.

## Step 8: Sidebar update (`src/components/Sidebar.tsx`)

Add `<OrganizationSwitcher hidePersonal />` below the "Better Reports" title. Hidden when collapsed.

## Files to modify/create

| File | Action |
|---|---|
| `src/lib/db/schema.ts` | Add organizations table + organizationId everywhere |
| `src/lib/auth.ts` | **Create** — requireAuth() helper |
| `src/lib/settings.ts` | Add orgId param to all functions |
| `src/lib/shopify-orders.ts` | Accept orgId param |
| `src/app/api/webhooks/clerk/route.ts` | Handle org events |
| `src/app/api/settings/route.ts` | Org-scoped |
| `src/app/api/settings/lifecycle/route.ts` | Org-scoped |
| `src/app/api/customers/route.ts` | Org-scoped + fix auth |
| `src/app/api/orders/route.ts` | Org-scoped |
| `src/app/api/campaigns/route.ts` | Org-scoped |
| `src/app/api/campaigns-wa/route.ts` + sub-routes | Org-scoped |
| `src/app/api/whatsapp/send/route.ts` | Org-scoped |
| `src/app/api/whatsapp/templates/route.ts` | Org-scoped |
| `src/app/api/shopify/products/route.ts` | Org-scoped |
| `src/app/api/shopify/discounts/route.ts` | Org-scoped |
| `src/app/api/users/me/route.ts` | Org-scoped |
| `src/app/api/cron/*` (4 files) | Use DEFAULT_ORG_ID |
| `src/app/api/backfill/*` (5+ files) | Accept orgId param |
| `src/app/api/webhooks/shopify/orders/route.ts` | Multi-org lookup |
| `src/app/users/page.tsx` | **Create** — OrganizationProfile |
| `src/components/Sidebar.tsx` | Add OrganizationSwitcher |
| Migration SQL | **Create** — manually edited |

## Verification

1. Migration on dev: verify `SELECT COUNT(*) FROM customers WHERE organization_id IS NULL` = 0 for all tables
2. `pnpm dev` — org switcher visible, all pages load with org-scoped data
3. `/users` page — invite a test user, verify they appear
4. Settings save/load scoped to org
5. Campaigns CRUD works with org filter
6. `pnpm build` — clean
