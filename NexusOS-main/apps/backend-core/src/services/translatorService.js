import nexusBridge from '../../services/bridge';

export const translateEgyptianToAcademicEnglish = async (text) => {
  try {
    const response = await nexusBridge.send('translate', { text, sourceLanguage: 'egyptian', targetLanguage: 'academic_english' });
    return response.translatedText;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
};