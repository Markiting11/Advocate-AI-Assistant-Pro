
import { GoogleGenAI, Type, Chat } from "@google/genai";
import { CaseAnalysis, LegalStrategy, HearingPrep, LegalDomain, DraftLanguage, Citation } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export interface MultimodalPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export const analyzeCaseFile = async (parts: MultimodalPart[]): Promise<CaseAnalysis> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { text: "Analyze this legal case documentation and return a structured analysis in JSON format." },
        ...parts
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          caseType: { type: Type.STRING },
          parties: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING },
          keyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
          reliefSought: { type: Type.STRING },
          legalIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["caseType", "parties", "summary", "keyFacts", "reliefSought", "legalIssues"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const researchLegalPrecedents = async (summary: string, legalIssues: string[]): Promise<Citation[]> => {
  const query = `Find relevant legal precedents, case law, and citations for a case regarding: ${summary}. Focus on these issues: ${legalIssues.join(', ')}. Provide links to full articles or court records.`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: query,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const citations: Citation[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  chunks.forEach((chunk: any) => {
    if (chunk.web && chunk.web.uri) {
      citations.push({
        title: chunk.web.title || "Legal Reference",
        uri: chunk.web.uri,
      });
    }
  });

  return citations;
};

export const generateStrategy = async (parts: MultimodalPart[]): Promise<LegalStrategy> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { text: "Based on these case documents, suggest a legal strategy and identify potential risks." },
        ...parts
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
          applicableLaws: { type: Type.ARRAY, items: { type: Type.STRING } },
          argumentFlow: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["strengths", "risks", "gaps", "applicableLaws", "argumentFlow"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const prepareHearing = async (parts: MultimodalPart[]): Promise<HearingPrep> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { text: "Prepare me for the next hearing based on these case details." },
        ...parts
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
          predictedQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          opponentArguments: { type: Type.ARRAY, items: { type: Type.STRING } },
          counterPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["checklist", "predictedQuestions", "opponentArguments", "counterPoints"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const generateDraft = async (
  parts: MultimodalPart[], 
  domain: LegalDomain, 
  draftType: string, 
  language: DraftLanguage
): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { 
          text: `STRICT REQUIREMENT: Draft a complete, professional legal document.
                 LANGUAGE: ${language === 'Urdu' ? 'Urdu Script (Native Urdu text, not Roman Urdu)' : 'English'}
                 DOMAIN: ${domain}
                 DOCUMENT TYPE: ${draftType}
                 
                 FORMATTING RULES:
                 1. If Urdu, use high-level "Adalati" (Court) Urdu terminology.
                 2. DO NOT use ANY markdown characters like asterisks (**), hashes (#), or underscores (_).
                 3. Use clear headers and spacing to differentiate sections.
                 4. For headings, use ALL CAPS (in English) or centered text structure.
                 5. Ensure the document looks like a formal legal petition or notice ready for court submission.
                 6. Incorporate case-specific details (parties, facts) from the attached documents naturally.` 
        },
        ...parts
      ]
    }
  });

  return response.text || "Failed to generate draft.";
};

export const startManualDraftChat = (parts: MultimodalPart[], language: DraftLanguage): Chat => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  return ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: `You are a professional legal drafting assistant. 
      CONTEXT: The user has provided some case documents.
      LANGUAGE: ${language === 'Urdu' ? 'Urdu Script' : 'English'}.
      
      BEHAVIOR:
      1. If the user asks "how to draft [document]" or asks a general question, provide a detailed step-by-step guide with legal requirements, templates, and important considerations (similar to a legal textbook).
      2. If the user provides specific details or asks to "draft now", produce a formal, professional legal document.
      3. For formal drafts, DO NOT use any markdown characters (*, #, _, etc.). Use spacing and CAPS for formatting.
      4. Always maintain a professional "Advocate-to-Advocate" tone.
      5. Help the user refine their draft through conversation.`
    },
    // We send context in the history if parts are provided
    history: parts.length > 0 ? [
      { role: 'user', parts: [{ text: "Here is the context of the case I am working on." }, ...parts] },
      { role: 'model', parts: [{ text: "I have received the case context. How can I assist you with drafting or guidance today?" }] }
    ] : []
  });
};

export const generateManualDraft = async (
  parts: MultimodalPart[],
  userInput: string,
  language: DraftLanguage
): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { 
          text: `STRICT REQUIREMENT: Draft a formal legal document based on user input.
                 USER INPUT: "${userInput}"
                 LANGUAGE: ${language === 'Urdu' ? 'Urdu Script (Native Urdu text, not Roman Urdu)' : 'English'}
                 
                 FORMATTING RULES:
                 1. Use formal legal prose appropriate for court filings.
                 2. If Urdu, use proper "Waqalat" vocabulary and traditional sentence structures.
                 3. DO NOT use ANY markdown like **bold**, *italics*, or # headings.
                 4. The output must be PLAIN TEXT that is formatted via spacing and case (if English) for headings.
                 5. Organize the user's points into a logical, professional legal narrative.` 
        },
        ...parts
      ]
    }
  });

  return response.text || "Failed to generate manual draft.";
};
