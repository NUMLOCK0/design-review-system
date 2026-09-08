import { Router } from 'express';
import type { DesignerWallet, WalletTransaction, WithdrawalRequest } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { notifyUser } from './messages.js';

export const walletRouter = Router();

// 内存 Mock 钱包与交易流水数据
let designerWallets: Record<string, DesignerWallet> = {
  'u_des_1': {
    designerId: 'u_des_1',
    designerName: '李设计师',
    availableBalance: 4250.00,
    pendingSettlement: 1584.00,
    totalEarned: 18600.00,
    withdrawnAmount: 14350.00,
    bankAccount: {
      bankName: '招商银行 (杭州西湖支行)',
      accountNo: '6225 **** **** 8890',
      holderName: '李**'
    },
    withdrawalRequests: [],
    transactions: [
      {
        id: 'tx_001',
        orderNo: 'ORD-20260901-01',
        taskNo: 'REV-20260901-002',
        type: 'order_income',
        amount: 1584.00,
        title: '智能降噪耳机详情页长图设计 (结算款)',
        description: '审核已通过，平台服务费 12% (扣除 ¥216)，净到手收益入账',
        status: 'pending',
        createdAt: new Date(Date.now() - 3600000 * 3).toISOString()
      },
      {
        id: 'tx_002',
        orderNo: 'ORD-20260828-09',
        taskNo: 'REV-20260828-001',
        type: 'order_income',
        amount: 680.00,
        title: '秋冬羽绒服天猫首屏主图 (5张套系)',
        description: '三级审核全票通过，款项已释放至可提现余额',
        status: 'settled',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        settledAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'tx_003',
        type: 'withdrawal',
        amount: -3000.00,
        title: '申请提现至银行卡 (尾号8890)',
        description: '银行系统转账已完成 (T+1)',
        status: 'settled',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        settledAt: new Date(Date.now() - 86400000 * 4).toISOString()
      }
    ]
  }
};

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
walletRouter.post('/withdraw', authenticate, requireRoles('designer'), (req, res) => {
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
  notifyUser('u_rev_1', { type: 'system', title: '新的提现申请待审核', content: `${req.user!.name}提交了 ¥${numAmount.toFixed(2)} 的银行卡提现申请，请审核。`, link: '/service/dashboard?tab=withdrawal_review' });

  res.json({
    code: 200,
    success: true,
    message: `提现申请已提交，¥${numAmount.toFixed(2)} 将在客服审核后处理`,
    data: publicWallet(wallet),
    timestamp: Date.now()
  });
});

walletRouter.post('/withdrawals/:id/review', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
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
  notifyUser(request.designerId, { type: 'system', title: action === 'approve' ? '提现审核通过' : '提现审核未通过', content: action === 'approve' ? `提现 ¥${request.amount.toFixed(2)} 已审核通过。` : `提现 ¥${request.amount.toFixed(2)} 未通过审核，金额已原路退回收益钱包。`, link: '/wallet' });
  res.json({ code: 200, success: true, message: action === 'approve' ? '提现审核已通过' : '提现已驳回，金额已原路退回收益钱包', data: request, timestamp: Date.now() });
});
