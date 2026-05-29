import React from 'react';
import { useI18n, translate as tr } from '../lib/i18n';

const TestPage: React.FC = () => {
  useI18n();
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{tr('test.title')}</h1>
        <p className="text-gray-600 mb-4">{tr('test.description')}</p>
        <div className="space-y-2">
          <div className="p-4 bg-blue-100 rounded-lg text-blue-800">{tr('test.blueCard')}</div>
          <div className="p-4 bg-green-100 rounded-lg text-green-800">{tr('test.greenCard')}</div>
          <div className="p-4 bg-yellow-100 rounded-lg text-yellow-800">{tr('test.yellowCard')}</div>
        </div>
      </div>
    </div>
  );
};

export default TestPage;
