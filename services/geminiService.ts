import { GoogleGenAI, Type } from "@google/genai";
import { GeminiSuggestion } from "../types";

// Using the provided pattern for Gemini API
let ai: GoogleGenAI | null = null;

try {
    // Safety check to prevent crash if process is not defined in certain browser environments
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
} catch (e) {
    console.warn("Gemini Service: API Key not accessible", e);
}

export const generateInteractionData = async (
  contractAddress: string, 
  intent: string
): Promise<GeminiSuggestion> => {
  if (!ai) {
    // Fallback if API key is missing
    console.warn("Gemini API Key missing, returning default.");
    return {
        hexData: "0x",
        reasoning: "API Key missing. Defaulting to empty transaction."
    };
  }

  const model = "gemini-2.5-flash"; // Good balance of speed and reasoning for code
  
  const prompt = `
    I am interacting with a Celo smart contract at address ${contractAddress}.
    My intent for the transaction is: "${intent}".
    
    Please generate the appropriate Ethereum Hex Data (calldata) for this interaction.
    If the intent is generic (e.g. "spam" or "transfer"), generate a valid transfer call or a random hex string if appropriate for fuzzing.
    Assume standard ERC20 or common patterns if not specified.
    
    Return a JSON object with:
    1. "hexData": The 0x-prefixed hex string.
    2. "reasoning": A short explanation of what this data does (e.g. function selector + params).
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hexData: { type: Type.STRING },
            reasoning: { type: Type.STRING }
          },
          required: ["hexData", "reasoning"]
        }
      }
    });

    if (response.text) {
        return JSON.parse(response.text) as GeminiSuggestion;
    }
    
    throw new Error("Empty response from Gemini");

  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      hexData: "0x",
      reasoning: "Failed to generate data. Defaulting to empty transaction."
    };
  }
};

export const analyzeContractStrategy = async (contractAddress: string): Promise<string> => {
    if (!ai) return "AI assistant unavailable (check API Key)";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Given the Celo contract address ${contractAddress}, suggest a high-load testing strategy suitable for "Proof of Ship" (proving network capacity). Keep it brief and technical.`
        });
        return response.text || "No strategy generated.";
    } catch (e) {
        return "Analysis failed.";
    }
}