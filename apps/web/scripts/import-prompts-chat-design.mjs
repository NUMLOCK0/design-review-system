// Import a reproducible snapshot of design-related prompts from the CC0 dataset.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const csv = execFileSync('curl', ['-fsSL', '--max-time', '120', 'https://raw.githubusercontent.com/f/prompts.chat/main/prompts.csv'], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
function parseCsv(input) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted && c === '"' && input[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === ',') { row.push(field); field = ''; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const rows = parseCsv(csv);
const headers = rows.shift();
const index = Object.fromEntries(headers.map((name, i) => [name, i]));
const design = /\b(logo|branding|brand identity|brand design|graphic design|visual identity|typography|typeface|lettering|packaging|poster|illustration|illustrator|art director|creative director|product design|ui design|ux design|web design|visual design|icon design|color palette|colour palette|mockup|layout|infographic|advertising design|social media design)\b|品牌设计|标志设计|平面设计|包装设计|海报设计|视觉设计|字体设计/i;
const seen = new Set();
const prompts = rows.flatMap((row) => {
  const title = row[index.act]?.trim(); const prompt = row[index.prompt]?.trim();
  if (!title || !prompt || !design.test(`${title}\n${prompt}`)) return [];
  const hash = createHash('sha256').update(`${title}\n${prompt}`).digest('hex').slice(0, 20);
  if (seen.has(hash)) return []; seen.add(hash);
  return [{ id: `prompts-chat-${hash}`, title, prompt, description: 'prompts.chat 设计相关提示词（CC0）', tags: ['prompts.chat', '设计', row[index.type] || 'TEXT'], author: row[index.contributor] || '', sourceUrl: 'https://prompts.chat/prompts', coverUrl: '', referenceImageUrls: [] }];
});
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/prompt-sources/prompts-chat-design.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(prompts, null, 2) + '\n');
console.log(`Imported ${prompts.length} design-related prompts from ${rows.length} records to ${out}`);
