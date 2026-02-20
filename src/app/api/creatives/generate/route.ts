import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { products, creatives } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/creatives/generate
 * Generate AI creatives using Fal.ai Freepik FLUX (Nano Banana)
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

    const formData = await request.formData();
    const productId = formData.get("productId") ? Number(formData.get("productId")) : null;
    const brandGuidelines = formData.get("brandGuidelines") as string | null;
    const campaignGoal = formData.get("campaignGoal") as string;
    const adAngle = formData.get("adAngle") as string | null;
    const customPrompt = formData.get("customPrompt") as string | null;
    const numVariations = Number(formData.get("numVariations") || "1");
    const numContextImages = Number(formData.get("numContextImages") || "0");

    // Process uploaded images
    const contextImageUrls: string[] = [];
    for (let i = 0; i < numContextImages; i++) {
      const file = formData.get(`contextImage${i}`) as File | null;
      if (file) {
        // Convert to base64 for Fal.ai
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString("base64");
        const mimeType = file.type || "image/jpeg";
        contextImageUrls.push(`data:${mimeType};base64,${base64}`);
      }
    }

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
      // Call Fal.ai Freepik FLUX API (Nano Banana)
      const requestBody: any = {
        prompt,
        image_size: "landscape_16_9", // Good for ads
        num_inference_steps: 4,
        enable_safety_checker: true,
      };

      // If we have context images, use img2img mode
      if (contextImageUrls.length > 0) {
        requestBody.image_url = contextImageUrls[0]; // Primary reference image
        requestBody.strength = 0.75; // How much to transform (0-1, higher = more creative freedom)
      }

      const falResponse = await fetch("https://fal.run/fal-ai/flux-realism", {
        method: "POST",
        headers: {
          "Authorization": `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
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
