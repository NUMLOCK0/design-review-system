import type { PoolConnection } from 'mysql2/promise';
import type { DesignOrder, DesignerWallet, WalletTransaction } from '@design-review/shared';
import { dbPool } from '../config/database.js';
import { designOrderFromRow } from '../config/persistence.js';
import { designerWallets } from '../routes/wallet.js';

const money = (value: number) => Number(value.toFixed(2));

// Called inside the same transaction as assignment/return, or after confirmed payment.
export async function writeOrderIncome(connection: PoolConnection, order: DesignOrder, state: 'pending' | 'settled' | 'failed'): Promise<DesignerWallet> {
  if (!order.claimedById || !order.taskId) throw new Error('收入必须关联正式接单的设计任务');
  const now = new Date().toISOString();
  await connection.query(`INSERT IGNORE INTO designer_wallets (designer_id,designer_name,available_balance,pending_settlement,total_earned,withdrawn_amount,transactions,updated_at) VALUES (?,?,0,0,0,0,'[]',?)`, [order.claimedById, order.claimedByName || '设计师', now]);
  const [rows]: any = await connection.query('SELECT * FROM designer_wallets WHERE designer_id=? FOR UPDATE', [order.claimedById]);
  const row = rows[0];
  const transactions: WalletTransaction[] = typeof row.transactions === 'string' ? JSON.parse(row.transactions) : row.transactions || [];
  const id = `order_income_${order.taskId}`;
  const existing = transactions.find((entry) => entry.id === id);
  const wallet: DesignerWallet = {
    designerId: row.designer_id, designerName: row.designer_name,
    availableBalance: Number(row.available_balance), pendingSettlement: Number(row.pending_settlement),
    totalEarned: Number(row.total_earned), withdrawnAmount: Number(row.withdrawn_amount), transactions,
    bankAccount: row.bank_account ? typeof row.bank_account === 'string' ? JSON.parse(row.bank_account) : row.bank_account : undefined,
  };
  if (existing?.status === state || existing?.status === 'settled') return wallet;
  if (existing?.status === 'pending') wallet.pendingSettlement = money(wallet.pendingSettlement - existing.amount);
  const amount = money(order.designerPayout);
  if (state === 'pending') wallet.pendingSettlement = money(wallet.pendingSettlement + amount);
  if (state === 'settled') { wallet.availableBalance = money(wallet.availableBalance + amount); wallet.totalEarned = money(wallet.totalEarned + amount); }
  const entry: WalletTransaction = {
    id, type: 'order_income', amount, title: `订单收入 · ${order.title}`, orderNo: order.orderNo, status: state,
    description: state === 'settled' ? '品牌方支付尾款后结算，已扣除平台服务费' : state === 'failed' ? '设计师退单，取消待结算收入' : '接单已确认，等待作品审核及品牌方支付尾款',
    createdAt: existing?.createdAt || now, settledAt: state === 'settled' ? now : undefined,
  };
  if (existing) Object.assign(existing, entry); else transactions.unshift(entry);
  await connection.query('UPDATE designer_wallets SET available_balance=?,pending_settlement=?,total_earned=?,transactions=?,updated_at=? WHERE designer_id=?', [wallet.availableBalance, wallet.pendingSettlement, wallet.totalEarned, JSON.stringify(transactions), now, wallet.designerId]);
  return wallet;
}

export async function settlePaidOrderIncome(id: string) {
  if (!dbPool) return;
  const connection = await dbPool.getConnection();
  let wallet: DesignerWallet | undefined;
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query('SELECT * FROM design_orders WHERE id=? FOR UPDATE', [id]);
    if (rows[0]?.payment_status === 'paid' && rows[0]?.claimed_by_id && rows[0]?.task_id)
      wallet = await writeOrderIncome(connection, designOrderFromRow(rows[0]), 'settled');
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  if (wallet) designerWallets[wallet.designerId] = wallet;
}
