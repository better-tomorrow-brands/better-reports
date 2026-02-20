import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { products, creatives } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/creatives/generate
 * Generate AI creatives using Fal.ai
 *
 * Setup:
 * 1. Sign up at https://fal.ai
 * 2. Get API key from https://fal.ai/dashboard/keys
 * 3. Add to .env.local: FAL_API_KEY=your-key-here
 */
export async function POST(request: Request) {
  try {
    const { userId, orgId } = await requireOrgFromRequest(request);

    const apiKey = process.env.FAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "FAL_API_KEY not configured. Please add it to your environment variables." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      productId,
      brandGuidelines,
      campaignGoal,
      adAngle,
      customPrompt,
      numVariations = 1,
    } = body;

    if (!campaignGoal?.trim()) {
      return NextResponse.json({ error: "Campaign goal is required" }, { status: 400 });
    }

    // Build the AI prompt
    let prompt = `Professional advertising creative for: ${campaignGoal}.`;

    // Add product context if selected
    if (productId) {
      const productRows = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (productRows.length) {
        prompt += ` Featuring product: ${productRows[0].productName || productRows[0].sku}.`;
      }
    }

    // Add brand guidelines if provided
    if (brandGuidelines?.trim()) {
      prompt += ` Brand guidelines: ${brandGuidelines.slice(0, 500)}.`;
    }

    // Add ad angle
    if (adAngle?.trim()) {
      prompt += ` Ad angle: ${adAngle}.`;
    }

    // Add custom instructions
    if (customPrompt?.trim()) {
      prompt += ` ${customPrompt}`;
    }

    prompt += " High-quality, professional, eye-catching, suitable for social media advertising.";

    // Generate creatives using Fal.ai
    const generatedCreatives = [];

    for (let i = 0; i < numVariations; i++) {
      // Call Fal.ai API
      const falResponse = await fetch("https://fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: {
          "Authorization": `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image_size: "landscape_16_9", // Good for ads
          num_inference_steps: 4,
          enable_safety_checker: true,
        }),
      });

      if (!falResponse.ok) {
        const errorText = await falResponse.text();
        console.error("Fal.ai API error:", errorText);
        throw new Error(`Fal.ai API failed: ${falResponse.status}`);
      }

      const falData = await falResponse.json();
      const imageUrl = falData.images?.[0]?.url;

      if (!imageUrl) {
        throw new Error("No image URL returned from Fal.ai");
      }

      // Save to database
      const [creative] = await db
        .insert(creatives)
        .values({
          orgId,
          userId,
          prompt,
          imageUrl,
          campaignGoal,
          adAngle: adAngle || null,
          productId: productId || null,
          brandGuidelines: brandGuidelines || null,
        })
        .returning();

      generatedCreatives.push({
        id: creative.id.toString(),
        imageUrl: creative.imageUrl,
        prompt: creative.prompt,
        createdAt: creative.createdAt?.toISOString() || new Date().toISOString(),
      });
    }

    return NextResponse.json({ creatives: generatedCreatives });
  } catch (error) {
    if (error instanceof OrgAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("creatives/generate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate creatives" },
      { status: 500 }
    );
  }
}
