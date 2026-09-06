<template>
  <view class="container">
    <!-- 顶部状态栏 -->
    <view class="header-card">
      <view class="header-title">设计审核待办</view>
      <view class="header-desc">支持移动端大图预览与快速通过/驳回</view>
    </view>

    <!-- 任务列表 -->
    <view class="task-list">
      <view 
        v-for="task in taskList" 
        :key="task.id" 
        class="task-card"
        @click="goToDetail(task.id)"
      >
        <view class="card-top">
          <text class="task-no">{{ task.taskNo }}</text>
          <text class="task-status status-review">审核中</text>
        </view>

        <view class="task-title">{{ task.productName }}</view>

        <view class="card-footer">
          <text class="meta-info">设计师: {{ task.designerName }}</text>
          <text class="meta-tag">天猫 · {{ task.totalImages }} 张</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const taskList = ref([
  {
    id: 'task_001',
    taskNo: 'REV-20260905-001',
    productName: '2026秋季新款复古工装夹克外衣',
    designerName: '李设计师',
    totalImages: 3,
    status: 'in_review'
  }
]);

const goToDetail = (id: string) => {
  uni.navigateTo({
    url: `/pages/detail/detail?id=${id}`
  });
};
</script>

<style scoped>
.container {
  padding: 30rpx;
  background-color: #F4FBFA;
  min-height: 100vh;
}
.header-card {
  background: linear-gradient(135deg, #2D8C87 0%, #153A3C 100%);
  padding: 40rpx 30rpx;
  border-radius: 20rpx;
  color: #ffffff;
  margin-bottom: 30rpx;
}
.header-title {
  font-size: 36rpx;
  font-weight: bold;
}
.header-desc {
  font-size: 24rpx;
  opacity: 0.8;
  margin-top: 10rpx;
}
.task-card {
  background: #ffffff;
  border-radius: 16rpx;
  padding: 30rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(45, 140, 135, 0.08);
}
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.task-no {
  font-size: 24rpx;
  color: #64748b;
  font-family: monospace;
}
.status-review {
  font-size: 22rpx;
  color: #3b82f6;
  background: #eff6ff;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
}
.task-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 20rpx;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 24rpx;
  color: #64748b;
  border-top: 1rpx solid #f1f5f9;
  padding-top: 16rpx;
}
.meta-tag {
  color: #2D8C87;
  background: #E6F7F5;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}
</style>
