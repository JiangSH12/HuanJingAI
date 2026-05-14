-- ============================================================
-- 妙境 AI 创作平台 — 数据库初始化脚本
-- 适用于: PostgreSQL 14+ (Supabase / 自托管)
-- 执行方式: 在 Supabase SQL Editor 或 psql 中运行
-- ============================================================

-- 0. 启用必要扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. 用户资料表 (profiles)
-- 与 Supabase Auth 的 auth.users 表关联
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  nickname VARCHAR(128),
  avatar_url TEXT,
  phone VARCHAR(20),
  role VARCHAR(32) NOT NULL DEFAULT 'user',        -- guest, user, vip, enterprise_admin, enterprise_member, admin
  membership_tier VARCHAR(32) NOT NULL DEFAULT 'free', -- free, basic, pro, enterprise
  membership_expires_at TIMESTAMPTZ,
  credits_balance INTEGER NOT NULL DEFAULT 0,
  daily_quota_used INTEGER NOT NULL DEFAULT 0,
  daily_quota_limit INTEGER NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles (email);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles (role);

-- ============================================================
-- 2. 创作作品表 (works)
-- ============================================================
CREATE TABLE IF NOT EXISTS works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT auth.uid(),
  title VARCHAR(255),
  type VARCHAR(32) NOT NULL,           -- text2img, img2img, text2video, img2video
  prompt TEXT,
  negative_prompt TEXT,
  params JSONB,                         -- 生成参数 (画面比例、分辨率、模型等)
  result_url TEXT,                      -- 生成文件的 URL
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  duration NUMERIC(6, 2),              -- 视频时长 (秒)
  is_public BOOLEAN NOT NULL DEFAULT false,
  likes_count INTEGER NOT NULL DEFAULT 0,
  credits_cost INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'completed', -- pending, processing, completed, failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS works_user_id_idx ON works (user_id);
CREATE INDEX IF NOT EXISTS works_type_idx ON works (type);
CREATE INDEX IF NOT EXISTS works_is_public_idx ON works (is_public);
CREATE INDEX IF NOT EXISTS works_created_at_idx ON works (created_at);
CREATE INDEX IF NOT EXISTS works_status_idx ON works (status);

-- ============================================================
-- 3. 积分记录表 (credit_transactions)
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT auth.uid(),
  amount INTEGER NOT NULL,              -- 正数=入账, 负数=消费
  balance_after INTEGER NOT NULL,
  type VARCHAR(32) NOT NULL,            -- purchase, consume, gift, reward, refund
  description VARCHAR(500),
  related_work_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_transactions_user_id_idx ON credit_transactions (user_id);
CREATE INDEX IF NOT EXISTS credit_transactions_type_idx ON credit_transactions (type);
CREATE INDEX IF NOT EXISTS credit_transactions_created_at_idx ON credit_transactions (created_at);

-- ============================================================
-- 4. 订单表 (orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT auth.uid(),
  order_no VARCHAR(64) NOT NULL UNIQUE,
  product_type VARCHAR(32) NOT NULL,    -- membership, credits, api
  product_name VARCHAR(255) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  credits_amount INTEGER,               -- 购买的积分数
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, paid, cancelled, refunded
  payment_method VARCHAR(32),           -- wechat, alipay, stripe
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id);
CREATE INDEX IF NOT EXISTS orders_order_no_idx ON orders (order_no);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at);

-- ============================================================
-- 5. 用户自定义 API 密钥表 (user_api_keys)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT auth.uid(),
  provider VARCHAR(64) NOT NULL,        -- openai, stabilityai, runway, etc.
  api_url TEXT,                         -- 完整 API 端点 URL
  model_name VARCHAR(128),              -- 具体模型名称
  api_key_encrypted TEXT NOT NULL,       -- 加密存储的 API Key
  api_key_preview VARCHAR(20),          -- Key 尾号 (如 sk-...4f3e)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_api_keys_user_id_idx ON user_api_keys (user_id);
CREATE INDEX IF NOT EXISTS user_api_keys_provider_idx ON user_api_keys (provider);

-- ============================================================
-- 6. 作品点赞表 (work_likes)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID DEFAULT auth.uid(),
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_likes_user_id_idx ON work_likes (user_id);
CREATE INDEX IF NOT EXISTS work_likes_work_id_idx ON work_likes (work_id);

-- 唯一约束：每个用户对每个作品只能点赞一次
CREATE UNIQUE INDEX IF NOT EXISTS work_likes_user_work_uniq ON work_likes (user_id, work_id);

-- ============================================================
-- 7. 网站配置表 (site_config)
-- ============================================================
CREATE TABLE IF NOT EXISTS site_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  site_name VARCHAR(128) NOT NULL DEFAULT '妙境',
  site_tab_title VARCHAR(255) NOT NULL DEFAULT '妙境 - AI创作平台',
  logo_url TEXT,
  favicon_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- 插入默认配置
