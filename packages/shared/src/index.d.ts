export * from './form-config';
export * from './order-form-presets';
export * from './collaboration';
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
export type PlatformType = 'taobao' | 'tmall' | 'pinduoduo' | 'douyin' | 'universal';
export declare const PLATFORM_MAP: Record<PlatformType, {
    label: string;
    color: string;
}>;
export type ImageGroupType = 'main_1_1' | 'main_3_4' | 'main_4_3' | 'main_16_9' | 'main_9_16' | 'detail';
export declare const GROUP_MAP: Record<ImageGroupType, {
    label: string;
    ratio: string;
    desc: string;
}>;
export type TaskStatus = 'draft' | 'pending' | 'in_review' | 'needs_revision' | 'approved' | 'returned' | 'archived';
export declare const TASK_STATUS_MAP: Record<TaskStatus, {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
    color: string;
}>;
export type ImageReviewStatus = 'pending' | 'approved' | 'rejected';
export type AnnotationType = 'rect' | 'circle' | 'arrow' | 'pin' | 'text';
export interface AnnotationItem {
    id: string;
    type: AnnotationType;
    x: number;
    y: number;
    width?: number;
    height?: number;
    color: string;
    comment: string;
    creatorId: string;
    creatorName: string;
    createdAt: string;
}
export interface ReviewRuleLevel {
    id: string;
    ruleId: string;
    level: number;
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
export interface ReviewImage {
    id: string;
    taskId: string;
    groupId: string;
    imageUrl: string;
    requirementVersionId?: string;
    originalAssetId?: string;
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
    requirementVersionId?: string;
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
    sourceFileUrl?: string;
    requiresPsd?: boolean;
    sourceFileName?: string;
    sourceFileSize?: string;
    orderId?: string;
    orderStatus?: string;
    orderBudget?: number;
    designerPayout?: number;
    rejectCount?: number;
    isDisputed?: boolean;
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
export type OrderStatus = 'open' | 'claimed' | 'in_progress' | 'submitted' | 'completed' | 'cancelled';
export type OrderPublicationStatus = 'draft' | 'pending_deposit' | 'pending_service_review' | 'published' | 'rejected';
export type OrderPaymentStatus = 'deposit_pending' | 'deposit_paid' | 'balance_pending' | 'paid';
export interface OrderReferenceImageItem {
    id: string;
    url: string;
    description: string;
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
    name: string;
    groupType: ImageGroupType;
    quantity: number;
    dimensions?: string;
    imageItems?: OrderImageRequirementImageItem[];
    materialImages?: string[];
    description?: string;
    referenceImages: string[];
    referenceImageItems?: OrderReferenceImageItem[];
    referenceLinks: string[];
}
export declare function calculateImageRequirementsMinimumPrice(groups: OrderImageRequirementItem[] | undefined, unitPrices: Partial<Record<ImageGroupType, number>>, fallbackUnitPrice?: number): number;
export declare function calculateOrderMinimumBudget(groups: OrderImageRequirementItem[] | undefined, unitPrices: Partial<Record<ImageGroupType, number>>, globalMinimum?: number, requiresPsd?: boolean, psdSurchargeRate?: number, fallbackUnitPrice?: number): number;
export interface DesignOrder {
    id: string;
    orderNo: string;
    title: string;
    category: string;
    platform: PlatformType;
    originalBudget?: number;
    acceptedApplicationId?: string;
    agreedExtraAmount?: number;
    pendingApplicationCount?: number;
    budget: number;
    platformCommissionRate: number;
    designerPayout: number;
    deadline: string;
    urgency: 'normal' | 'urgent' | 'super_urgent';
    requirements: string;
    requiresPsd?: boolean;
    imageRequirementGroups?: OrderImageRequirementItem[];
    referenceImages?: string[];
    attachmentUrl?: string;
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
    taskId?: string;
    createdAt: string;
    updatedAt?: string;
}
export type OrderApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'closed';
export interface OrderApplication {
    id: string;
    orderId: string;
    orderNo: string;
    orderTitle: string;
    designerId: string;
    designerName: string;
    invitationId?: string;
    originalBudget: number;
    extraAmount: number;
    quotedTotal: number;
    designerPayout: number;
    depositAmount: number;
    balanceAmount: number;
    message: string;
    status: OrderApplicationStatus;
    version: number;
    reviewerId?: string;
    reviewComment?: string;
    reviewedAt?: string;
    taskId?: string;
    createdAt: string;
    updatedAt: string;
    designer?: DesignerProfile & {
        portfolios: DesignerPortfolio[];
    };
}
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
    status: 'draft' | 'pending_review' | 'published' | 'hidden';
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
export type SiteMessageType = 'system' | 'order' | 'review' | 'dispute' | 'announcement';
export type EvaluationDirection = 'advertiser_to_designer' | 'designer_to_advertiser';
export declare const EVALUATION_TAGS: Record<EvaluationDirection, string[]>;
export interface OrderEvaluation {
    id: string;
    orderId: string;
    direction: EvaluationDirection;
    authorId: string;
    authorName: string;
    targetId: string;
    targetName?: string;
    category: string;
    score: number;
    tags: string[];
    comment: string;
    visibility: 'visible' | 'hidden';
    reputationEligible: boolean;
    createdAt: string;
    publishedAt?: string;
    reply?: string;
    repliedAt?: string;
}
export interface OrderEvaluationState {
    orderId: string;
    title: string;
    targetName: string;
    direction?: EvaluationDirection;
    status: 'unavailable' | 'open' | 'paused' | 'published' | 'closed';
    reason?: string;
    deadlineAt?: string;
    canSubmit: boolean;
    submitted: boolean;
    evaluations: OrderEvaluation[];
}
export interface EvaluationSummary {
    average: number | null;
    count: number;
}
export interface EvaluationReport {
    id: string;
    evaluationId: string;
    reporterName: string;
    reason: string;
    description: string;
    status: 'open' | 'resolved';
    decision?: string;
    resolution?: string;
    createdAt: string;
    evaluation: OrderEvaluation;
}
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
export type TransactionType = 'order_income' | 'withdrawal' | 'commission_deduct' | 'dispute_refund';
export type TransactionStatus = 'pending' | 'settled' | 'processing' | 'failed';
export type WithdrawalStatus = 'pending_review' | 'approved' | 'rejected';
export interface WithdrawalRequest {
    id: string;
    designerId: string;
    designerName: string;
    amount: number;
    bankAccount: {
        bankName: string;
        accountNo: string;
        holderName: string;
    };
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
    amount: number;
    title: string;
    description?: string;
    status: TransactionStatus;
    createdAt: string;
    settledAt?: string;
}
export interface DesignerWallet {
    designerId: string;
    designerName: string;
    availableBalance: number;
    pendingSettlement: number;
    totalEarned: number;
    withdrawnAmount: number;
    bankAccount?: {
        bankName: string;
        accountNo: string;
        holderName: string;
    };
    withdrawalRequests?: WithdrawalRequest[];
    transactions: WalletTransaction[];
}
export interface CommissionTier {
    id: string;
    category: string;
    defaultRate: number;
    minRate: number;
    maxRate: number;
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
    defaultCommissionRate: number;
    urgentMarkupRate: number;
    minOrderBudget: number;
    autoClaimTimeoutMinutes: number;
    maxRevisionLimit: number;
    allowDesignerBidding: boolean;
    reviewStrictLevel: 'strict' | 'standard' | 'relaxed';
    commissionTiers: CommissionTier[];
    announcement?: string;
    depositRate: number;
    requireOrderPublicationReview: boolean;
    imageUnitPrice: number;
    imageUnitPrices: Record<ImageGroupType, number>;
    psdSurchargeRate: number;
    customerServiceWechat: string;
    customerServiceContacts: CustomerServiceContact[];
    activeCustomerServiceId: string;
    userAgreementContent: string;
    privacyPolicyContent: string;
    imageTemplates: ImageTemplate[];
    updatedAt: string;
}
