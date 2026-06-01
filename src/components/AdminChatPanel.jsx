import React, { useEffect, useState, useRef } from 'react';
import MessageBubble from './MessageBubble';
import { FiSend } from 'react-icons/fi';
import '../styles/ChatbotUI.css';
import '../styles/AdminDashboard.css';
import { listenEscalationById, appendMessageToEscalation, setAdminReply, markEscalationResolved, setAdminTyping } from '../services/escalationService';

const AdminChatPanel = ({ escalationId, onClose, onSend }) => {
  const [esc, setEsc] = useState(null);
  const [reply, setReply] = useState('');
  const [messages, setMessages] = useState([]);
  const endRef = useRef(null);

  useEffect(() => {
    if (!escalationId) return;
    const unsub = listenEscalationById(escalationId, (doc) => {
      setEsc(doc);
      if (doc && Array.isArray(doc.messages)) {
        // normalize timestamps
        const msgs = doc.messages.map(m => ({
          ...m,
          timestamp: m.timestamp && m.timestamp.toDate ? m.timestamp.toDate() : (m.timestamp ? new Date(m.timestamp) : new Date())
        }));
        setMessages(msgs);
      }
    });
    return () => {
      // attempt to clear adminTyping when panel unmounts (best-effort)
      try { setAdminTyping(escalationId, false).catch(()=>{}); } catch(e){}
      unsub && unsub();
    };
  }, [escalationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const handleSend = async () => {
    if (!reply.trim() || !escalationId) return;
    const text = reply.trim();
    try {
      // clear admin typing indicator before sending
      try { await setAdminTyping(escalationId, false); } catch(e){}
      // set adminReply so guest receives the text, but keep escalation open
      await setAdminReply(escalationId, 'admin', text);
      // append to thread for admin history
      await appendMessageToEscalation(escalationId, { sender: 'admin', text, timestamp: new Date() });
      setReply('');
      if (onSend) onSend(text);
    } catch (err) {
      console.error('Failed to send admin message', err);
      // If network error or transient failure, enqueue the reply locally and retry later
      try {
        const key = 'pendingAdminReplies';
        const raw = localStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        list.push({ escalationId, adminId: 'admin', text, ts: Date.now() });
        localStorage.setItem(key, JSON.stringify(list));
        console.warn('Enqueued admin reply for later delivery', { escalationId, text });
      } catch (e) {
        console.error('Failed to enqueue pending admin reply', e);
      }
    }
  };

  // Admin typing detection: debounce writing adminTyping flag
  const adminTypingDebounceRef = useRef(null);
  const adminTypingClearRef = useRef(null);
  const handleAdminInputChange = (e) => {
    const v = e.target.value;
    setReply(v);

    if (!escalationId) return;
    // set admin typing true (debounced)
    if (adminTypingDebounceRef.current) clearTimeout(adminTypingDebounceRef.current);
    adminTypingDebounceRef.current = setTimeout(async () => {
      try { await setAdminTyping(escalationId, true); } catch(e){}
      // set/refresh clear timer
      if (adminTypingClearRef.current) clearTimeout(adminTypingClearRef.current);
      adminTypingClearRef.current = setTimeout(async () => { try { await setAdminTyping(escalationId, false); } catch(e){} }, 2200);
    }, 120);
  };

  // Flush pending admin replies stored in localStorage
  const flushPendingReplies = async () => {
    try {
      const key = 'pendingAdminReplies';
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || list.length === 0) return;

      const remaining = [];
      for (const item of list) {
        try {
          if (!item || !item.escalationId) continue;
          await setAdminReply(item.escalationId, item.adminId || 'admin', item.text);
          await appendMessageToEscalation(item.escalationId, { sender: 'admin', text: item.text, timestamp: new Date(item.ts) });
          console.info('Flushed pending admin reply for escalation', item.escalationId);
        } catch (err) {
          console.warn('Failed to flush pending admin reply, will retry later', err, item);
          remaining.push(item);
        }
      }

      if (remaining.length) {
        localStorage.setItem(key, JSON.stringify(remaining));
      } else {
        localStorage.removeItem(key);
      }
    } catch (err) {
      console.error('Error flushing pending admin replies', err);
    }
  };

  const handleResolve = async () => {
    if (!escalationId) return;
    try {
      await markEscalationResolved(escalationId, 'admin');
      if (onClose) onClose(true);
    } catch (err) {
      console.error('Failed to mark escalation resolved', err);
    }
  };

  // Periodically try to flush pending admin replies and also when browser goes online
  useEffect(() => {
    const interval = setInterval(() => {
      flushPendingReplies();
    }, 5000);

    const onOnline = () => {
      flushPendingReplies();
    };
    window.addEventListener('online', onOnline);

    // Attempt an initial flush when component mounts
    flushPendingReplies();

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [escalationId]);

  return (
    <div className="admin-chat-root">
      <div className="chatbot-header admin-chat-header">
        <div className="header-avatar" aria-hidden>
          {/* show initials or generic icon */}
          {esc?.guestName ? esc.guestName.split(' ').map(n=>n[0]).slice(0,2).join('') : 'G'}
        </div>
        <div className="header-info">
          <h2>{esc?.guestName || esc?.token || 'Guest'}</h2>
          <p>{esc?.roomNo ? `Room ${esc.roomNo} • ` : ''}{esc?.adminId ? 'Online' : 'Offline'}</p>
        </div>
        <div className="header-actions">
          {/* placeholder actions - keep parity with chatbot header */}
        </div>
      </div>
      <div className="admin-chat-messages">
        {messages.map((m, i) => (
          // For admin view: render guest messages as bot-style (left, white) and admin messages as guest-style (right, blue)
          <MessageBubble key={i} text={m.text} sender={m.sender === 'guest' ? 'bot' : 'guest'} timestamp={m.timestamp?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
        ))}

        {/* Show a single typing bubble representing the guest typing. In admin view we map guest messages
            to the 'bot' visual (left side), so render typing as sender='bot'. This avoids showing a right-side
            typing bubble (which looks like the admin typing). We render it when the escalation's guestTyping
            flag is true OR as a fallback when the last persisted message is from the guest and there is no
            adminReply yet. */}
        {esc && (() => {
          // Only show guest typing if guestTyping is recent (<=5s) or fallback recent guest message exists
          try {
            const at = esc.guestTypingUpdatedAt;
            let active = false;
            if (esc.guestTyping && at) {
              const ms = (at && at.toMillis) ? at.toMillis() : (at?.seconds ? at.seconds * 1000 : 0);
              if (Date.now() - ms <= 5000) active = true;
            }
            // fallback: if last message is guest and its timestamp is within 5s and no adminReply
            if (!active && !esc.adminReply && messages.length) {
              const last = messages[messages.length - 1];
              const tms = last.timestamp ? (last.timestamp.getTime ? last.timestamp.getTime() : new Date(last.timestamp).getTime()) : 0;
              if (Date.now() - tms <= 5000 && last.sender === 'guest') active = true;
            }
            return active ? <MessageBubble isTyping={true} sender={'bot'} /> : null;
          } catch (e) {
            return null;
          }
        })()}

        <div ref={endRef} />
      </div>

      <div className="admin-chat-composer">
        <div className="input-container">
          <input
            type="text"
            value={reply}
            onChange={handleAdminInputChange}
            placeholder="Type reply to send as chatbot"
            className="message-input"
            onKeyDown={(e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleSend(); } }}
          />
          <button onClick={handleSend} className="send-button" aria-label="Send message">
            <FiSend size={18} />
          </button>
        </div>
        <div className="esc-actions">
          <button onClick={handleResolve} className="secondary">Mark resolved</button>
          <button onClick={() => onClose && onClose(false)} className="secondary">Close</button>
        </div>
      </div>
    </div>
  );
};

export default AdminChatPanel;
