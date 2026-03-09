import { NextRequest, NextResponse } from "next/server";
import { fetchClickUpTasks, fetchClickUpWorkspaceLists } from "@/lib/clickup";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * GET /api/clickup/features
 *
 * Fetches features/tasks from ClickUp
 *
 * Query params:
 * - listId: Optional ClickUp list ID to fetch from (uses env default if not provided)
 * - action: Optional action ("lists" to fetch available lists)
 */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const listId = searchParams.get("listId");

    // If action is "lists", return available lists
    if (action === "lists") {
      const workspaceId = searchParams.get("workspaceId");
      const lists = await fetchClickUpWorkspaceLists(workspaceId || undefined);
      return NextResponse.json({ lists });
    }

    // Otherwise, fetch tasks from the specified or default list
    const features = await fetchClickUpTasks(listId || undefined);

    return NextResponse.json({
      success: true,
      count: features.length,
      features,
    });
  } catch (error) {
    console.error("Error fetching ClickUp features:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
