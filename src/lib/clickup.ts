/**
 * ClickUp API Helper
 *
 * Fetches features/tasks from ClickUp and manages status synchronization
 *
 * Environment Variables Required:
 * - CLICKUP_API_TOKEN: Access token from ClickUp OAuth flow
 * - CLICKUP_WORKSPACE_ID: ClickUp workspace ID
 * - CLICKUP_LIST_ID: ClickUp list ID containing features (optional, can fetch from space)
 * - CLICKUP_SPACE_ID: ClickUp space ID (optional, alternative to list)
 */

interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status: {
    status: string;
    color?: string;
    type?: string;
  };
  priority?: {
    priority: string;
    color?: string;
  };
  date_created: string;
  date_updated: string;
  due_date?: string;
  tags?: Array<{
    name: string;
    tag_fg?: string;
    tag_bg?: string;
  }>;
  custom_fields?: Array<{
    id: string;
    name: string;
    type: string;
    value?: any;
  }>;
  url: string;
}

interface ClickUpTasksResponse {
  tasks: ClickUpTask[];
}

interface Feature {
  id: string;
  name: string;
  description: string;
  status: string;
  priority?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  url: string;
  customFields?: Record<string, any>;
}

/**
 * Fetch all tasks from a ClickUp list
 */
export async function fetchClickUpTasks(listId?: string): Promise<Feature[]> {
  const clickupToken = process.env.CLICKUP_API_TOKEN;
  const defaultListId = process.env.CLICKUP_LIST_ID;

  const targetListId = listId || defaultListId;

  if (!clickupToken) {
    throw new Error("CLICKUP_API_TOKEN not configured");
  }

  if (!targetListId) {
    throw new Error("CLICKUP_LIST_ID not configured and no listId provided");
  }

  console.log(`Fetching tasks from ClickUp list: ${targetListId}`);

  try {
    const response = await fetch(
      `https://api.clickup.com/api/v2/list/${targetListId}/task`,
      {
        method: "GET",
        headers: {
          Authorization: clickupToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      const errorMsg = `ClickUp API error: ${response.status} ${response.statusText} - ${errorText}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const data = (await response.json()) as ClickUpTasksResponse;

    console.log(`Successfully fetched ${data.tasks.length} tasks from ClickUp`);

    // Transform ClickUp tasks into our Feature format
    const features: Feature[] = data.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description || "",
      status: task.status.status,
      priority: task.priority?.priority,
      tags: task.tags?.map((tag) => tag.name) || [],
      createdAt: task.date_created,
      updatedAt: task.date_updated,
      dueDate: task.due_date,
      url: task.url,
      customFields: task.custom_fields?.reduce((acc, field) => {
        acc[field.name] = field.value;
        return acc;
      }, {} as Record<string, any>),
    }));

    return features;
  } catch (error) {
    console.error("Failed to fetch ClickUp tasks:", error);
    throw error;
  }
}

/**
 * Fetch all lists in a workspace
 */
export async function fetchClickUpWorkspaceLists(
  workspaceId?: string
): Promise<Array<{ id: string; name: string }>> {
  const clickupToken = process.env.CLICKUP_API_TOKEN;
  const defaultWorkspaceId = process.env.CLICKUP_WORKSPACE_ID;

  const targetWorkspaceId = workspaceId || defaultWorkspaceId;

  if (!clickupToken) {
    throw new Error("CLICKUP_API_TOKEN not configured");
  }

  if (!targetWorkspaceId) {
    throw new Error("CLICKUP_WORKSPACE_ID not configured and no workspaceId provided");
  }

  try {
    // First get all spaces in the workspace
    const spacesResponse = await fetch(
      `https://api.clickup.com/api/v2/team/${targetWorkspaceId}/space`,
      {
        method: "GET",
        headers: {
          Authorization: clickupToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!spacesResponse.ok) {
      const errorText = await spacesResponse.text();
      throw new Error(`Failed to fetch spaces: ${errorText}`);
    }

    const spacesData = await spacesResponse.json();
    const lists: Array<{ id: string; name: string }> = [];

    // Get lists from each space
    for (const space of spacesData.spaces || []) {
      const foldersResponse = await fetch(
        `https://api.clickup.com/api/v2/space/${space.id}/folder`,
        {
          method: "GET",
          headers: {
            Authorization: clickupToken,
            "Content-Type": "application/json",
          },
        }
      );

      if (foldersResponse.ok) {
        const foldersData = await foldersResponse.json();
        for (const folder of foldersData.folders || []) {
          for (const list of folder.lists || []) {
            lists.push({ id: list.id, name: `${space.name} > ${folder.name} > ${list.name}` });
          }
        }
      }

      // Also get folderless lists
      const listsResponse = await fetch(
        `https://api.clickup.com/api/v2/space/${space.id}/list`,
        {
          method: "GET",
          headers: {
            Authorization: clickupToken,
            "Content-Type": "application/json",
          },
        }
      );

      if (listsResponse.ok) {
        const listsData = await listsResponse.json();
        for (const list of listsData.lists || []) {
          lists.push({ id: list.id, name: `${space.name} > ${list.name}` });
        }
      }
    }

    return lists;
  } catch (error) {
    console.error("Failed to fetch ClickUp workspace lists:", error);
    throw error;
  }
}

/**
 * Update a task status in ClickUp
 */
export async function updateClickUpTaskStatus(
  taskId: string,
  status: string
): Promise<void> {
  const clickupToken = process.env.CLICKUP_API_TOKEN;

  if (!clickupToken) {
    throw new Error("CLICKUP_API_TOKEN not configured");
  }

  try {
    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        method: "PUT",
        headers: {
          Authorization: clickupToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update task status: ${errorText}`);
    }

    console.log(`Successfully updated task ${taskId} to status: ${status}`);
  } catch (error) {
    console.error("Failed to update ClickUp task status:", error);
    throw error;
  }
}
