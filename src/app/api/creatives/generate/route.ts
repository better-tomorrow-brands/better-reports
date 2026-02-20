import { NextResponse } from "next/server";
import { requireOrgFromRequest, OrgAuthError } from "@/lib/org-auth";
import { db } from "@/lib/db";
import { products, creatives } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { uploadToSpaces, generateImageKey } from "@/lib/storage";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

/**
 * POST /api/creatives/generate
 * Generate AI creatives using Google's Gemini Image (Nano Banana)
 * Images are permanently stored in DigitalOcean Spaces
 *
 * Setup:
 * 1. Google AI:
 *    - Sign up at https://aistudio.google.com/
 *    - Get API key from https://aistudio.google.com/apikey
 *    - Add to .env.local: GOOGLE_AI_API_KEY=your-key-here
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

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_AI_API_KEY not configured. Please add it to your environment variables." },
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

    // Process uploaded images - convert to base64 for Gemini
    const contextImageParts: any[] = [];
    for (let i = 0; i < numContextImages; i++) {
      const file = formData.get(`contextImage${i}`) as File | null;
      if (file) {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = buffer.toString("base64");
        const mimeType = file.type || "image/jpeg";

        contextImageParts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64,
          },
        });
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

    // Initialize Google Generative AI
    const genAI = new GoogleGenerativeAI(apiKey);

    // Generate creatives using Google Gemini Image (Nano Banana)
    const generatedCreatives = [];

    for (let i = 0; i < numVariations; i++) {
      try {
        // Build contents array - images first, then text (following the docs pattern)
        const contents: any[] = [];

        // If we have context images, add them first
        if (contextImageParts.length > 0) {
          contents.push(...contextImageParts);
        }

        // Add the text prompt last
        contents.push({ text: prompt });

        // Get the model
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash-image",
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, // Strictest for adult content
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
          ],
        });

        // Generate image using Gemini 2.5 Flash Image (Nano Banana)
        const result = await model.generateContent(contents);
        const response = result.response;

        // Extract image from response (following docs pattern)
        let imageData: string | null = null;
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageData = part.inlineData.data;
            break;
          }
        }

        if (!imageData) {
          throw new Error("No image data in Gemini response");
        }

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(imageData, "base64");

        // Upload to DigitalOcean Spaces for permanent storage
        const imageKey = generateImageKey(orgId, "creatives");
        const permanentImageUrl = await uploadToSpaces(imageBuffer, imageKey, "image/png");

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
      } catch (varError: any) {
        console.error(`Failed to generate variation ${i + 1}:`, varError);
        // Continue with other variations even if one fails
        throw new Error(`Variation ${i + 1} failed: ${varError.message}`);
      }
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
