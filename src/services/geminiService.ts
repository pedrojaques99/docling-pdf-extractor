import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ExtractedImage {
  name: string;
  description: string;
  transcription: string;
  boundingBox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in 0-1000 scale
}

export type ExtractionMode = 'all' | 'markdown' | 'images' | 'transcription';

export interface PageExtraction {
  markdown: string;
  images: ExtractedImage[];
}

export async function extractPageToMarkdown(
  imageBase64: string,
  pageNumber: number,
  mode: ExtractionMode = 'all'
): Promise<PageExtraction> {
  const model = "gemini-3-flash-preview";
  
  let prompt = "";
  if (mode === 'all') {
    prompt = `Analyze this PDF page image and convert it to high-fidelity Markdown.
    Rules:
    1. Maintain the layout structure (headers, lists, tables).
    2. If you see an image, figure, or chart:
       - Insert a placeholder: ![Extracted Image: {brief_description}](image_p${pageNumber}_{index}.png)
       - Provide a detailed transcription or description of that image immediately after the placeholder.
    3. If there's a table, convert it to a Markdown table.
    4. Identify the bounding boxes of any images/figures you find.
    Return the result in JSON format.`;
  } else if (mode === 'markdown') {
    prompt = `Analyze this PDF page image and convert it to high-fidelity Markdown.
    Rules:
    1. Maintain the layout structure (headers, lists, tables).
    2. DO NOT include image placeholders or image descriptions. Focus only on text and tables.
    3. If there's a table, convert it to a Markdown table.
    Return the result in JSON format with an empty images array.`;
  } else if (mode === 'images') {
    prompt = `Analyze this PDF page image and identify all images, figures, charts, or diagrams.
    Rules:
    1. For each visual element, provide a name, brief description, and its bounding box.
    2. Do not extract the markdown text of the page.
    Return the result in JSON format with an empty markdown string.`;
  } else if (mode === 'transcription') {
    prompt = `Analyze this PDF page image and provide a clean, plain text transcription of all content.
    Rules:
    1. Do not use Markdown formatting (no #, *, etc.).
    2. Just provide a continuous text stream that represents the page content faithfully.
    3. Do not extract images or bounding boxes.
    Return the result in JSON format with an empty images array and the transcription in the markdown field.`;
  }

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/png",
              data: imageBase64,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          markdown: {
            type: Type.STRING,
            description: "The extracted Markdown or transcription text.",
          },
          images: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                transcription: { type: Type.STRING },
                boundingBox: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                  description: "[ymin, xmin, ymax, xmax] in 0-1000 scale",
                },
              },
              required: ["name", "description", "transcription"],
            },
          },
        },
        required: ["markdown", "images"],
      },
    },
  });

  try {
    return JSON.parse(response.text || "{}") as PageExtraction;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { markdown: response.text || "", images: [] };
  }
}
