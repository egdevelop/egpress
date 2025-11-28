import { GoogleGenAI } from "@google/genai";

export async function generateBlogPost(
  apiKey: string,
  topic: string,
  keywords: string[] = [],
  tone: "professional" | "casual" | "technical" | "creative" = "professional",
  length: "short" | "medium" | "long" = "medium"
): Promise<{ title: string; description: string; content: string; tags: string[] }> {
  const ai = new GoogleGenAI({ apiKey });

  const wordCount = length === "short" ? "300-500" : length === "medium" ? "800-1200" : "1500-2000";
  
  const keywordStr = keywords.length > 0 ? `Focus on these keywords: ${keywords.join(", ")}.` : "";
  
  const toneGuide = {
    professional: "Use a professional and authoritative tone suitable for business readers.",
    casual: "Use a friendly and conversational tone that's easy to read.",
    technical: "Use a technical and detailed tone with code examples where relevant.",
    creative: "Use a creative and engaging storytelling approach.",
  };

  const prompt = `Write a blog post about: ${topic}

${keywordStr}
${toneGuide[tone]}
Target word count: ${wordCount} words.

Return the response in JSON format with these fields:
- title: An engaging SEO-friendly title
- description: A 1-2 sentence meta description (max 160 characters)
- content: The full blog post in Markdown format with proper headings (##, ###), paragraphs, bullet points, and code blocks where appropriate
- tags: An array of 3-5 relevant tags

Make sure the content is well-structured, informative, and engaging.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "description", "content", "tags"],
      },
    },
  });

  const rawJson = response.text;
  if (!rawJson) {
    throw new Error("Empty response from Gemini");
  }

  return JSON.parse(rawJson);
}
