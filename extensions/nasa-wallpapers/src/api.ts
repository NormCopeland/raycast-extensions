import { NASAImage } from "./types";

const BASE_URL = "https://api.nasa.gov/planetary/apod";

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await globalThis.fetch(url, {
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
    }
  }
  throw new Error("Max retries reached");
}

export async function fetchNASAImages(apiKey: string, count: number = 30): Promise<NASAImage[]> {
  const url = `${BASE_URL}?api_key=${apiKey}&count=${count}&thumbs=true`;
  
  try {
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NASA API returned ${response.status}: ${response.statusText}. ${errorText || 'The NASA API may be temporarily unavailable. Please try again later.'}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('503')) {
        throw new Error(`NASA API is currently unavailable. Please try again in a few minutes.`);
      }
      throw new Error(`Failed to load NASA images: ${error.message}`);
    }
    throw error;
  }
}

export async function fetchNASAImageByDate(apiKey: string, date: string): Promise<NASAImage> {
  const url = `${BASE_URL}?api_key=${apiKey}&date=${date}&thumbs=true`;
  const response = await globalThis.fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch NASA image: ${response.statusText}`);
  }

  return await response.json();
}

export async function fetchRandomNASAImage(apiKey: string): Promise<NASAImage> {
  const url = `${BASE_URL}?api_key=${apiKey}&count=1&thumbs=true`;
  const response = await globalThis.fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch random NASA image: ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}
