import {
  captureSceneRequestSchema,
  storyDeleteRequestSchema,
  storyMutationRequestSchema,
  storyResponseSchema,
  type PrimaryStory,
} from "@/stories/story-model";

async function parseResponse(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "The story request failed.");
  }
  return storyResponseSchema.parse(body);
}

export class StoryRepository {
  constructor(private readonly canvasId: string) {}

  async load(signal?: AbortSignal): Promise<PrimaryStory | null> {
    const response = await fetch(`/api/canvases/${this.canvasId}/stories`, {
      cache: "no-store",
      signal,
    });
    return (await parseResponse(response)).story;
  }

  async capture(
    input: Parameters<typeof captureSceneRequestSchema.parse>[0],
  ): Promise<PrimaryStory> {
    const response = await fetch(`/api/canvases/${this.canvasId}/stories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(captureSceneRequestSchema.parse(input)),
    });
    const story = (await parseResponse(response)).story;
    if (!story) throw new Error("The saved story was not returned.");
    return story;
  }

  async mutate(
    input: Parameters<typeof storyMutationRequestSchema.parse>[0],
  ): Promise<PrimaryStory> {
    const response = await fetch(`/api/canvases/${this.canvasId}/stories`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(storyMutationRequestSchema.parse(input)),
    });
    const story = (await parseResponse(response)).story;
    if (!story) throw new Error("The updated story was not returned.");
    return story;
  }

  async delete(
    input: Parameters<typeof storyDeleteRequestSchema.parse>[0],
  ): Promise<PrimaryStory> {
    const response = await fetch(`/api/canvases/${this.canvasId}/stories`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(storyDeleteRequestSchema.parse(input)),
    });
    const story = (await parseResponse(response)).story;
    if (!story) throw new Error("The updated story was not returned.");
    return story;
  }
}
