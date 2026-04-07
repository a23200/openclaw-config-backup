import React, { useState, useEffect } from 'react';
import { MessageSquare, User, Package, Clock, Search, Filter, RefreshCw } from 'lucide-react';

interface Conversation {
  id: number;
  cookie_id: string;
  chat_id: string;
  user_id: string;
  item_id: string;
  role: string;
  content: string;
  intent: string;
  bargain_count: number;
  created_at: string;
}

const Conversations: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedCookie, setSelectedCookie] = useState<string>('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAccounts();
    fetchConversations();
  }, [page, selectedCookie]);

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/accounts', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setAccounts(data.data);
      }
    } catch (error) {
      console.error('获取账号列表失败:', error);
    }
  };

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: '20'
      });
      
      if (selectedCookie) {
        params.append('cookie_id', selectedCookie);
      }

      const response = await fetch(`/api/conversations?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setConversations(data.data);
        setTotal(data.total);
        setTotalPages(data.total_pages);
      }
    } catch (error) {
      console.error('获取聊天记录失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchConversations();
  };

  const getRoleLabel = (role: string) => {
    return role === 'user' ? '买家' : '卖家';
  };

  const getRoleBadgeColor = (role: string) => {
    return role === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';
  };

  const getIntentLabel = (intent: string) => {
    const intentMap: { [key: string]: string } = {
      'bargain': '议价',
      'inquiry': '咨询',
      'purchase': '购买',
      'complaint': '投诉',
      'other': '其他'
    };
    return intentMap[intent] || intent || '未知';
  };

  const filteredConversations = conversations.filter(conv =>
    conv.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">聊天记录</h1>
        <p className="text-gray-500">查看和管理所有AI对话记录</p>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="搜索内容或买家ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
          </div>

          {/* 账号筛选 */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={selectedCookie}
              onChange={(e) => {
                setSelectedCookie(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent appearance-none bg-white"
            >
              <option value="">全部账号</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.nick || account.id}
                </option>
              ))}
            </select>
          </div>

          {/* 刷新按钮 */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-400 text-black rounded-xl hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {/* 统计信息 */}
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-600">
          <span>共 {total} 条记录</span>
          {selectedCookie && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-lg">
              已筛选
            </span>
          )}
        </div>
      </div>

      {/* 聊天记录列表 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <MessageSquare className="w-16 h-16 mb-4" />
            <p className="text-lg">暂无聊天记录</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* 角色图标 */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    conv.role === 'user' ? 'bg-blue-100' : 'bg-green-100'
                  }`}>
                    <User className={`w-5 h-5 ${
                      conv.role === 'user' ? 'text-blue-600' : 'text-green-600'
                    }`} />
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getRoleBadgeColor(conv.role)}`}>
                        {getRoleLabel(conv.role)}
                      </span>
                      {conv.intent && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">
                          {getIntentLabel(conv.intent)}
                        </span>
                      )}
                      {conv.bargain_count > 0 && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-medium">
                          议价 {conv.bargain_count} 次
                        </span>
                      )}
                    </div>

                    <p className="text-gray-900 mb-3 leading-relaxed">{conv.content}</p>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        <span>买家: {conv.user_id}</span>
                      </div>
                      {conv.item_id && (
                        <div className="flex items-center gap-1">
                          <Package className="w-4 h-4" />
                          <span>商品: {conv.item_id}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>{new Date(conv.created_at).toLocaleString('zh-CN')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversations;
