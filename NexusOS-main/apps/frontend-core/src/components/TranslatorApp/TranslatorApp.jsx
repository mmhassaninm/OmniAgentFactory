// Translated content will be displayed here

import { TailwindProvider } from '@nexus/tailwind-provider';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation as useI18nTranslation, t } from '../../i18n/i18n';

const TranslatorApp = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const selectedLanguage = useSelector(state => state.ui.selectedLanguage);
  const { t: translate } = useI18nTranslation(selectedLanguage, { ns: 'common' });

  return (
    <TailwindProvider>
      <div className="bg-white/10 backdrop-blur-md border-white/10 rounded-lg p-4">
        <h1 className="text-xl font-bold text-purple-600">Translate Text</h1>
        <p className="mt-2">Enter the text you want to translate:</p>
        <input
          type="text"
          placeholder={translate('placeholder')}
          className="w-full px-3 py-2 mt-2 rounded-lg border border-gray-300 focus:border-purple-500 focus:ring-purple-500" />
        <button
          onClick={() => {
            // Translate the text using our local LLM with a system prompt
            const translatedText = 'You are a professional translator. Translate this Egyptian slang to formal academic English.';
            navigate('/translated-text', { state: { text: translatedText } });
          }}
          className="mt-4 bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500">
          Translate
        </button>
      </div>
    </TailwindProvider>
  );
};

export default TranslatorApp;
