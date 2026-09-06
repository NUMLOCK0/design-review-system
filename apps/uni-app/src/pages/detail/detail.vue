<template>
  <view class="detail-container">
    <!-- 大图预览 -->
    <view class="preview-box">
      <image 
        src="https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=1200&auto=format&fit=crop&q=80"
        mode="aspectFit"
        class="main-image"
      />
    </view>

    <!-- 审核信息 -->
    <view class="info-section">
      <view class="title">2026秋季新款复古工装夹克外衣 (3:4)</view>
      <view class="designer-tip">设计师说明: 3:4 模特场景图，突出初秋户外工装氛围。</view>
    </view>

    <!-- 移动端审核操作底栏 -->
    <view class="bottom-bar">
      <button class="btn-reject" @click="handleReject">驳回修改</button>
      <button class="btn-approve" @click="handleApprove">审核通过</button>
    </view>
  </view>
</template>

<script setup lang="ts">
const handleApprove = () => {
  uni.showToast({
    title: '已通过审核',
    icon: 'success'
  });
};

const handleReject = () => {
  uni.showModal({
    title: '驳回设计稿',
    editable: true,
    placeholderText: '请输入修改要求说明',
    success: (res) => {
      if (res.confirm) {
        uni.showToast({
          title: '已下发驳回意见',
          icon: 'none'
        });
      }
    }
  });
};
</script>

<style scoped>
.detail-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #0f172a;
}
.preview-box {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20rpx;
}
.main-image {
  width: 100%;
  height: 100%;
}
.info-section {
  background: #1e293b;
  padding: 30rpx;
  border-top-left-radius: 24rpx;
  border-top-right-radius: 24rpx;
}
.title {
  font-size: 30rpx;
  font-weight: bold;
  color: #f8fafc;
}
.designer-tip {
  font-size: 24rpx;
  color: #94a3b8;
  margin-top: 10rpx;
}
.bottom-bar {
  display: flex;
  gap: 20rpx;
  padding: 30rpx;
  background: #1e293b;
  padding-bottom: calc(30rpx + env(safe-area-inset-bottom));
}
.btn-reject {
  flex: 1;
  background: #dc2626;
  color: #ffffff;
  font-size: 28rpx;
  border-radius: 12rpx;
}
.btn-approve {
  flex: 1;
  background: #2D8C87;
  color: #ffffff;
  font-size: 28rpx;
  border-radius: 12rpx;
}
</style>
