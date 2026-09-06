// ================= 用户与权限 =================
export type UserRole = 'admin' | 'reviewer' | 'designer';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: UserRole;
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
export type TaskStatus = 'draft' | 'pending' | 'in_review' | 'needs_revision' | 'approved' | 'archived';

export const TASK_STATUS_MAP: Record<TaskStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; color: string }> = {
  draft: { label: '草稿箱', variant: 'secondary', color: '#94a3b8' },
  pending: { label: '待审核', variant: 'warning', color: '#f59e0b' },
  in_review: { label: '审核中', variant: 'default', color: '#3b82f6' },
  needs_revision: { label: '待修改(驳回)', variant: 'destructive', color: '#ef4444' },
  approved: { label: '已通过', variant: 'success', color: '#10b981' },
  archived: { label: '已归档', variant: 'outline', color: '#64748b' },
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
  referenceImages?: string[]; // 参考图例/素材
  attachmentUrl?: string; // 附件包
  status: OrderStatus;
  creatorId: string;
  creatorName: string;
  claimedById?: string;
  claimedByName?: string;
  claimedAt?: string;
  completedAt?: string;
  taskId?: string; // 关联的审核任务ID
  createdAt: string;
  updatedAt?: string;
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


