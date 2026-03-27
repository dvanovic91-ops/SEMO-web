import { supabase } from './supabase';
import { createSkinSelfieAnalyzer } from './skinSelfieAnalyzer';

export type SkinProgressSnapshot = {
  user_id: string;
  cycle: 'monthly' | 'quarterly';
  base_score: number;
  selfie_score: number;
  adjusted_score: number;
  summary: string;
  concerns: string[];
  recommendations: string[];
  selfie_url?: string | null;
};

export async function saveSkinProgressWithSelfie(input: {
  userId: string;
  cycle: 'monthly' | 'quarterly';
  baseScore: number;
  selfieUrl: string;
}) {
  const analyzer = createSkinSelfieAnalyzer();
  const analyzed = await analyzer.analyze({
    imageUrl: input.selfieUrl,
    skinTestScore: input.baseScore,
  });
  const payload: SkinProgressSnapshot = {
    user_id: input.userId,
    cycle: input.cycle,
    base_score: input.baseScore,
    selfie_score: analyzed.adjustedScore,
    adjusted_score: Math.round((input.baseScore + analyzed.adjustedScore) / 2),
    summary: analyzed.summary,
    concerns: analyzed.concerns,
    recommendations: analyzed.recommendations,
    selfie_url: input.selfieUrl,
  };
  if (!supabase) return payload;
  await supabase.from('skin_progress_snapshots').insert(payload);
  return payload;
}

