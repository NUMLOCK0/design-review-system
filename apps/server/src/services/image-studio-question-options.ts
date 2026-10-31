import { cleanDesignChoices, normalizeDesignChoiceQuestion } from '@design-review/shared';
import type { AgentTurnOutput } from './image-studio-agent-memory.js';

type Form = NonNullable<AgentTurnOutput['skillConfirmationForm']>;

/** A bounded repair only supplies choices; it cannot change questions, plans, answers or production. */
export async function ensureDesignQuestionOptions(form: Form, mode: 'brand' | 'product', recommend: (questions: Form['questions']) => Promise<Form | null | undefined>): Promise<Form> {
  const missing = form.questions.filter((question) => cleanDesignChoices([...(question.recommendation ? [question.recommendation] : []), ...question.options]).length < 2);
  let suggestions: Form | null | undefined;
  if (missing.length) {
    try { suggestions = await recommend(missing); } catch { /* Preserve the interview and use compatibility choices. */ }
  }
  const questions = form.questions.map((question) => {
    const suggestion = missing.some((item) => item.id === question.id) ? suggestions?.questions.find((item) => item.id === question.id) : undefined;
    const options = cleanDesignChoices([...(suggestion?.recommendation ? [suggestion.recommendation] : []), ...(suggestion?.options || [])]);
    return normalizeDesignChoiceQuestion(options.length >= 2 ? { ...question, options, recommendation: suggestion?.recommendation || question.recommendation } : question, mode);
  });
  return { ...form, questions };
}
