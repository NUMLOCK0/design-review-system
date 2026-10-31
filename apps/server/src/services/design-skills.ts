import { randomUUID } from 'node:crypto';
import type { DesignSkill, DesignSkillInput, DesignSkillSource } from '@design-review/shared';
import { dbPool } from '../config/database.js';
import { defaultDesignSkillSeeds } from '../config/design-skill-seeds.js';

type Actor = { id: string; name: string; role: 'admin' | 'customer_service' };
type StoredSkill = {
  id: string; name: string; category: string; description: string; instructions: string; completion_criteria: string;
  questions: unknown; version: number; is_enabled: boolean | number; created_by_id: string; created_by_name: string;
  created_by_role: 'admin' | 'customer_service'; updated_by_name: string; created_at: Date | string; updated_at: Date | string;
  source_name?: string | null; source_url?: string | null; source_license?: string | null; source_note?: string | null;
};

type DesignSkillSeed = DesignSkillInput & { id: string; source: DesignSkillSource };

const memorySkills = new Map<string, StoredSkill>();

function iso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function parseQuestions(value: unknown) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return value || [];
}

function toView(row: StoredSkill): DesignSkill {
  return {
    id: String(row.id), name: String(row.name), category: row.category as DesignSkill['category'],
    description: String(row.description), instructions: String(row.instructions || ''), completionCriteria: String(row.completion_criteria || ''),
    questions: parseQuestions(row.questions) as DesignSkill['questions'], version: Number(row.version || 1), isEnabled: Boolean(row.is_enabled),
    createdById: String(row.created_by_id), createdByName: String(row.created_by_name), createdByRole: row.created_by_role,
    updatedByName: String(row.updated_by_name || row.created_by_name), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    ...(row.source_name && row.source_url && row.source_license ? { source: {
      name: String(row.source_name), url: String(row.source_url), license: String(row.source_license),
      ...(row.source_note ? { note: String(row.source_note) } : {}),
    } } : {}),
  };
}

function duplicateError() {
  return Object.assign(new Error('同一设计类型下已存在同名 Skill，请更换名称'), { status: 409, code: 'DESIGN_SKILL_DUPLICATE' });
}

async function ensureNameAvailable(input: Pick<DesignSkillInput, 'name' | 'category'>, excludingId?: string) {
  const name = input.name.trim().toLocaleLowerCase();
  if (!dbPool) {
    const duplicate = [...memorySkills.values()].some((row) => row.id !== excludingId && row.category === input.category && row.name.trim().toLocaleLowerCase() === name);
    if (duplicate) throw duplicateError();
    return;
  }
  const [rows]: any = await dbPool.query('SELECT id FROM design_skills WHERE category=? AND name=? AND id<>? LIMIT 1', [input.category, input.name.trim(), excludingId || '']);
  if (rows.length) throw duplicateError();
}

export async function listDesignSkills(includeDisabled: boolean) {
  if (!dbPool) {
    return [...memorySkills.values()].filter((row) => includeDisabled || Boolean(row.is_enabled))
      .sort((a, b) => iso(b.updated_at).localeCompare(iso(a.updated_at))).map(toView);
  }
  const [rows]: any = await dbPool.query(`SELECT id,name,category,description,instructions,completion_criteria,questions,version,is_enabled,
      created_by_id,created_by_name,created_by_role,updated_by_name,created_at,updated_at,source_name,source_url,source_license,source_note
    FROM design_skills ${includeDisabled ? '' : 'WHERE is_enabled=TRUE'} ORDER BY updated_at DESC, created_at DESC`);
  return (rows as StoredSkill[]).map(toView);
}

export async function getDesignSkill(id: string) {
  if (!dbPool) return memorySkills.has(id) ? toView(memorySkills.get(id)!) : null;
  const [rows]: any = await dbPool.query(`SELECT id,name,category,description,instructions,completion_criteria,questions,version,is_enabled,
      created_by_id,created_by_name,created_by_role,updated_by_name,created_at,updated_at,source_name,source_url,source_license,source_note
      FROM design_skills WHERE id=? LIMIT 1`, [id]);
  return rows[0] ? toView(rows[0] as StoredSkill) : null;
}

