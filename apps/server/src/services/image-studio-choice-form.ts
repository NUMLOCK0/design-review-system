import type { AgentTurnOutput } from './image-studio-agent-memory.js';

// Only recover explicit, enumerated choices when the reply asks the user to choose.
export function choiceFormFromReply(reply: string): AgentTurnOutput['skillConfirmationForm'] {
  if (!/(选一个|选择|偏好|更喜欢|选哪|供你比较)/.test(reply)) return undefined;
  const numbered = [...reply.matchAll(/[①②③④⑤]\s*([^①②③④⑤\n]{2,100})/g)]
    .map((match) => match[1].split(/[。！？；;]/)[0].replace(/^[：:\s]+|[，,\s]+$/g, '').trim());
  const choiceText = reply.match(/(?:偏好|更喜欢|选择|选一个|选哪)[^。！？\n]*/)?.[0] || '';
  const quoted = [...choiceText.matchAll(/「([^「」\n]{1,60})」/g)].map((match) => match[1].trim());
  const options = [...new Set(numbered.length >= 2 ? numbered : quoted)].filter(Boolean);
  if (options.length < 2 || options.length > 5) return undefined;
  return { title: '选择设计方向', intro: '选择一个方向，或填写你的想法。', skillIds: [],
    questions: [{ id: 'direction', label: '你更喜欢哪个方向？', prompt: '你可以选择或输入自己的方向。', required: true, answerType: 'select', options }] };
}
