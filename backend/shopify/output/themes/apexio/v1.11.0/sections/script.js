document.addEventListener('DOMContentLoaded', function() {
  const hero = document.querySelector('.hero');
  const cta = document.querySelector('.button');
  const mediaQuery = window.matchMedia('(max-width: 768px)');
  const handleMediaQueryChange = function() {
    if (mediaQuery.matches) {
      cta.style.display = 'block';
      cta.style.position = 'relative';
      cta.style.bottom = '2rem';
    } else {
      cta.style.display = 'block';
      cta.style.position = 'relative';
      cta.style.bottom = 'unset';
    }
  };
  handleMediaQueryChange();
  mediaQuery.addEventListener('change', handleMediaQueryChange);
});