// ================= 用户与权限 =================
export type UserRole = 'advertiser' | 'designer' | 'customer_service' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: UserRole;
  /** 当前会话角色；普通用户默认同时拥有 advertiser 与 designer。 */
  roles?: UserRole[];
  organizationId?: string;
  isOrganizationAdmin?: boolean;
  department?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

// ================= 平台与图片分组 =================
export type PlatformType = 'taobao' | 'tmall' | 'pinduoduo' | 'douyin' | 'universal';

export const PLATFORM_MAP: Record<PlatformType, { label: string; color: string }> = {
  taobao: { label: '淘宝', color: '#ff5000' },
  tmall: { label: '天猫', color: '#ff0036' },
  pinduoduo: { label: '拼多多', color: '#e02e24' },
  douyin: { label: '抖音电商', color: '#222222' },
  universal: { label: '通用全网', color: '#2D8C87' },
};

export type ImageGroupType = 'main_1_1' | 'main_3_4' | 'main_4_3' | 'main_16_9' | 'main_9_16' | 'detail';

export const GROUP_MAP: Record<ImageGroupType, { label: string; ratio: string; desc: string }> = {
  main_1_1: { label: '主图 (1:1)', ratio: '1:1', desc: '800x800 或以上方形主图' },
  main_3_4: { label: '长图 (3:4)', ratio: '3:4', desc: '750x1000 或 800x1066 长主图' },
  main_4_3: { label: '横版主图 (4:3)', ratio: '4:3', desc: '1200x900 或以上横版主图' },
  main_16_9: { label: '横幅图 (16:9)', ratio: '16:9', desc: '1600x900 或以上横幅图' },
  main_9_16: { label: '竖版图 (9:16)', ratio: '9:16', desc: '900x1600 或以上竖版图' },
  detail: { label: '详情页 (长图)', ratio: '自适应', desc: '商详分段或整张详情图' },
};

// ================= 审核状态定义 =================
export type TaskStatus = 
  | 'draft'           // 1. 已接单待交付 (设计师已接单，制作与上传切图中)
  | 'pending'         // 2. 已提审待初审 (设计师提交审核，等待审核员/主管处理)
  | 'in_review'       // 3. 审核会审中   (审核员正在工作台批注打标作业)
  | 'needs_revision'  // 4. 驳回待修订   (存在违规或修改意见，退回给设计师重新修改)
  | 'approved'        // 5. 终审已通过   (全票通过，触发资金自动结算分账)
  | 'returned'        // 6. 已退回接单   (设计师主动放弃接单，订单重新释放回接单广场)
  | 'archived';       // 7. 已完结归档   (设计稿资产入库与结算完毕)

export const TASK_STATUS_MAP: Record<TaskStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; color: string }> = {
  draft: { label: '待交付(制作中)', variant: 'secondary', color: '#64748b' },
  pending: { label: '待初审质检', variant: 'warning', color: '#f59e0b' },
  in_review: { label: '审核会审中', variant: 'default', color: '#3b82f6' },
  needs_revision: { label: '待修改(已驳回)', variant: 'destructive', color: '#ef4444' },
  approved: { label: '终审已通过', variant: 'success', color: '#10b981' },
  returned: { label: '已退单释放', variant: 'outline', color: '#94a3b8' },
  archived: { label: '已完结归档', variant: 'outline', color: '#475569' },
};

export type ImageReviewStatus = 'pending' | 'approved' | 'rejected';

// ================= 标注与批注数据 =================
export type AnnotationType = 'rect' | 'circle' | 'arrow' | 'pin' | 'text';

export interface AnnotationItem {
  id: string;
  type: AnnotationType;
  x: number; // 百分比 0-100
  y: number; // 百分比 0-100
  width?: number; // 百分比
  height?: number; // 百分比
  color: string;
  comment: string;
  creatorId: string;
  creatorName: string;
  createdAt: string;
}

