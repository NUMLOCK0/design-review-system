// ================= 用户与权限 =================
export * from './form-config';
export * from './order-form-presets';
export * from './collaboration';
export const PLATFORM_MAP = {
    taobao: { label: '淘宝', color: '#ff5000' },
    tmall: { label: '天猫', color: '#ff0036' },
    pinduoduo: { label: '拼多多', color: '#e02e24' },
    douyin: { label: '抖音电商', color: '#222222' },
    universal: { label: '通用全网', color: '#2D8C87' },
};
export const GROUP_MAP = {
    main_1_1: { label: '主图 (1:1)', ratio: '1:1', desc: '800x800 或以上方形主图' },
    main_3_4: { label: '长图 (3:4)', ratio: '3:4', desc: '750x1000 或 800x1066 长主图' },
    main_4_3: { label: '横版主图 (4:3)', ratio: '4:3', desc: '1200x900 或以上横版主图' },
    main_16_9: { label: '横幅图 (16:9)', ratio: '16:9', desc: '1600x900 或以上横幅图' },
    main_9_16: { label: '竖版图 (9:16)', ratio: '9:16', desc: '900x1600 或以上竖版图' },
    detail: { label: '详情页 (长图)', ratio: '自适应', desc: '商详分段或整张详情图' },
};
export const TASK_STATUS_MAP = {
    draft: { label: '待交付(制作中)', variant: 'secondary', color: '#64748b' },
    pending: { label: '待初审质检', variant: 'warning', color: '#f59e0b' },
    in_review: { label: '审核会审中', variant: 'default', color: '#3b82f6' },
    needs_revision: { label: '待修改(已驳回)', variant: 'destructive', color: '#ef4444' },
    approved: { label: '终审已通过', variant: 'success', color: '#10b981' },
    returned: { label: '已退单释放', variant: 'outline', color: '#94a3b8' },
    archived: { label: '已完结归档', variant: 'outline', color: '#475569' },
};
export function calculateImageRequirementsMinimumPrice(groups, unitPrices, fallbackUnitPrice = 0) {
    const total = (Array.isArray(groups) ? groups : []).reduce((sum, group) => {
        if (!group || typeof group !== 'object')
            return sum;
        const rawCount = Array.isArray(group.imageItems) ? group.imageItems.length : Number(group.quantity);
        const imageCount = Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0;
        const configuredPrice = Number(unitPrices?.[group.groupType]);
        const fallbackPrice = Number(fallbackUnitPrice);
        const unitPrice = Number.isFinite(configuredPrice) ? configuredPrice : fallbackPrice;
        return sum + imageCount * (Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0);
    }, 0);
    return Math.round((total + Number.EPSILON) * 100) / 100;
}
export function calculateOrderMinimumBudget(groups, unitPrices, globalMinimum = 0, requiresPsd = false, psdSurchargeRate = 0, fallbackUnitPrice = 0) {
    const globalFloor = Number(globalMinimum);
    const baseMinimum = Math.max(Number.isFinite(globalFloor) ? Math.max(0, globalFloor) : 0, calculateImageRequirementsMinimumPrice(groups, unitPrices, fallbackUnitPrice));
    const rate = Number(psdSurchargeRate);
    const multiplier = requiresPsd && Number.isFinite(rate) ? 1 + Math.max(0, rate) : 1;
    return Math.round((baseMinimum * multiplier + Number.EPSILON) * 100) / 100;
}
export const EVALUATION_TAGS = {
    advertiser_to_designer: ['设计出色', '沟通顺畅', '交付及时', '修改配合', '理解有偏差', '沟通不及时', '交付延期'],
    designer_to_advertiser: ['需求清晰', '反馈及时', '沟通顺畅', '尊重专业', '需求变化频繁', '反馈不及时', '沟通困难'],
};