INSERT INTO site_config (id, site_name, site_tab_title)
VALUES (1, '妙境', '妙境 - AI创作平台')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. 公告表 (announcements)
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,                 -- 支持 Markdown
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS announcements_is_active_idx ON announcements (is_active);
CREATE INDEX IF NOT EXISTS announcements_expires_at_idx ON announcements (expires_at);

-- ============================================================
-- 9. 网站统计表 (site_stats)
-- ============================================================
CREATE TABLE IF NOT EXISTS site_stats (
  id INTEGER PRIMARY KEY DEFAULT 1,
  total_visits BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_stats (id, total_visits) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Row Level Security (RLS) 策略
-- ============================================================

-- 启用所有表的 RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_stats ENABLE ROW LEVEL SECURITY;

-- profiles: 用户可读自己的资料，管理员可读写所有
CREATE POLICY "profiles_read_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- works: 用户可管理自己的作品，公开作品所有人可读
CREATE POLICY "works_read_public" ON works FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "works_insert_own" ON works FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "works_update_own" ON works FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "works_delete_own" ON works FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "works_admin_all" ON works FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- credit_transactions: 用户可读自己的记录
CREATE POLICY "credit_transactions_read_own" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "credit_transactions_admin_all" ON credit_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- orders: 用户可读自己的订单
CREATE POLICY "orders_read_own" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "orders_insert_own" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "orders_admin_all" ON orders FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- user_api_keys: 用户可管理自己的密钥
CREATE POLICY "user_api_keys_read_own" ON user_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_api_keys_insert_own" ON user_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_api_keys_update_own" ON user_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_api_keys_delete_own" ON user_api_keys FOR DELETE USING (auth.uid() = user_id);

-- work_likes: 认证用户可点赞，所有人可读
CREATE POLICY "work_likes_read_all" ON work_likes FOR SELECT USING (true);
CREATE POLICY "work_likes_insert_own" ON work_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "work_likes_delete_own" ON work_likes FOR DELETE USING (auth.uid() = user_id);

-- site_config: 所有人可读，认证用户可写 (管理员操作通过 service role key)
CREATE POLICY "site_config_read_all" ON site_config FOR SELECT USING (true);
CREATE POLICY "site_config_write_auth" ON site_config FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- announcements: 所有人可读，认证用户可写 (管理员操作)
CREATE POLICY "announcements_read_all" ON announcements FOR SELECT USING (true);
CREATE POLICY "announcements_write_auth" ON announcements FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- site_stats: 公开读，认证用户可写
CREATE POLICY "site_stats_read_all" ON site_stats FOR SELECT USING (true);
CREATE POLICY "site_stats_write_auth" ON site_stats FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- Supabase Storage 桶 (通过 Supabase Dashboard 或 API 创建)
-- ============================================================
-- 需要在 Supabase Dashboard 中手动创建以下 Storage 桶:
-- 1. site-assets (公开读) — 存放网站 Logo、Favicon
-- 2. works (私有) — 存放用户生成的图片/视频文件
--
-- 或者通过 SQL (需要 service_role 权限):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('site-assets', 'site-assets', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('works', 'works', false) ON CONFLICT DO NOTHING;

-- ============================================================
-- 触发器: 自动更新 updated_at 字段
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER works_updated_at BEFORE UPDATE ON works FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_api_keys_updated_at BEFORE UPDATE ON user_api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER site_config_updated_at BEFORE UPDATE ON site_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 触发器: 新用户注册时自动创建 profile
-- (仅在使用 Supabase Auth 时生效)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, nickname, role, membership_tier, credits_balance, daily_quota_limit)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nickname', split_part(NEW.email, '@', 1)),
    'user',
    'free',
    10,  -- 新用户赠送 10 积分
    5    -- 每日配额 5 次
  );
  -- 记录注册赠送积分
  INSERT INTO credit_transactions (user_id, amount, balance_after, type, description)
  VALUES (NEW.id, 10, 10, 'gift', '新用户注册奖励');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 初始化管理员账户 (可选)
-- 请在注册管理员后，手动执行以下 SQL 将角色设为 admin:
-- UPDATE profiles SET role = 'admin' WHERE email = 'your-admin@example.com';
-- ============================================================

-- ============================================================
-- 原子递增访问量的 SQL 函数
-- ============================================================
CREATE OR REPLACE FUNCTION increment_visits()
RETURNS BIGINT AS $$
DECLARE
  new_count BIGINT;
BEGIN
  UPDATE site_stats SET total_visits = total_visits + 1, updated_at = now() WHERE id = 1
  RETURNING total_visits INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 完成
SELECT 'Database initialization completed successfully!' AS status;
