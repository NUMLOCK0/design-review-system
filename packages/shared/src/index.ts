// ================= 用户与权限 =================
export type UserRole = 'advertiser' | 'designer' | 'customer_service' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
  organizationId?: string;
  isOrganizationAdmin?: boolean;
  department?: string;
  phone?: string;
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

export type ImageGroupType = 'main_1_1' | 'main_3_4' | 'detail';

export const GROUP_MAP: Record<ImageGroupType, { label: string; ratio: string; desc: string }> = {
  main_1_1: { label: '主图 (1:1)', ratio: '1:1', desc: '800x800 或以上方形主图' },
  main_3_4: { label: '长图 (3:4)', ratio: '3:4', desc: '750x1000 或 800x1066 长主图' },
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
  sourceFileName?: string;
  sourceFileSize?: string;
  orderId?: string; // 绑定的接单需求ID
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
export type OrderPublicationStatus = 'draft' | 'pending_service_review' | 'published' | 'rejected';

export interface OrderReferenceImageItem {
  id: string;
  url: string;
  description: string; // 针对该参考图的具体要求/亮点说明 (如: "借鉴此图的金属反光排版", "参考该模特的穿搭站姿")
}

export interface OrderImageRequirementItem {
  id: string;
  name: string; // 如：主图白底透气图、模特场景图、卖点拆解图、尺码长图
  groupType: ImageGroupType; // 'main_1_1' | 'main_3_4' | 'detail'
  quantity: number; // 张数
  dimensions?: string; // 800x800, 750x1000 等
  description?: string; // 本组整体要求
  referenceImages: string[]; // 兼容纯字符串数组
  referenceImageItems?: OrderReferenceImageItem[]; // 包含每张图片独立描述的参考图列表
  referenceLinks: string[]; // 多个外部样例链接
}

export interface DesignOrder {
  id: string;
  orderNo: string;
  title: string;
  category: string; // 主图设计 / 详情页设计 / 活动海报 / 3D建模 / 精修合成
  platform: PlatformType;
  budget: number; // 客户支付预算 (元)
  platformCommissionRate: number; // 平台抽成比例 (例如 0.15 = 15%)
  designerPayout: number; // 设计师实际到手金额 (元)
  deadline: string; // 交付截止时间
  urgency: 'normal' | 'urgent' | 'super_urgent';
  requirements: string; // 需求详细说明与文案
  imageRequirementGroups?: OrderImageRequirementItem[]; // 多图片需求组与参考样例
  referenceImages?: string[]; // 兼容旧字段
  attachmentUrl?: string; // 附件包
  status: OrderStatus;
  publicationStatus?: OrderPublicationStatus;
  publicationReviewComment?: string;
  publicationReviewedAt?: string;
  publicationReviewerId?: string;
  publicationReviewerName?: string;
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
  categories: string[];
  platforms: PlatformType[];
  styles: string[];
  minBudget?: number;
  maxActiveOrders: number;
  availabilityStatus: 'available' | 'busy' | 'unavailable';
  portfolioUrls: string[];
  activeOrderCount: number;
  qualityScore: number;
  onTimeRate: number;
  recommendationScore?: number;
  recommendationReasons?: string[];
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
  resolutionComment?: string;
  createdAt: string;
  updatedAt?: string;
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
  updatedAt: string;
}


