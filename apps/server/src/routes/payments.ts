import { Router } from 'express';
import { authenticate, requireRoles, type AuthUserPayload } from '../middleware/auth.middleware.js';
import { designOrders } from './design-orders.js';
import { tasks } from './review-tasks.js';
import { notifyUser } from './messages.js';
import { persistDesignOrder, persistReviewTask } from '../config/persistence.js';
import { createEpayApiCheckout, expectedEpayGatewayAmount, money, verifyEpaySign } from '../services/epay.js';

export const paymentsRouter = Router();

const isOwner = (order: typeof designOrders[number], user: AuthUserPayload) =>
  user.role === 'admin' || order.creatorId === user.id || (Boolean(user.organizationId) && order.organizationId === user.organizationId);

function finishPayment(fields: Record<string, unknown>) {
  const pid = String(process.env.EPAY_PID || '').trim();
  const key = String(process.env.EPAY_KEY || '').trim();
  if (!pid || !key || String(fields.pid || '') !== pid || !verifyEpaySign(fields, String(fields.sign || ''), key)) return { ok: false as const, message: '支付签名校验失败' };

  const outTradeNo = String(fields.out_trade_no || '');
  const order = designOrders.find((item) => item.depositOutTradeNo === outTradeNo || item.balanceOutTradeNo === outTradeNo);
  if (!order) return { ok: false as const, message: '支付订单不存在' };
  if (String(fields.trade_status || '') !== 'TRADE_SUCCESS') return { ok: false as const, message: '支付尚未成功' };

  const amount = expectedEpayGatewayAmount(fields.money);
  const isDeposit = order.depositOutTradeNo === outTradeNo;
  const expected = money(isDeposit ? order.depositAmount || 0 : order.balanceAmount || 0);
  if (amount !== expected) return { ok: false as const, message: '支付金额校验失败' };
  if (isDeposit && order.paymentStatus !== 'deposit_paid' && order.paymentStatus !== 'paid') {
    order.paymentStatus = 'deposit_paid';
    order.depositTradeNo = String(fields.trade_no || '');
    order.depositPaidAt = new Date().toISOString();
    order.publicationStatus = 'pending_service_review';
    order.status = 'open';
    order.updatedAt = new Date().toISOString();
    void persistDesignOrder(order);
    notifyUser('u_rev_1', { type: 'order', title: '新的订单待审核', content: `${order.creatorName}提交了订单「${order.title}」，请完成发布审核。`, link: '/service/dashboard?tab=order_audit' });
  } else if (!isDeposit && order.paymentStatus !== 'paid') {
    order.paymentStatus = 'paid';
    order.balanceTradeNo = String(fields.trade_no || '');
    order.balancePaidAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    const task = tasks.find((item) => item.orderId === order.id || item.id === order.taskId);
    if (task?.status === 'approved' && !task.acceptedAt) {
      task.acceptedAt = order.balancePaidAt;
      task.acceptedById = order.creatorId;
      task.acceptedByName = order.creatorName;
      task.updatedAt = order.balancePaidAt;
      void persistReviewTask(task);
      notifyUser(task.designerId, { type: 'review', title: '订单已确认验收', content: `品牌方已支付尾款并确认验收「${task.productName}」，原图与源文件已开放下载。`, link: '/review-tasks' });
    }
    void persistDesignOrder(order);
  }
  return { ok: true as const, order };
}

paymentsRouter.post('/orders/:id/checkout', authenticate, requireRoles('advertiser', 'admin'), async (req, res) => {
  const order = designOrders.find((item) => item.id === req.params.id);
  if (!order || !isOwner(order, req.user!)) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
  const stage = req.body?.stage === 'balance' ? 'balance' : 'deposit';
  const paymentType = req.body?.type === 'alipay' ? 'alipay' : 'wxpay';
  if (stage === 'deposit') {
    if (order.paymentStatus === 'deposit_paid' || order.paymentStatus === 'paid') return res.status(400).json({ code: 400, success: false, message: '该订单定金已支付' });
    if (!order.depositAmount || order.depositAmount <= 0) return res.status(400).json({ code: 400, success: false, message: '订单定金金额无效' });
    order.paymentStatus = 'deposit_pending';
  } else {
    const task = tasks.find((item) => item.orderId === order.id || item.id === order.taskId);
    if (order.paymentStatus !== 'deposit_paid' || task?.status !== 'approved') return res.status(400).json({ code: 400, success: false, message: '作品通过审核且定金到账后才可支付尾款' });
    if (order.paymentStatus === 'paid') return res.status(400).json({ code: 400, success: false, message: '该订单尾款已支付' });
    if (!order.balanceAmount || order.balanceAmount <= 0) return res.status(400).json({ code: 400, success: false, message: '订单尾款金额无效' });
    order.paymentStatus = 'balance_pending';
  }

  const tradePrefix = `${stage === 'deposit' ? 'DEP' : 'BAL'}_${paymentType === 'alipay' ? 'ALI' : 'WX'}_`;
  const currentOutTradeNo = stage === 'deposit' ? order.depositOutTradeNo : order.balanceOutTradeNo;
  const outTradeNo = currentOutTradeNo?.startsWith(tradePrefix)
    ? currentOutTradeNo
    : `${tradePrefix}${order.orderNo}_${Date.now()}`;
  if (stage === 'deposit') order.depositOutTradeNo = outTradeNo;
  else order.balanceOutTradeNo = outTradeNo;
  order.updatedAt = new Date().toISOString();
  void persistDesignOrder(order);
  try {
    const amount = stage === 'deposit' ? order.depositAmount! : order.balanceAmount!;
    const checkout = await createEpayApiCheckout({ outTradeNo, name: `${stage === 'deposit' ? '定金' : '尾款'}-${order.title}`, amount, param: `${order.id}|${stage}`, type: paymentType });
    res.json({ code: 200, success: true, message: '支付二维码已生成', data: { ...checkout, outTradeNo, amount, stage, type: paymentType }, timestamp: Date.now() });
  } catch (error: any) {
    res.status(503).json({ code: 503, success: false, message: error.message || '支付服务暂不可用' });
  }
});

paymentsRouter.get('/status/:outTradeNo', authenticate, (req, res) => {
  const order = designOrders.find((item) => item.depositOutTradeNo === req.params.outTradeNo || item.balanceOutTradeNo === req.params.outTradeNo);
  if (!order || !isOwner(order, req.user!)) return res.status(404).json({ code: 404, success: false, message: '支付订单不存在' });
  res.json({ code: 200, success: true, data: { orderId: order.id, paymentStatus: order.paymentStatus, depositPaidAt: order.depositPaidAt, balancePaidAt: order.balancePaidAt }, timestamp: Date.now() });
});

const handleNotify = (req: any, res: any) => {
  try {
    const result = finishPayment({ ...(req.query || {}), ...(req.body || {}) });
    return res.status(200).send(result.ok ? 'success' : 'fail');
  } catch (error) {
    console.error('[Epay] 回调处理失败:', error);
    return res.status(200).send('fail');
  }
};

paymentsRouter.get('/epay/notify', handleNotify);
paymentsRouter.post('/epay/notify', handleNotify);
paymentsRouter.get('/epay/return', (req, res) => {
  const target = String(process.env.WEB_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
  const stage = String(req.query.out_trade_no || '').startsWith('BAL_') ? 'balance' : 'deposit';
  res.redirect(`${target}/${stage === 'balance' ? 'review-tasks' : 'advertiser/orders'}?payment=returned&out_trade_no=${encodeURIComponent(String(req.query.out_trade_no || ''))}`);
});
