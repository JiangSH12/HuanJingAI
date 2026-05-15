/**
 * Admin Store - manages system configuration for the admin panel
 *
 * Stores: default API keys, user list, pricing, payment settings
 * Demo mode: localStorage (persisted, shared via events)
 * Production: Supabase tables (system_config, user_api_keys, etc.)
 */

import { useState, useEffect, useCallback } from 'react';

// ---- Types ----

export interface SystemApiConfig {
  id: string;
  name: string;           // Display name, e.g. "See Dream v5.0"
  apiUrl: string;          // Full endpoint URL
  modelName: string;       // Model ID to send in request
  apiKey: string;          // Server-side key (masked in UI)
  apiKeyPreview: string;   // e.g. "sk-...abc"
  type: 'image' | 'video' | 'text'; // What this API generates
  apiFormat: 'openai' | 'kling' | 'dashscope'; // API format, default 'openai'
  creditsPerUse: number;   // Credits consumed per generation
  isActive: boolean;
  sortOrder: number;
}

export interface ManagedUser {
  id: string;
  email: string;
  nickname: string;
  role: 'user' | 'vip' | 'admin' | 'enterprise_admin' | 'enterprise_member';
  membershipTier: 'free' | 'basic' | 'pro' | 'enterprise';
  creditsBalance: number;
  dailyQuotaLimit: number;
  dailyQuotaUsed: number;
  status: 'active' | 'suspended' | 'banned';
  createdAt: string;
}

export interface MembershipPlan {
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  name: string;
  price: number;        // Monthly price in CNY
  credits: number;      // Monthly included credits
  dailyQuota: number;   // Daily generation quota
  features: string[];   // Feature descriptions
}

export interface PaymentMethod {
  id: string;
  type: 'alipay' | 'wechat' | 'stripe' | 'manual';
  name: string;
  isActive: boolean;
  config: Record<string, string>; // e.g. { appId, merchantId, apiKey }
}

export interface CreditPricing {
  id: string;
  name: string;        // e.g. "100 积分包"
  credits: number;
  price: number;       // Price in CNY
  bonusCredits: number; // Bonus credits
  isPopular: boolean;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  userEmail: string;
  type: 'topup' | 'deduct' | 'set' | 'grant' | 'consume' | 'refund';
  amount: number;        // Positive = credits added, Negative = credits removed
  balanceAfter: number;  // Balance after this transaction
  reason: string;        // e.g. "管理员手动充值", "系统赠送"
  operatorId: string;    // Who made the change (admin user id or 'system')
  createdAt: string;
}

export interface AdminConfig {
  showBillingPlan: boolean;
  systemApis: SystemApiConfig[];
  users: ManagedUser[];
  membershipPlans: MembershipPlan[];
  paymentMethods: PaymentMethod[];
  creditPricings: CreditPricing[];
  creditTransactions: CreditTransaction[];
}

// ---- Default Data ----

const DEFAULT_SYSTEM_APIS: SystemApiConfig[] = [
  {
    id: 'sys-api-1',
    name: 'See Dream v5.0',
    apiUrl: '',
    modelName: 'doubao-seedream-5-0-260128',
    apiKey: '',
    apiKeyPreview: '',
    type: 'image',
    apiFormat: 'openai',
    creditsPerUse: 10,
    isActive: false,
    sortOrder: 0,
  },
  {
    id: 'sys-api-2',
    name: 'SeeDance Pro',
    apiUrl: '',
    modelName: 'doubao-seedance-1-5-pro-251215',
    apiKey: '',
    apiKeyPreview: '',
    type: 'video',
    apiFormat: 'openai',
    creditsPerUse: 30,
    isActive: false,
    sortOrder: 1,
  },
];

const DEFAULT_USERS: ManagedUser[] = [];

const DEFAULT_MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    tier: 'free',
    name: '免费版',
    price: 0,
    credits: 10,
    dailyQuota: 5,
    features: ['每日5次生成', '10初始积分', '基础模型', '720p视频'],
  },
  {
    tier: 'basic',
    name: '基础版',
    price: 29,
    credits: 100,
    dailyQuota: 20,
    features: ['每日20次生成', '每月100积分', '全部图片模型', '720p视频', '创作历史'],
  },
  {
    tier: 'pro',
    name: '专业版',
    price: 99,
    credits: 500,
    dailyQuota: 50,
    features: ['每日50次生成', '每月500积分', '全部模型', '1080p视频', '优先队列', 'API接入'],
  },
  {
    tier: 'enterprise',
    name: '企业版',
    price: 299,
    credits: 9999,
    dailyQuota: 999,
    features: ['无限次生成', '充足积分', '全部模型+优先', '4K视频', '专属客服', '自定义模型'],
  },
];

