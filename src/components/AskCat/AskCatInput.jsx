import React, { useState } from 'react';

/**
 * AskCatInput component with pure Vanilla CSS and SVG
 */
export default function AskCatInput({ onAsk, isLoading, onClose }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;
    onAsk(query.trim());
    setQuery('');
  };

  return (
    <form onSubmit={handleSubmit} className="ask-cat-form no-drag">
      <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
        </svg>
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask about your screen..."
        disabled={isLoading}
        autoFocus
        className="ask-cat-input"
      />
      <button
        type="submit"
        disabled={!query.trim() || isLoading}
        className="ask-cat-submit"
        title="Send"
      >
        {isLoading ? (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="ask-cat-submit"
        title="Close"
        style={{ background: 'transparent', color: '#64748b', boxShadow: 'none' }}
      >
        ×
      </button>
    </form>
  );
}
