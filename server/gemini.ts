import { GoogleGenAI, Modality } from "@google/genai";

export interface GeneratedPost {
  title: string;
  description: string;
  content: string;
  tags: string[];
  heroImage?: string;
  heroImageAlt?: string;
}

export interface GeneratedImage {
  imageData: string; // base64 encoded image
  mimeType: string;
}

export async function generateBlogPost(
  apiKey: string,
  topic: string,
  keywords: string[] = [],
  tone: "professional" | "casual" | "technical" | "creative" = "professional",
  length: "short" | "medium" | "long" = "medium",
  language: string = "english"
): Promise<GeneratedPost> {
  const ai = new GoogleGenAI({ apiKey });

  const wordCount = length === "short" ? "300-500" : length === "medium" ? "800-1200" : "1500-2000";
  
  const keywordStr = keywords.length > 0 ? `Focus on these keywords: ${keywords.join(", ")}.` : "";
  
  const toneGuide = {
    professional: "Use a professional and authoritative tone suitable for business readers. Include data, statistics, and expert insights where relevant.",
    casual: "Use a friendly and conversational tone that's easy to read. Add personal touches and relatable examples.",
    technical: "Use a technical and detailed tone with code examples, diagrams descriptions, and step-by-step instructions where relevant.",
    creative: "Use a creative and engaging storytelling approach with vivid descriptions and unique perspectives.",
  };

  const languageInstruction = language !== "english" 
    ? `IMPORTANT: Write the entire blog post in ${language} language. All content including title, description, and body must be in ${language}.`
    : "";

  const prompt = `You are an expert blog content writer. Write a comprehensive, high-quality blog post about: ${topic}
${languageInstruction}

${keywordStr}
${toneGuide[tone]}
Target word count: ${wordCount} words.

IMPORTANT GUIDELINES:
1. Create an engaging, SEO-optimized title that captures attention
2. Write a compelling meta description (max 160 characters)
3. Structure the content with clear sections using Markdown headings (##, ###)
4. Include a strong introduction that hooks the reader
5. Add practical examples, tips, or actionable advice
6. Use bullet points and numbered lists for easy scanning
7. Include relevant internal linking suggestions (use placeholder format: [link text](/related-post-slug))
8. Add a conclusion with a call-to-action
9. Suggest a hero image that would complement the article
10. For technical topics, include code blocks with proper syntax highlighting

CONTENT STRUCTURE:
- Hook/Introduction (engaging opening)
- Main content sections (3-5 well-developed sections)
- Practical tips or key takeaways
- Conclusion with CTA

Return the response in JSON format with these fields:
- title: An engaging SEO-friendly title (50-60 characters ideal)
- description: A compelling meta description (max 160 characters)
- content: The full blog post in Markdown format with:
  * Proper headings (##, ###)
  * Bullet points and numbered lists
  * Code blocks where relevant (use \`\`\`language syntax)
  * Bold and italic text for emphasis
  * Block quotes for important callouts
- tags: An array of 4-6 relevant tags (lowercase, hyphenated)
- heroImage: A suggested image description for the hero image (e.g., "A developer working on a laptop with code on screen")
- heroImageAlt: Alt text for the hero image for accessibility

Make sure the content is:
- Well-researched and accurate
- Engaging and valuable to readers
- Properly formatted for web reading
- Free of fluff and filler content`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
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
          heroImage: { type: "string" },
          heroImageAlt: { type: "string" },
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

export async function generateImage(
  apiKey: string,
  prompt: string
): Promise<GeneratedImage> {
  const ai = new GoogleGenAI({ apiKey });

  const enhancedPrompt = `Create a high-quality, professional blog hero image: ${prompt}. 
Style: Modern, clean, visually appealing, suitable for a professional blog. 
Aspect ratio: 16:9 landscape format.
No text or watermarks in the image.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts: [{ text: enhancedPrompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find((part: any) => part.inlineData);
  
  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response. The model may not support image generation.");
  }

  return {
    imageData: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}
