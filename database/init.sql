-- =========================================================
-- Cozi Design Review System (设计稿审核管理系统)
-- 数据库初始化脚本 (PostgreSQL / Supabase / MySQL 通用参考)
-- =========================================================

-- 1. 用户与角色表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  email VARCHAR(128) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'designer', -- admin / reviewer / designer
  department VARCHAR(64),
  phone VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 审核规则配置表
CREATE TABLE IF NOT EXISTS review_rules (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  platform VARCHAR(32) NOT NULL, -- taobao / tmall / pinduoduo / douyin / universal
  category VARCHAR(64),
  reject_limit INT NOT NULL DEFAULT 3,
  review_hours_limit INT NOT NULL DEFAULT 48,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. 审核规则层级及审核人员配置
CREATE TABLE IF NOT EXISTS review_rule_levels (
  id VARCHAR(64) PRIMARY KEY,
  rule_id VARCHAR(64) NOT NULL REFERENCES review_rules(id) ON DELETE CASCADE,
  level INT NOT NULL DEFAULT 1,
  reviewer_ids JSONB,
  reviewer_names JSONB,
  approval_mode VARCHAR(20) NOT NULL DEFAULT 'any', -- any / all
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. 审核主任务表
CREATE TABLE IF NOT EXISTS review_tasks (
  id VARCHAR(64) PRIMARY KEY,
  task_no VARCHAR(64) UNIQUE NOT NULL,
  product_name VARCHAR(256) NOT NULL,
  sku VARCHAR(64),
  platform VARCHAR(32) NOT NULL,
  designer_id VARCHAR(64) NOT NULL,
  designer_name VARCHAR(64) NOT NULL,
  rule_id VARCHAR(64) REFERENCES review_rules(id),
  status VARCHAR(32) NOT NULL DEFAULT 'draft', -- draft / pending / in_review / needs_revision / approved / archived
  current_level INT NOT NULL DEFAULT 1,
  total_images INT NOT NULL DEFAULT 0,
  approved_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  urgency VARCHAR(20) NOT NULL DEFAULT 'medium',
  submitted_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. 审核图片分组表
CREATE TABLE IF NOT EXISTS review_image_groups (
  id VARCHAR(64) PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL REFERENCES review_tasks(id) ON DELETE CASCADE,
  group_type VARCHAR(32) NOT NULL, -- main_1_1 / main_3_4 / detail
  required_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. 审核图片表
CREATE TABLE IF NOT EXISTS review_images (
  id VARCHAR(64) PRIMARY KEY,
  group_id VARCHAR(64) NOT NULL REFERENCES review_image_groups(id) ON DELETE CASCADE,
  task_id VARCHAR(64) NOT NULL REFERENCES review_tasks(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  image_index INT NOT NULL DEFAULT 1,
  width INT,
  height INT,
  design_description TEXT,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending / approved / rejected
  reviewer_id VARCHAR(64),
  reviewer_name VARCHAR(64),
  reject_reasons JSONB,
  reject_comment TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_level INT DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. 图片批注与坐标打标表
CREATE TABLE IF NOT EXISTS review_annotations (
  id VARCHAR(64) PRIMARY KEY,
  image_id VARCHAR(64) NOT NULL REFERENCES review_images(id) ON DELETE CASCADE,
  task_id VARCHAR(64) NOT NULL REFERENCES review_tasks(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL DEFAULT 'rect', -- rect / circle / arrow / pin
  x NUMERIC(5, 2) NOT NULL, -- 0.00 ~ 100.00
  y NUMERIC(5, 2) NOT NULL,
  width NUMERIC(5, 2),
  height NUMERIC(5, 2),
  color VARCHAR(20) NOT NULL DEFAULT '#ef4444',
  comment TEXT NOT NULL,
  creator_id VARCHAR(64) NOT NULL,
  creator_name VARCHAR(64) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. 审核历史版本与审计记录
CREATE TABLE IF NOT EXISTS review_history (
  id VARCHAR(64) PRIMARY KEY,
  image_id VARCHAR(64) NOT NULL REFERENCES review_images(id) ON DELETE CASCADE,
  task_id VARCHAR(64) NOT NULL REFERENCES review_tasks(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  image_url TEXT NOT NULL,
  design_description TEXT,
  action VARCHAR(32) NOT NULL, -- submitted / approved / rejected
  reviewer_id VARCHAR(64),
  reviewer_name VARCHAR(64),
  reject_reasons JSONB,
  reject_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 初始化基础种子数据 (可选)
INSERT INTO users (id, name, email, role, department) VALUES
('u_admin_1', '系统管理员', 'admin@cozi.com', 'admin', '运营管理部'),
('u_rev_1', '王总监', 'reviewer@cozi.com', 'reviewer', '视觉设计部'),
('u_des_1', '李设计师', 'designer@cozi.com', 'designer', '视觉设计部')
ON CONFLICT (id) DO NOTHING;
