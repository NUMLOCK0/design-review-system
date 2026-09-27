import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const { dbPool } = await import('../apps/server/src/config/database.js');
  if (!dbPool) throw new Error('未检测到 MYSQL_URL');
  const assetId = 'asset_b4bffe8db925f86a3b20c272ae2f39bf';
  const [assetRows]: any = await dbPool.query('SELECT id, kind, oss_original_key FROM media_assets WHERE id = ?', [assetId]);
  console.log(`media_assets: ${JSON.stringify(assetRows)}`);
  const targets = [
    ['design_orders', 'id', 'image_requirement_groups'],
    ['design_orders', 'id', 'reference_images'],
    ['review_tasks', 'id', 'payload_json'],
    ['order_disputes', 'id', 'evidence_urls'],
    ['order_disputes', 'id', 'payload_json'],
    ['designer_profiles', 'user_id', 'portfolio_urls'],
    ['designer_portfolios', 'id', 'cover_url'],
    ['designer_portfolios', 'id', 'image_urls'],
    ['customer_service_contacts', 'id', 'qr_code_url'],
    ['users', 'id', 'avatar_url'],
  ] as const;
  for (const [table, idColumn, column] of targets) {
    try {
      const [rows]: any = await dbPool.query(`SELECT \`${idColumn}\` AS record_id, \`${column}\` AS value FROM \`${table}\` WHERE CAST(\`${column}\` AS CHAR) LIKE ?`, [`%${assetId}%`]);
      if (rows?.length) console.log(`${table}.${column}: ${JSON.stringify(rows)}`);
    } catch (error: any) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
    }
  }
  await dbPool.end();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
