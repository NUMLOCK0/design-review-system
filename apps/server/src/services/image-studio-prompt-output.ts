import { z } from 'zod';
const output = z.object({ prompts: z.array(z.object({ slotKey: z.string().min(1).max(128), prompt: z.string().min(1).max(12000), negativePrompt: z.string().max(2000).default('') }).strict()).min(1).max(64) }).strict();
export function validatePerImagePrompts(value: unknown, slots: Array<{ slotKey: string }>) {
  const parsed = output.parse(value); const keys = new Set(parsed.prompts.map((p) => p.slotKey));
  if (keys.size !== parsed.prompts.length || keys.size !== slots.length || slots.some((slot) => !keys.has(slot.slotKey))) throw new Error('逐图提示词未完整对应计划中的图片槽位');
  return parsed;
}
