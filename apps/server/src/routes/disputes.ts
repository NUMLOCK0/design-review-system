import { Router } from 'express';
import type { DesignOrder, OrderDispute } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { designOrders } from './design-orders.js';
import { persistDesignOrder, persistDispute } from '../config/persistence.js';
import { notifyUser } from './messages.js';

export const disputesRouter = Router();

export const disputes: OrderDispute[] = [];

function canAccessDispute(dispute: OrderDispute, user: Express.Request['user']) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'customer_service') return true;
  return dispute.initiatorId === user.id || dispute.respondentId === user.id;
}

disputesRouter.get('/', authenticate, requireRoles('advertiser', 'designer', 'customer_service', 'admin'), (req, res) => {
  const list = disputes.filter((dispute) => canAccessDispute(dispute, req.user));
  res.json({ code: 200, success: true, data: list, timestamp: Date.now() });
});

disputesRouter.post('/', authenticate, requireRoles('advertiser', 'designer'), (req, res) => {
  const order = designOrders.find((item) => item.id === req.body?.orderId) as DesignOrder | undefined;
  if (!order) return res.status(404).json({ code: 404, success: false, message: '关联订单不存在' });
  if (!req.body?.reason || !req.body?.description) {
    return res.status(400).json({ code: 400, success: false, message: '请填写纠纷原因与说明' });
  }
  if (order.disputeId && disputes.some((item) => item.id === order.disputeId && item.status !== 'resolved')) {
    return res.status(400).json({ code: 400, success: false, message: '该订单已有处理中纠纷' });
  }

  const dispute: OrderDispute = {
    id: `disp_${Date.now()}`,
    orderId: order.id,
    orderNo: order.orderNo,
    initiatorId: req.user!.id,
    initiatorName: req.user!.name,
    initiatorRole: req.user!.role as 'advertiser' | 'designer',
    respondentId: req.user!.role === 'advertiser' ? order.claimedById : order.creatorId,
    respondentName: req.user!.role === 'advertiser' ? order.claimedByName : order.creatorName,
    reason: String(req.body.reason),
    description: String(req.body.description),
    evidenceUrls: Array.isArray(req.body.evidenceUrls) ? req.body.evidenceUrls : [],
    status: 'open',
    createdAt: new Date().toISOString()
  };
  disputes.unshift(dispute);
  order.isDisputed = true;
  order.disputeId = dispute.id;
  order.updatedAt = new Date().toISOString();
  void persistDispute(dispute);
  void persistDesignOrder(order);
  notifyUser(dispute.respondentId, {
    type: 'dispute',
    title: '你有一条新的订单纠纷',
    content: `订单「${order.title}」已发起纠纷，请查看详情。`,
    link: '/service/disputes',
  });

  res.status(201).json({ code: 201, success: true, message: '纠纷已提交，结算已冻结并转入客服调解', data: dispute, timestamp: Date.now() });
});

disputesRouter.post('/:id/action', authenticate, requireRoles('customer_service', 'admin'), (req, res) => {
  const dispute = disputes.find((item) => item.id === req.params.id);
  if (!dispute) return res.status(404).json({ code: 404, success: false, message: '纠纷不存在' });
  const action = req.body?.action;
  if (!['mediation', 'resolve', 'escalate'].includes(action)) {
    return res.status(400).json({ code: 400, success: false, message: '处理动作无效' });
  }

  dispute.status = action === 'mediation' ? 'mediation' : action === 'resolve' ? 'resolved' : 'escalated';
  dispute.handlerId = req.user!.id;
  dispute.handlerName = req.user!.name;
  dispute.resolutionComment = String(req.body?.comment || '');
  dispute.updatedAt = new Date().toISOString();
  const order = designOrders.find((item) => item.id === dispute.orderId);
  if (order && dispute.status === 'resolved') {
    order.isDisputed = false;
    order.updatedAt = new Date().toISOString();
  }
  void persistDispute(dispute);
  if (order) void persistDesignOrder(order);
  for (const recipientId of new Set([dispute.initiatorId, dispute.respondentId].filter(Boolean))) {
    notifyUser(recipientId, {
      type: 'dispute',
      title: '订单纠纷状态已更新',
      content: `订单 ${dispute.orderNo} 的纠纷状态已更新为「${dispute.status}」。`,
      link: '/advertiser/disputes',
    });
  }

  res.json({ code: 200, success: true, message: dispute.status === 'resolved' ? '纠纷已结案，订单恢复结算流程' : '纠纷处理状态已更新', data: dispute, timestamp: Date.now() });
});
