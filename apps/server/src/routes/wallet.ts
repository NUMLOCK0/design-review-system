import { Router } from 'express';
import type { DesignerWallet, WalletTransaction } from '@design-review/shared';
import { authenticate } from '../middleware/auth.middleware.js';

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

// 1. 获取当前设计师钱包资产概览
walletRouter.get('/my-wallet', (req, res) => {
  const designerId = (req.query.designerId as string) || 'u_des_1';
  let wallet = designerWallets[designerId];

  if (!wallet) {
    wallet = {
      designerId,
      designerName: '签约设计师',
      availableBalance: 0,
      pendingSettlement: 0,
      totalEarned: 0,
      withdrawnAmount: 0,
      transactions: []
    };
    designerWallets[designerId] = wallet;
  }

  res.json({
    code: 200,
    success: true,
    data: wallet,
    timestamp: Date.now()
  });
});

// 2. 申请提现
walletRouter.post('/withdraw', (req, res) => {
  const { designerId = 'u_des_1', amount } = req.body;
  const numAmount = Number(amount);

  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ code: 400, success: false, message: '请输入有效的提现金额' });
  }

  const wallet = designerWallets[designerId];
  if (!wallet || wallet.availableBalance < numAmount) {
    return res.status(400).json({ code: 400, success: false, message: '可提现余额不足' });
  }

  wallet.availableBalance -= numAmount;
  wallet.withdrawnAmount += numAmount;

  const newTx: WalletTransaction = {
    id: `tx_${Date.now()}`,
    type: 'withdrawal',
    amount: -numAmount,
    title: '申请提现至银行卡',
    description: '系统已受理提现请求，预计 1~2 个工作日到账',
    status: 'processing',
    createdAt: new Date().toISOString()
  };

  wallet.transactions.unshift(newTx);

  res.json({
    code: 200,
    success: true,
    message: `提现申请提交成功！¥${numAmount.toFixed(2)} 将转入绑定账户`,
    data: wallet,
    timestamp: Date.now()
  });
});
