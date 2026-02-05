import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkUserEvent {
  data: {
    id: string;
    email_addresses: ClerkEmailAddress[];
    first_name: string | null;
    last_name: string | null;
  };
  type: string;
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await request.text();

  const wh = new Webhook(secret);
  let event: ClerkUserEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserEvent;
  } catch {
    console.error("Webhook verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { type, data } = event;
  const email = data.email_addresses?.[0]?.email_address;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

  if (type === "user.created" || type === "user.updated") {
    await db
      .insert(users)
      .values({
        id: data.id,
        email: email || "",
        name,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: email || "", name },
      });
    console.log(`User upserted: ${data.id} (${email})`);
  }

  if (type === "user.deleted") {
    await db.delete(users).where(eq(users.id, data.id));
    console.log(`User deleted: ${data.id}`);
  }

  return NextResponse.json({ success: true });
}
