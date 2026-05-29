import React from 'react';
import { Globe2 } from 'lucide-react';
import { LanguageCode, languages, useI18n } from '../lib/i18n';

const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <Globe2 className="h-4 w-4 text-gray-500" />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as LanguageCode)}
        aria-label={t('common.language')}
        title={t('common.language')}
        className="min-w-[128px] bg-transparent text-sm font-bold text-gray-700 outline-none"
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code}>
            {item.localName}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSwitcher;
