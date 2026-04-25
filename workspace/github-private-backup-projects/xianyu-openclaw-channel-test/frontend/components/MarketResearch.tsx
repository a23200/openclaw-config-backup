import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Download, ExternalLink, Loader2, RefreshCw, Search, ShieldAlert, TimerReset } from 'lucide-react';
import { contactMarketSellers, getAccountDetails, getMarketResearch, getMarketSellerContactJob, resumeMarketResearch } from '../services/api';
import { AccountDetail, MarketResearchItem, MarketResearchResponse, MarketSellerContactResponse } from '../types';
import { buildItemPlaceholderDataUrl, normalizeImageUrl } from '../utils/image';

const formatCurrency = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
};

const downloadTextFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const getMarketItemImage = (item: MarketResearchItem) =>
  normalizeImageUrl(item.main_image) || buildItemPlaceholderDataUrl(item.title, item.price_display || item.price_text);

const getQualityBadgeClass = (level?: string) => {
  if (level === 'S') return 'bg-emerald-100 text-emerald-700';
  if (level === 'A') return 'bg-green-100 text-green-700';
  if (level === 'B') return 'bg-blue-100 text-blue-700';
  if (level === 'C') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
};

const MARKET_RESEARCH_CACHE_KEY = 'yuyu:market-research:cache:v2';

const defaultResearchForm = {
  cookie_id: '',
  keyword: 'iPhone 17',
  max_pages: 3,
  include_terms: '',
  exclude_terms: '手机壳,贴膜,配件,壳',
  min_price: '',
  max_price: '',
  sort: 'price_asc' as 'price_asc' | 'price_desc' | 'want_desc' | 'latest' | 'quality_desc',
  interval_seconds: 180,
};

const defaultQualityForm = {
  min_score: 70,
  max_contact: 3,
  delay_seconds: 2,
  message_template: '你好，看到你这台${item_title}还在，请问真实成色和电池情况方便再发我确认下吗？',
};

type MarketResearchCacheShape = {
  form?: typeof defaultResearchForm;
  qualityForm?: typeof defaultQualityForm;
  result?: MarketResearchResponse | null;
  lastUpdated?: string;
  contactResult?: MarketSellerContactResponse | null;
  contactJobId?: string;
};

const normalizeCachedResearchResult = (value: MarketResearchResponse | null | undefined): MarketResearchResponse | null => {
  if (!value) return null;
  return {
    ...value,
    items: (value.items || []).map((item) => ({
      ...item,
      main_image: normalizeImageUrl(item.main_image),
    })),
  };
};

const loadMarketResearchCache = (): MarketResearchCacheShape | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MARKET_RESEARCH_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MarketResearchCacheShape;
  } catch (error) {
    console.warn('读取市场调研缓存失败', error);
    return null;
  }
};

