import { getDefaultEnabledAiConfig, getEnabledAiModelProfileCredentials } from './ai-config.js';

/** A saved/explicit choice must never fall back to a different provider when it is unavailable. */
export async function resolveImageStudioTextModel(workflow: Record<string, any>, modelProfileId?: string, loaders = {
  profile: getEnabledAiModelProfileCredentials, legacy: getDefaultEnabledAiConfig,
}, requireVision = false) {
  const savedId = requireVision ? workflow.modelProfiles?.visionProfileId : workflow.modelProfiles?.textProfileId;
  const selectedId = modelProfileId || (typeof savedId === 'string' ? savedId : '');
  if (selectedId) {
    const profile = await loaders.profile(selectedId, requireVision ? ['vision'] : ['text', 'vision']);
    if (!profile) throw Object.assign(new Error(requireVision ? '商品图规划需要可用的图片理解模型，请重新选择' : '所选方案与文案模型已停用或类型不匹配，请重新选择'), { status: 409, code: 'IMAGE_STUDIO_SELECTED_MODEL_UNAVAILABLE' });
    return { baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model, configId: profile.configId, profileId: profile.id };
  }
  if (requireVision) throw Object.assign(new Error('请先选择图片理解模型，再结合商品图生成方案'), { status: 409, code: 'IMAGE_STUDIO_SELECTED_MODEL_UNAVAILABLE' });
  const legacy = await loaders.legacy();
  return legacy ? { baseUrl: legacy.baseUrl, apiKey: legacy.apiKey, model: legacy.model, configId: legacy.id, profileId: null } : null;
}
