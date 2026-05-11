document.addEventListener('DOMContentLoaded', function() {
  // Handle search form submission to ensure proper locale and translation parameters
  const searchForm = document.querySelector('form[data-search-form]');
  if (searchForm) {
    searchForm.addEventListener('submit', function(e) {
      const currentLocale = document.documentElement.lang || 'ar';
      const localeInput = document.createElement('input');
      localeInput.type = 'hidden';
      localeInput.name = 'locale';
      localeInput.value = currentLocale;
      
      // Remove any existing locale input to avoid duplicates
      const existingLocaleInput = searchForm.querySelector('input[name="locale"]');
      if (existingLocaleInput) {
        existingLocaleInput.remove();
      }
      
      // Add translation filter for non-English locales
      if (currentLocale !== 'en') {
        const filterInput = document.createElement('input');
        filterInput.type = 'hidden';
        filterInput.name = 'options[filter]';
        filterInput.value = 'translated:true';
        searchForm.appendChild(filterInput);
      }
      
      searchForm.appendChild(localeInput);
    });
  }

  // Handle search results to ensure they're properly localized
  const searchResults = document.querySelectorAll('[data-search-result]');
  if (searchResults.length > 0) {
    const currentLocale = document.documentElement.lang || 'ar';
    
    searchResults.forEach(result => {
      const resultLocale = result.getAttribute('data-locale') || 'en';
      
      // Hide results that don't match the current locale
      if (resultLocale !== currentLocale) {
        result.style.display = 'none';
      }
    });
  }
});
