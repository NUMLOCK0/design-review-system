import { Router } from 'express';
import type { DesignerWallet, WalletTransaction, WithdrawalRequest } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { notifyUser } from './messages.js';
import { persistDesignerWallet, persistWithdrawalRequest } from '../config/persistence.js';
import { recordAdminAudit } from '../services/admin-audit.js';

export const walletRouter = Router();

// 钱包余额与流水只来自真实业务，不再预置演示数据。
export let designerWallets: Record<string, DesignerWallet> = {};

export const withdrawalRequests: WithdrawalRequest[] = [];

const walletFor = (designerId: string) => {
  let wallet = designerWallets[designerId];
  if (!wallet) {
    wallet = { designerId, designerName: '签约设计师', availableBalance: 0, pendingSettlement: 0, totalEarned: 0, withdrawnAmount: 0, transactions: [], withdrawalRequests: [] };
    designerWallets[designerId] = wallet;
  }
  wallet.withdrawalRequests ||= [];
  return wallet;
};

const maskAccount = (accountNo: string) => accountNo.includes('*') ? accountNo : `**** **** **** ${accountNo.replace(/\s/g, '').slice(-4)}`;
const publicWallet = (wallet: DesignerWallet): DesignerWallet => ({
  ...wallet,
  bankAccount: wallet.bankAccount ? { ...wallet.bankAccount, accountNo: maskAccount(wallet.bankAccount.accountNo) } : undefined,
  withdrawalRequests: wallet.withdrawalRequests?.map((request) => ({ ...request, bankAccount: { ...request.bankAccount, accountNo: maskAccount(request.bankAccount.accountNo) } })),
});

// 1. 获取当前设计师钱包资产概览
walletRouter.get('/my-wallet', authenticate, requireRoles('designer', 'admin'), (req, res) => {
  const wallet = walletFor(req.user!.id);
  res.json({
    code: 200,
    success: true,
    data: publicWallet(wallet),
    timestamp: Date.now()
  });
});

// 2. 申请提现
walletRouter.post('/withdraw', authenticate, requireRoles('designer'), async (req, res) => {
  const { amount, bankName, accountNo, holderName } = req.body;
  const numAmount = Number(Number(amount).toFixed(2));
  const cleanAccountNo = String(accountNo || '').replace(/\s/g, '');

  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ code: 400, success: false, message: '请输入有效的提现金额' });
  }
  if (!bankName || !/^\d{8,30}$/.test(cleanAccountNo) || !String(holderName || '').trim()) {
    return res.status(400).json({ code: 400, success: false, message: '请填写银行名称、完整银行卡号和持卡人姓名' });
  }
  const wallet = walletFor(req.user!.id);
  if (!wallet || wallet.availableBalance < numAmount) {
    return res.status(400).json({ code: 400, success: false, message: '可提现余额不足' });
  }
  if (withdrawalRequests.some((request) => request.designerId === req.user!.id && request.status === 'pending_review')) {
    return res.status(409).json({ code: 409, success: false, message: '已有提现申请正在客服审核，请勿重复提交' });
  }

  wallet.availableBalance -= numAmount;
  const withdrawalId = `wd_${Date.now()}`;
  const createdAt = new Date().toISOString();
  const bankAccount = { bankName: String(bankName).trim(), accountNo: cleanAccountNo, holderName: String(holderName).trim() };
  wallet.bankAccount = bankAccount;

  const newTx: WalletTransaction = {
    id: withdrawalId,
    type: 'withdrawal',
    amount: -numAmount,
    title: `申请提现至银行卡 (尾号${cleanAccountNo.slice(-4)})`,
    description: '提现申请已提交，等待客服审核；审核不通过时金额原路退回收益钱包',
    status: 'pending',
    createdAt
  };

  wallet.transactions.unshift(newTx);
  const request: WithdrawalRequest = { id: withdrawalId, designerId: req.user!.id, designerName: req.user!.name, amount: numAmount, bankAccount, status: 'pending_review', createdAt };
  wallet.withdrawalRequests!.unshift(request);
  withdrawalRequests.unshift(request);
  await persistDesignerWallet(wallet);
  await persistWithdrawalRequest(request);
  notifyUser('u_rev_1', { type: 'system', title: '新的提现申请待审核', content: `${req.user!.name}提交了 ¥${numAmount.toFixed(2)} 的银行卡提现申请，请审核。`, link: '/service/dashboard?tab=withdrawal_review' });

  res.json({
    code: 200,
    success: true,
    message: `提现申请已提交，¥${numAmount.toFixed(2)} 将在客服审核后处理`,
    data: publicWallet(wallet),
    timestamp: Date.now()
  });
});

walletRouter.post('/withdrawals/:id/review', authenticate, requireRoles('customer_service', 'admin'), async (req, res) => {
  const request = withdrawalRequests.find((item) => item.id === req.params.id);
  if (!request || request.status !== 'pending_review') return res.status(404).json({ code: 404, success: false, message: '提现申请不存在或已处理' });
  const action = req.body?.action === 'approve' ? 'approve' : req.body?.action === 'reject' ? 'reject' : '';
  if (!action || (action === 'reject' && !String(req.body?.comment || '').trim())) return res.status(400).json({ code: 400, success: false, message: '审核动作或处理意见无效' });

  const wallet = walletFor(request.designerId);
  const transaction = wallet.transactions.find((item) => item.id === request.id);
  const now = new Date().toISOString();
  request.status = action === 'approve' ? 'approved' : 'rejected';
  request.reviewedAt = now;
  request.reviewerId = req.user!.id;
  request.reviewerName = req.user!.name;
  request.reviewComment = String(req.body?.comment || '').trim() || undefined;
  if (action === 'approve') {
    wallet.withdrawnAmount += request.amount;
    if (transaction) { transaction.status = 'settled'; transaction.settledAt = now; transaction.description = '客服审核通过，按提交的银行卡信息处理提现'; }
  } else {
    wallet.availableBalance += request.amount;
    if (transaction) { transaction.status = 'failed'; transaction.settledAt = now; transaction.description = `客服审核未通过，提现金额已原路退回收益钱包${request.reviewComment ? `：${request.reviewComment}` : ''}`; }
  }
  await persistDesignerWallet(wallet);
  await persistWithdrawalRequest(request);
  notifyUser(request.designerId, { type: 'system', title: action === 'approve' ? '提现审核通过' : '提现审核未通过', content: action === 'approve' ? `提现 ¥${request.amount.toFixed(2)} 已审核通过。` : `提现 ¥${request.amount.toFixed(2)} 未通过审核，金额已原路退回收益钱包。`, link: '/wallet' });
  void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'withdrawals', action: action === 'approve' ? 'approve' : 'reject', targetType: 'withdrawal', targetId: request.id, summary: `${req.user!.name}${action === 'approve' ? '通过' : '驳回'}提现申请 ¥${request.amount.toFixed(2)}`, detail: { designerId: request.designerId, comment: request.reviewComment }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 提现审核日志写入失败:', error));
  res.json({ code: 200, success: true, message: action === 'approve' ? '提现审核已通过' : '提现已驳回，金额已原路退回收益钱包', data: request, timestamp: Date.now() });
});
