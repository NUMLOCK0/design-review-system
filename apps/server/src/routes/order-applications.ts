import { Router } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { handleOrderApplication, listOrderApplications, submitOrderApplication } from '../services/order-applications.js';

export const orderApplicationsRouter = Router();
orderApplicationsRouter.use(['/design-orders/:orderId/applications', '/order-applications'], authenticate);
orderApplicationsRouter.get('/design-orders/:orderId/applications', requireRoles('advertiser'), async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listOrderApplications(req.user!, String(req.params.orderId)) }); }
  catch (error) { next(error); }
});
orderApplicationsRouter.post('/design-orders/:orderId/applications', requireRoles('designer'), async (req, res, next) => {
  try { res.status(201).json({ code: 200, success: true, message: '申请已提交，等待品牌方确认', data: await submitOrderApplication(String(req.params.orderId), req.user!, req.body || {}) }); }
  catch (error) { next(error); }
});
orderApplicationsRouter.get('/order-applications/mine', requireRoles('designer'), async (req, res, next) => {
  try { res.json({ code: 200, success: true, data: await listOrderApplications(req.user!) }); }
  catch (error) { next(error); }
});
orderApplicationsRouter.patch('/order-applications/:id', requireRoles('designer'), async (req, res, next) => {
  try { res.json({ code: 200, success: true, message: '申请已更新', data: await handleOrderApplication(String(req.params.id), req.user!, 'update', req.body || {}) }); }
  catch (error) { next(error); }
});
for (const action of ['withdraw', 'approve', 'reject'] as const) {
  orderApplicationsRouter.post(`/order-applications/:id/${action}`, requireRoles(action === 'withdraw' ? 'designer' : 'advertiser'), async (req, res, next) => {
    try { res.json({ code: 200, success: true, message: ({ withdraw: '申请已撤回', approve: '已确认设计师，任务已创建', reject: '申请已拒绝' })[action], data: await handleOrderApplication(String(req.params.id), req.user!, action, req.body || {}) }); }
    catch (error) { next(error); }
  });
}
