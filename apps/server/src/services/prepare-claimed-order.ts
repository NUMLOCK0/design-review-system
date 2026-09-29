import type { DesignOrder, ReviewTask } from '@design-review/shared';

export function prepareClaimedOrder(source: DesignOrder, designerId: string, designerName: string) {
  const order = structuredClone(source);
  if (order.creatorId === designerId) {
    throw new Error('不能接取自己发布的订单');
  }
  if (order.status !== 'open' || (order.publicationStatus && order.publicationStatus !== 'published')) {
    throw new Error('手慢了，该订单已被接取或已下架');
  }

  const taskId = `task_${crypto.randomUUID()}`;
  const taskNo = `REV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

  order.status = 'claimed';
  order.claimedById = designerId;
  order.claimedByName = designerName;
  order.claimedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  order.taskId = taskId;

  // 自动在审核任务中心创建关联任务草稿/待提交状态
  const createdTask: ReviewTask = {
    id: taskId,
    taskNo,
    productName: order.title,
    sku: `SKU-${order.orderNo.slice(-6)}`,
    platform: order.platform,
    designerId,
    designerName,
    advertiserId: order.creatorId,
    advertiserName: order.creatorName,
    organizationId: order.organizationId,
    ruleId: order.reviewRuleId,
    ruleName: order.reviewRuleName,
    status: 'draft',
    currentLevel: 1,
    totalImages: (order.imageRequirementGroups && order.imageRequirementGroups.length > 0)
      ? order.imageRequirementGroups.reduce((acc, g) => acc + (g.imageItems?.length || g.quantity || 1), 0)
      : (order.referenceImages?.length || 1),
    approvedCount: 0,
    rejectedCount: 0,
    rejectCount: 0,
    version: 1,
    urgency: order.urgency === 'super_urgent' ? 'urgent' : (order.urgency === 'urgent' ? 'high' : 'medium'),
    requiresPsd: Boolean(order.requiresPsd),
    orderId: order.id,
    orderBudget: order.budget,
    designerPayout: order.designerPayout,
    groups: (order.imageRequirementGroups && order.imageRequirementGroups.length > 0)
      ? order.imageRequirementGroups.map((grp, idx) => {
          const groupId = `grp_${Date.now()}_${idx}`;
          const itemSources = (grp.imageItems || [])
            .map((item) => ({ url: item.materialImage, description: item.description || grp.description || grp.name }))
            .filter((item): item is { url: string; description: string } => typeof item.url === 'string' && Boolean(item.url));
          const fallbackSources = (grp.referenceImages || []).map((url) => ({ url, description: grp.description || grp.name }));
          const sources = itemSources.length > 0 ? itemSources : fallbackSources;
          return {
            id: groupId,
            taskId,
            groupType: grp.groupType,
            requiredCount: grp.imageItems?.length || grp.quantity || 1,
            images: sources.map((source, i) => ({
              id: `img_${Date.now()}_${idx}_${i}`,
              taskId,
              groupId,
              imageUrl: source.url,
              imageIndex: i + 1,
              designDescription: source.description,
              version: 1,
              status: 'pending' as const,
              createdAt: new Date().toISOString()
            }))
          };
        })
      : [
          {
            id: `grp_${Date.now()}_0`,
            taskId,
            groupType: 'main_1_1',
            requiredCount: 1,
            images: (order.referenceImages && order.referenceImages.length > 0)
              ? order.referenceImages.map((url, i) => ({
                  id: `img_${Date.now()}_${i}`,
                  taskId,
                  groupId: `grp_${Date.now()}_0`,
                  imageUrl: url,
                  imageIndex: i + 1,
                  designDescription: '设计待交付切图',
                  version: 1,
                  status: 'pending' as const,
                  createdAt: new Date().toISOString()
                }))
              : []
          }
        ],
    createdAt: new Date().toISOString()
  };

  return { order, task: createdTask };
}
