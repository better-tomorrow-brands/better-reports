import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { products, creatives } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { downloadAndUploadImage, generateImageKey } from "@/lib/storage";

/**
 * POST /api/creatives/generate
 * Generate AI creatives using Fal.ai Freepik FLUX (Nano Banana)
 * Images are permanently stored in DigitalOcean Spaces
 *
 * Setup:
 * 1. Fal.ai:
 *    - Sign up at https://fal.ai
 *    - Get API key from https://fal.ai/dashboard/keys
 *    - Add to .env.local: FAL_API_KEY=your-key-here
 *
 * 2. DigitalOcean Spaces:
 *    - Create Space at https://cloud.digitalocean.com/spaces
 *    - Generate keys at https://cloud.digitalocean.com/account/api/spaces
 *    - Add to .env.local:
 *      DO_SPACES_REGION=nyc3 (your region)
 *      DO_SPACES_BUCKET=your-bucket-name
 *      DO_SPACES_KEY=your-access-key
 *      DO_SPACES_SECRET=your-secret-key
 *      DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
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

    // Build the AI prompt - keep it visual and concise for best results
    let prompt = `${campaignGoal}`;

    // Add product context if selected
    if (productId) {
      const productRows = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (productRows.length) {
        prompt += ` featuring ${productRows[0].productName || productRows[0].sku}`;
      }
    }

    // Extract only visual/style keywords from brand guidelines (first 100 chars max)
    if (brandGuidelines?.trim()) {
      const visualKeywords = brandGuidelines.slice(0, 100).toLowerCase();
      prompt += `, style: ${visualKeywords}`;
    }

    // Add ad angle as creative direction
    if (adAngle?.trim()) {
      prompt += `, ${adAngle.toLowerCase()} approach`;
    }

    // Add custom instructions (limit to 150 chars for focus)
    if (customPrompt?.trim()) {
      prompt += `, ${customPrompt.slice(0, 150)}`;
    }

    // Add quality modifiers
    prompt += ". Professional advertising photography, high-quality product shot, clean composition, suitable for social media ads";

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
      const falImageUrl = falData.images?.[0]?.url;

      if (!falImageUrl) {
        throw new Error("No image URL returned from Fal.ai");
      }

      // Download from Fal.ai and upload to DigitalOcean Spaces for permanent storage
      const imageKey = generateImageKey(orgId, "creatives");
      const permanentImageUrl = await downloadAndUploadImage(falImageUrl, imageKey);

      // Save to database with permanent URL
      const [creative] = await db
        .insert(creatives)
        .values({
          orgId,
          userId,
          prompt,
          imageUrl: permanentImageUrl, // Store permanent DO Spaces URL
          campaignGoal,
          adAngle: adAngle || null,
          productId: productId || null,
          brandGuidelines: brandGuidelines || null,
        })
        .returning();

      generatedCreatives.push({
        id: creative.id.toString(),
        imageUrl: permanentImageUrl, // Return permanent URL
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