const MarketResearch: React.FC = () => {
  const cachedState = loadMarketResearchCache();
  const [accounts, setAccounts] = useState<AccountDetail[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MarketResearchResponse | null>(() => normalizeCachedResearchResult(cachedState?.result));
  const [lastUpdated, setLastUpdated] = useState(() => cachedState?.lastUpdated || '');
  const [captchaResolved, setCaptchaResolved] = useState(false);
  const [captchaCapturedCount, setCaptchaCapturedCount] = useState(0);
  const [resuming, setResuming] = useState(false);
  const autoResumedSessionRef = useRef<string | null>(null);
  const [contacting, setContacting] = useState(false);
  const [contactResult, setContactResult] = useState<MarketSellerContactResponse | null>(() => cachedState?.contactResult || null);
  const [contactJobId, setContactJobId] = useState(() => cachedState?.contactJobId || '');
  const [form, setForm] = useState(() => ({ ...defaultResearchForm, ...(cachedState?.form || {}) }));
  const [qualityForm, setQualityForm] = useState(() => ({ ...defaultQualityForm, ...(cachedState?.qualityForm || {}) }));

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const data = await getAccountDetails();
        const enabledAccounts = data.filter((item) => item.enabled);
        setAccounts(enabledAccounts);
        const hasCurrent = enabledAccounts.some((account) => account.id === form.cookie_id);
        if ((!form.cookie_id || !hasCurrent) && enabledAccounts.length > 0) {
          setForm((prev) => ({ ...prev, cookie_id: enabledAccounts[0].id }));
        }
      } catch (loadError) {
        console.error('加载账号失败', loadError);
      } finally {
        setLoadingAccounts(false);
      }
    };
    loadAccounts();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: MarketResearchCacheShape = {
      form,
      qualityForm,
      result,
      lastUpdated,
      contactResult,
      contactJobId,
    };
    window.localStorage.setItem(MARKET_RESEARCH_CACHE_KEY, JSON.stringify(payload));
  }, [form, qualityForm, result, lastUpdated, contactResult, contactJobId]);

  useEffect(() => {
    if (!contactJobId) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const response = await getMarketSellerContactJob(contactJobId);
        if (cancelled) return;
        setContactResult(response);
        const running = response.status === 'queued' || response.status === 'running';
        setContacting(running);
        if (running) {
          timer = window.setTimeout(() => {
            void poll();
          }, 900);
        }
      } catch (pollError: any) {
        if (cancelled) return;
        console.error('查询自动沟通进度失败', pollError);
        setError((prev) => prev || pollError.message || '查询自动沟通进度失败');
        timer = window.setTimeout(() => {
          void poll();
        }, 1500);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [contactJobId]);

  const submitResearch = async (allowLocalBrowserHandoff = true) => {
    if (!form.keyword.trim()) {
      setError('请输入搜索关键词');
      return;
    }
    if (!form.cookie_id) {
      setError('请选择调研账号');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await getMarketResearch({
        cookie_id: form.cookie_id,
        keyword: form.keyword.trim(),
        max_pages: Number(form.max_pages) || 3,
        include_terms: form.include_terms.split(',').map((item) => item.trim()).filter(Boolean),
        exclude_terms: form.exclude_terms.split(',').map((item) => item.trim()).filter(Boolean),
        min_price: form.min_price ? Number(form.min_price) : undefined,
        max_price: form.max_price ? Number(form.max_price) : undefined,
        sort: form.sort,
        captcha_mode: allowLocalBrowserHandoff ? 'local_browser' : 'remote_control',
        allow_local_browser_handoff: allowLocalBrowserHandoff === true,
      });

      setResult(response);
      setContactResult(null);
      setContactJobId('');
      setContacting(false);
      setCaptchaResolved(false);
      setCaptchaCapturedCount(0);
      setLastUpdated(new Date().toLocaleString('zh-CN'));
      if (!response.ok && response.error) {
        setError(response.error);
      }
    } catch (requestError: any) {
      console.error('市场调研失败', requestError);
      setError(requestError.message || '市场调研失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoRefresh || !result) return;
    const timer = window.setInterval(() => {
      submitResearch(false);
    }, Math.max(15, Number(form.interval_seconds) || 180) * 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, result, form.interval_seconds, form.cookie_id, form.keyword, form.max_pages, form.include_terms, form.exclude_terms, form.min_price, form.max_price, form.sort]);

  useEffect(() => {
    if (!result?.captcha_required || result.captcha_info?.mode !== 'local_browser' || !result.captcha_info?.session_id) {
      setCaptchaResolved(false);
      setCaptchaCapturedCount(0);
      autoResumedSessionRef.current = null;
      return;
    }

    const sessionId = result.captcha_info.session_id;
    if (autoResumedSessionRef.current && autoResumedSessionRef.current !== sessionId) {
      autoResumedSessionRef.current = null;
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/captcha/status/${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        setCaptchaResolved(Boolean(payload?.completed));
        setCaptchaCapturedCount(Number(payload?.captured_count || 0));
      } catch (pollError) {
        console.warn('验证码状态轮询失败', pollError);
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [result?.captcha_required, result?.captcha_info?.mode, result?.captcha_info?.session_id]);

  const resumeAfterCaptcha = async () => {
    const sessionId = result?.captcha_info?.session_id;
    if (!sessionId) return;

    setResuming(true);
    setError('');
    try {
      const response = await resumeMarketResearch({
        session_id: sessionId,
        cookie_id: form.cookie_id,
        keyword: form.keyword.trim(),
        max_pages: Number(form.max_pages) || 3,
        include_terms: form.include_terms.split(',').map((item) => item.trim()).filter(Boolean),
        exclude_terms: form.exclude_terms.split(',').map((item) => item.trim()).filter(Boolean),
        min_price: form.min_price ? Number(form.min_price) : undefined,
        max_price: form.max_price ? Number(form.max_price) : undefined,
        sort: form.sort,
      });

      setResult(response);
      setLastUpdated(new Date().toLocaleString('zh-CN'));
      if (!response.ok && response.error) {
        setError(response.error);
      }
    } catch (resumeError: any) {
      console.error('恢复市场调研失败', resumeError);
      setError(resumeError.message || '恢复市场调研失败');
    } finally {
      setResuming(false);
    }
  };

  useEffect(() => {
    const sessionId = result?.captcha_required && result.captcha_info?.mode === 'local_browser'
      ? result.captcha_info.session_id
      : '';

    if (!sessionId || !captchaResolved || resuming) return;
    if (autoResumedSessionRef.current === sessionId) return;

    autoResumedSessionRef.current = sessionId;
    void resumeAfterCaptcha();
  }, [captchaResolved, resuming, result?.captcha_required, result?.captcha_info?.mode, result?.captcha_info?.session_id]);

  const summary = result?.summary;
  const topConditions = useMemo(() => summary?.condition_breakdown?.slice(0, 4) || [], [summary]);
  const topStorages = useMemo(() => summary?.storage_breakdown?.slice(0, 4) || [], [summary]);
  const qualityItems = useMemo(
    () => (result?.items || []).filter((item) => (item.quality_score || 0) >= Number(qualityForm.min_score || 0)),
    [result?.items, qualityForm.min_score],
  );
  const contactableQualityItems = useMemo(
    () => qualityItems.filter((item) => item.contact_ready && item.seller_user_id),
    [qualityItems],
  );
  const previewContactItems = useMemo(
    () => contactableQualityItems.slice(0, Math.max(1, Number(qualityForm.max_contact) || 1)),
    [contactableQualityItems, qualityForm.max_contact],
  );

  const exportJson = () => {
    if (!result) return;
    const filename = `${form.keyword.replace(/\s+/g, '_')}_market_research.json`;
    downloadTextFile(filename, JSON.stringify(result, null, 2), 'application/json;charset=utf-8');
  };

  const exportCsv = () => {
    if (!result?.items?.length) return;
    const header = ['标题', '价格文本', '价格数值', '主图', '成色', '容量', '电池健康', '想要人数', '地区', '卖家', '发布时间', '链接'];
    const rows = result.items.map((item) => [
      item.title,
      item.price_text,
      item.price_value ?? '',
      item.main_image || '',
      item.condition,
      item.storage,
      item.battery_health ?? '',
      item.want_count,
      item.area,
      item.seller_name,
      item.publish_time,
      item.item_url,
    ]);
    const csvContent = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const filename = `${form.keyword.replace(/\s+/g, '_')}_market_research.csv`;
    downloadTextFile(filename, csvContent, 'text/csv;charset=utf-8');
  };

  const contactTopQualitySellers = async () => {
    if (!previewContactItems.length) {
      setError('当前没有可自动沟通的优质商家，请先放宽筛选条件或重新调研。');
      return;
    }

    const confirmed = window.confirm(`确认自动沟通前 ${previewContactItems.length} 位优质商家吗？系统会按顺序逐个发消息。`);
    if (!confirmed) return;

    setContacting(true);
    setError('');
    try {
      const response = await contactMarketSellers({
        cookie_id: form.cookie_id,
        items: previewContactItems.map((item) => ({
          item_id: item.item_id,
          title: item.title,
          seller_name: item.seller_name,
          seller_user_id: item.seller_user_id || '',
          price_text: item.price_text,
          price_display: item.price_display,
          condition: item.condition,
          storage: item.storage,
          battery_health: item.battery_health,
          area: item.area,
          quality_score: item.quality_score,
          quality_level: item.quality_level,
          item_url: item.item_url,
        })),
        message_template: qualityForm.message_template,
        min_quality_score: qualityForm.min_score,
        max_count: qualityForm.max_contact,
        delay_seconds: qualityForm.delay_seconds,
        dry_run: false,
        async_mode: true,
      });
      setContactResult(response);
      setContactJobId(response.job_id || '');
      if (!response.ok && response.error) {
        setError(response.error);
      }
    } catch (contactError: any) {
      console.error('自动沟通失败', contactError);
      setError(contactError.message || '自动沟通失败');
      setContacting(false);
    }
  };

  const contactProgressPercent = useMemo(() => {
    const total = Number(contactResult?.total_count || contactResult?.count || 0);
    const processed = Number(contactResult?.processed_count || 0);
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
  }, [contactResult]);

  const clearCachedState = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(MARKET_RESEARCH_CACHE_KEY);
    }
    setResult(null);
    setLastUpdated('');
    setContactResult(null);
    setContactJobId('');
    setContacting(false);
    setCaptchaResolved(false);
    setCaptchaCapturedCount(0);
    setForm((prev) => ({ ...defaultResearchForm, cookie_id: prev.cookie_id || '' }));
    setQualityForm(defaultQualityForm);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">市场调研</h2>
          <p className="text-gray-500 mt-2 font-medium">实时抓取鱼鱼搜索结果，分析同行报价、成色、容量与热度。</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <BarChart3 className="w-4 h-4 text-[#F59E0B]" />
          {lastUpdated ? <span>最近更新：{lastUpdated}</span> : <span>尚未查询</span>}
        </div>
      </div>

      <div className="ios-card p-8 rounded-[2rem] space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">调研账号</label>
            <select
              value={form.cookie_id}
              onChange={(e) => setForm((prev) => ({ ...prev, cookie_id: e.target.value }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
              disabled={loadingAccounts}
            >
              <option value="">{loadingAccounts ? '加载账号中...' : '请选择账号'}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nickname || account.remark || account.id}
                </option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="block text-sm font-bold text-gray-700 mb-2">关键词</label>
            <input
              value={form.keyword}
              onChange={(e) => setForm((prev) => ({ ...prev, keyword: e.target.value }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
              placeholder="例如：iPhone 17 Pro Max"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">抓取页数</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.max_pages}
              onChange={(e) => setForm((prev) => ({ ...prev, max_pages: Number(e.target.value) || 1 }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">必须包含</label>
            <input
              value={form.include_terms}
              onChange={(e) => setForm((prev) => ({ ...prev, include_terms: e.target.value }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
              placeholder="逗号分隔，如：国行,256GB"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">排除词</label>
            <input
              value={form.exclude_terms}
              onChange={(e) => setForm((prev) => ({ ...prev, exclude_terms: e.target.value }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
              placeholder="逗号分隔，如：手机壳,贴膜"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">最低价格</label>
            <input
              type="number"
              value={form.min_price}
              onChange={(e) => setForm((prev) => ({ ...prev, min_price: e.target.value }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
              placeholder="例如：3000"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">最高价格</label>
            <input
              type="number"
              value={form.max_price}
              onChange={(e) => setForm((prev) => ({ ...prev, max_price: e.target.value }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
              placeholder="例如：9000"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">排序方式</label>
            <select
              value={form.sort}
              onChange={(e) => setForm((prev) => ({ ...prev, sort: e.target.value as any }))}
              className="ios-input px-4 py-3 rounded-xl min-w-[180px]"
            >
              <option value="price_asc">价格升序</option>
              <option value="price_desc">价格降序</option>
              <option value="want_desc">想要人数</option>
              <option value="latest">最新发布时间</option>
              <option value="quality_desc">优质商家优先</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">自动刷新间隔（秒）</label>
            <input
              type="number"
              min={15}
              value={form.interval_seconds}
              onChange={(e) => setForm((prev) => ({ ...prev, interval_seconds: Number(e.target.value) || 180 }))}
              className="ios-input px-4 py-3 rounded-xl min-w-[180px]"
            />
          </div>

          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`px-5 py-3 rounded-2xl font-bold transition-all ${autoRefresh ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            <TimerReset className="w-4 h-4 inline mr-2" />
            {autoRefresh ? '停止自动刷新' : '开启自动刷新'}
          </button>

          <button
            type="button"
            onClick={() => submitResearch(true)}
            disabled={loading}
            className="ios-btn-primary px-6 py-3 rounded-2xl font-bold flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            开始调研
          </button>

          <button type="button" onClick={exportJson} disabled={!result} className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold">
            <Download className="w-4 h-4 inline mr-2" />
            导出 JSON
          </button>
          <button type="button" onClick={exportCsv} disabled={!result?.items?.length} className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold">
            <Download className="w-4 h-4 inline mr-2" />
            导出 CSV
          </button>
          <button type="button" onClick={clearCachedState} className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold">
            清空缓存
          </button>
        </div>

        {error && (
          <div className="rounded-2xl bg-red-50 text-red-600 px-4 py-3 font-medium">
            {error}
          </div>
        )}

        {result?.captcha_required && (
          <div className="rounded-2xl bg-amber-50 text-amber-700 px-4 py-4 font-medium space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              <span>搜索触发验证码，请先完成人工验证。</span>
            </div>
            {result.captcha_info?.mode === 'local_browser' && (
              <>
                <div className="text-sm text-amber-800">
                  {result.captcha_info.browser_hint || '已切换到本机浏览器接管，请直接在浏览器窗口完成验证。'}
                </div>
                <div className="text-sm text-amber-800">
                  当前状态：{resuming ? '验证已完成，正在自动继续抓取' : captchaResolved ? '验证已完成，即将自动继续抓取' : '等待你在本机浏览器完成验证'}
                </div>
                <div className="text-sm text-amber-800">
                  已同步结果：{captchaCapturedCount} 条
                </div>
                <button
                  type="button"
                  onClick={resumeAfterCaptcha}
                  disabled={!captchaResolved || resuming}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resuming ? '恢复抓取中…' : '立即继续抓取'}
                </button>
              </>
            )}
            {result.captcha_info?.control_url && (
              <a className="text-amber-800 underline" href={result.captcha_info.control_url} target="_blank" rel="noreferrer">
                打开验证码控制页面
              </a>
            )}
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: '筛后商品数', value: summary.count },
            { label: '中位价', value: formatCurrency(summary.median_price) },
            { label: '均价', value: formatCurrency(summary.avg_price) },
            { label: '价格区间', value: `${formatCurrency(summary.min_price)} ~ ${formatCurrency(summary.max_price)}` },
            { label: '优质商家', value: summary.quality_count ?? 0 },
            { label: '可沟通商家', value: summary.contactable_count ?? 0 },
          ].map((card) => (
            <div key={card.label} className="ios-card rounded-[2rem] p-6">
              <div className="text-sm font-bold text-gray-500">{card.label}</div>
              <div className="mt-3 text-3xl font-extrabold text-gray-900 tracking-tight">{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="ios-card rounded-[2rem] p-6">
            <h3 className="text-xl font-extrabold text-gray-900 mb-4">成色分布</h3>
            <div className="space-y-3">
              {topConditions.length ? topConditions.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                  <span className="font-semibold text-gray-800">{label}</span>
                  <span className="font-bold text-black">{count} 条</span>
                </div>
              )) : <div className="text-gray-400">暂无数据</div>}
            </div>
          </div>

          <div className="ios-card rounded-[2rem] p-6">
            <h3 className="text-xl font-extrabold text-gray-900 mb-4">容量价格带</h3>
            <div className="space-y-3">
              {topStorages.length ? topStorages.map((entry) => (
                <div key={entry.storage} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                  <div>
                    <div className="font-semibold text-gray-800">{entry.storage}</div>
                    <div className="text-sm text-gray-500">{entry.count} 条样本</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-black">{formatCurrency(entry.median_price)}</div>
                    <div className="text-sm text-gray-500">均价 {formatCurrency(entry.avg_price)}</div>
                  </div>
                </div>
              )) : <div className="text-gray-400">暂无数据</div>}
            </div>
          </div>
        </div>
      )}

      <div className="ios-card rounded-[2rem] p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-gray-900">优质商家筛选与自动沟通</h3>
            <p className="text-sm text-gray-500 mt-1">按成色、价格、瑕疵、资料完整度评分，只会联系你确认后的前几位卖家。</p>
          </div>
          <div className="text-sm text-gray-500">
            当前命中 {qualityItems.length} 位，能自动沟通 {contactableQualityItems.length} 位
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">最低评分</label>
            <input
              type="number"
              min={0}
              max={100}
              value={qualityForm.min_score}
              onChange={(e) => setQualityForm((prev) => ({ ...prev, min_score: Number(e.target.value) || 0 }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">最多联系</label>
            <input
              type="number"
              min={1}
              max={10}
              value={qualityForm.max_contact}
              onChange={(e) => setQualityForm((prev) => ({ ...prev, max_contact: Number(e.target.value) || 1 }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">联系间隔（秒）</label>
            <input
              type="number"
              min={1}
              max={10}
              value={qualityForm.delay_seconds}
              onChange={(e) => setQualityForm((prev) => ({ ...prev, delay_seconds: Number(e.target.value) || 2 }))}
              className="w-full ios-input px-4 py-3 rounded-xl"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">沟通模板</label>
          <textarea
            value={qualityForm.message_template}
            onChange={(e) => setQualityForm((prev) => ({ ...prev, message_template: e.target.value }))}
            className="w-full ios-input px-4 py-3 rounded-xl min-h-[96px]"
            placeholder="支持变量：${seller_name} ${item_title} ${price} ${condition} ${storage} ${battery_health}"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={contactTopQualitySellers}
            disabled={contacting || !previewContactItems.length}
            className="ios-btn-primary px-6 py-3 rounded-2xl font-bold flex items-center gap-2 disabled:opacity-50"
          >
            {contacting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            自动沟通前 {Math.max(1, Number(qualityForm.max_contact) || 1)} 位
          </button>
          <div className="text-sm text-gray-500">
            仅联系有卖家ID且商品ID真实的结果，避免误发。
          </div>
        </div>

        {contactResult && (
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold text-gray-900">
                  发送进度：{contactResult.processed_count || 0} / {contactResult.total_count || contactResult.count || 0}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {contactResult.status === 'queued' && '任务已创建，准备开始发送'}
                  {contactResult.status === 'running' && `正在联系：${contactResult.current_seller_name || '卖家'} · ${contactResult.current_title || '商品'}`}
                  {contactResult.status === 'completed' && `已完成，成功 ${contactResult.success_count || 0} / 失败 ${contactResult.failed_count || 0}`}
                  {contactResult.status === 'failed' && (contactResult.error || '任务执行失败')}
                </div>
              </div>
              {contactResult.job_id && (
                <div className="text-xs text-gray-400">
                  任务ID：{contactResult.job_id}
                </div>
              )}
            </div>
            <div className="h-2.5 rounded-full bg-white overflow-hidden border border-gray-100">
              <div
                className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-300"
                style={{ width: `${contactProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-3 pr-4">卖家</th>
                <th className="py-3 pr-4">商品</th>
                <th className="py-3 pr-4">评分</th>
                <th className="py-3 pr-4">理由</th>
                <th className="py-3 pr-4">状态</th>
              </tr>
            </thead>
            <tbody>
              {qualityItems.slice(0, 12).map((item, index) => (
                <tr key={`${item.item_id}-${item.seller_user_id || index}`} className="border-b border-gray-50 align-top">
                  <td className="py-4 pr-4 whitespace-nowrap">
                    <div className="font-semibold text-gray-900">{item.seller_name || '匿名卖家'}</div>
                    <div className="text-xs text-gray-500">{item.area || '地区未知'}</div>
                  </td>
                  <td className="py-4 pr-4 min-w-[280px]">
                    <div className="font-medium text-gray-900 line-clamp-2">{item.title}</div>
                    <div className="text-xs text-gray-500 mt-1">{item.price_display || item.price_text} · {item.condition} · {item.storage}</div>
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${getQualityBadgeClass(item.quality_level)}`}>
                      {item.quality_level || 'D'} / {item.quality_score || 0}
                    </span>
                  </td>
                  <td className="py-4 pr-4 text-gray-600">
                    {(item.quality_reasons || []).join('，') || '暂无'}
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap">
                    {item.contact_ready ? (
                      <span className="text-green-600 font-semibold">可自动沟通</span>
                    ) : (
                      <span className="text-gray-400">{item.contact_block_reason || '暂不可联系'}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!qualityItems.length && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-400">
                    先完成调研，或把最低评分调低一些。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {contactResult && (
          <div className="rounded-2xl bg-gray-50 px-4 py-4">
            <div className="font-bold text-gray-900">
              沟通结果：成功 {contactResult.success_count || 0} / 失败 {contactResult.failed_count || 0}
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {contactResult.results.map((entry, index) => (
                <div key={`${entry.item_id}-${entry.seller_user_id}-${index}`} className="flex items-start justify-between gap-4 rounded-xl bg-white px-4 py-3 border border-gray-100">
                  <div>
                    <div className="font-semibold text-gray-900">{entry.seller_name} · {entry.title}</div>
                    <div className="text-gray-500 mt-1">{entry.message}</div>
                    {entry.chat_id && (
                      <div className="text-xs text-gray-400 mt-1">会话 {entry.chat_id}</div>
                    )}
                  </div>
                  <div className={`font-bold whitespace-nowrap ${
                    entry.status === 'sent'
                      ? 'text-green-600'
                      : entry.status === 'failed'
                        ? 'text-red-500'
                        : 'text-amber-600'
                  }`}>
                    {entry.status === 'queued' && '排队中'}
                    {entry.status === 'sending' && '发送中'}
                    {entry.status === 'sent' && '已发送'}
                    {entry.status === 'failed' && (entry.error || '失败')}
                    {!entry.status && (entry.ok ? '已发送' : entry.error || '处理中')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ios-card rounded-[2rem] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-extrabold text-gray-900">结果列表</h3>
            {result && (
              <p className="text-sm text-gray-500 mt-1">
                原始 {result.raw_count} 条 / 去重 {result.deduped_count} 条 / 筛选后 {result.filtered_count} 条
              </p>
            )}
          </div>
          <button type="button" onClick={() => submitResearch(true)} disabled={loading} className="text-sm font-bold text-gray-600 hover:text-black">
            <RefreshCw className={`w-4 h-4 inline mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-3 pr-4">标题</th>
                <th className="py-3 pr-4">价格</th>
                <th className="py-3 pr-4">成色</th>
                <th className="py-3 pr-4">容量</th>
                <th className="py-3 pr-4">电池</th>
                <th className="py-3 pr-4">想要</th>
                <th className="py-3 pr-4">地区</th>
                <th className="py-3 pr-4">时间</th>
                <th className="py-3 pr-4">评分</th>
                <th className="py-3 pr-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {(result?.items || []).map((item: MarketResearchItem, index) => (
                <tr key={`${item.item_id}-${index}`} className="border-b border-gray-50 align-top">
                  <td className="py-4 pr-4 min-w-[320px]">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 flex-shrink-0">
                        <img
                          src={getMarketItemImage(item)}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(event) => {
                            event.currentTarget.src = buildItemPlaceholderDataUrl(item.title, item.price_display || item.price_text);
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 line-clamp-2">{item.title}</div>
                        <div className="text-xs text-gray-500 mt-1">{item.seller_name || '匿名卖家'} · {item.area || '地区未知'}</div>
                        <div className="text-xs text-gray-500 mt-1">{item.defects_text || item.tags_text || '无额外标签'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-4 font-bold text-black">{item.price_display || item.price_text}</td>
                  <td className="py-4 pr-4">{item.condition}</td>
                  <td className="py-4 pr-4">{item.storage}</td>
                  <td className="py-4 pr-4">{item.battery_health ? `${item.battery_health}%` : '-'}</td>
                  <td className="py-4 pr-4">{item.want_count}</td>
                  <td className="py-4 pr-4">{item.area}</td>
                  <td className="py-4 pr-4 whitespace-nowrap">{item.publish_time || '-'}</td>
                  <td className="py-4 pr-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${getQualityBadgeClass(item.quality_level)}`}>
                      {item.quality_level || 'D'} / {item.quality_score || 0}
                    </span>
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap">
                    {item.item_url ? (
                      <a href={item.item_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 font-semibold">
                        查看
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : '-'}
                  </td>
                </tr>
              ))}
              {!loading && !(result?.items?.length) && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400">
                    还没有调研结果，输入关键词后开始搜索。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MarketResearch;