const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm-alipay', type: 'alipay', name: '支付宝', isActive: true, config: {} },
  { id: 'pm-wechat', type: 'wechat', name: '微信支付', isActive: false, config: {} },
  { id: 'pm-manual', type: 'manual', name: '手动转账', isActive: false, config: {} },
];

const DEFAULT_CREDIT_PRICINGS: CreditPricing[] = [
  { id: 'cp-100', name: '100 积分', credits: 100, price: 9.9, bonusCredits: 0, isPopular: false },
  { id: 'cp-500', name: '500 积分', credits: 500, price: 39.9, bonusCredits: 50, isPopular: true },
  { id: 'cp-1000', name: '1000 积分', credits: 1000, price: 69.9, bonusCredits: 150, isPopular: false },
  { id: 'cp-5000', name: '5000 积分', credits: 5000, price: 299, bonusCredits: 1000, isPopular: false },
];

const DEFAULT_CONFIG: AdminConfig = {
  showBillingPlan: false,
  systemApis: DEFAULT_SYSTEM_APIS,
  users: DEFAULT_USERS,
  membershipPlans: DEFAULT_MEMBERSHIP_PLANS,
  paymentMethods: DEFAULT_PAYMENT_METHODS,
  creditPricings: DEFAULT_CREDIT_PRICINGS,
  creditTransactions: [],
};

// ---- Storage ----

const STORAGE_KEY = 'miaojing_admin_config';
const EVENT_KEY = 'miaojing_admin_updated';

function getStoredConfig(): AdminConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function setStoredConfig(config: AdminConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[AdminStore] localStorage 写入失败:', e);
  }
  // 无论 localStorage 是否成功，都通知其他组件更新
  window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: config }));
}

// ---- Hook ----

