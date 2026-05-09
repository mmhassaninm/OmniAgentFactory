import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enDict from './locales/en.json';
import arDict from './locales/ar.json';

// Initialize i18n
i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: enDict },
            ar: { translation: arDict }
        },
        lng: 'en', // Default language
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false // React already escapes by default
        }
    });

export default i18n;
