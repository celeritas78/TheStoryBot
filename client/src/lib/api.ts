const API_BASE = "/api";

export async function generateStory(formData) {
  const response = await fetch(`${API_BASE}/stories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formData),
  });

  if (!response.ok) {
    throw new Error("Failed to generate story");
  }

  return response.json();
}

export async function continueStory(storyId) {
  const response = await fetch(`${API_BASE}/stories/${storyId}/continue`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to continue story");
  }

  return response.json();
}
