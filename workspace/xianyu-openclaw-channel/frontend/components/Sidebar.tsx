import React from 'react';
import { LayoutDashboard, Users, ShoppingBag, CreditCard, Settings, LogOut, Box, Sparkles, MessageSquare, Upload, Layers, SearchCheck } from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onLogout }) => {
  const { t } = useI18n();
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: 'accounts', icon: Users, label: t('nav.accounts') },
    { id: 'orders', icon: ShoppingBag, label: t('nav.orders') },
    { id: 'conversations', icon: MessageSquare, label: t('nav.conversations') },
    { id: 'cards', icon: CreditCard, label: t('nav.cards') },
    { id: 'items', icon: Box, label: t('nav.items') },
    { id: 'publish', icon: Upload, label: t('nav.publish') },
    { id: 'batch-publish', icon: Layers, label: t('nav.batchPublish') },
    { id: 'market-research', icon: SearchCheck, label: t('nav.marketResearch') },
    { id: 'keywords', icon: Sparkles, label: t('nav.keywords') },
    { id: 'settings', icon: Settings, label: t('nav.settings') },
  ];

  return (
    <div className="w-64 h-screen fixed left-0 top-0 bg-white border-r border-gray-100 flex flex-col justify-between z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-[#FFE815] rounded-xl flex items-center justify-center shadow-lg shadow-yellow-200 transform rotate-[-3deg]">
            <span className="text-black font-extrabold text-xl">鱼</span>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">{t('common.productName')} <span className="text-xs bg-black text-[#FFE815] px-1.5 py-0.5 rounded ml-1">{t('common.pro')}</span></h1>
        </div>

        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
                  isActive 
                    ? 'bg-[#FFE815] text-black font-bold shadow-lg shadow-yellow-100 transform scale-[1.02]' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-black' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <span className="text-sm tracking-wide">{item.label}</span>
                {isActive && <Sparkles className="w-4 h-4 absolute right-3 text-black/20 animate-pulse" />}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-6 border-t border-gray-50">
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all duration-200 font-medium"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-sm">{t('nav.logout')}</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
