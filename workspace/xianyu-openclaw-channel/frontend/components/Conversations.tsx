import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Clock, Filter, MessageSquare, Package, RefreshCw, Search, User } from 'lucide-react';
import { getConversationAccounts, getConversationSessions, getConversationThread } from '../services/api';
import { AccountDetail, ConversationRecord, ConversationSession } from '../types';
import { useI18n, translate as tr } from '../lib/i18n';

const buildSessionKey = (session: Pick<ConversationSession, 'cookie_id' | 'chat_id'>) =>
  `${session.cookie_id}::${session.chat_id}`;

const getAccountLabel = (accounts: AccountDetail[], cookieId: string) => {
  const account = accounts.find((item) => item.id === cookieId);
  return account?.nickname || account?.remark || account?.username || cookieId || tr('common.unknownAccount');
};

const isMeaningfulBuyerId = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  return Boolean(normalized)
    && !['0', 'unknown', 'unknown_user', 'none', 'null'].includes(normalized)
    && normalized.length >= 6;
};

const getCounterpartRoleLabel = (session: Pick<ConversationSession, 'counterpart_role'>) =>
  session.counterpart_role === 'seller' ? tr('conversations.role.seller') : tr('conversations.role.buyer');

const getOurRoleLabel = (session: Pick<ConversationSession, 'our_role'>) =>
  session.our_role === 'buyer' ? tr('conversations.role.buyer') : tr('conversations.role.seller');

const getCounterpartName = (session: Pick<ConversationSession, 'counterpart_name' | 'buyer_name' | 'user_name' | 'user_id' | 'counterpart_role'>) => {
  const roleLabel = getCounterpartRoleLabel(session);
  const name = (session.counterpart_name || session.buyer_name || session.user_name || '').trim();
  if (name && ![tr('conversations.unknownUser'), '未知买家', '未知卖家'].includes(name)) return name;
  return isMeaningfulBuyerId(session.user_id) ? `${roleLabel} ${session.user_id}` : `未知${roleLabel}`;
};

const getCounterpartSubtitle = (session: Pick<ConversationSession, 'counterpart_name' | 'buyer_name' | 'user_name' | 'user_id' | 'chat_id' | 'counterpart_role'>) => {
  const hasName = Boolean((session.counterpart_name || session.buyer_name || session.user_name || '').trim());
  const roleLabel = getCounterpartRoleLabel(session);
  if (hasName && isMeaningfulBuyerId(session.user_id)) return `${roleLabel}ID ${session.user_id}`;
  return `会话 ${session.chat_id}`;
};

const getSceneLabel = (session: Pick<ConversationSession, 'scene_type' | 'our_role'>) => {
  if (session.scene_type === 'market_research') return tr('conversations.marketScene');
  return session.our_role === 'buyer' ? tr('conversations.buyerScene') : tr('conversations.sellerScene');
};

const formatConversationTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Conversations: React.FC = () => {
  useI18n();
  const [accounts, setAccounts] = useState<AccountDetail[]>([]);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [messages, setMessages] = useState<ConversationRecord[]>([]);
  const [selectedCookie, setSelectedCookie] = useState('');
  const [selectedSessionKey, setSelectedSessionKey] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [syncNotice, setSyncNotice] = useState('');

  useEffect(() => {
    void fetchAccounts();
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [page, selectedCookie]);

  const fetchAccounts = async () => {
    try {
      const data = await getConversationAccounts();
      setAccounts(data);
      if (!selectedCookie && data.length > 0) {
        setSelectedCookie(data[0].id);
        setPage(1);
      }
    } catch (loadError) {
      console.error('获取账号列表失败:', loadError);
      setError(loadError instanceof Error ? loadError.message : tr('conversations.loadAccountsFailed'));
    }
  };

  const fetchSessions = async (syncMode: 'auto' | 'none' | 'background' | 'force' = 'none') => {
    setLoadingSessions(true);
    setError('');
    try {
      const response = await getConversationSessions({
        page,
        page_size: 20,
        sync_mode: syncMode,
        ...(selectedCookie ? { cookie_id: selectedCookie } : {}),
      });
      setSessions(response.data || []);
      setTotal(response.total || 0);
      setTotalPages(response.total_pages || 1);
      if (syncMode === 'background') {
        setSyncNotice(
          response.sync_triggered
            ? tr('conversations.syncTriggered')
            : tr('conversations.noSyncTask'),
        );
      } else if (syncMode === 'auto' && response.total) {
        setSyncNotice('');
      }
    } catch (loadError) {
      console.error('获取聊天会话失败:', loadError);
      setSessions([]);
      setMessages([]);
      setTotal(0);
      setTotalPages(1);
      setSyncNotice('');
      setError(loadError instanceof Error ? loadError.message : tr('conversations.loadSessionsFailed'));
    } finally {
      setLoadingSessions(false);
    }
  };

  const selectedSession = useMemo(
    () => sessions.find((session) => buildSessionKey(session) === selectedSessionKey) || null,
    [sessions, selectedSessionKey],
  );

  const filteredSessions = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return sessions;
    return sessions.filter((session) =>
      [
        session.user_id,
        session.user_name,
        session.buyer_name,
        session.item_id,
        session.chat_id,
        session.latest_content,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [sessions, searchTerm]);

  useEffect(() => {
    if (!sessions.length) {
      setSelectedSessionKey('');
      setMessages([]);
      return;
    }

    const hasCurrentSelection = sessions.some((session) => buildSessionKey(session) === selectedSessionKey);
    if (!hasCurrentSelection) {
      setSelectedSessionKey(buildSessionKey(sessions[0]));
    }
  }, [sessions, selectedSessionKey]);

  useEffect(() => {
    if (!selectedSession) {
      setMessages([]);
      return;
    }
    void fetchThread(selectedSession);
  }, [selectedSessionKey, selectedSession?.cookie_id, selectedSession?.chat_id]);

  const fetchThread = async (session: ConversationSession) => {
    setLoadingMessages(true);
    setThreadError('');
    try {
      const response = await getConversationThread({
        cookie_id: session.cookie_id,
        chat_id: session.chat_id,
      });
      setMessages(response.data || []);
    } catch (loadError) {
      console.error('获取聊天详情失败:', loadError);
      setMessages([]);
      setThreadError(loadError instanceof Error ? loadError.message : tr('conversations.loadThreadFailed'));
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleRefresh = async () => {
    await fetchSessions('background');
    if (selectedSession) {
      await fetchThread(selectedSession);
    }
    window.setTimeout(() => {
      void fetchSessions('none');
      if (selectedSession) {
        void fetchThread(selectedSession);
      }
    }, 2500);
    window.setTimeout(() => {
      void fetchSessions('none');
      if (selectedSession) {
        void fetchThread(selectedSession);
      }
    }, 6000);
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{tr('conversations.title')}</h1>
        <p className="text-gray-500">{tr('conversations.subtitle')}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_160px] gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={tr('conversations.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
          </div>

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={selectedCookie}
              onChange={(e) => {
                setSelectedCookie(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent appearance-none bg-white"
            >
              <option value="">{tr('conversations.allAccounts')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nickname || account.remark || account.id}
                  {account.conversation_only ? tr('conversations.derived') : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => void handleRefresh()}
            disabled={loadingSessions || loadingMessages}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-400 text-black rounded-xl hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <RefreshCw className={`w-5 h-5 ${(loadingSessions || loadingMessages) ? 'animate-spin' : ''}`} />
            后台同步
          </button>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
          <span>共 {total} 个会话</span>
          {selectedCookie && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg">
              当前账号：{getAccountLabel(accounts, selectedCookie)}
            </span>
          )}
          {searchTerm && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg">{tr('conversations.searchingPage')}</span>}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm font-medium">
            {error}
          </div>
        )}

        {syncNotice && !error && (
          <div className="mt-4 rounded-xl bg-blue-50 text-blue-700 px-4 py-3 text-sm font-medium">
            {syncNotice}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[720px] grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-r border-gray-100 flex flex-col min-h-[720px]">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-gray-900">{tr('conversations.listTitle')}</div>
              <div className="text-sm text-gray-500">{tr('conversations.listHint')}</div>
            </div>
            <MessageSquare className="w-5 h-5 text-gray-300" />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-7 h-7 text-yellow-400 animate-spin" />
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <MessageSquare className="w-14 h-14 mb-3" />
                <p>{sessions.length ? tr('conversations.noMatch') : tr('conversations.empty')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredSessions.map((session) => {
                  const isActive = buildSessionKey(session) === selectedSessionKey;
                  const counterpartName = getCounterpartName(session);
                  const counterpartSubtitle = getCounterpartSubtitle(session);
                  const counterpartRoleLabel = getCounterpartRoleLabel(session);
                  const ourRoleLabel = getOurRoleLabel(session);
                  return (
                    <button
                      key={buildSessionKey(session)}
                      type="button"
                      onClick={() => setSelectedSessionKey(buildSessionKey(session))}
                      className={`w-full text-left px-5 py-4 transition-colors ${
                        isActive ? 'bg-yellow-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{counterpartName}</div>
                          <div className="text-xs text-gray-500 mt-1 truncate">{counterpartSubtitle}</div>
                          <div className="text-xs text-yellow-700 mt-1 truncate">账号 {getAccountLabel(accounts, session.cookie_id)}</div>
                        </div>
                        <div className="text-xs text-gray-400 shrink-0">
                          {formatConversationTime(session.last_message_at)}
                        </div>
                      </div>

                      <div className="mt-2 text-sm text-gray-700 line-clamp-2 break-all">
                        {session.latest_content || tr('conversations.noContent')}
                      </div>

                      <div className="mt-3 flex items-center flex-wrap gap-2 text-xs">
                        <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600">
                          共 {session.message_count} 条
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-600">
                          {counterpartRoleLabel} {session.user_message_count}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-yellow-100 text-yellow-800">
                          我方{ourRoleLabel} {session.assistant_message_count}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                          {getSceneLabel(session)}
                        </span>
                        {session.item_id && (
                          <span className="px-2 py-1 rounded-lg bg-purple-50 text-purple-700 truncate max-w-full">
                            商品 {session.item_id}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <span className="text-sm text-gray-600">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col min-h-[720px] bg-[#fafafa]">
          {!selectedSession ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <MessageSquare className="w-16 h-16 mb-4" />
              <p className="text-lg">{tr('conversations.selectChat')}</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-5 border-b border-gray-100 bg-white">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-gray-900">{getCounterpartName(selectedSession)}</div>
                    <div className="text-sm text-gray-500 flex flex-wrap items-center gap-3">
                      <span>会话ID：{selectedSession.chat_id}</span>
                      {isMeaningfulBuyerId(selectedSession.user_id) && <span>{getCounterpartRoleLabel(selectedSession)}ID：{selectedSession.user_id}</span>}
                      <span>账号：{getAccountLabel(accounts, selectedSession.cookie_id)}</span>
                      <span>我方身份：{getOurRoleLabel(selectedSession)}</span>
                      <span>场景：{getSceneLabel(selectedSession)}</span>
                      <span>消息数：{selectedSession.message_count}</span>
                      {selectedSession.item_id && <span>商品：{selectedSession.item_id}</span>}
                    </div>
                  </div>
                </div>
              </div>

              {threadError && (
                <div className="mx-6 mt-4 rounded-xl bg-red-50 text-red-600 px-4 py-3 text-sm font-medium">
                  {threadError}
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-20">
                    <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <MessageSquare className="w-16 h-16 mb-4" />
                    <p className="text-lg">{tr('conversations.emptyThread')}</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isAssistant = message.role === 'assistant';
                    const sessionCounterpartRole = getCounterpartRoleLabel(selectedSession);
                    const sessionOurRole = getOurRoleLabel(selectedSession);
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isAssistant ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[78%] ${isAssistant ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                          <div className={`flex items-center gap-2 text-xs text-gray-400 ${isAssistant ? 'flex-row-reverse' : ''}`}>
                            {isAssistant ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                            <span>{isAssistant ? `我方${sessionOurRole}` : `${sessionCounterpartRole}消息`}</span>
                            <span>·</span>
                            <span>{getAccountLabel(accounts, message.cookie_id)}</span>
                            <span>·</span>
                            <span>{formatConversationTime(message.created_at)}</span>
                          </div>

                          <div
                            className={`rounded-2xl px-4 py-3 shadow-sm break-words ${
                              isAssistant
                                ? 'bg-yellow-300 text-black rounded-br-md'
                                : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                            }`}
                          >
                            <div className="leading-relaxed whitespace-pre-wrap">{message.content}</div>

                            <div className={`mt-2 flex items-center flex-wrap gap-2 text-[11px] ${isAssistant ? 'text-black/60' : 'text-gray-500'}`}>
                              {message.intent && <span>意图：{message.intent}</span>}
                              {message.bargain_count > 0 && <span>议价次数：{message.bargain_count}</span>}
                            </div>
                          </div>

                          {message.item_id && (
                            <div className={`flex items-center gap-1 text-xs text-gray-400 ${isAssistant ? 'flex-row-reverse' : ''}`}>
                              <Package className="w-3.5 h-3.5" />
                              <span>{message.item_id}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-white text-sm text-gray-500 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>首次消息：{formatConversationTime(selectedSession.first_message_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  <span>最后消息：{formatConversationTime(selectedSession.last_message_at)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Conversations;
