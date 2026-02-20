import React, { useState } from 'react';
import type { Seat } from '../engine/tuteTypes';
import { FRASES_RANDOM } from '../ui/gameConstants';

interface ChatBarProps {
  onSendChat: (texto: string) => void;
  onSendPhrase: (texto: string) => void;
}

const MAX_CHARS = 60;

export function ChatBar({ onSendChat, onSendPhrase }: ChatBarProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setText('');
  };

  return (
    <div className="chat-input-row">
      <select
        className="chat-phrase-select"
        value=""
        onChange={(e) => {
          if (e.target.value) {
            onSendPhrase(e.target.value);
            e.target.value = '';
          }
        }}
        title="Frases predefinidas"
      >
        <option value="" disabled>💬</option>
        <option value="Tengo salida" style={{ color: '#111' }}>Tengo salida</option>
        {FRASES_RANDOM.map((f, i) => (
          <option key={i} value={f} style={{ color: '#111' }}>{f}</option>
        ))}
      </select>
      <input
        className="chat-input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
        placeholder="Escribe algo..."
        maxLength={MAX_CHARS}
      />
      <button className="chat-send-btn" onClick={handleSend} disabled={!text.trim()}>
        ➤
      </button>
    </div>
  );
}
