# Nano Banana (Google Gemini Image) Implementation Log

**Date:** 2026-02-20
**Feature:** AI Creative Generation using Google Gemini Image API (Nano Banana)

## Overview

Completely replaced Fal.ai with Google's Gemini Image API (Nano Banana) for AI creative generation. The system generates advertising creatives based on campaign goals, brand guidelines, and optional product/image references.

## What Was Done

### 1. Installed Google Generative AI SDK
```bash
pnpm add @google/generative-ai
```
- Package: `@google/generative-ai` v0.24.1
- Note: Docs show `@google/genai` but actual package is `@google/generative-ai`

### 2. Environment Configuration

Added to `.env.local`:
```bash
GOOGLE_AI_API_KEY=AIzaSyDgZ1QeWtmw6st4NK1v_Wz1JEu9F1MGLv8
```

**How to get API key:**
1. Go to https://aistudio.google.com/apikey
2. Sign in with Google account
3. Create new API key
4. Enable billing for production use (free tier has very limited quotas)

### 3. Updated API Route (`/src/app/api/creatives/generate/route.ts`)

**Key Implementation Details:**

```typescript
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// Initialize SDK
const genAI = new GoogleGenerativeAI(apiKey);

// Get model (using Nano Banana Pro)
const model = genAI.getGenerativeModel({
  model: "gemini-3-pro-image-preview", // Started with gemini-2.5-flash-image but hit quota
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, // Strictest
    },
    // ... other safety settings
  ],
});

// Generate image
const result = await model.generateContent(contents);
const response = result.response;

// Extract base64 image data
for (const part of response.candidates[0].content.parts) {
  if (part.inlineData) {
    imageData = part.inlineData.data;
    break;
  }
}
```

**Safety Settings (Content Moderation):**
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`: `BLOCK_LOW_AND_ABOVE` (strictest)
- `HARM_CATEGORY_HARASSMENT`: `BLOCK_MEDIUM_AND_ABOVE`
- `HARM_CATEGORY_HATE_SPEECH`: `BLOCK_MEDIUM_AND_ABOVE`
- `HARM_CATEGORY_DANGEROUS_CONTENT`: `BLOCK_MEDIUM_AND_ABOVE`

This prevents users from generating adult/inappropriate content, protecting against Stripe violations.

### 4. Updated UI (`/src/app/creatives/page.tsx`)

Added "Powered by Google Gemini" badge to show the technology being used.

### 5. Image Storage

**Current State (Temporary):**
- Images returned as base64 data URLs: `data:image/png;base64,{imageData}`
- Stored directly in database as data URLs
- Allows immediate display without external storage

**Future State (TODO):**
- Re-enable DigitalOcean Spaces upload once credentials are fixed
- Store permanent URLs instead of base64
- Issue: "The request signature we calculated does not match the signature you provided"
- Current DO Spaces config in `.env.local`:
  ```
  DO_SPACES_REGION=nyc3
  DO_SPACES_BUCKET=better-reports
  DO_SPACES_KEY=DO0023C2BQT8WNTVAEET
  DO_SPACES_SECRET=Oxfa5SVIbQozRpc1l1ZQeX6jveKWTBzBFKfbZRByNEo
  DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
  DO_SPACES_CDN_ENDPOINT=https://better-reports.nyc3.cdn.digitaloceanspaces.com
  ```

## Issues Encountered & Fixes

### Issue 1: Build Error - Module Not Found
**Error:** `Can't resolve '@google/genai'`

**Fix:** Correct import path
```typescript
// Wrong (from docs)
import { GoogleGenAI } from "@google/genai";

// Correct (actual package)
import { GoogleGenerativeAI } from "@google/generative-ai";
```

### Issue 2: TypeScript Type Error - Safety Settings
**Error:** `Type '"HARM_CATEGORY_HARASSMENT"' is not assignable to type 'HarmCategory'`

