import { z } from 'zod';
export const designReviewOutputSchema = z.object({
  summary: z.string().min(1).max(2000),
  checks: z.array(z.object({ assetId: z.string().min(1).max(64), criterion: z.string().min(1).max(160),
    status: z.enum(['passed', 'needs_changes', 'uncertain']), evidence: z.string().min(1).max(1000),
  }).strict()).min(1).max(60),
  suggestions: z.array(z.string().max(500)).max(12),
}).strict();
