import { dbPool } from '../config/database.js';

export type DesignerClaimEligibility = {
  canClaim: boolean;
  profilePublished: boolean;
  acceptingOrders: boolean;
  profileCompleted: boolean;
  approvedPortfolioCount: number;
};

export async function getDesignerClaimEligibility(userId: string): Promise<DesignerClaimEligibility> {
  if (!dbPool) throw new Error('数据库未连接，暂时无法核验设计师接单资格');
  const [rows]: any = await dbPool.query(
    "SELECT p.public_status, p.availability_status, COALESCE(p.profile_completed, 0) AS profile_completed, (SELECT COUNT(*) FROM designer_portfolios dp WHERE dp.designer_id=u.id AND dp.status='published' AND TRIM(COALESCE(dp.title, '')) <> '' AND TRIM(COALESCE(dp.cover_url, '')) <> '' AND JSON_LENGTH(dp.image_urls) > 0) AS approved_portfolio_count FROM users u LEFT JOIN designer_profiles p ON p.user_id=u.id WHERE u.id=? LIMIT 1",
    [userId],
  );
  const row = rows?.[0];
  const profileCompleted = Number(row?.profile_completed || 0) === 1;
  const approvedPortfolioCount = Number(row?.approved_portfolio_count || 0);
  const profilePublished = row?.public_status === 'published';
  const acceptingOrders = row?.availability_status !== 'unavailable';
  return { profilePublished, acceptingOrders, canClaim: Boolean(row) && profileCompleted && profilePublished && acceptingOrders && approvedPortfolioCount > 0, profileCompleted, approvedPortfolioCount };
}
