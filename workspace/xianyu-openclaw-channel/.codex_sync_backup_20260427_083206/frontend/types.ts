
// API Response Bases
export interface ApiResponse {
  success?: boolean;
  message?: string;
  msg?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Auth
export interface LoginResponse {
  success: boolean;
  token?: string;
  message?: string;
  user_id?: number;
  username?: string;
  is_admin?: boolean;
}

// Accounts
export interface AccountDetail {
  id: string;
  value?: string; // cookie value from backend
  cookie?: string; // alias for value
  enabled: boolean;
  auto_confirm: boolean;
  remark?: string;
  note?: string; // alias for remark
  pause_duration?: number;
  // 登录信息
  username?: string;
  login_password?: string;
  show_browser?: boolean;
  // Frontend helpers
  nickname?: string;
  avatar_url?: string;
  conversation_only?: boolean;
  derived_from?: string;
  message_count?: number;
  session_count?: number;
  last_message_at?: string;
  // AI设置
  ai_enabled?: boolean;
  max_discount_percent?: number;
  max_discount_amount?: number;
  max_bargain_rounds?: number;
  custom_prompts?: string;
}

// Orders
export type OrderStatus = 
  | 'processing'      
  | 'pending_ship'    
  | 'shipped'         
  | 'completed'       
  | 'cancelled'       
  | 'refunding';

export interface Order {
  id: string;
  order_id: string;
  cookie_id: string;
  item_id: string;
  item_title?: string;
  item_image?: string;
  item_price?: string;
  buyer_id: string;
  quantity: number;
  amount: string;
  status: OrderStatus;
  receiver_name?: string;
  receiver_phone?: string;
  receiver_address?: string;
  created_at?: string;
  updated_at?: string;
}

// Cards
export interface Card {
  id: number;
  name: string;
  type: 'api' | 'text' | 'data' | 'image';
  description?: string;
  enabled: boolean;
  // 文本类型
  text_content?: string;
  // 批量数据类型
  data_content?: string;
  // API 类型配置
  api_config?: {
    url: string;
    method: 'GET' | 'POST';
    timeout?: number;
    headers?: string;
    params?: string;
  };
  // 图片类型
  image_url?: string;
  // 通用配置
  delay_seconds?: number;
  // 多规格配置
  is_multi_spec?: boolean;
  spec_name?: string;
  spec_value?: string;
  created_at: string;
  updated_at: string;
}

// Items
export interface Item {
  id: string | number;
  cookie_id: string;
  item_id: string;
  item_title?: string;
  item_price?: string;
  item_image?: string; // Inferred from common usage, though not explicitly in list model sometimes
  item_category?: string;
  ai_knowledge?: string;
  is_multi_qty_ship?: boolean;
  is_multi_spec?: number | boolean;
  created_at?: string;
}

// Rules
export interface ShippingRule {
  id: string;
  name: string;
  item_keyword: string; // Matches item title
  card_group_id: number; // ID from Card list
  card_group_name?: string; // UI helper
  priority: number;
  enabled: boolean;
}

export interface ReplyRule {
  id: string;
  keyword: string;
  reply_content: string;
  match_type: 'exact' | 'fuzzy';
  enabled: boolean;
}

// Stats
export interface AdminStats {
  total_users: number;
  total_cookies: number;
  active_cookies: number;
  total_cards: number;
  total_keywords: number;
  total_orders: number;
}

export interface OrderAnalytics {
  revenue_stats: {
    total_amount: number;
    total_orders: number;
  };
  daily_stats: Array<{ date: string; amount: number }>;
  item_stats?: Array<{
    item_id: string;
    order_count: number;
    total_amount: number;
    avg_amount: number;
  }>;
}

// Settings
export interface SystemSettings {
  ai_model?: string;
  ai_api_key?: string;
  ai_base_url?: string;
  default_reply?: string;
  registration_enabled?: boolean;
  smtp_server?: string;
  [key: string]: any;
}

export interface AIReplySettings {
  ai_enabled: boolean;
  model_name?: string;
  api_key?: string;
  base_url?: string;
  max_discount_percent: number;
  max_discount_amount?: number;
  max_bargain_rounds: number;
  custom_prompts: string;
}

// Default Reply
export interface DefaultReply {
  cookie_id: string;
  enabled: boolean;
  reply_content: string;
  reply_once: boolean;
  reply_image_url?: string;
}

export interface MarketResearchItem {
  item_id: string;
  title: string;
  price_text: string;
  price_value: number | null;
  price_display: string;
  main_image?: string;
  condition: string;
  defects: string[];
  defects_text: string;
  storage: string;
  battery_health: number | null;
  color: string;
  want_count: number;
  area: string;
  seller_name: string;
  seller_user_id?: string;
  publish_time: string;
  item_url: string;
  tags_text: string;
  quality_score?: number;
  quality_level?: string;
  quality_reasons?: string[];
  contact_ready?: boolean;
  contact_block_reason?: string;
}

export interface MarketResearchSummary {
  count: number;
  priced_count: number;
  min_price: number | null;
  p25_price: number | null;
  median_price: number | null;
  avg_price: number | null;
  p75_price: number | null;
  max_price: number | null;
  condition_breakdown: Array<[string, number]>;
  area_breakdown: Array<[string, number]>;
  storage_breakdown: Array<{
    storage: string;
    count: number;
    median_price: number;
    avg_price: number;
  }>;
  quality_count?: number;
  contactable_count?: number;
}

export interface MarketResearchResponse {
  ok: boolean;
  keyword: string;
  cookie_id: string;
  items: MarketResearchItem[];
  summary: MarketResearchSummary;
  raw_count: number;
  deduped_count: number;
  filtered_count: number;
  source?: string;
  is_real_data?: boolean;
  sort?: string;
  captcha_required?: boolean;
  error?: string;
  captcha_info?: {
    session_id?: string;
    mode?: string;
    control_url?: string;
    base_control_url?: string;
    status_url?: string;
    resume_url?: string;
    browser_name?: string;
    browser_hint?: string;
  };
}

export interface MarketSellerContactResult {
  item_id: string;
  title: string;
  seller_name: string;
  seller_user_id: string;
  quality_score: number;
  message: string;
  status?: 'queued' | 'sending' | 'sent' | 'failed';
  chat_id?: string;
  scene_type?: string;
  our_role?: string;
  counterpart_role?: string;
  ok?: boolean;
  error?: string;
}

export interface MarketSellerContactResponse {
  ok: boolean;
  job_id?: string;
  dry_run?: boolean;
  status?: 'queued' | 'running' | 'completed' | 'failed';
  count?: number;
  total_count?: number;
  processed_count?: number;
  success_count?: number;
  failed_count?: number;
  current_index?: number;
  current_seller_name?: string;
  current_title?: string;
  started_at?: string;
  finished_at?: string;
  results: MarketSellerContactResult[];
  error?: string;
}

export interface ConversationRecord {
  id: number;
  cookie_id: string;
  chat_id: string;
  user_id: string;
  user_name?: string;
  item_id: string;
  role: string;
  content: string;
  intent: string;
  bargain_count: number;
  created_at: string;
  scene_type?: string;
  our_role?: string;
  counterpart_role?: string;
  counterpart_name?: string;
  conversation_source?: string;
  item_title?: string;
  item_price?: string;
}

export interface ConversationSession {
  cookie_id: string;
  chat_id: string;
  user_id: string;
  user_name?: string;
  buyer_name?: string;
  item_id: string;
  latest_message_id: number;
  latest_role: string;
  latest_content: string;
  latest_intent: string;
  latest_bargain_count: number;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  first_message_at: string;
  last_message_at: string;
  scene_type?: string;
  our_role?: string;
  counterpart_role?: string;
  counterpart_name?: string;
  conversation_source?: string;
  item_title?: string;
  item_price?: string;
}
