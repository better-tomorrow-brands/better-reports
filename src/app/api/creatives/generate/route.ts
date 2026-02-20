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
    const targetCta = formData.get("targetCta") as string | null;
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

    // Build the AI prompt - detailed scene description for best results with Gemini Image
    let prompt = `Create a professional advertising image for social media. `;

    // Start with the main concept
    prompt += `Scene: ${campaignGoal}. `;

    // Add product context if selected
    if (productId) {
      const productRows = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (productRows.length) {
        const productName = productRows[0].productName || productRows[0].sku;
        prompt += `Feature the product "${productName}" prominently in the composition. `;
      }
    }

    // Add brand visual style from guidelines
    if (brandGuidelines?.trim()) {
      const visualKeywords = brandGuidelines.slice(0, 200);
      prompt += `Visual style and branding: ${visualKeywords}. `;
    }

    // Add ad angle as creative direction
    if (adAngle?.trim()) {
      prompt += `Creative approach: ${adAngle}. `;
    }

    // Add custom instructions
    if (customPrompt?.trim()) {
      prompt += `Additional requirements: ${customPrompt.slice(0, 250)}. `;
    }

    // Add comprehensive quality and technical specifications
    prompt += `Technical requirements: Professional advertising photography quality, sharp focus, proper lighting (golden hour or studio lighting as appropriate), clean and uncluttered composition, vibrant and engaging colors, high resolution, eye-catching visual hierarchy. The image should be optimized for social media feeds (Instagram, Facebook) with strong visual impact when viewed on mobile devices. Ensure the composition leaves space for text overlay if needed. Style: modern, polished, premium advertising aesthetic.`;

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

        // Get the image model (using Nano Banana Pro for higher quality and potentially better quota)
        const imageModel = genAI.getGenerativeModel({
          model: "gemini-3-pro-image-preview",
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
        const imageResult = await imageModel.generateContent(contents);
        const imageResponse = imageResult.response;

        // Extract image from response (following docs pattern)
        if (!imageResponse.candidates || imageResponse.candidates.length === 0) {
          throw new Error("No candidates in Gemini image response");
        }

        let imageData: string | null = null;
        for (const part of imageResponse.candidates[0].content.parts) {
          if (part.inlineData) {
            imageData = part.inlineData.data;
            break;
          }
        }

        if (!imageData) {
          throw new Error("No image data in Gemini response");
        }

        // Generate ad copy using Gemini text model
        const textModel = genAI.getGenerativeModel({
          model: "gemini-1.5-pro",
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
              threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
          ],
        });

        // Build ad copy prompt
        let adCopyPrompt = `You are an expert advertising copywriter. Generate compelling ad copy for a social media advertisement with the following details:

Campaign Goal: ${campaignGoal}`;

        if (targetCta) {
          adCopyPrompt += `\nTarget Action/CTA: ${targetCta}`;
        }

        if (adAngle) {
          adCopyPrompt += `\nAd Angle: ${adAngle}`;
        }

        if (brandGuidelines) {
          adCopyPrompt += `\nBrand Guidelines: ${brandGuidelines}`;
        }

        if (customPrompt) {
          adCopyPrompt += `\nAdditional Context: ${customPrompt}`;
        }

        adCopyPrompt += `\n\nGenerate the following ad copy components in JSON format:
{
  "headline": "A punchy, attention-grabbing headline (25-40 characters)",
  "primaryText": "The main ad copy that tells the story and creates desire (100-125 characters for optimal Facebook/Instagram performance)",
  "description": "A supporting description that adds context or details (30-90 characters)",
  "callToAction": "A clear call-to-action button text${targetCta ? ` based on the target action: "${targetCta}"` : ' (e.g., "Shop Now", "Learn More", "Sign Up", "Get Started")'}"
}

Guidelines:
- Keep it concise and impactful
- Focus on benefits, not features
- Create urgency or emotional connection
- Match the brand voice and guidelines
- The CTA should align with the target action specified above
- Make it suitable for social media advertising
- Ensure it complies with advertising standards (no misleading claims, adult content, etc.)

Return ONLY the JSON object, no other text.`;

        const adCopyResult = await textModel.generateContent(adCopyPrompt);
        const adCopyResponse = adCopyResult.response;

        // Parse the ad copy JSON response
        let adCopy = {
          headline: null,
          primaryText: null,
          description: null,
          callToAction: null,
        };

        try {
          const adCopyText = adCopyResponse.text();
          // Remove markdown code blocks if present
          const cleanedText = adCopyText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleanedText);
          adCopy = {
            headline: parsed.headline || null,
            primaryText: parsed.primaryText || null,
            description: parsed.description || null,
            callToAction: parsed.callToAction || null,
          };
        } catch (parseError) {
          console.error("Failed to parse ad copy JSON:", parseError);
          // Continue with null values rather than failing the entire generation
        }

        // Convert base64 to buffer
        const imageBuffer = Buffer.from(imageData, "base64");

        // TODO: Re-enable DO Spaces upload after fixing credentials
        // For now, return the base64 data URL directly so we can see the generated image
        const dataUrl = `data:image/png;base64,${imageData}`;

        // Save to database with data URL (temporary) and ad copy
        const [creative] = await db
          .insert(creatives)
          .values({
            orgId,
            userId,
            prompt,
            imageUrl: dataUrl, // Store base64 data URL temporarily
            campaignGoal,
            adAngle: adAngle || null,
            productId: productId || null,
            brandGuidelines: brandGuidelines || null,
            headline: adCopy.headline,
            primaryText: adCopy.primaryText,
            description: adCopy.description,
            callToAction: adCopy.callToAction,
          })
          .returning();

        generatedCreatives.push({
          id: creative.id.toString(),
          imageUrl: dataUrl, // Return data URL so image displays immediately
          prompt: creative.prompt,
          headline: creative.headline,
          primaryText: creative.primaryText,
          description: creative.description,
          callToAction: creative.callToAction,
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
