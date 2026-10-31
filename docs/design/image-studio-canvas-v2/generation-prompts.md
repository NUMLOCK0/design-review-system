# UI 设计图生成记录

方式：内置 image_gen，ui-mockup。设计稿用于评审，不作为运行中的网页截图。

## 关键交互状态

参考图：`workbench-overview.png`，仅用于 UI 语言与示例商品的一致性。

```text
Use case: ui-mockup
Asset type: a high-fidelity product-interaction design board for a Chinese AI image workbench, 4:3 landscape, high-resolution, four large detailed interface fragments in a tidy 2 by 2 grid.
Input image 1: STYLE REFERENCE ONLY, the previously generated workbench screen. Use its restrained warm-white UI, violet primary actions, crisp charcoal Chinese typography, sage/cream MORU coffee cup, thin borders and precise professional icons. Create an entirely new design board, not an edited copy of the full screenshot.

Primary request: visualize the four critical interaction states of a canvas-centered AI design workbench whose task steps are dynamically planned from business Skills. All examples use one consistent cream travel coffee cup with sage green lid and small MORU logo. Each quadrant should focus on one meaningful interaction with LARGE readable UI, not tiny replicas of the entire screen. Beautiful flat frontend UI design, practical components, authentic screenshot-like fragments. No browser or hardware frames.
Overall background very light warm gray. At top, editorial but small title "关键交互 · 从需求到成品" and subtitle "Skills 规划任务，创作成果沉淀到画布". Each quadrant has a clear small stage number and Chinese title above its screenshot. White panels, subtle shadow, rounded 16px outer frames, generous gaps. Fine violet arrows between the quadrants along a simple reading order, no tangled diagram.

TOP LEFT: "01 需求与 Skills"
A focused empty-canvas startup state. Visible white compact Agent card and subtle dot-grid backdrop. Large in-canvas task entry prompt "这次想完成什么设计？". Composer contains short user sentence "做一套自然生活风格的天猫商品图". Below are two tasteful actions "上传商品图" and "关联品牌方会话". An Agent recommendation card shows label "推荐 Skills" and two chips "电商套图" in violet, "自然生活" in sage. A short one-line explanation "根据目标与已有资料规划工作". Primary action "生成任务计划". Include one small clean thumbnail of the source cup.

TOP RIGHT: "02 动态计划与变更"
Focused task-plan revision drawer with header "计划 V3 → V4" and subtitle "新增 Skill：京东适配".
Clear change summary with three rows and semantic colored status labels:
green "复用" — "商品资料、视觉调研"
cyan "新增" — "平台规格适配"
amber "更新" — "套图规划、相关图片"
Underneath, a soft information line "保留已有图片，仅更新受影响任务".
At bottom a quiet "保留原计划" button and prominent violet "应用变更" button.
Behind the drawer, subtle small task cards suggest existing completed work. This panel should make clear that changing a Skill produces a reviewable task delta, rather than restarting everything. No code or JSON visible.

BOTTOM LEFT: "03 选图与局部修改"
Focused canvas editing state with two beautiful cup-image tiles side-by-side labelled "V1 原稿" and "V2 新版本".
The same cup geometry and lid are strictly preserved; only background shifts from neutral gray-beige to warm golden beige in the new version. A subtle translucent violet brush/mask indicates a small background area on V1, not over the cup.
A floating short instruction card below the images says "背景更暖，保留杯子".
Compact floating toolbar "局部修改" "生成变体" "对比".
A pinned compact composer underneath shows one reference thumbnail, chip "已引用 主视觉 V1", and violet "生成新版本" button.
Emphasize object-targeted conversation, mask-based edits, non-destructive versions.

BOTTOM RIGHT: "04 审稿与交付"
Focused large image of the same cup on light stone with two tasteful small violet numbered comment pins "1" and "2" in empty background areas.
A compact review card on right with title "审稿意见", row "1 增加文案留白" green check "已处理", row "2 保留杯盖形态" green check "已处理".
Below it, an elegant small delivery checklist card titled "交付清单", rows "主图 · 2 张" and "场景图 · 2 张", then green status "4 张成品已确认".
Bottom primary action "生成交付包", secondary "发回会话".
Make this panel show that selected final versions and resolved comments become a defined delivery set.

Constraints: all Chinese labels exactly as requested wherever practical; typography clean and large enough to read, concise text only. Preserve visual consistency with the reference screen, no dark theme, no huge gradients, no English marketing titles, no arbitrary arrows on product photos other than the two numbered review pins. Four equally polished readable panels.
```

## 工作台全貌

