
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { SongStructure, TrackMood } from "./types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2, backoff = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isQuotaError = error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
    if (isQuotaError && retries > 0) {
      await delay(backoff);
      return callWithRetry(fn, retries - 1, backoff * 2);
    }
    throw error;
  }
}

export const generateLyrics = async (prompt: string, styleConfig: string, mood: TrackMood, isLongTrack: boolean, selectedSfx: string[] = [], languageMix: string = 'Khmer Only'): Promise<SongStructure> => {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    const lengthInstruction = isLongTrack 
      ? "Generate an EXTENSIVE track structure (at least 8 sections: Intro, multiple Verses, multiple Hooks, Bridge, Outro) designed for a 5-minute performance." 
      : "Generate a standard 2-3 minute song structure (5-6 sections).";
    
    const moodInstruction = mood === 'Funny/Rude' 
      ? "Mood: Funny, Rude, Satirical. Use playful Khmer street slang (e.g., 'nhoy', 'klun', 'jou') while keeping it aggressive trap. The tone should be sharp, witty, and slightly offensive but in a humorous 'diss track' way."
      : mood === 'Melodic'
      ? "Mood: Melodic, Emotional, Smooth. Focus on catchy vocal melodies, R&B influenced trap, and heartfelt Khmer lyrics about life, love, or struggle. Use smoother flow and more singing-style delivery."
      : mood === 'Dark/Gritty'
      ? "Mood: Dark, Gritty, Underground. Focus on heavy bass, mysterious vibes, and raw street storytelling. Use deep, raspy delivery and intense Khmer imagery."
      : "Mood: Aggressive, Dark, Professional. Focus on street power, loyalty, and hustle.";

    const sfxInstruction = selectedSfx.length > 0
      ? `CRITICAL SFX REQUIREMENT: The user has selected the following sound effects: ${selectedSfx.join(', ')}. You MUST embed these sound effects naturally into the lyrics text using brackets, e.g., [SFX: Gunshots] or [SFX: Sirens]. Place them where they make the most impact.`
      : "";

    const languageInstruction = languageMix === 'Khmer Only'
      ? "CRITICAL: The lyrics and ad-libs MUST be written primarily in the Khmer language using the Khmer script (អក្សរខ្មែរ). Do not use romanized/English alphabet for the Khmer words. You may include occasional English trap slang."
      : `CRITICAL: The lyrics and ad-libs MUST be a mix of Khmer (using Khmer script អក្សរខ្មែរ) and the secondary language specified in "${languageMix}". Seamlessly blend the two languages together in the verses and hooks. Do not use romanized/English alphabet for the Khmer words.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Write a professional Khmer Trap / Cambodian Hip-Hop song based on this theme: "${prompt}". 
      The style must match: ${styleConfig}. 
      ${moodInstruction}
      ${lengthInstruction}
      Include aggressive delivery vibes, hard 808s energy in the structure, and hype ad-libs.
      ${sfxInstruction}
      ${languageInstruction}
      ALSO CRITICAL: You MUST generate exactly 25 storyboard scenes for the MV (Music Video). Each scene must include the vibe/atmosphere, a highly detailed visual description (scene), the main character(s) involved, additional specific details (lighting/camera), and the accompanying short, impactful lyrics/captions (in Khmer script and/or the mixed language).
      Response MUST be valid JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            theme: { type: Type.STRING },
            bpm: { type: Type.NUMBER },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ['Intro', 'Verse', 'Hook', 'Bridge', 'Outro'] },
                  text: { type: Type.STRING, description: 'Lyrics written in the Khmer language (Khmer script)' },
                  adlibs: { type: Type.STRING, description: 'High energy ad-libs in parentheses, written in Khmer script' },
                  energyLevel: { type: Type.STRING, enum: ['low', 'medium', 'high', 'peak'] }
                },
                required: ['type', 'text', 'energyLevel']
              }
            },
            mvStoryboard: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  vibe: { type: Type.STRING, description: 'The overall vibe or atmosphere of the scene (in English)' },
                  scene: { type: Type.STRING, description: 'Highly detailed visual description of the scene for an AI video generator (in English)' },
                  character: { type: Type.STRING, description: 'The main character(s) featured in the scene (in English)' },
                  details: { type: Type.STRING, description: 'Additional specific details, lighting, or camera angles (in English)' },
                  text: { type: Type.STRING, description: 'The accompanying short, impactful lyrics/captions (in Khmer script)' }
                },
                required: ['vibe', 'scene', 'character', 'details', 'text']
              },
              description: 'Exactly 25 storyboard scenes for the MV'
            }
          },
          required: ['title', 'theme', 'bpm', 'sections', 'mvStoryboard']
        }
      }
    });

    if (!response.text) throw new Error("Empty lyric response");
    return JSON.parse(response.text) as SongStructure;
  });
};

export const generateCoverArtPrompt = async (title: string, theme: string, mood: TrackMood, lyrics: string): Promise<string> => {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    const visualMood = mood === 'Funny/Rude' 
      ? "Colorful, chaotic, satirical, and wild. High-energy cartoonish elements mixed with dark trap neon. Slightly absurd and edgy visuals."
      : mood === 'Melodic'
      ? "Soft neon lights, purple and blue hues, dreamy urban atmosphere, smooth textures, aesthetic and emotional."
      : mood === 'Dark/Gritty'
      ? "Monochrome with deep shadows, grainy texture, industrial urban decay, intense and raw street vibes."
      : "Gritty, cinematic, dark street life. High contrast, sharp details, red and gold accents, powerful and mysterious.";

    const promptInstruction = `You are an expert AI image prompt engineer. Based on the following song details, write a highly detailed, vivid, and descriptive prompt for an AI image generator (like Midjourney or DALL-E) to create the perfect album cover art.
    
Song Title: "${title}"
Theme: ${theme}
Mood/Vibe: ${visualMood}
Lyrics Snippet: ${lyrics}

CRITICAL STYLE REQUIREMENT: The text style and overall image MUST be hyper-realistic, photorealistic, cinematic, shot on high-end camera, 8k resolution, highly detailed, and lifelike. It must look like a real photograph or a hyper-realistic render, not a cartoon or illustration.

CRITICAL TEXT REQUIREMENT: The prompt MUST explicitly instruct the image generator to prominently feature the text "${title}" as the album title on the cover art.

The prompt should describe the subject, setting, lighting, colors, camera angle, and artistic style. It should be written in English.
Do not include any intro or outro text, just the prompt itself.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: promptInstruction,
    });

    if (!response.text) throw new Error("Empty prompt response");
    return response.text.trim();
  });
};

export const generateSpeech = async (text: string): Promise<Uint8Array> => {
  return callWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say this like a confident trap rapper: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio returned");

    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  });
};