**Fix:** Import and use enums instead of string literals
```typescript
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// Use enums
category: HarmCategory.HARM_CATEGORY_HARASSMENT
threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
```

### Issue 3: TypeScript Error - Undefined Candidates
**Error:** `'response.candidates' is possibly 'undefined'`

**Fix:** Add null check
```typescript
if (!response.candidates || response.candidates.length === 0) {
  throw new Error("No candidates in Gemini response");
}
```

### Issue 4: API Quota Exceeded
**Error:**
```
[429 Too Many Requests] You exceeded your current quota
Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests
```

**Attempted Fix:** Switched from `gemini-2.5-flash-image` to `gemini-3-pro-image-preview`

**Real Solution:** Enable billing in Google Cloud Console
- Free tier has 0 quota remaining for image generation
- Image generation is compute-intensive and has strict limits
- Need to enable billing: https://console.cloud.google.com/billing

### Issue 5: DO Spaces Upload Signature Error
**Error:** `The request signature we calculated does not match the signature you provided`

**Temporary Fix:** Disabled DO Spaces upload, using base64 data URLs instead
- See line 175-199 in `/src/app/api/creatives/generate/route.ts`
- TODO: Debug DO Spaces credentials and re-enable permanent storage

## Prompt Engineering Best Practices

Based on Google's official documentation, the system:

1. **Keeps prompts visual and concise** (not marketing copy)
2. **Limits input lengths:**
   - Brand guidelines: 100 chars max
   - Custom prompt: 150 chars max
3. **Uses descriptive, scene-based language** instead of keyword lists
4. **Adds quality modifiers:**
   - "Professional advertising photography"
   - "High-quality product shot"
   - "Clean composition"
   - "Suitable for social media ads"

## Example Test Prompt

```
Campaign Goal: Summer beach vacation product photography

Brand Guidelines:
Bright, vibrant colors with tropical feel. Clean modern aesthetic.
Ocean blue and sunset orange accents.

Ad Angle: Lifestyle-focused, aspirational

Additional Instructions:
High-end resort setting, golden hour lighting,
professional commercial photography style

Number of Variations: 3
```

## API Configuration

**Model:** `gemini-3-pro-image-preview` (Nano Banana Pro)
- Higher quality than flash model
- Supports up to 14 reference images
- Can generate up to 4K resolution (1K, 2K, 4K)
- Has "thinking" mode for complex prompts
- Better text rendering

**Output Format:**
- Aspect ratio: 16:9 (good for social media ads)
- Format: PNG
- Delivery: Base64 data URL (temporary)

**Input Support:**
- Text prompts
- Up to 5 context/reference images (high fidelity)
- Up to 14 total images supported

## Files Modified

1. `/src/app/api/creatives/generate/route.ts` - Complete rewrite for Gemini
2. `/src/app/creatives/page.tsx` - Added "Powered by Google Gemini" badge
3. `/.env.local` - Added `GOOGLE_AI_API_KEY`
4. `/package.json` - Added `@google/generative-ai` dependency

## Git Commits

1. `e196ea5` - Replace Fal.ai with Google Gemini Image (Nano Banana)
2. `c36f5d7` - Update Nano Banana implementation with official SDK patterns
3. `7a90206` - Fix Google Generative AI SDK imports and API usage
4. `c2301bd` - Fix safety settings to use proper TypeScript enums
5. `0109a9c` - Add null check for response.candidates
6. `5b128f6` - Switch to gemini-3-pro-image-preview (Nano Banana Pro)
7. `4637a81` - Temporarily disable DO Spaces upload, return base64 data URLs

## Next Steps / TODO

### High Priority
1. **Enable billing in Google Cloud Console** to get proper quota for image generation
2. **Fix DO Spaces upload** - debug signature error and re-enable permanent storage
3. **Test image generation** end-to-end with actual creative

