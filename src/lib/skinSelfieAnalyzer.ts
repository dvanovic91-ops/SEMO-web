export type SkinSelfieInput = {
  imageUrl: string;
  skinTestScore?: number;
  skinType?: string;
  ageRange?: string;
};

export type SkinSelfieResult = {
  adjustedScore: number;
  summary: string;
  concerns: string[];
  recommendations: string[];
  provider: 'google-ai-studio' | 'mock';
};

export interface SkinSelfieAnalyzer {
  analyze(input: SkinSelfieInput): Promise<SkinSelfieResult>;
}

class MockSkinSelfieAnalyzer implements SkinSelfieAnalyzer {
  async analyze(input: SkinSelfieInput): Promise<SkinSelfieResult> {
    const base = Number.isFinite(input.skinTestScore) ? Number(input.skinTestScore) : 70;
    return {
      adjustedScore: Math.max(0, Math.min(100, Math.round(base))),
      summary: 'Selfie analysis is not connected yet. This is a safe mock result.',
      concerns: ['dryness', 'texture'],
      recommendations: ['hydrating serum', 'gentle exfoliation'],
      provider: 'mock',
    };
  }
}

class GoogleAiStudioAnalyzer implements SkinSelfieAnalyzer {
  async analyze(input: SkinSelfieInput): Promise<SkinSelfieResult> {
    // TODO: connect real provider with server-side API key proxy endpoint.
    const fallback = new MockSkinSelfieAnalyzer();
    const result = await fallback.analyze(input);
    return { ...result, provider: 'google-ai-studio' };
  }
}

export function createSkinSelfieAnalyzer(): SkinSelfieAnalyzer {
  const provider = (import.meta.env.VITE_SKIN_SELFIE_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'google-ai-studio') return new GoogleAiStudioAnalyzer();
  return new MockSkinSelfieAnalyzer();
}

