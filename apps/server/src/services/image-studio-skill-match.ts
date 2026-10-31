type Skill = { id: string; name: string; category: string };

// Match only enabled skills supplied by the caller. Results are guidance for this
// turn, not a change to the user's explicitly selected skills.
export function matchDesignSkills(skills: Skill[], input: { text: string; mode: 'brand' | 'product'; selectedIds: string[] }): string[] {
  const text = input.text.toLowerCase();
  const ids: string[] = [];
  const add = (...values: string[]) => ids.push(...values);
  if (/logo|标志|商标|字标|标识/.test(text)) {
    add('builtin_logo_design_brief', 'builtin_logo_concept_vector_workflow', 'builtin_logo_direction_critique', 'builtin_logo_prompt_direction');
  }
  if (/吉祥物|卡通形象|mascot|角色标志/.test(text)) add('builtin_logo_mascot_prompt');
  if (/包装|包装盒|瓶身|杯身/.test(text)) add('builtin_packaging_brief');
  if (/品牌设计|品牌视觉|品牌识别|品牌形象|brand identity/.test(text)) add('builtin_brand_identity_system_workflow', 'builtin_brand_identity_brief');
  if (/主图|详情页|商品图|电商|产品图/.test(text)) add('builtin_ecommerce_visual_brief');
  if (/淘宝|天猫/.test(text)) add('builtin_taobao_tmall_product_visual');
  if (/京东/.test(text)) add('builtin_jd_product_visual');
  if (/拼多多/.test(text)) add('builtin_pdd_product_visual');
  if (/抖音/.test(text)) add('builtin_douyin_shop_visual');
  if (!ids.length && /设计|出图|生图|视觉|design/.test(text)) add(input.mode === 'brand' ? 'builtin_brand_identity_brief' : 'builtin_ecommerce_visual_brief');
  const enabled = new Set(skills.map((skill) => skill.id));
  const selected = new Set(input.selectedIds);
  return [...new Set(ids)].filter((id) => enabled.has(id) && !selected.has(id)).slice(0, Math.max(0, 5 - selected.size));
}