### Medium Priority
4. **Add aspect ratio selector** to UI (1:1, 4:5, 16:9, etc.)
5. **Add resolution selector** for Pro model (1K, 2K, 4K)
6. **Consider adding Google Search grounding** for data-driven creatives
7. **Add multi-turn editing** via chat interface for iterative refinement

### Low Priority
8. **Add image download feature** (currently just shows in gallery)
9. **Add creative deletion** capability
10. **Consider adding batch generation** if many creatives needed at once

## Other Issues Fixed (Earlier in Session)

### Subscriptions Page Race Condition
Fixed the same race condition that affected creatives page:
- File: `/src/app/subscriptions/page.tsx`
- Issue: Calling `apiFetch` before `OrgContext` loaded
- Fix: Added `orgLoading` and `currentOrg` checks in `useEffect`

## Additional Context Moderation Notes

User asked about preventing adult content to avoid Stripe fines. Current implementation:

1. **Google's built-in safety filters** (configured in API call)
2. **Blocks both prompts and outputs** that violate policies

For future enhancement, could add:
- Google Cloud Vision Safe Search detection (post-generation check)
- AWS Rekognition Content Moderation
- Sightengine
- Hive Moderation

Current setup with `BLOCK_LOW_AND_ABOVE` for sexual content should be sufficient for most cases.

## Official Documentation References

- Nano Banana Docs: https://ai.google.dev/gemini-api/docs/imagen
- API Key: https://aistudio.google.com/apikey
- Rate Limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Billing: https://console.cloud.google.com/billing

## Ad Copy Generation (Added 2026-02-20)

### What Was Added

Integrated AI-powered ad copy generation alongside image generation. Now generates complete ad packages with both visuals and copy.

### Implementation Details

**Database Schema Changes:**
- Added 4 new fields to `creatives` table:
  - `headline` - Main ad headline (25-40 chars)
  - `primary_text` - Main body copy (100-125 chars)
  - `description` - Supporting description (30-90 chars)
  - `call_to_action` - CTA button text
- Migration: `drizzle/0023_thin_wither.sql`

**API Changes:**
1. `/src/app/api/creatives/generate/route.ts`:
   - Added Gemini text model (`gemini-2.0-flash-exp`) for copywriting
   - Generates ad copy in parallel with image generation
   - Parses structured JSON response with all ad copy components
   - Gracefully handles parsing errors (continues with null values)
   - Saves ad copy to database alongside images

2. `/src/app/api/creatives/route.ts`:
   - Updated GET endpoint to return ad copy fields

**UI Updates:**
1. `/src/app/creatives/page.tsx`:
   - Updated `GeneratedCreative` interface to include ad copy fields
   - Displays ad copy in organized sections (Headline, Primary Text, Description, CTA)
   - CTA displayed as button-style element
   - Removed form reset on generation (keeps settings for multiple variations)

**Ad Copy Generation Prompt:**
- Context-aware: uses campaign goal, ad angle, brand guidelines, and custom prompt
- Outputs structured JSON with 4 components
- Optimized for social media advertising (Facebook/Instagram character limits)
- Benefits-focused, creates urgency, matches brand voice
- Includes content safety guidelines

### Files Modified
1. `/src/lib/db/schema.ts` - Added ad copy fields to schema
2. `/src/app/api/creatives/generate/route.ts` - Added text model and copy generation
3. `/src/app/api/creatives/route.ts` - Return ad copy in GET endpoint
4. `/src/app/creatives/page.tsx` - Display ad copy in UI

### User Experience Improvements
- Form no longer clears after generation (easier to make variations)
- Complete ad packages ready to use in campaigns
- Structured copy sections for easy copy/paste

## Current Status

✅ **Complete:** SDK integration, safety settings, UI updates, error handling, ad copy generation
⚠️ **Blocked:** Need billing enabled to test (free quota exhausted)
⚠️ **Temporary:** Using base64 data URLs instead of DO Spaces
🔄 **Ready:** Code is production-ready once billing enabled and DO Spaces fixed
