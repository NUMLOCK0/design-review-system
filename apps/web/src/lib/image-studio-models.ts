export type StudioModelProfile = { id: string; name: string; capability: 'text' | 'vision' | 'image'; model?: string | null; options?: Record<string, any> };
export type StudioModelSelection = { textProfileId: string; visionProfileId: string; imageProfileId: string };

const MODEL_PREFERENCES_KEY = 'image-studio:last-model-selection:v1';

export function readStudioModelPreference(): StudioModelSelection | null {
  try {
    const value = JSON.parse(localStorage.getItem(MODEL_PREFERENCES_KEY) || 'null');
    if (!value || typeof value !== 'object' || !['textProfileId', 'visionProfileId', 'imageProfileId'].every((key) => typeof value[key] === 'string')) return null;
    return { textProfileId: value.textProfileId, visionProfileId: value.visionProfileId, imageProfileId: value.imageProfileId };
  } catch { return null; }
}

export function saveStudioModelPreference(selection: StudioModelSelection): void {
  try { localStorage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify(selection)); } catch { /* Project-level persistence remains available. */ }
}

export function resolveStudioModels(profiles: StudioModelProfile[], saved?: Partial<StudioModelSelection> | null): StudioModelSelection {
  return {
    textProfileId: saved?.textProfileId || profiles.find((profile) => profile.capability === 'text')?.id || profiles.find((profile) => profile.capability === 'vision')?.id || '',
    visionProfileId: saved?.visionProfileId || profiles.find((profile) => profile.capability === 'vision')?.id || '',
    imageProfileId: saved?.imageProfileId || profiles.find((profile) => profile.capability === 'image')?.id || '',
  };
}
