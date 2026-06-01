// src/pages/AdminDashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import { addGuest, checkRoomOccupancy, generateGuestToken } from "../services/guestService";
import { validateGuestForm } from "../utils/validations";
import GuestList from "../components/GuestList";
import "../styles/AdminDashboard.css";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import axios from 'axios';
import { FiFileText, FiCopy, FiClipboard } from 'react-icons/fi';
import { useToast } from '../context/ToastContext';
import emailjs from '@emailjs/browser';
import ChatLinkContainer from '../components/ChatLinkContainer';
import { listenPendingEscalations, replyToEscalation, getRecentEscalations, markEscalationResolved, appendMessageToEscalation } from "../services/escalationService";
import { expireGuestsIfNeeded, expirePendingEscalationsLinkedToExpiredGuests } from '../services/guestService';
import AdminChatPanel from '../components/AdminChatPanel';
import { getAllGuests, getGuestByToken } from "../services/guestService";


const AdminDashboard = () => {
  const { currentUser, logout, checkSession } = useAuth();
  const navigate = useNavigate();
  
  // Session validation
  useEffect(() => {
    if (!currentUser) {
      navigate("/admin-login");
      return;
    }
    
    // Check session validity every 30 seconds
    const sessionInterval = setInterval(() => {
      if (!checkSession()) {
        logout();
        navigate("/admin-login");
      }
    }, 30000);
    
    return () => clearInterval(sessionInterval);
  }, [currentUser, navigate, checkSession, logout]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/admin-login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };


  const [guestName, setGuestName] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [status, setStatus] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState('addGuest'); // 'addGuest' or 'guestList'
  const [escalations, setEscalations] = useState([]);
  const [isEscalationsLoading, setIsEscalationsLoading] = useState(false);
  const [escalationsSeeded, setEscalationsSeeded] = useState(false);
  const [selectedEscalation, setSelectedEscalation] = useState(null);
  const [escalationReply, setEscalationReply] = useState('');
  const [newEscalationCount, setNewEscalationCount] = useState(0);
  const [validationErrors, setValidationErrors] = useState({});
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const [chatbotLink, setChatbotLink] = useState('');
  const { addToast } = useToast();

  // timer ref for auto-hiding chatbot link
  const chatbotTimerRef = useRef(null);
  const statusTimerRef = useRef(null);

  // auto-hide chatbot link after 10 seconds
  useEffect(() => {
    if (!chatbotLink) return;
    if (chatbotTimerRef.current) clearTimeout(chatbotTimerRef.current);
    chatbotTimerRef.current = setTimeout(() => {
      setChatbotLink('');
    }, 10000);
    return () => {
      if (chatbotTimerRef.current) {
        clearTimeout(chatbotTimerRef.current);
        chatbotTimerRef.current = null;
      }
    };
  }, [chatbotLink]);

  // Listen for chatlink events from GuestList when expiry edited/reactivated
  useEffect(() => {
    const onChatLink = (e) => {
      const url = e?.detail?.chatUrl;
      if (url) {
        setChatbotLink(url);
        // show a floating toast as well
        addToast({ message: 'Chat link restored for guest', type: 'success', variant: 'floating', duration: 3200 });
      }
    };
    window.addEventListener('chatlink', onChatLink);
    return () => window.removeEventListener('chatlink', onChatLink);
  }, [addToast]);

  // auto-clear copy/status messages containing clipboard icon after 10s
  useEffect(() => {
    if (!status) return;
    // clear previous status timer
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    // only auto-clear for copy notifications or success statuses
    if (status.includes('📋') || status.includes('Chatbot link copied') || status.includes('Guest added successfully')) {
      statusTimerRef.current = setTimeout(() => setStatus(''), 10000);
    }
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, [status]);

  // map status messages to static toasts (bottom-right with close button)
  useEffect(() => {
    if (!status) return;
    // Show static toast for generic statuses (errors or success)
    addToast({ message: status, type: status.includes('Error') || status.includes('Failed') || status.includes('❌') ? 'error' : 'success', variant: 'static', duration: 0 });
    // Clear the inline status to avoid duplicate UI
    setStatus('');
  }, [status, addToast]);

  // clear chatbot link when switching tabs
  useEffect(() => {
    if (activeTab !== 'addGuest' && chatbotLink) {
      setChatbotLink('');
      if (chatbotTimerRef.current) {
        clearTimeout(chatbotTimerRef.current);
        chatbotTimerRef.current = null;
      }
    }
    // when switching to escalations, perform a refresh so loader is managed correctly
    if (activeTab === 'escalations') {
      refreshEscalations().catch(err => console.debug('refreshEscalations on tab switch failed', err));
    }
    // if switching away from escalations, close any open right-hand chat panel
    if (activeTab !== 'escalations' && selectedEscalation) {
      setSelectedEscalation(null);
    }
  }, [activeTab]);

  // Listen for pending escalations on mount (so admin receives updates regardless of active tab)
  useEffect(() => {
    // only start after we have an authenticated admin user
    if (!currentUser) return;

    let isMounted = true;
    let unsub = null;
    let pollInterval = null;
    const prevIdsRef = { current: new Set() };

    const seedAndListen = async () => {
      try {
        // expire guests first so any pending escalations tied to expired guests are handled
        try {
          const seedExpireResult = await expireGuestsIfNeeded();
          if (seedExpireResult && seedExpireResult.expiredEscalations && seedExpireResult.expiredEscalations > 0) {
            addToast({ type: 'info', message: `${seedExpireResult.expiredEscalations} pending escalations were marked expired and archived.`, duration: 6000 });
          }
        } catch (e) { console.warn('Could not expire guests before seeding escalations:', e); }

        // seed initial pending escalations so UI shows existing items immediately
        setIsEscalationsLoading(true);
        const all = await getRecentEscalations();
        if (!isMounted) return;
        const pending = all.filter(i => i.status === 'pending');
        setEscalations(pending);
        setNewEscalationCount(pending.length);
        // mark that we've completed the initial seed
        setEscalationsSeeded(true);
        // populate prevIds so initial existing items won't trigger toasts
        prevIdsRef.current = new Set(pending.map(p => p.id));
        setIsEscalationsLoading(false);

        // now start real-time listener
        unsub = listenPendingEscalations((items) => {
          if (!isMounted) return;
          console.debug('Escalation listener callback, items:', items);
          setEscalations(items);
          setNewEscalationCount(items.length);

          // detect newly-arrived ids (present in items but not in prevIds)
          const currentIds = new Set(items.map(i => i.id));
          const newIds = [];
          for (const id of currentIds) {
            if (!prevIdsRef.current.has(id)) newIds.push(id);
          }
          // update prevIds to current state
          prevIdsRef.current = currentIds;

          if (newIds.length) {
            // show toast for the newest one
            const newest = items.find(i => i.id === newIds[0]) || items[0];
            const guestLabel = newest?.guestName || newest?.token || 'Guest';
            const roomLabel = newest?.roomNo || 'N/A';
            addToast({ message: `Request from ${guestLabel} in room ${roomLabel}`, type: 'info', variant: 'floating', duration: 3000 });
          }
        });

        // polling fallback in case onSnapshot misses events or connectivity blips
        pollInterval = setInterval(async () => {
          try {
            const all2 = await getRecentEscalations();
            const pending2 = all2.filter(i => i.status === 'pending');
            // detect change
            const idsNow = new Set(pending2.map(p => p.id));
            const idsPrev = new Set(Array.from(prevIdsRef.current || []));
            let changed = false;
            if (idsNow.size !== idsPrev.size) changed = true;
            if (!changed) {
              for (const id of idsNow) if (!idsPrev.has(id)) { changed = true; break; }
            }
            if (changed) {
              prevIdsRef.current = idsNow;
              setEscalations(pending2);
              setNewEscalationCount(pending2.length);
            }
          } catch (err) {
            console.warn('Escalation polling failed', err);
          }
        }, 12000);
      } catch (err) {
        console.error('Failed to seed/listen escalations:', err);
        // fallback: still try to set up listener
        unsub = listenPendingEscalations((items) => {
          setEscalations(items);
          setNewEscalationCount(items.length);
          // even on fallback, consider seed completed
          setEscalationsSeeded(true);
        });
      }
    };

    seedAndListen();

    return () => {
      isMounted = false;
      if (unsub) unsub();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [currentUser]);

  const openEscalation = async (esc) => {
    setSelectedEscalation(esc);
    setEscalationReply('');
    // try to enrich guest info if token present
    if (esc?.token && !esc.guestName) {
      try {
        const guest = await getGuestByToken(esc.token);
        if (guest) {
          // update local copy shown in UI
          setSelectedEscalation(prev => ({ ...prev, guestName: guest.guestName, roomNo: guest.roomNo, guestId: guest.id }));
        }
      } catch (err) {
        console.warn('Failed to fetch guest for escalation', err);
      }
    }
  };

  const sendEscalationReply = async () => {
    if (!selectedEscalation) return;
    if (!escalationReply.trim()) {
      setStatus('Please enter a reply before sending');
      return;
    }
    const replyText = escalationReply.trim();
    const adminId = currentUser?.email || currentUser?.uid;

    // If offline, queue the reply in localStorage and show a toast
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const queued = JSON.parse(localStorage.getItem('queuedEscalationReplies') || '[]');
      queued.push({ escalationId: selectedEscalation.id, adminId, replyText, queuedAt: new Date().toISOString() });
      localStorage.setItem('queuedEscalationReplies', JSON.stringify(queued));
      addToast({ message: 'No internet — reply queued and will be sent when back online', type: 'info', variant: 'floating', duration: 4000 });
      // optimistically update UI: remove from list and close panel
      setEscalations(prev => prev.filter(e => e.id !== selectedEscalation.id));
      setNewEscalationCount(prev => Math.max(0, prev - 1));
      setSelectedEscalation(null);
      setEscalationReply('');
      return;
    }

    try {
      // send reply as previously (updates adminReply/status)
      await replyToEscalation(selectedEscalation.id, adminId, replyText);
      // append this admin message to the escalation.messages thread for admin-side chat history
      try {
        await appendMessageToEscalation(selectedEscalation.id, { sender: 'admin', text: replyText, timestamp: new Date() });
      } catch (appendErr) {
        console.warn('Failed to append admin message to escalation thread:', appendErr);
      }
      addToast({ message: 'Reply sent to guest as chatbot', type: 'success', variant: 'floating', duration: 3000 });
      setEscalations(prev => prev.filter(e => e.id !== selectedEscalation.id));
      setNewEscalationCount(prev => Math.max(0, prev - 1));
      setSelectedEscalation(null);
      setEscalationReply('');
    } catch (err) {
      console.error('Failed to send escalation reply', err);
      // If the error looks like a network / disconnected error, queue it locally
      const isNetworkError = (err && err.message && /network|internet|disconnected|offline/i.test(err.message));
      if (isNetworkError) {
        const queued = JSON.parse(localStorage.getItem('queuedEscalationReplies') || '[]');
        queued.push({ escalationId: selectedEscalation.id, adminId, replyText, queuedAt: new Date().toISOString() });
        localStorage.setItem('queuedEscalationReplies', JSON.stringify(queued));
        addToast({ message: 'Network issue — reply queued and will be retried', type: 'info', variant: 'floating', duration: 4000 });
        setEscalations(prev => prev.filter(e => e.id !== selectedEscalation.id));
        setNewEscalationCount(prev => Math.max(0, prev - 1));
        setSelectedEscalation(null);
        setEscalationReply('');
        return;
      }
      addToast({ message: 'Failed to send reply ❌', type: 'error', variant: 'static', duration: 0 });
    }
  };

  // Flush queued admin replies when the app regains connectivity
  useEffect(() => {
    let flushInterval = null;
    let isMounted = true;

    const flushQueuedReplies = async () => {
      if (!isMounted) return;
      const raw = localStorage.getItem('queuedEscalationReplies');
      if (!raw) return;
      let queued = [];
      try { queued = JSON.parse(raw) || []; } catch (e) { queued = []; }
      if (!queued.length) return;
      const remaining = [];
      for (const q of queued) {
        try {
          await replyToEscalation(q.escalationId, q.adminId, q.replyText);
          console.debug('Flushed queued escalation reply:', q.escalationId);
        } catch (err) {
          console.warn('Failed to flush queued reply, keep for retry:', q, err);
          remaining.push(q);
        }
      }
      localStorage.setItem('queuedEscalationReplies', JSON.stringify(remaining));
    };

    const onOnline = () => {
      flushQueuedReplies().catch(err => console.warn('Flush queued replies failed on online event', err));
    };

    window.addEventListener('online', onOnline);
    // periodic flush every 12s as a fallback
    flushInterval = setInterval(() => {
      if (navigator.onLine) flushQueuedReplies().catch(err => console.warn('Periodic flush failed', err));
    }, 12000);

    // try once on mount if online
    if (navigator.onLine) flushQueuedReplies().catch(err => console.warn('Initial flush failed', err));

    return () => {
      isMounted = false;
      window.removeEventListener('online', onOnline);
      if (flushInterval) clearInterval(flushInterval);
    };
  }, []);

    const handleMarkResolved = async () => {
      if (!selectedEscalation) return;
      try {
        await markEscalationResolved(selectedEscalation.id, currentUser?.email || currentUser?.uid);
        addToast({ message: 'Escalation marked resolved', type: 'success', variant: 'floating', duration: 2500 });
        // remove locally
        setEscalations(prev => prev.filter(e => e.id !== selectedEscalation.id));
        setNewEscalationCount(prev => Math.max(0, prev - 1));
        setSelectedEscalation(null);
        setEscalationReply('');
      } catch (err) {
        console.error('Failed to mark escalation resolved', err);
        addToast({ message: 'Failed to mark resolved ❌', type: 'error', variant: 'static', duration: 0 });
      }
    };

  const refreshEscalations = async () => {
    try {
      // expire guests first; this will mark pending escalations as 'expired' for guests that passed expiry
      let expireResult = null;
      try { expireResult = await expireGuestsIfNeeded(); } catch (e) { console.warn('Could not expire guests before refresh:', e); }
      // run escalation-level fallback to catch pending escalations referencing expired/missing guests
      try {
        const fallback = await expirePendingEscalationsLinkedToExpiredGuests();
        if (fallback && fallback.expired && fallback.expired > 0) {
          addToast({ type: 'info', message: `${fallback.expired} pending escalations were archived (fallback scan).`, duration: 6000 });
        }
      } catch (fbErr) {
        console.warn('Fallback escalation expiry scan failed:', fbErr);
      }
      if (expireResult && expireResult.expiredEscalations && expireResult.expiredEscalations > 0) {
        addToast({
          type: 'info',
          message: `${expireResult.expiredEscalations} pending escalations were marked expired and archived.`,
          duration: 6000,
        });
      }
      setIsEscalationsLoading(true);
      console.debug('refreshEscalations: started, showing loader');
      // ensure loader is visible for at least 600ms so human testers can see it
      const sleep = (ms) => new Promise(res => setTimeout(res, ms));
      // race the fetch with a 4s safety timeout so we don't spin forever
      const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
      let items = [];
      try {
        const res = await Promise.race([getRecentEscalations(), timeout(4000), sleep(600).then(() => null)]);
        if (Array.isArray(res)) items = res;
      } catch (err) {
        console.warn('refreshEscalations fetch timed out or failed:', err);
      }
      // filter only pending
      const pending = (items || []).filter(i => i.status === 'pending');
      setEscalations(pending);
      setNewEscalationCount(pending.length);
  // close right-hand chat if open so UI resets after refresh
  setSelectedEscalation(null);
      setIsEscalationsLoading(false);
      setEscalationsSeeded(true);
      console.debug('refreshEscalations: finished, hiding loader');
      addToast({ message: 'Escalations refreshed', type: 'info', variant: 'floating', duration: 2000 });
    } catch (err) {
      console.error('Failed to refresh escalations', err);
      addToast({ message: 'Failed to refresh escalations', type: 'error', variant: 'static', duration: 0 });
    }
  };

  // Try to flush any queued guests created while offline
  useEffect(() => {
    const flushQueue = async () => {
      const queued = JSON.parse(localStorage.getItem('guestQueue') || '[]');
      if (!queued.length) return;
      const remaining = [];
      for (const g of queued) {
        try {
          // attempt to add to Firestore
          await addGuest({ guestName: g.guestName, roomNo: g.roomNo, expiry: g.expiry, phone: g.phone, email: g.email });
          console.log('Flushed queued guest to server:', g);
        } catch (err) {
          console.warn('Failed to flush queued guest, will retry later:', g);
          remaining.push(g);
        }
      }
      localStorage.setItem('guestQueue', JSON.stringify(remaining));
    };

    // Try immediately on mount and whenever connectivity changes
    flushQueue();

    const onOnline = () => flushQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);


  // Helper function to format phone number
  const formatPhoneNumber = (phone) => {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // If it starts with 91 (India), add + prefix
    if (digits.startsWith('91') && digits.length === 12) {
      return `+${digits}`;
    }
    
    // If it's a 10-digit number (assuming India), add +91
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    
    // If it already has +, return as is
    if (phone.startsWith('+')) {
      return phone;
    }
    
    // Default: assume it needs country code
    return `+91${digits}`;
  };

  

  // Check room occupancy
  const handleRoomCheck = async () => {
    if (!roomNo.trim()) return;
    
    setIsCheckingRoom(true);
    try {
      const occupancy = await checkRoomOccupancy(roomNo.trim());
      if (occupancy.isOccupied) {
        setStatus(`❌ Room ${roomNo} is already occupied by ${occupancy.guest.guestName}`);
        setValidationErrors({...validationErrors, roomNo: "Room is already occupied"});
      } else {
        setStatus(`✅ Room ${roomNo} is available`);
        setValidationErrors({...validationErrors, roomNo: null});
      }
    } catch (error) {
      setStatus("Error checking room occupancy ❌");
      console.error("Room check error:", error);
    } finally {
      setIsCheckingRoom(false);
    }
  };

  // Validate form fields
  const validateField = (fieldName, value) => {
    const formData = { guestName, roomNo, phone, email, expiry };
    formData[fieldName] = value;
    
    const validation = validateGuestForm(formData);
    setValidationErrors(validation.errors);
    return validation.isValid;
  };

  // allow registration without verification (client requested removal of verification step)
  const canRegister = true;

  // Copy chatbot link to clipboard
  const copyChatbotLink = async () => {
    try {
      await navigator.clipboard.writeText(chatbotLink);
      // show floating copy toast
      addToast({ message: 'Chatbot link copied to clipboard! 📋', type: 'success', variant: 'floating', duration: 3000 });
    } catch (err) {
      console.error('Failed to copy link:', err);
      addToast({ message: 'Failed to copy link. Please copy manually.', type: 'error', variant: 'static' });
    }
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    
    // Validate form
    const formData = { guestName, roomNo, phone, email, expiry };
    const validation = validateGuestForm(formData);
    
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      setStatus('Please fix the validation errors before proceeding!');
      return;
    }
    
    if (!canRegister) {
      setStatus('Please verify phone and email first!');
      return;
    }
    
    // Check room occupancy one more time
    try {
      const occupancy = await checkRoomOccupancy(roomNo.trim());
      if (occupancy.isOccupied) {
        setStatus(`❌ Room ${roomNo} is already occupied by ${occupancy.guest.guestName}`);
        return;
      }
    } catch (error) {
      setStatus("Error checking room occupancy ❌");
      return;
    }
    
    try {
        const result = await addGuest({ guestName, roomNo, expiry, phone, email });
      // ensure token is encoded and chatUrl logged
      try {
        const url = new URL(result.chatUrl, window.location.origin).toString();
        console.log('Generated chatUrl (from addGuest):', url);
        setChatbotLink(url);
      } catch (err) {
        // fallback: encode token if result.chatUrl contains a token param
        try {
          const m = /[?&]token=([^&]+)/.exec(result.chatUrl || '');
          if (m && m[1]) {
            const token = encodeURIComponent(m[1]);
            const chatUrl = `${window.location.origin}/?token=${token}`;
            console.log('Generated chatUrl (fallback, encoded token):', chatUrl);
            setChatbotLink(chatUrl);
          } else {
            console.log('Generated chatUrl (raw):', result.chatUrl);
            setChatbotLink(result.chatUrl);
          }
        } catch (e2) {
          console.warn('Failed to normalize chatUrl from addGuest:', e2);
          setChatbotLink(result.chatUrl);
        }
      }
      setStatus(`Guest added successfully ✅`);

      // Capture values to use for notifications (we will clear state afterwards)
      const phoneToSend = formatPhoneNumber(phone);
      const guestToSend = guestName;
      const emailToSend = email;

  // Reset form
  setGuestName("");
  setRoomNo("");
  setExpiry("");
  setPhone("");
  setEmail("");
  setValidationErrors({});

      // Send chatbot link via SMS (fire-and-forget so it can't crash the UI)
      axios.post('http://localhost:5001/send-chatbot-link-sms', {
        phone: phoneToSend,
        guestName: guestToSend,
        chatUrl: result.chatUrl
      }).then(() => {
        console.log('Chatbot link sent via SMS successfully');
      }).catch((smsError) => {
        console.error('Failed to send chatbot link via SMS:', smsError?.response?.data || smsError?.message || smsError);
      });

      // Send chatbot welcome email directly from the frontend using EmailJS browser SDK
      try {
        const emailjsServiceId = 'service_7oxoiv9';
        const emailjsTemplateId = 'template_umhbwm5';
        const emailjsPublicKey = 'z7nefzf1F5xhQv9j1';

        emailjs.send(emailjsServiceId, emailjsTemplateId, {
          to_email: emailToSend,
          guest_name: guestToSend,
          chat_url: result.chatUrl,
          year: new Date().getFullYear()
        }, emailjsPublicKey).then(() => {
          console.log('Chatbot welcome email sent via EmailJS (browser SDK)');
        }).catch(err => {
          console.error('EmailJS browser send failed:', err?.text || err?.message || err);
        });
      } catch (err) {
        console.error('Unexpected error sending email from frontend (EmailJS):', err);
      }

    } catch (err) {
      console.error("Add guest error - falling back to offline mode:", err);
      // If Firestore/network is down, create a local guest token and queue it for later sync
      try {
        const token = generateGuestToken();
        const chatUrl = `${window.location.origin}/?token=${token}`;
        setChatbotLink(chatUrl);
        setStatus('Guest added locally (offline). Link generated ✅');

        // Queue the guest for later synchronization (capture values before any state clears)
        const queued = JSON.parse(localStorage.getItem('guestQueue') || '[]');
        queued.push({ guestName, roomNo, expiry, phone, email, token, createdAt: new Date().toISOString() });
        localStorage.setItem('guestQueue', JSON.stringify(queued));
        console.log('Queued guest for later sync', queued[queued.length - 1]);
      } catch (fallbackErr) {
        setStatus("Error adding guest ❌");
        console.error("Fallback add guest error:", fallbackErr);
      }
    }
  };


  return (
    <div className="admin-container">
      <div className="admin-card">
        <div className="dashboard-header">
          <div className="header-content">
            <h1 className="admin-title">🏨 Hotel Admin Dashboard</h1>
            <p className="admin-subtitle">Manage guest access and chatbot permissions</p>
          </div>
          <div className="header-actions">
            <span className="welcome-text">
              Welcome, {currentUser?.email}
            </span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-button ${activeTab === 'addGuest' ? 'active' : ''}`}
            onClick={() => setActiveTab('addGuest')}
          >
            <span className="tab-icon">➕</span>
            Add Guest
          </button>
          <button 
            className={`tab-button ${activeTab === 'guestList' ? 'active' : ''}`}
            onClick={() => setActiveTab('guestList')}
          >
            <span className="tab-icon">👥</span>
            Guest List
          </button>
          <button
            className={`tab-button ${activeTab === 'escalations' ? 'active' : ''}`}
            onClick={() => setActiveTab('escalations')}
          >
            <span className="tab-icon">⚠️</span>
            Escalations
            {newEscalationCount > 0 && (
              <span className="tab-badge">{newEscalationCount}</span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'addGuest' && (
          <div className="tab-content">
            <form className="admin-form add-guest-form" onSubmit={handleAddGuest}>
          <div className="form-group">
            <label className="form-label">Guest Name</label>
            <input
              type="text"
              placeholder="Enter guest name (letters only)"
              value={guestName}
              onChange={(e) => {
                setGuestName(e.target.value);
                validateField('guestName', e.target.value);
              }}
              required
              className={validationErrors.guestName ? 'error' : ''}
            />
            {validationErrors.guestName && (
              <small className="error-message">{validationErrors.guestName}</small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Room Number</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Enter room number"
                value={roomNo}
                onChange={(e) => {
                  setRoomNo(e.target.value);
                  validateField('roomNo', e.target.value);
                }}
                required
                className={validationErrors.roomNo ? 'error' : ''}
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                onClick={handleRoomCheck}
                disabled={!roomNo.trim() || isCheckingRoom}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {isCheckingRoom ? 'Checking...' : 'Check Room'}
              </button>
            </div>
            {validationErrors.roomNo && (
              <small className="error-message">{validationErrors.roomNo}</small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              type="tel"
              placeholder="Enter phone number (e.g., 9600021821 or +919600021821)"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                validateField('phone', e.target.value);
              }}
              required
              className={validationErrors.phone ? 'error' : ''}
            />
            <small style={{ color: '#64748b', fontSize: '0.8rem' }}>
              Enter your phone number (will be formatted as +91XXXXXXXXXX)
            </small>
            {validationErrors.phone && (
              <small className="error-message">{validationErrors.phone}</small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                validateField('email', e.target.value);
              }}
              required
              className={validationErrors.email ? 'error' : ''}
            />
            {validationErrors.email && (
              <small className="error-message">{validationErrors.email}</small>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Access Expiry</label>
            <input
              type="datetime-local"
              value={expiry}
              onChange={(e) => {
                setExpiry(e.target.value);
                validateField('expiry', e.target.value);
              }}
              required
              className={validationErrors.expiry ? 'error' : ''}
            />
            {validationErrors.expiry && (
              <small className="error-message">{validationErrors.expiry}</small>
            )}
          </div>
          {/* Note: phone and email fields are kept, but verification steps were removed per client request */}
              <button type="submit" disabled={!canRegister} className="submit-button">
                Add Guest
              </button>
            </form>

            {/* Chatbot Link Container (reusable component) */}
            {chatbotLink && (
              <ChatLinkContainer
                chatUrl={chatbotLink}
                onCopy={() => { /* existing toast handled inside component */ }}
                onDismiss={() => setChatbotLink('')}
              />
            )}
          </div>
        )}
        {activeTab === 'escalations' && (
          <div className="tab-content escalations-tab">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h2>Pending Escalations</h2>
              <div>
                <button onClick={refreshEscalations} className="refresh-button" disabled={isEscalationsLoading}>🔄 Refresh</button>
              </div>
            </div>

            <div className="escalations-grid">
              <div className={`escalation-list-container ${isEscalationsLoading ? 'loading' : ''}`}>
                <div className={`escalation-list ${isEscalationsLoading ? 'loading' : ''}`}>
                  {escalations.length === 0 && <p>No pending escalations</p>}
                  {escalations.map((esc) => (
                    <div key={esc.id} className="escalation-item" onClick={() => openEscalation(esc)}>
                      <div className="esc-header">
                        <strong>{esc.guestName || esc.token || 'Unknown Guest'}</strong>
                        <span className="esc-room">{esc.roomNo ? `Room ${esc.roomNo}` : ''}</span>
                      </div>
                      <div className="esc-question">{esc.question}</div>
                      <div className="esc-meta">{esc.createdAt?.toDate ? esc.createdAt.toDate().toLocaleString() : ''}</div>
                    </div>
                  ))}
                </div>
                {/* Move loader here so it's positioned relative to the outer card and not clipped by the inner scrollable list */}
                {isEscalationsLoading && (
                  <div className="list-loading" aria-hidden role="status" aria-live="polite">
                    <div className="spinner-circle" aria-hidden></div>
                    <div className="loading-text">Loading escalations...</div>
                  </div>
                )}
              </div>
              <div className="escalation-panel">
                {selectedEscalation ? (
                  <AdminChatPanel escalationId={selectedEscalation.id} onClose={(resolved) => {
                    if (resolved) {
                      // remove from left list if marked resolved
                      setEscalations(prev => prev.filter(e => e.id !== selectedEscalation.id));
                      setNewEscalationCount(prev => Math.max(0, prev - 1));
                    }
                    setSelectedEscalation(null);
                    setEscalationReply('');
                  }} onSend={(text) => {
                    // notify admin that message was appended (we don't auto-resolve on send)
                    addToast({ message: 'Reply appended to escalation', type: 'info', variant: 'floating', duration: 2000 });
                  }} />
                ) : (
                  <div className="esc-placeholder">Select an escalation to reply</div>
                )}
              </div>
            </div>

            {/* global overlay removed: loader is shown inside the left escalation list (.list-loading) */}
          </div>
        )}

        {activeTab === 'guestList' && (
          <div className="tab-content">
            <GuestList />
          </div>
        )}

  {/* Status Messages handled via toasts */}
      </div>
    </div>
  );
};

export default AdminDashboard;
