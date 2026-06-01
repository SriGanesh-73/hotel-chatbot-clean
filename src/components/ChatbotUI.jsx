import React, { useState, useRef, useEffect } from "react";
import { FiSend } from 'react-icons/fi';
import MessageBubble from "./MessageBubble";
import QuickReplies from "./QuickReplies";
import Header from "./Header";
import "../styles/ChatbotUI.css";
import { createEscalation, listenEscalationsForGuest, getEscalationsByToken, getEscalationsByGuestId, listenEscalationsForGuestCombined, findOpenEscalation, appendMessageToEscalation, setGuestTyping } from "../services/escalationService";
import { getGuestByToken } from "../services/guestService";

// Custom hook for responsive design
const useResponsive = () => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth <= 768,
    isTablet: window.innerWidth > 768 && window.innerWidth <= 1024,
    isDesktop: window.innerWidth > 1024,
    isLandscape: window.innerWidth > window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
        isMobile: window.innerWidth <= 768,
        isTablet: window.innerWidth > 768 && window.innerWidth <= 1024,
        isDesktop: window.innerWidth > 1024,
        isLandscape: window.innerWidth > window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
};

const ChatbotUI = ({ rules }) => {
  const [messages, setMessages] = useState([
    { 
      text: "Hi! 👋 Welcome to our hotel chatbot. How can I help you?", 
      sender: "bot",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [adminTypingActive, setAdminTypingActive] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const seenEscalationIdsRef = useRef(new Set());
  const seenAdminMessageKeysRef = useRef(new Set());
  const initialSeedRef = useRef(true);
  // Track whether we've already shown the apology/fallback message this session
  const escalationApologyShownRef = useRef(false);
  // track last guest message timestamp (ms) to ignore admin typing that predates it
  const lastGuestMessageAtRef = useRef(0);
  // track whether any admin is currently connected for this guest/token (global across escalations)
  const hasAnyAdminRef = useRef(false);
  // Keep a reference to guest info (fetched once) so typing detection can find guestId
  const guestRef = useRef(null);
  // Typing debounce and throttle refs to reduce Firestore writes
  const typingDebounceRef = useRef(null);
  const typingClearRef = useRef(null);
  const typingActiveEscRef = useRef(null);
  const typingActiveEscAtRef = useRef(0);
  const { isMobile, isLandscape } = useResponsive();

  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    // Prefer smooth programmatic scroll on the container so the bottom area (input/quick replies)
    // doesn't overlap the last message. Fallback to scrollIntoView if container missing.
    if (container) {
      try {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      } catch (e) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getTokenFromUrl = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('token');
    } catch (e) {
      return null;
    }
  };

  const handleOptionSelect = async (question) => {
    // Add user message
    const userMessage = { 
      text: question, 
      sender: "guest",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Get bot reply from rules
    const botReply = rules[question.toLowerCase()];

    // If botReply missing, escalate to admin
    let finalBotReply = botReply;
    let createdEscalation = null;
    if (!botReply) {
      finalBotReply = "Sorry for the inconvenience — I couldn't find an answer right now. I've escalated your request to our reception team; they'll reply here in this chat shortly or contact you from the reception. Thank you for your patience.";
      // NOTE: escalation creation is deferred to the loading-placeholder flow below so we
      // create exactly one escalation and can attach its id to the placeholder. Do not
      // call createEscalation here (it caused duplicate documents previously).
    }

    const botMessage = {
      text: finalBotReply || "",
      sender: "bot",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

  // Add user message immediately
  setMessages((prev) => [...prev, userMessage]);
  // record guest message time so we don't display stale admin typing
  lastGuestMessageAtRef.current = Date.now();
    setInputValue("");

    // If we have a botReply (regular flow), show the short typing animation then replace
    if (botReply) {
      const typingPlaceholder = { text: "", sender: "bot", isTyping: true };
      setMessages((prev) => [...prev, typingPlaceholder]);

      setTimeout(() => {
        setMessages((prev) => {
          const withoutTyping = prev.slice(0, -1);
          return [...withoutTyping, botMessage];
        });
      }, 1200);
      return;
    }

    // No bot reply -> escalation path
    // Show apology only once per session
    if (!escalationApologyShownRef.current) {
      escalationApologyShownRef.current = true;
      setMessages((prev) => [...prev, botMessage]);
    }

  // We'll decide whether to show a static loading bubble by checking if there's an existing
  // escalation and whether an admin is already connected. If an admin is connected we avoid
  // showing the static transfer bubble so that only live admin typing (when they type) appears.
  (async () => {
    try {
      const token = getTokenFromUrl();
      let guestId = null;
      let guestName = null;
      let roomNo = null;
      if (token) {
        const guest = await getGuestByToken(token);
        if (guest) {
          guestId = guest.id;
          guestName = guest.guestName || null;
          roomNo = guest.roomNo || null;
        }
      }

      // Check for an existing open escalation before deciding to show a static loading bubble
      const existing = await findOpenEscalation(token, guestId);
      // Debug: log shapes so we can diagnose when static placeholders are added
      console.debug('Escalation decision:', { token, guestId, existing, hasAnyAdmin: hasAnyAdminRef.current });

      // Only show the static loading/transfer placeholder when there is NO admin connected.
      // This ensures the static pulse is used exclusively for bot-to-human transfers and
      // never shown when an admin is already connected (admins should show live typing only).
      const shouldShowLoading = !hasAnyAdminRef.current && !(existing && existing.adminId);

      const loadingPlaceholder = { text: "", sender: "bot", isLoading: true, escalationId: null };
      if (shouldShowLoading) {
        console.debug('Appending static loading placeholder for escalation transfer', { token, guestId });
        setMessages(prev => [...prev, loadingPlaceholder]);
      } else {
        console.debug('Skipping static loading placeholder (admin is connected or existing escalation has admin)', { token, guestId, existing });
      }

      // Now create or append to the escalation (reuse 'existing' if present)
      let escalationId = null;
      if (existing && existing.id) {
        escalationId = existing.id;
        try { await setGuestTyping(escalationId, true); } catch(e){}
        try { await appendMessageToEscalation(escalationId, { sender: 'guest', text: question, timestamp: new Date() }); } catch(e){ console.warn('Failed to append guest message to existing escalation:', e); }
        try { await setGuestTyping(escalationId, false); } catch(e){}
      } else {
        try {
          const created = await createEscalation({ token, guestId, guestName, roomNo, question });
          if (created && created.id) {
            escalationId = created.id;
            try { await setGuestTyping(escalationId, true); } catch(e){}
            try { await setGuestTyping(escalationId, false); } catch(e){}
          }
        } catch (err) {
          console.error('Failed to create escalation:', err);
        }
      }

      if (escalationId && shouldShowLoading) {
        // attach escalationId to the most recent loading placeholder (we use isLoading)
        setMessages((prev) => {
          const idx = [...prev].map(m => m).reverse().findIndex(m => m && m.isLoading && !m.escalationId);
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const copy = prev.slice();
          copy[realIdx] = { ...copy[realIdx], escalationId };
          return copy;
        });
      }
    } catch (err) {
      console.error('Failed during escalation flow:', err);
    }
  })();
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      handleOptionSelect(inputValue);
    }
  };

  // When the guest types in the input, if there is an open escalation, set guestTyping on that escalation
  // so admins see a typing indicator. Debounced to avoid frequent writes.
  const handleInputChange = (e) => {
    const v = e.target.value;
    setInputValue(v);

    // quick guard: if input is empty, do nothing
    const token = getTokenFromUrl();
    if (!token) return;

    // debounce the typing detection
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(async () => {
      try {
        const guest = guestRef.current;
        const guestId = guest ? guest.id : null;
        const existing = await findOpenEscalation(token, guestId);
        if (existing && existing.id) {
          const escId = existing.id;
          // throttle: if we've set typing very recently for this escalation, skip
          const now = Date.now();
          if (typingActiveEscRef.current === escId && (now - (typingActiveEscAtRef.current || 0) < 1500)) return;
          typingActiveEscRef.current = escId;
          typingActiveEscAtRef.current = now;
          try { await setGuestTyping(escId, true); } catch (err) { /* ignore */ }

          // clear previous clear timer and set a new one that will clear typing after idle
          if (typingClearRef.current) clearTimeout(typingClearRef.current);
          typingClearRef.current = setTimeout(async () => {
            try { await setGuestTyping(escId, false); } catch (err) { /* ignore */ }
            typingActiveEscRef.current = null;
            typingActiveEscAtRef.current = 0;
          }, 2200);
        }
      } catch (err) {
        // ignore any errors from findOpenEscalation
      }
    }, 350);
  };

  // Listen for admin replies for this guest token and render them as bot messages
  useEffect(() => {
    (async () => {
      const token = (new URLSearchParams(window.location.search)).get('token');
      if (!token) return;
      // Fetch guest by token to also obtain guestId (if present)
      let guestId = null;
      try {
        const guest = await getGuestByToken(token);
        if (guest) {
          guestId = guest.id;
          guestRef.current = guest;
        }
      } catch (err) {
        console.warn('Failed to fetch guest by token while seeding escalations', err);
      }

      // Fetch existing escalations by token and guestId and append any adminReply
      try {
        const existingToken = await getEscalationsByToken(token);
        const existingGuest = guestId ? await getEscalationsByGuestId(guestId) : [];
        const merged = [...existingToken, ...existingGuest];

        // Compute aggregated adminTypingActive from seeded documents so we don't toggle typing
        // based on a single escalation update (this mirrors logic used by the realtime listener).
        try {
          const anyTypingSeed = (merged || []).some(esc => {
            if (!esc || !esc.adminTyping) return false;
            if (esc.status && esc.status !== 'pending') return false;
            const at = esc.adminTypingUpdatedAt;
            if (!at) return false;
            const ms = (at && at.toMillis) ? at.toMillis() : (at?.seconds ? at.seconds * 1000 : 0);
            // If escalation has a repliedAt (previous admin reply), ensure typing occurred after that reply.
            const repliedAtMs = (esc.repliedAt && esc.repliedAt.toMillis) ? esc.repliedAt.toMillis() : (esc.repliedAt?.seconds ? esc.repliedAt.seconds * 1000 : 0);
            // Also ignore typing that predates the guest's last message
            const sinceMs = Math.max(lastGuestMessageAtRef.current || 0, repliedAtMs || 0);
            if (ms <= sinceMs) return false;
            return (Date.now() - ms) <= 5000;
          });
          setAdminTypingActive(!!anyTypingSeed);
          // Track whether any admin is currently connected so future guest messages
          // avoid appending a static loading placeholder.
          try {
            const hasAnyAdmin = (merged || []).some(esc => esc && esc.adminId);
            hasAnyAdminRef.current = !!hasAnyAdmin;
            if (hasAnyAdmin) {
              // remove any static loading placeholders (they may not yet have escalationId attached)
              setMessages(prev => prev.filter(m => !(m && m.isLoading)));
            }
          } catch (e) {}
        } catch (e) {
          setAdminTypingActive(false);
        }

        // attempt to deliver any admin replies found in seeded documents (adminReply, lastAdminMessage, or messages array)
        // Avoid flooding the guest with historical admin messages on first load: only seed recent replies.
        // Mark older escalations as seen so they won't be re-delivered by the realtime listener.
        const SEED_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
        const nowMs = Date.now();
        const getEscLatestAdminTs = (esc) => {
          if (!esc) return 0;
          // prefer lastAdminMessage.ts
          if (esc.lastAdminMessage && esc.lastAdminMessage.ts && typeof esc.lastAdminMessage.ts.toMillis === 'function') return esc.lastAdminMessage.ts.toMillis();
          if (esc.repliedAt && typeof esc.repliedAt.toMillis === 'function') return esc.repliedAt.toMillis();
          // fallback: scan messages for last admin message
          const msgsFallback = esc.messages || [];
          for (let i = msgsFallback.length - 1; i >= 0; i--) {
            const m = msgsFallback[i];
            if (m && (m.sender === 'admin' || (m.sender === 'bot' && m.fromAdmin))) {
              if (m.timestamp && typeof m.timestamp.toMillis === 'function') return m.timestamp.toMillis();
              if (m.timestamp && m.timestamp.seconds) return m.timestamp.seconds * 1000;
            }
          }
          return 0;
        };

        for (const esc of merged) {
          try {
            const lastAdminTs = getEscLatestAdminTs(esc) || 0;
            if (lastAdminTs && (nowMs - lastAdminTs) <= SEED_WINDOW_MS) {
              // recent enough -> deliver to guest
              deliverAdminReply(esc);
              seenEscalationIdsRef.current.add(esc.id);
            } else {
              // too old or no admin messages -> mark as seen to avoid seeding historic messages
              seenEscalationIdsRef.current.add(esc.id);
            }
          } catch (e) {
            // fallback: deliver safely
            try { deliverAdminReply(esc); seenEscalationIdsRef.current.add(esc.id); } catch(_){}
          }
        }
        // initial seeding completed
        initialSeedRef.current = false;
      } catch (err) {
        console.warn('Failed to fetch existing escalations for token/guestId', err);
      }

      const subs = [];
      // helper to render admin reply and replace any loading placeholder that matches escalationId
      const deliverAdminReply = (escalation) => {
        if (!escalation) return;
        // Do NOT modify adminTypingActive here. Typing state is computed from the combined
        // escalation listener (and from seeded documents above). Updating it per-escalation
        // caused the guest UI to flip typing on/off incorrectly when individual items arrived.
        const escId = escalation.id;

        // First, if adminReply field exists, prefer that (backward compatible)
        if (escalation.adminReply) {
          const replyText = escalation.adminReply || '';
          // Derive a per-message dedupe key using lastAdminMessage.ts, repliedAt, or fallback to scanning messages
          let tsMillis = Date.now();
          if (escalation.lastAdminMessage && escalation.lastAdminMessage.ts && escalation.lastAdminMessage.ts.toMillis) {
            tsMillis = escalation.lastAdminMessage.ts.toMillis();
          } else if (escalation.repliedAt && escalation.repliedAt.toMillis) {
            tsMillis = escalation.repliedAt.toMillis();
          } else {
            const msgsFallback = escalation.messages || [];
            for (let i = msgsFallback.length - 1; i >= 0; i--) {
              const m = msgsFallback[i];
              if (m && (m.sender === 'admin' || (m.sender === 'bot' && m.fromAdmin))) {
                tsMillis = m.timestamp && m.timestamp.toMillis ? m.timestamp.toMillis() : (m.timestamp?.seconds ? m.timestamp.seconds * 1000 : tsMillis);
                break;
              }
            }
          }

          const key = `${escId}:${tsMillis}:${replyText.slice(0,40)}`;
          if (seenAdminMessageKeysRef.current.has(key)) return; // already processed this admin reply

          setMessages((prev) => {
            // Try to find a typing/loading placeholder with this escalationId
            let idx = prev.findIndex(m => m && (m.isTyping || m.isLoading) && m.escalationId === escId);
            if (idx !== -1) {
              const copy = prev.slice();
              copy[idx] = { text: replyText, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
              return copy;
            }

            // If not found, try to find the most recent typing/loading placeholder without an escalationId
            idx = (() => {
              for (let i = prev.length - 1; i >= 0; i--) {
                const m = prev[i];
                if (m && (m.isTyping || m.isLoading) && !m.escalationId) return i;
              }
              return -1;
            })();

            if (idx !== -1) {
              const copy = prev.slice();
              copy[idx] = { text: replyText, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
              return copy;
            }

            // Otherwise append as fallback
            return [...prev, { text: replyText, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }];
          });

          // mark this admin message key as seen so subsequent updates are ignored
          seenAdminMessageKeysRef.current.add(key);
          return;
        }

        // If adminReply field not present, try to detect latest admin message in escalation.messages
        const msgs = escalation.messages || [];
        // find the latest admin message
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (m && (m.sender === 'admin' || m.sender === 'bot' && m.fromAdmin)) {
            // derive a simple dedupe key per escalation+message
            const ts = m.timestamp && m.timestamp.toMillis ? m.timestamp.toMillis() : (m.timestamp?.seconds ? m.timestamp.seconds * 1000 : Date.now());
            const key = `${escId}:${ts}:${(m.text||'').slice(0,40)}`;
            if (seenAdminMessageKeysRef.current.has(key)) return; // already processed this message

            const replyText = m.text || '';
            setMessages((prev) => {
              // replace typing/loading placeholder by escalationId if present
              let idx = prev.findIndex(x => x && (x.isTyping || x.isLoading) && x.escalationId === escId);
              if (idx !== -1) {
                const copy = prev.slice();
                copy[idx] = { text: replyText, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
                return copy;
              }

              // fallback: replace most recent typing placeholder without escalationId
              idx = (() => {
                for (let j = prev.length - 1; j >= 0; j--) {
                  const mm = prev[j];
                  if (mm && (mm.isTyping || mm.isLoading) && !mm.escalationId) return j;
                }
                return -1;
              })();

              if (idx !== -1) {
                const copy = prev.slice();
                copy[idx] = { text: replyText, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
                return copy;
              }

              return [...prev, { text: replyText, sender: 'bot', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }];
            });

            // mark this message as seen
            seenAdminMessageKeysRef.current.add(key);
            return;
          }
        }
      };

      // set up real-time combined listener
      const unsub = listenEscalationsForGuestCombined(token, guestId, (items) => {
        console.debug('Guest combined escalation listener received items:', items);
        // Compute adminTypingActive from any escalation that has adminTyping recently set (<=5s)
        // Additionally require that the escalation is still pending and not already replied (avoid showing typing after reply)
        try {
          const anyTyping = (items || []).some(esc => {
            if (!esc || !esc.adminTyping) return false;
            if (esc.status && esc.status !== 'pending') return false;
            const at = esc.adminTypingUpdatedAt;
            if (!at) return false;
            const ms = (at && at.toMillis) ? at.toMillis() : (at?.seconds ? at.seconds * 1000 : 0);
            // If escalation has a repliedAt (previous admin reply), ensure typing occurred after that reply.
            const repliedAtMs = (esc.repliedAt && esc.repliedAt.toMillis) ? esc.repliedAt.toMillis() : (esc.repliedAt?.seconds ? esc.repliedAt.seconds * 1000 : 0);
            // ignore admin typing that occurred before the guest's last message or before the previous reply
            if (ms <= Math.max(lastGuestMessageAtRef.current || 0, repliedAtMs || 0)) return false;
            return (Date.now() - ms) <= 5000;
          });
          setAdminTypingActive(!!anyTyping);
        } catch (e) {
          // fallback: do not set typing
          setAdminTypingActive(false);
        }

        // Track a global admin-connected flag and clear static loading placeholders
        try {
          const hasAnyAdmin = (items || []).some(esc => esc && esc.adminId);
          hasAnyAdminRef.current = !!hasAnyAdmin;
          if (hasAnyAdmin) {
            setMessages(prev => prev.filter(m => !(m && m.isLoading)));
          }
        } catch (e) {}

        // try to deliver admin replies from any updated item (this covers adminReply, lastAdminMessage, and appended messages)
        items.forEach(deliverAdminReply);
      });
      subs.push(unsub);

      // Polling fallback: in case onSnapshot fails (index required, network blips), poll every 8s
      let pollInterval = null;
      const startPolling = () => {
        pollInterval = setInterval(async () => {
          try {
            const tokenRows = await getEscalationsByToken(token);
            const guestRows = guestId ? await getEscalationsByGuestId(guestId) : [];
            const merged = [...(tokenRows||[]), ...(guestRows||[])];
            // attempt to deliver admin replies found by polling (covers adminReply, lastAdminMessage, and appended messages)
            merged.forEach((esc) => {
              // During initial seed we've marked old escalations as seen. Avoid delivering them now.
              if (initialSeedRef.current && seenEscalationIdsRef.current.has(esc.id)) return;
              deliverAdminReply(esc);
            });
          } catch (err) {
            console.warn('Polling for escalations failed', err);
          }
        }, 8000);
      };

      // Start polling as a safety net
      startPolling();

      return () => {
        subs.forEach(s => s && s());
        if (pollInterval) clearInterval(pollInterval);
      };
    })();
  }, []);

  // Collect all possible questions from rules
  const options = Object.keys(rules);

  return (
    <div className={`chatbot-container ${isMobile ? 'mobile' : ''} ${isLandscape ? 'landscape' : ''}`}>
      <Header />
      {adminTypingActive ? (
        <div className="admin-typing-indicator" style={{padding:'6px 16px', fontSize:13, color:'var(--muted)'}}>Reception is typing…</div>
      ) : null}
      
      <div className="chat-window">
        <div className="messages-container" ref={messagesContainerRef}>
          {messages.map((msg, idx) => (
            <MessageBubble 
              key={idx} 
              text={msg.text} 
              sender={msg.sender} 
              timestamp={msg.timestamp}
              isTyping={msg.isTyping}
              isLoading={msg.isLoading}
              isMobile={isMobile}
            />
          ))}
          {/* Show admin typing bubble (left) when adminTypingActive is true */}
          {adminTypingActive ? <MessageBubble isTyping={true} sender={'bot'} /> : null}
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      <QuickReplies 
        options={options} 
        onSelect={handleOptionSelect} 
        isMobile={isMobile}
        isLandscape={isLandscape}
      />
      
      <form className="message-input-form" onSubmit={handleSendMessage}>
        <div className="input-container">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            placeholder="Type message here..."
            className="message-input"
          />
          <button type="submit" className="send-button" aria-label="Send message">
            <FiSend size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatbotUI;