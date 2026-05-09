import React, { useEffect } from 'react';
import CortexAI from './components/CortexAI/CortexAI.jsx';
import './index.css';

function App() {
  // Apply persisted chat font size before first paint
  useEffect(() => {
    const stored = localStorage.getItem('nexus_chat_font_size');
    if (stored) {
      document.documentElement.style.setProperty('--chat-font-size', `${stored}px`);
    }
  }, []);

  return (
    <div className="w-screen h-screen m-0 p-0 overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      <CortexAI />
    </div>
  );
}

export default App;