export function useAdminConfig() {
  const [config, setConfig] = useState<AdminConfig>(DEFAULT_CONFIG);

  // Load from localStorage on mount (client-only)
  useEffect(() => {
    setConfig(getStoredConfig());
  }, []);

  useEffect(() => {
    const handleCustom = (e: Event) => setConfig((e as CustomEvent<AdminConfig>).detail);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setConfig(getStoredConfig());
    };
    window.addEventListener(EVENT_KEY, handleCustom);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(EVENT_KEY, handleCustom);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const update = useCallback((updater: (prev: AdminConfig) => AdminConfig) => {
    setConfig(prev => {
      const next = updater(prev);
      // Defer localStorage write and event dispatch to avoid triggering
      // event handlers during the state update cycle
      Promise.resolve().then(() => setStoredConfig(next));
      return next;
    });
  }, []);

  // ---- System API methods ----
  const addSystemApi = useCallback((api: Omit<SystemApiConfig, 'id' | 'sortOrder'>) => {
    update(prev => ({
      ...prev,
      systemApis: [...prev.systemApis, {
        ...api,
        id: `sys-api-${Date.now()}`,
        sortOrder: prev.systemApis.length,
      }],
    }));
  }, [update]);

  const updateSystemApi = useCallback((id: string, updates: Partial<SystemApiConfig>) => {
    update(prev => ({
      ...prev,
      systemApis: prev.systemApis.map(a => a.id === id ? { ...a, ...updates } : a),
    }));
  }, [update]);

  const removeSystemApi = useCallback((id: string) => {
    update(prev => ({
      ...prev,
      systemApis: prev.systemApis.filter(a => a.id !== id),
    }));
  }, [update]);

  const toggleSystemApi = useCallback((id: string) => {
    update(prev => ({
      ...prev,
      systemApis: prev.systemApis.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a),
    }));
  }, [update]);

  // ---- User management methods ----
  const addUser = useCallback((user: Omit<ManagedUser, 'id' | 'createdAt' | 'dailyQuotaUsed'>) => {
    update(prev => ({
      ...prev,
      users: [...prev.users, {
        ...user,
        id: `user-${Date.now()}`,
        dailyQuotaUsed: 0,
        createdAt: new Date().toISOString().split('T')[0],
      }],
    }));
  }, [update]);

  const updateUser = useCallback((id: string, updates: Partial<ManagedUser>) => {
    update(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === id ? { ...u, ...updates } : u),
    }));
  }, [update]);

  const removeUser = useCallback((id: string) => {
    update(prev => ({
      ...prev,
      users: prev.users.filter(u => u.id !== id),
    }));
  }, [update]);

  // ---- Membership plan methods ----
  const updateMembershipPlan = useCallback((tier: string, updates: Partial<MembershipPlan>) => {
    update(prev => ({
      ...prev,
      membershipPlans: prev.membershipPlans.map(p => p.tier === tier ? { ...p, ...updates } : p),
    }));
  }, [update]);

  // ---- Payment method methods ----
  const togglePaymentMethod = useCallback((id: string) => {
    update(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.map(p => p.id === id ? { ...p, isActive: !p.isActive } : p),
    }));
  }, [update]);

  const updatePaymentMethod = useCallback((id: string, updates: Partial<PaymentMethod>) => {
    update(prev => ({
      ...prev,
      paymentMethods: prev.paymentMethods.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  }, [update]);

  // ---- Credit pricing methods ----
  const addCreditPricing = useCallback((pricing: Omit<CreditPricing, 'id'>) => {
    update(prev => ({
      ...prev,
      creditPricings: [...prev.creditPricings, { ...pricing, id: `cp-${Date.now()}` }],
    }));
  }, [update]);

  const updateCreditPricing = useCallback((id: string, updates: Partial<CreditPricing>) => {
    update(prev => ({
      ...prev,
      creditPricings: prev.creditPricings.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  }, [update]);

  const removeCreditPricing = useCallback((id: string) => {
    update(prev => ({
      ...prev,
      creditPricings: prev.creditPricings.filter(p => p.id !== id),
    }));
  }, [update]);

  // ---- Credit adjustment methods ----
  const adjustUserCredits = useCallback((params: {
    userId: string;
    type: CreditTransaction['type'];
    amount: number;
    reason: string;
    operatorId?: string;
  }) => {
    update(prev => {
      const user = prev.users.find(u => u.id === params.userId);
      if (!user) return prev;
      const newBalance = Math.max(0, user.creditsBalance + params.amount);
      const tx: CreditTransaction = {
        id: `tx-${Date.now()}`,
        userId: params.userId,
        userEmail: user.email,
        type: params.type,
        amount: params.amount,
        balanceAfter: newBalance,
        reason: params.reason,
        operatorId: params.operatorId || 'admin',
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        users: prev.users.map(u => u.id === params.userId ? { ...u, creditsBalance: newBalance } : u),
        creditTransactions: [tx, ...prev.creditTransactions].slice(0, 500), // keep last 500
      };
    });
  }, [update]);

  const setUserCredits = useCallback((params: {
    userId: string;
    balance: number;
    reason: string;
    operatorId?: string;
  }) => {
    update(prev => {
      const user = prev.users.find(u => u.id === params.userId);
      if (!user) return prev;
      const tx: CreditTransaction = {
        id: `tx-${Date.now()}`,
        userId: params.userId,
        userEmail: user.email,
        type: 'set',
        amount: params.balance - user.creditsBalance,
        balanceAfter: params.balance,
        reason: params.reason,
        operatorId: params.operatorId || 'admin',
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        users: prev.users.map(u => u.id === params.userId ? { ...u, creditsBalance: params.balance } : u),
        creditTransactions: [tx, ...prev.creditTransactions].slice(0, 500),
      };
    });
  }, [update]);

  // ---- Feature toggle methods ----
  const setShowBillingPlan = useCallback((show: boolean) => {
    update(prev => ({ ...prev, showBillingPlan: show }));
  }, [update]);

  return {
    config,
    // System APIs
    addSystemApi,
    updateSystemApi,
    removeSystemApi,
    toggleSystemApi,
    // Users
    addUser,
    updateUser,
    removeUser,
    // Credits
    adjustUserCredits,
    setUserCredits,
    // Membership
    updateMembershipPlan,
    // Payments
    togglePaymentMethod,
    updatePaymentMethod,
    // Credits pricing
    addCreditPricing,
    updateCreditPricing,
    removeCreditPricing,
    // Feature toggles
    setShowBillingPlan,
  };
}