```text
Use case: ui-mockup
Asset type: high-fidelity desktop SaaS design-workspace UI proposal for a Chinese ecommerce design product. Deliver one fully designed flat front-facing 16:9 desktop screen, wide 2400x1350 composition, highly legible Chinese UI. This is the actual application interior, not a landing page, not a presentation slide, no laptop frame, no perspective.
Primary request: an AI image-creation workbench with an INFINITE CANVAS as its main surface, a conversational Agent on the left, and a skill-driven dynamic task plan on the right. Generated product images live on the canvas itself. Design it as a refined professional creative tool: warm white and off-white surfaces, extremely subtle gray dot-grid canvas, charcoal type, precise spacing, soft 1px borders, 12px rounded cards, restrained violet accent with semantic teal, green and amber. Strong visual hierarchy, generous uncluttered image area, polished production-ready interface.

Screen layout: top app header 60px high. Slim 52px white icon rail at far left. A 310px left Agent conversation panel. A very large central infinite canvas about 65% of screen width. A 280px right task panel. Canvas and side panels meet with fine vertical borders. Use clean outline icons consistent across all panels.
Top header text: small purple geometric logo, "设计工作台"; breadcrumb "MORU 随行杯 / 天猫套图"; green dot "已保存". On the right quiet icon actions, "分享", and a prominent violet "导出成品" button.

Left Agent panel:
Header "设计 Agent" with small green connected indicator.
Compact source pill "已关联品牌方会话".
One user chat card with exact short text "为随行杯做一套自然生活风格的电商图。"
Below a compact labelled area "已使用 Skills" and two tasteful colored skill chips "电商套图" and "自然生活", a small "+".
Assistant short text "已整理商品资料，并按 Skills 规划任务。先确认风格，再生成套图。"
One compact white plan-preview card "自然生活方向" with three small palette swatches sage / cream / charcoal and a thumbnail; green check "已确认".
A new assistant progress message "4 张图片已生成，可在画布中继续调整。"
At bottom a pinned, well-spaced composer: two tiny selected-reference thumbnails labelled "已引用 2 张商品图"; textarea placeholder "告诉我想调整的地方…"; attachment and @ icons with violet send arrow. Keep long paragraphs out of this panel.

Canvas:
Make high-quality photorealistic ecommerce product images the hero of this screen. Product is one consistent premium travel coffee tumbler with cylindrical cream body, sage-green lid, small tasteful MORU logo. No invented product claims. Each generated tile shows same cup geometry and lid.
Near upper-left of canvas, a small discreet frame named "商品素材 · 2" contains two simple source photos of this cup.
Near top-middle/right, a compact frame "视觉方向 · 已确认" shows 3 reference-mood thumbnails: botanical shadow, pale stone texture, calm sunlight, plus sage and beige swatches. These are secondary to output pictures.
Large central frame "天猫套图 · 自然生活", sublabel "6 张 · 统一风格", contains 6 neatly arranged cards in a 3-column by 2-row grid with elegant spacing. Four cards show actual beautiful detailed imagery:
1. "01 主视觉": hero cup on creamy stone pedestal with soft leaf shadow and generous negative space.
2. "02 材质细节": realistic close-up detail of cup and sage lid, warm studio lighting.
3. "03 使用场景": consistent cup beside a linen bag on sunlit outdoor cafe table.
4. "04 颜色组合": consistent cream and sage product variants against warm neutral background.
5. A muted lavender pending image tile with clean spinner, "生成中".
6. A quiet pale gray dashed pending tile "待生成".
Each tile has a tiny footer title and a status dot; actual product imagery dominates its card.
Select the first result tile using a thin violet border, small corner handles and a subtle floating contextual toolbar below it with exact labels "修改" "生成变体" "设为成品". One selected-result check in top right, no giant selection decorations.
Frames occupy about 75% of available canvas, leaving breathing space and a convincing infinitely pannable dotted backdrop. Do not connect all frames with wires. A small unobtrusive floating canvas tools bar at top-left with select / hand / text / frame / upload icons. Bottom-center zoom pill "68%". Tiny minimap in bottom-right of canvas.

Right panel:
Header tabs "任务" active, "属性" inactive. Heading "任务计划", subtitle "根据 Skills 动态规划", small "V3".
A small count "已完成 4 / 6".
A polished vertical task list:
green check "商品信息核对"
green check "视觉调研"
green check "方向探索"
green check "套图规划"
violet active circle "图片生成" with indented subline "4 / 6 张"
gray circle "审稿与交付"
Make these look like runtime tasks generated for this project, not a fixed top-step wizard.
Under active task, a compact lavender progress card "正在生成场景图" with 67% progress bar and quiet "暂停" and "查看详情" actions.
At panel bottom one unobtrusive outlined "调整任务计划" action.

Typography: crisp Chinese sans-serif resembling PingFang SC or Noto Sans SC, readable labels with clear size hierarchy, accurate Chinese text, no lorem ipsum or gibberish. Product photography should be beautiful and consistent, UI should be plausible to implement and not overdecorated. No gradients on primary action buttons, no black theme, no oversized hero titles, no marketing copy.
```