// ================= 规则配置 =================
export interface ReviewRuleLevel {
  id: string;
  ruleId: string;
  level: number; // 1, 2, 3
  reviewerIds: string[];
  reviewerNames: string[];
  approvalMode: 'any' | 'all';
}

export interface ReviewRule {
  id: string;
  name: string;
  organizationId?: string;
  ownerId?: string;
  ownerName?: string;
  platform: PlatformType;
  category?: string;
  rejectLimit: number;
  reviewHoursLimit: number;
  isActive: boolean;
  levels?: ReviewRuleLevel[];
  createdAt: string;
  updatedAt?: string;
}

// ================= 核心任务与图片实体 =================
export interface ReviewImage {
  id: string;
  taskId: string;
  groupId: string;
  imageUrl: string;
  originalAssetId?: string; // 无水印原图资产，仅在品牌方确认验收后可下载
  thumbnailUrl?: string;
  imageIndex: number;
  width?: number;
  height?: number;
  designDescription?: string;
  version: number;
  status: ImageReviewStatus;
  reviewerId?: string;
  reviewerName?: string;
  rejectReasons?: string[];
  rejectComment?: string;
  reviewedAt?: string;
  reviewLevel?: number;
  reviewHistory?: Array<{
    level: number;
    version?: number;
    reviewerId: string;
    reviewerName: string;
    status: 'approved' | 'rejected';
    reviewedAt: string;
    rejectReasons?: string[];
    rejectComment?: string;
  }>;
  annotations?: AnnotationItem[];
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewImageGroup {
  id: string;
  taskId: string;
  groupType: ImageGroupType;
  requiredCount: number;
  images: ReviewImage[];
}

export interface ReviewTask {
  id: string;
  taskNo: string;
  productName: string;
  sku?: string;
  platform: PlatformType;
  designerId: string;
  designerName: string;
  advertiserId?: string;
  advertiserName?: string;
  organizationId?: string;
  ruleId?: string;
  ruleName?: string;
  status: TaskStatus;
  currentLevel: number;
  totalImages: number;
  approvedCount: number;
  rejectedCount: number;
  version: number;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  sourceFileUrl?: string; // 交付的源文件包 (PSD/AI/C4D/ZIP)
  requiresPsd?: boolean; // 关联订单是否要求交付 PSD 源文件
  sourceFileName?: string;
  sourceFileSize?: string;
  orderId?: string; // 绑定的接单需求ID
  orderStatus?: string; // 关联订单当前状态
  orderBudget?: number; // 订单总预算
  designerPayout?: number; // 预计到手收益
  rejectCount?: number; // 历史被驳回总次数 (用于返修熔断)
  isDisputed?: boolean; // 是否进入客服/平台仲裁
  disputeReason?: string;
  submittedAt?: string;
  completedAt?: string;
  acceptedAt?: string;
  acceptedById?: string;
  acceptedByName?: string;
  groups?: ReviewImageGroup[];
  orderImageRequirementGroups?: OrderImageRequirementItem[];
  createdAt: string;
  updatedAt?: string;
}

// ================= 统一 API 响应格式 =================
export interface ApiResponse<T = any> {
  code: number;
  success: boolean;
  message: string;
  data: T;
  timestamp: number;
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ================= 设计接单与派单市场 (前台) =================
export type OrderStatus = 'open' | 'claimed' | 'in_progress' | 'submitted' | 'completed' | 'cancelled';
export type OrderPublicationStatus = 'draft' | 'pending_deposit' | 'pending_service_review' | 'published' | 'rejected';
export type OrderPaymentStatus = 'deposit_pending' | 'deposit_paid' | 'balance_pending' | 'paid';

export interface OrderReferenceImageItem {
  id: string;
  url: string;
  description: string; // 针对该参考图的具体要求/亮点说明 (如: "借鉴此图的金属反光排版", "参考该模特的穿搭站姿")
}

export interface OrderReferenceLinkItem {
  id: string;
  image?: string;
  link?: string;
  description?: string;
}

export interface OrderImageRequirementImageItem {
  id: string;
  materialImage?: string;
  description?: string;
  referenceImages?: string[];
  referenceImageItems?: OrderReferenceImageItem[];
  referenceLinks?: string[];
  referenceLinkItems?: OrderReferenceLinkItem[];
  referenceLinkDescription?: string;
}

export interface OrderImageRequirementItem {
  id: string;
  name: string; // 如：主图白底透气图、模特场景图、卖点拆解图、尺码长图
  groupType: ImageGroupType; // 'main_1_1' | 'main_3_4' | 'detail'
  quantity: number; // 张数
  dimensions?: string; // 800x800, 750x1000 等
  imageItems?: OrderImageRequirementImageItem[]; // 本组每张图片的独立需求
  materialImages?: string[]; // 本组需要处理的素材原图
  description?: string; // 本组整体要求
  referenceImages: string[]; // 兼容纯字符串数组
  referenceImageItems?: OrderReferenceImageItem[]; // 包含每张图片独立描述的参考图列表
  referenceLinks: string[]; // 多个外部样例链接
}

export function calculateImageRequirementsMinimumPrice(
  groups: OrderImageRequirementItem[] | undefined,
  unitPrices: Partial<Record<ImageGroupType, number>>,
  fallbackUnitPrice = 0,
) {
  const total = (Array.isArray(groups) ? groups : []).reduce((sum, group) => {
    if (!group || typeof group !== 'object') return sum;
    const rawCount = Array.isArray(group.imageItems) ? group.imageItems.length : Number(group.quantity);
    const imageCount = Number.isFinite(rawCount) ? Math.max(0, rawCount) : 0;
    const configuredPrice = Number(unitPrices?.[group.groupType]);
    const fallbackPrice = Number(fallbackUnitPrice);
    const unitPrice = Number.isFinite(configuredPrice) ? configuredPrice : fallbackPrice;
    return sum + imageCount * (Number.isFinite(unitPrice) ? Math.max(0, unitPrice) : 0);
  }, 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function calculateOrderMinimumBudget(
  groups: OrderImageRequirementItem[] | undefined,
  unitPrices: Partial<Record<ImageGroupType, number>>,
  globalMinimum = 0,
  requiresPsd = false,
  psdSurchargeRate = 0,
  fallbackUnitPrice = 0,
) {
  const globalFloor = Number(globalMinimum);
  const baseMinimum = Math.max(
    Number.isFinite(globalFloor) ? Math.max(0, globalFloor) : 0,
    calculateImageRequirementsMinimumPrice(groups, unitPrices, fallbackUnitPrice),
  );
  const rate = Number(psdSurchargeRate);
  const multiplier = requiresPsd && Number.isFinite(rate) ? 1 + Math.max(0, rate) : 1;
  return Math.round((baseMinimum * multiplier + Number.EPSILON) * 100) / 100;
}

export interface DesignOrder {
  id: string;
  orderNo: string;
  title: string;
  category: string; // 主图设计 / 详情页设计 / 活动海报 / 3D建模 / 精修合成
  platform: PlatformType;
  budget: number; // 客户支付预算 (元)
  platformCommissionRate: number; // 尾款平台抽成比例 (例如 0.15 = 15%)
  designerPayout: number; // 设计师实际到手金额：定金全额 + 尾款扣除平台服务费 (元)
  deadline: string; // 交付截止时间
  urgency: 'normal' | 'urgent' | 'super_urgent';
  requirements: string; // 需求详细说明与文案
  requiresPsd?: boolean; // 是否要求交付可编辑 PSD 源文件
  imageRequirementGroups?: OrderImageRequirementItem[]; // 多图片需求组与参考样例
  referenceImages?: string[]; // 兼容旧字段
  attachmentUrl?: string; // 附件包
  status: OrderStatus;
  publicationStatus?: OrderPublicationStatus;
  paymentStatus?: OrderPaymentStatus;
  depositRate?: number;
  depositAmount?: number;
  depositOutTradeNo?: string;
    depositTradeNo?: string;
    depositPaidAt?: string;
    depositRefundStatus?: 'pending' | 'refunded';
    depositRefundTradeNo?: string;
    depositRefundedAt?: string;
  balanceAmount?: number;
  balanceOutTradeNo?: string;
  balanceTradeNo?: string;
  balancePaidAt?: string;
  publicationReviewComment?: string;
  publicationReviewedAt?: string;
  publicationReviewerId?: string;
  publicationReviewerName?: string;
  serviceAssigneeId?: string;
  serviceAssigneeName?: string;
  serviceClaimedAt?: string;
  serviceDueAt?: string;
  servicePriority?: ServicePriority;
  creatorId: string;
  creatorName: string;
  organizationId?: string;
  reviewRuleId?: string;
  reviewRuleName?: string;
  isDisputed?: boolean;
  disputeId?: string;
  claimedById?: string;
  claimedByName?: string;
  claimedAt?: string;
  completedAt?: string;
  taskId?: string; // 关联的审核任务ID
  createdAt: string;
  updatedAt?: string;
}

// ================= 设计师邀请与推荐 =================
export type InvitationStatus = 'queued' | 'sent' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export interface DesignerProfile {
  userId: string;
  name: string;
  avatarUrl?: string;
  headline?: string;
  bio?: string;
  industries?: string[];
  yearsExperience?: number;
  publicStatus?: 'draft' | 'published' | 'hidden';
  profileCompleted?: boolean;
  categories: string[];
  platforms: PlatformType[];
  styles: string[];
  minBudget?: number;
  maxActiveOrders: number;
  availabilityStatus: 'available' | 'busy' | 'unavailable';
  portfolioUrls: string[];
  portfolios?: DesignerPortfolio[];
  activeOrderCount: number;
  qualityScore: number;
  onTimeRate: number;
  recommendationScore?: number;
  recommendationReasons?: string[];
}

export interface DesignerPortfolio {
  id: string;
  designerId: string;
  title: string;
  coverUrl: string;
  imageUrls: string[];
  category?: string;
  industry?: string;
  platform?: PlatformType;
  description?: string;
  designerRole?: string;
  tags: string[];
  sortOrder: number;
  status: 'draft' | 'published' | 'hidden';
  isFeatured: boolean;
  createdAt: string;
  updatedAt?: string;
  publishedAt?: string;
}

export interface OrderInvitation {
  id: string;
  orderId: string;
  orderNo: string;
  orderTitle: string;
  inviterId: string;
  inviterName: string;
  designerId: string;
  designerName: string;
  status: InvitationStatus;
  inviteMessage?: string;
  recommendationScore?: number;
  recommendationReasons?: string[];
  expiresAt: string;
  sentAt?: string;
  respondedAt?: string;
  createdAt: string;
}

export type DisputeStatus = 'open' | 'mediation' | 'resolved' | 'escalated';

export interface OrderDispute {
  id: string;
  orderId: string;
  orderNo: string;
  initiatorId: string;
  initiatorName: string;
  initiatorRole: 'advertiser' | 'designer';
  respondentId?: string;
  respondentName?: string;
  reason: string;
  description: string;
  evidenceUrls?: string[];
  status: DisputeStatus;
  handlerId?: string;
  handlerName?: string;
  serviceClaimedAt?: string;
  serviceDueAt?: string;
  servicePriority?: ServicePriority;
  resolutionComment?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ServicePriority = 'normal' | 'high' | 'urgent';

export type ServiceTaskType = 'order_audit' | 'dispute' | 'withdrawal_review';

export interface ServiceActionLog {
  id: string;
  taskType: ServiceTaskType;
  taskId: string;
  action: string;
  comment?: string;
  operatorId: string;
  operatorName: string;
  createdAt: string;
}

// ================= 后台操作审计日志 =================
export interface AdminAuditLog {
  id: string;
  operatorId: string;
  operatorName: string;
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  detail?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// ================= 站内信 =================
export type SiteMessageType = 'system' | 'order' | 'review' | 'dispute' | 'announcement';

export interface SiteMessage {
  id: string;
  recipientId: string;
  senderName?: string;
  type: SiteMessageType;
  title: string;
  content: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

// ================= 设计师钱包与财务结算 =================
export type TransactionType = 'order_income' | 'withdrawal' | 'commission_deduct' | 'dispute_refund';
export type TransactionStatus = 'pending' | 'settled' | 'processing' | 'failed';

export type WithdrawalStatus = 'pending_review' | 'approved' | 'rejected';

export interface WithdrawalRequest {
  id: string;
  designerId: string;
  designerName: string;
  amount: number;
  bankAccount: { bankName: string; accountNo: string; holderName: string };
  status: WithdrawalStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewComment?: string;
}

export interface WalletTransaction {
  id: string;
  orderNo?: string;
  taskNo?: string;
  type: TransactionType;
  amount: number; // 交易金额 (正数表示增加，负数表示扣除)
  title: string;
  description?: string;
  status: TransactionStatus;
  createdAt: string;
  settledAt?: string;
}

export interface DesignerWallet {
  designerId: string;
  designerName: string;
  availableBalance: number; // 可提现余额 (元)
  pendingSettlement: number; // 审核中/待结算金额 (元)
  totalEarned: number; // 累计总收入 (元)
  withdrawnAmount: number; // 已提现金额 (元)
  bankAccount?: {
    bankName: string;
    accountNo: string;
    holderName: string;
  };
  withdrawalRequests?: WithdrawalRequest[];
  transactions: WalletTransaction[];
}

// ================= 平台商业化与全局运营配置 (后台) =================
export interface CommissionTier {
  id: string;
  category: string; // 适用分类
  defaultRate: number; // 默认抽成比例 (0.00 - 1.00)
  minRate: number; // 最低保底比例
  maxRate: number; // 封顶比例
  description?: string;
}

export interface ImageTemplateGroup {
  id: string;
  name: string;
  groupType: ImageGroupType;
  quantity: number;
}

export interface ImageTemplate {
  id: string;
  name: string;
  groups: ImageTemplateGroup[];
}

export interface CustomerServiceContact {
  id: string;
  name: string;
  wechat: string;
  qrCodeUrl: string;
  enabled: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SystemConfig {
  id: string;
  platformName: string;
  defaultCommissionRate: number; // 全局默认抽成比例 15%
  urgentMarkupRate: number; // 加急单抽成浮动/溢价
  minOrderBudget: number; // 接单最低起步预算
  autoClaimTimeoutMinutes: number; // 超时未响应自动释放接单
  maxRevisionLimit: number; // 最大免费返修次数 (默认3次，超过触发熔断仲裁)
  allowDesignerBidding: boolean; // 是否允许设计师竞价/自由议价
  reviewStrictLevel: 'strict' | 'standard' | 'relaxed'; // 质检严格度
  commissionTiers: CommissionTier[]; // 各分类分级抽成
  announcement?: string; // 全局前台公告
  depositRate: number; // 发布订单时支付的定金比例（0.00 - 1.00）
    requireOrderPublicationReview: boolean; // 发布订单是否需要客服审核后上架
  imageUnitPrice: number; // 创建订单时每张图片的推荐单价（元）
  imageUnitPrices: Record<ImageGroupType, number>; // 按图片分组类型配置的最低单价（元/张）
  psdSurchargeRate: number; // 需要 PSD 源文件时最低报价上浮比例（0.2 = 20%）
  customerServiceWechat: string; // 创建订单后的客服沟通微信
  customerServiceContacts: CustomerServiceContact[];
  activeCustomerServiceId: string;
  userAgreementContent: string; // 用户协议正文
  privacyPolicyContent: string; // 隐私协议正文
  imageTemplates: ImageTemplate[]; // 创建订单时可一键添加的图片分组模板
  updatedAt: string;
}


