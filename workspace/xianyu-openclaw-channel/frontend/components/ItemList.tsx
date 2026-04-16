import React, { useEffect, useState } from 'react';
import { Item, AccountDetail } from '../types';
import { getItems, getAccountDetails, syncItemsFromAccount, updateItemAiKnowledge } from '../services/api';
import { RefreshCw, ShoppingBag, Edit, Trash2, Plus, Save, X, Eye, EyeOff, Brain } from 'lucide-react';
import { buildItemPlaceholderDataUrl } from '../utils/image';

const ItemList: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<AccountDetail[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState<Partial<Item>>({});

  const [showAiModal, setShowAiModal] = useState(false);
  const [aiKnowledgeText, setAiKnowledgeText] = useState('');

  const [addForm, setAddForm] = useState({
    cookie_id: '',
    item_id: '',
    item_title: '',
    item_price: '',
    item_image: '',
    is_multi_spec: false,
    is_multi_qty_ship: false
  });

  useEffect(() => {
    getAccountDetails().then(setAccounts);
    getItems().then(setItems);
  }, []);

  const handleSync = async () => {
      if (!selectedAccount) return alert('请先选择账号');
      setLoading(true);
      await syncItemsFromAccount(selectedAccount);
      getItems().then(setItems);
      setLoading(false);
  };

  const handleEdit = (item: Item) => {
    setSelectedItem(item);
    setEditForm({ ...item });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    try {
      const updatedItems = items.map(item =>
        item.cookie_id === selectedItem.cookie_id && item.item_id === selectedItem.item_id
          ? { ...item, ...editForm }
          : item
      );
      setItems(updatedItems);
      setShowEditModal(false);
    } catch (error) {
      console.error('更新商品失败:', error);
      alert('更新失败，请重试');
    }
  };

  const handleDelete = async (item: Item) => {
    if (confirm(`确认删除商品"${item.item_title}"吗？`)) {
      try {
        const filteredItems = items.filter(i =>
          !(i.cookie_id === item.cookie_id && i.item_id === item.item_id)
        );
        setItems(filteredItems);
      } catch (error) {
        console.error('删除商品失败:', error);
        alert('删除失败，请重试');
      }
    }
  };

  const handleAddItem = async () => {
    try {
      const newItem: Item = {
        ...addForm,
        id: Date.now().toString()
      } as Item;
      setItems([newItem, ...items]);
      setShowAddModal(false);
      setAddForm({
        cookie_id: '',
        item_id: '',
        item_title: '',
        item_price: '',
        item_image: '',
        is_multi_spec: false,
        is_multi_qty_ship: false
      });
    } catch (error) {
      console.error('添加商品失败:', error);
      alert('添加失败，请重试');
    }
  };

  
  const handleOpenAiModal = (item: Item) => {
    setSelectedItem(item);
    setAiKnowledgeText(item.ai_knowledge || '');
    setShowAiModal(true);
  };

  const handleSaveAiKnowledge = async () => {
    if (!selectedItem) return;
    try {
      await updateItemAiKnowledge(selectedItem.cookie_id, selectedItem.item_id, aiKnowledgeText);
      const updatedItems = items.map(item =>
        item.cookie_id === selectedItem.cookie_id && item.item_id === selectedItem.item_id
          ? { ...item, ai_knowledge: aiKnowledgeText }
          : item
      );
      setItems(updatedItems);
      setShowAiModal(false);
      alert('AI专属知识库保存成功！');
    } catch (error) {
      console.error('保存AI知识库失败:', error);
      alert('保存失败，请重试');
    }
  };

  const toggleMultiSpec = async (item: Item) => {
    try {
      const updatedItems = items.map(i =>
        i.cookie_id === item.cookie_id && i.item_id === item.item_id
          ? { ...i, is_multi_spec: !i.is_multi_spec }
          : i
      );
      setItems(updatedItems);
    } catch (error) {
      console.error('切换状态失败:', error);
    }
  };

  const toggleMultiQty = async (item: Item) => {
    try {
      const updatedItems = items.map(i =>
        i.cookie_id === item.cookie_id && i.item_id === item.item_id
          ? { ...i, is_multi_qty_ship: !i.is_multi_qty_ship }
          : i
      );
      setItems(updatedItems);
    } catch (error) {
      console.error('切换状态失败:', error);
    }
  };

  const getItemCardImage = (item: Item) =>
    item.item_image || buildItemPlaceholderDataUrl(item.item_title, item.item_price);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">商品管理</h2>
          <p className="text-gray-500 mt-2 text-sm">监控并管理所有账号下的鱼鱼商品。</p>
        </div>
        <div className="flex gap-3">
            <select
                className="ios-input px-4 py-3 rounded-xl text-sm"
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
            >
                <option value="">选择账号以同步</option>
                {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.nickname}</option>
                ))}
            </select>
            <button
                onClick={handleSync}
                disabled={loading || !selectedAccount}
                className="ios-btn-primary flex items-center gap-2 px-6 py-3 rounded-2xl font-bold shadow-lg shadow-yellow-200 disabled:opacity-50"
            >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                同步商品
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-5 py-3 rounded-2xl font-bold bg-gray-900 text-white hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              添加商品
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map(item => (
              <div key={`${item.cookie_id}-${item.item_id}`} className="ios-card p-4 rounded-3xl hover:shadow-lg transition-all group relative">
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      
                      <button
                        onClick={() => handleOpenAiModal(item)}
                        className="p-2 bg-white/90 backdrop-blur rounded-lg shadow-md hover:bg-purple-100 text-purple-600 transition-colors"
                        title="AI专属知识库"
                      >
                        <Brain className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(item)}

                        className="p-2 bg-white/90 backdrop-blur rounded-lg shadow-md hover:bg-[#FFE815] transition-colors"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-2 bg-white/90 backdrop-blur rounded-lg shadow-md hover:bg-red-100 text-red-500 transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                  </div>
                  <div className="aspect-square bg-gray-100 rounded-2xl mb-4 overflow-hidden relative">
                      <img
                        src={getItemCardImage(item)}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(event) => {
                          event.currentTarget.src = buildItemPlaceholderDataUrl(item.item_title, item.item_price);
                        }}
                      />
                      <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded-lg">
                          {item.item_price || '价格待补充'}
                      </div>
                  </div>
                  <h3 className="font-bold text-gray-900 line-clamp-2 text-sm mb-2 h-10">{item.item_title}</h3>
                  <div className="flex justify-between items-center text-xs text-gray-500 mb-2">
                      <span className="bg-gray-100 px-2 py-1 rounded-md truncate max-w-[100px]">ID: {item.item_id}</span>
                  </div>
                  <div className="flex gap-2">
                      <button
                        onClick={() => toggleMultiSpec(item)}
                        className={`flex-1 text-xs font-bold px-2 py-1.5 rounded-lg transition-colors ${
                          item.is_multi_spec
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        多规格
                      </button>
                      <button
                        onClick={() => toggleMultiQty(item)}
                        className={`flex-1 text-xs font-bold px-2 py-1.5 rounded-lg transition-colors ${
                          item.is_multi_qty_ship
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        多数量发货
                      </button>
                  </div>
              </div>
          ))}
          {items.length === 0 && (
             <div className="col-span-full py-20 text-center text-gray-400">
                 <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-30" />
                 暂无商品数据，请选择账号进行同步
             </div>
          )}
      </div>

      {showAiModal && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-600" />
                  AI专属知识库喂养
                </h3>
                <p className="text-xs text-gray-500 mt-1">预设用户可能会问的问题及标准回答方向</p>
              </div>
              <button onClick={() => setShowAiModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4 bg-purple-50 p-3 rounded-xl border border-purple-100 text-sm text-purple-800">
                <strong>💡 提示：</strong> 您可以在这里输入该商品的常见FAQ、底线规则、售后政策。AI在回复客户关于该商品的问题时，会严格参考这里的内容。
              </div>
              <textarea
                className="ios-input w-full h-64 p-4 rounded-2xl resize-none font-mono text-sm leading-relaxed"
                placeholder="例如：
Q：能便宜吗？
A：底价500，不能再低了，不包邮。

Q：几成新？
A：95新，屏幕无划痕，边框有一点小磕碰，已拍图。

规则：售出不退换，看好再拍。"
                value={aiKnowledgeText}
                onChange={(e) => setAiKnowledgeText(e.target.value)}
              ></textarea>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button 
                onClick={() => setShowAiModal(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSaveAiKnowledge}
                className="px-5 py-2.5 rounded-xl font-bold bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                保存知识库
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemList;