export async function createDesignSkill(input: DesignSkillInput, actor: Actor) {
  await ensureNameAvailable(input);
  const id = randomUUID();
  const now = new Date().toISOString();
  const row: StoredSkill = {
    id, name: input.name.trim(), category: input.category, description: input.description.trim(), instructions: input.instructions.trim(),
    completion_criteria: input.completionCriteria.trim(), questions: input.questions, version: 1, is_enabled: true,
    created_by_id: actor.id, created_by_name: actor.name, created_by_role: actor.role, updated_by_name: actor.name, created_at: now, updated_at: now,
    source_name: null, source_url: null, source_license: null, source_note: null,
  };
  if (!dbPool) memorySkills.set(id, row);
  else await dbPool.query(`INSERT INTO design_skills
    (id,name,category,description,instructions,completion_criteria,questions,version,is_enabled,created_by_id,created_by_name,created_by_role,updated_by_name,source_name,source_url,source_license,source_note)
    VALUES (?,?,?,?,?,?,?,1,TRUE,?,?,?,?,NULL,NULL,NULL,NULL)`, [id, row.name, row.category, row.description, row.instructions, row.completion_criteria,
    JSON.stringify(row.questions), actor.id, actor.name, actor.role, actor.name]);
  return (await getDesignSkill(id))!;
}

/** Seed curated examples once without overwriting administrator edits or existing custom Skills. */
export async function ensureDefaultDesignSkills() {
  const actor = { id: 'system:design-skills', name: '系统精选', role: 'admin' as const };
  for (const seed of defaultDesignSkillSeeds as DesignSkillSeed[]) {
    if (!dbPool) {
      const exists = memorySkills.has(seed.id) || [...memorySkills.values()].some((row) => row.category === seed.category && row.name === seed.name);
      if (exists) continue;
      const now = new Date().toISOString();
      memorySkills.set(seed.id, {
        id: seed.id, name: seed.name, category: seed.category, description: seed.description,
        instructions: seed.instructions, completion_criteria: seed.completionCriteria, questions: seed.questions,
        version: 1, is_enabled: true, created_by_id: actor.id, created_by_name: actor.name,
        created_by_role: actor.role, updated_by_name: actor.name, created_at: now, updated_at: now,
        source_name: seed.source.name, source_url: seed.source.url, source_license: seed.source.license, source_note: seed.source.note || null,
      });
      continue;
    }

    const [rows]: any = await dbPool.query('SELECT id FROM design_skills WHERE category=? AND name=? LIMIT 1', [seed.category, seed.name]);
    if (rows.length) continue;
    try {
      await dbPool.query(`INSERT INTO design_skills
        (id,name,category,description,instructions,completion_criteria,questions,version,is_enabled,created_by_id,created_by_name,created_by_role,updated_by_name,source_name,source_url,source_license,source_note)
        VALUES (?,?,?,?,?,?,?,1,TRUE,?,?,?,?,?,?,?,?)`, [seed.id, seed.name, seed.category, seed.description, seed.instructions,
        seed.completionCriteria, JSON.stringify(seed.questions), actor.id, actor.name, actor.role, actor.name,
        seed.source.name, seed.source.url, seed.source.license, seed.source.note || null]);
    } catch (error) {
      // Another server instance may have inserted the same seed between the existence check and insert.
      if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
    }
  }
}

export async function updateDesignSkill(id: string, input: DesignSkillInput, actor: Actor) {
  const existing = await getDesignSkill(id);
  if (!existing) return null;
  if (actor.role !== 'admin' && existing.createdById !== actor.id) {
    throw Object.assign(new Error('客服只能修改自己创建的 Skill'), { status: 403, code: 'DESIGN_SKILL_FORBIDDEN' });
  }
  await ensureNameAvailable(input, id);
  if (!dbPool) {
    const row = memorySkills.get(id)!;
    memorySkills.set(id, { ...row, name: input.name.trim(), category: input.category, description: input.description.trim(),
      instructions: input.instructions.trim(), completion_criteria: input.completionCriteria.trim(), questions: input.questions,
      version: Number(row.version) + 1, updated_by_name: actor.name, updated_at: new Date().toISOString() });
  } else {
    const [result]: any = await dbPool.query(`UPDATE design_skills SET name=?,category=?,description=?,instructions=?,completion_criteria=?,questions=?,
      version=version+1,updated_by_name=?,updated_at=NOW(3) WHERE id=?`, [input.name.trim(), input.category, input.description.trim(),
      input.instructions.trim(), input.completionCriteria.trim(), JSON.stringify(input.questions), actor.name, id]);
    if (!result.affectedRows) return null;
  }
  return getDesignSkill(id);
}

export async function setDesignSkillEnabled(id: string, enabled: boolean) {
  if (!dbPool) {
    const row = memorySkills.get(id);
    if (!row) return false;
    memorySkills.set(id, { ...row, is_enabled: enabled, updated_at: new Date().toISOString() });
    return true;
  }
  const [result]: any = await dbPool.query('UPDATE design_skills SET is_enabled=?,updated_at=NOW(3) WHERE id=?', [enabled, id]);
  return Boolean(result.affectedRows);
}
