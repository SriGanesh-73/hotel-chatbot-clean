import React, { useState, useEffect, useRef } from "react";
import { FiEdit, FiTrash, FiSave, FiX } from 'react-icons/fi';
import { getAllGuests, deleteGuest, updateGuest, expireGuestsIfNeeded } from "../services/guestService";
import "../styles/GuestList.css";
import { useToast } from '../context/ToastContext';
import ChatLinkContainer from './ChatLinkContainer';
import emailjs from '@emailjs/browser';
import { validateEmail } from '../utils/validations';

const GuestList = () => {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [status, setStatus] = useState("");
  const statusTimerRef = useRef(null);
  const { addToast } = useToast();
  const [shownChatLink, setShownChatLink] = useState(null); // { id, chatUrl }
  const chatLinkTimerRef = useRef(null);

  const sendChatLinkEmail = async (guest, chatUrl) => {
    const recipientEmail = (guest.email || '').trim();

    if (!validateEmail(recipientEmail).isValid) {
      addToast({
        message: 'Guest email is missing or invalid for this record.',
        type: 'error',
        variant: 'static'
      });
      return;
    }

    // reuse same EmailJS service/template - non-blocking
    const serviceId = 'service_7oxoiv9';
    const templateId = 'template_umhbwm5';
    const publicKey = 'z7nefzf1F5xhQv9j1';

    await emailjs.send(serviceId, templateId, {
      to_email: recipientEmail,
      guest_name: guest.guestName || '',
      chat_url: chatUrl,
      year: new Date().getFullYear()
    }, publicKey);
  };

  const showStatus = (msg, ms = 3500) => {
    setStatus(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    if (ms > 0) {
      statusTimerRef.current = setTimeout(() => setStatus(''), ms);
    }
  };

  // Load guests on component mount
  useEffect(() => {
    loadGuests();
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  // Periodically check guest expiries and update status dynamically (no full refresh required)
  useEffect(() => {
    let interval = null;

    const parseExpiry = (expiry) => {
      if (!expiry) return null;
      try {
        if (expiry.toDate) return expiry.toDate();
        if (expiry.seconds) return new Date(expiry.seconds * 1000);
        return new Date(expiry);
      } catch (err) {
        return null;
      }
    };

    const checkStatuses = async () => {
      if (!guests || guests.length === 0) return;
      const now = new Date();
      const updates = [];
      const newGuests = guests.map(g => {
        const expDate = parseExpiry(g.expiry);
        if (expDate && expDate < now && g.isActive) {
          // mark locally expired
          const updated = { ...g, isActive: false };
          // queue backend update (fire-and-forget)
          updates.push(updateGuest(g.id, { isActive: false }).catch(err => console.warn('Expiry update failed for', g.id, err)));
          return updated;
        }
        return g;
      });

      if (updates.length) {
        // update state immediately for responsive UI
        setGuests(newGuests);
        // let the backend updates proceed in background
        Promise.allSettled(updates).then(results => {
          const failed = results.filter(r => r.status === 'rejected');
          if (failed.length) console.warn('Some expiry updates failed during periodic check:', failed);
        });
      }
    };

    // run immediately and then on interval
    checkStatuses();
    interval = setInterval(checkStatuses, 15000); // every 15s

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [guests]);

  // Poll backend for remote updates (merge into local state) while on this screen
  useEffect(() => {
    let poll = null;
    let isMounted = true;

    const mergeGuests = (remote) => {
      if (!isMounted) return;
      // If user is editing, don't overwrite that row
      setGuests(prev => {
        // build map for quick lookup
        const prevMap = new Map(prev.map(g => [g.id, g]));
        const merged = remote.map(r => {
          const existing = prevMap.get(r.id);
          if (!existing) return r; // new guest
          // if currently editing this guest, keep local fields for edit
          if (editingId === r.id) return existing;
          // preserve shownChatLink row (do not clear it)
          // prefer remote updated fields but keep any transient local-only props
          return { ...existing, ...r };
        });
        // if remote removed some guests, keep prev rows that are not present? We'll filter to merged
        return merged;
      });
    };

    const doPoll = async () => {
      try {
        const remote = await getAllGuests();
        // normalize remote array
        mergeGuests(remote);
      } catch (err) {
        console.warn('GuestList polling failed', err);
      }
    };

    // start polling shortly after mount
    doPoll();
    poll = setInterval(doPoll, 12000); // every 12s

    return () => {
      isMounted = false;
      if (poll) clearInterval(poll);
    };
  }, [editingId, shownChatLink]);

  const loadGuests = async () => {
    try {
      setLoading(true);
      // expire any guests that passed their expiry
      try { await expireGuestsIfNeeded(); } catch (e) { console.warn('Could not expire guests before load:', e); }
      const data = await getAllGuests();
      // detect expired guests client-side (in case server-side expire didn't run)
      const now = new Date();
      const normalized = data.map(g => ({ ...g }));
      const expiriesToUpdate = [];
      const parseExpiry = (expiry) => {
        if (!expiry) return null;
        try {
          if (expiry.toDate) return expiry.toDate();
          if (expiry.seconds) return new Date(expiry.seconds * 1000);
          return new Date(expiry);
        } catch (err) {
          return null;
        }
      };

      normalized.forEach(g => {
        const expDate = parseExpiry(g.expiry);
        if (expDate && expDate < now && g.isActive) {
          // mark locally and queue DB update
          g.isActive = false;
          expiriesToUpdate.push(updateGuest(g.id, { isActive: false }));
        }
      });

      // persist expiry updates in background
      if (expiriesToUpdate.length) {
        Promise.allSettled(expiriesToUpdate).then(results => {
          const failed = results.filter(r => r.status === 'rejected');
          if (failed.length) console.warn('Some expiry updates failed:', failed);
        });
      }

      setGuests(normalized);
    } catch (error) {
      showStatus("Error loading guests ❌");
      console.error("Error loading guests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGuest = async (id) => {
    if (!window.confirm("Are you sure you want to delete this guest?")) return;
    try {
      await deleteGuest(id);
      setGuests(prev => prev.filter(g => g.id !== id));
      showStatus("Guest deleted successfully ✅");
      addToast({ message: 'Guest deleted successfully', type: 'success', variant: 'floating', duration: 2800 });
    } catch (err) {
      showStatus("Error deleting guest ❌");
      addToast({ message: 'Error deleting guest', type: 'error', variant: 'static' });
      console.error("Delete error:", err);
    }
  };

  const handleEditGuest = (guest) => {
    setEditingId(guest.id);
    setEditForm({
      guestName: guest.guestName,
      roomNo: guest.roomNo,
      phone: guest.phone,
      email: guest.email,
      expiry: guest.expiry ? (guest.expiry.toDate ? guest.expiry.toDate().toISOString().slice(0, 16) : new Date(guest.expiry.seconds ? guest.expiry.seconds * 1000 : guest.expiry).toISOString().slice(0, 16)) : "",
      token: guest.token || ''
      , errorExpiry: ''
    });
  };

  const handleUpdateGuest = async (id) => {
    try {
      // Validate expiry: do not allow past dates/times
      const now = new Date();
      let parsedExpiry = null;
      if (editForm.expiry) {
        parsedExpiry = new Date(editForm.expiry);
        if (isNaN(parsedExpiry.getTime())) {
          // invalid date
          setEditForm(prev => ({ ...prev, errorExpiry: 'Invalid date/time' }));
          showStatus('Please provide a valid expiry date/time');
          return;
        }
        if (parsedExpiry <= now) {
          setEditForm(prev => ({ ...prev, errorExpiry: 'Expiry must be a future date and time' }));
          showStatus('Expiry must be a future date/time');
          return;
        }
      }

      const updatedData = {
        guestName: editForm.guestName,
        roomNo: editForm.roomNo,
        phone: editForm.phone,
        email: editForm.email,
        expiry: parsedExpiry || null
      };
      // If expiry was extended into the future, reactivate guest
      try {
        if (updatedData.expiry && updatedData.expiry > now) {
          updatedData.isActive = true;
        }
      } catch (e) {
        console.warn('Could not evaluate expiry date for activation check', e);
      }

      await updateGuest(id, updatedData);
      setEditingId(null);
      setEditForm({});
      await loadGuests(); // Reload the list
      showStatus("Guest updated successfully ✅");

      // If we have a token (chat link) and guest is active now, dispatch an event so AdminDashboard can show the chat link
      try {
        const token = editForm.token;
        if (token && updatedData.isActive) {
          const encoded = encodeURIComponent(token);
          const chatUrl = `${window.location.origin}/?token=${encoded}`;
          console.log('Reactivate chatUrl for guest:', chatUrl);
          window.dispatchEvent(new CustomEvent('chatlink', { detail: { chatUrl } }));
          // show inline chat link in GuestList
          setShownChatLink({ id, chatUrl });
          // Do not auto-dismiss the inline chat link anymore. Keep Dismiss button as sole way to close it.
          if (chatLinkTimerRef.current) {
            clearTimeout(chatLinkTimerRef.current);
            chatLinkTimerRef.current = null;
          }
          addToast({ message: 'Chat link reactivated and available', type: 'success', variant: 'floating', duration: 3000 });
        }
        if (token && !updatedData.isActive) {
          // do not reactivate chat link if expiry is in the past (shouldn't happen due to validation), but warn
          console.warn('Chat link not reactivated because guest is not active (expiry in past)');
        }
      } catch (e) {
        console.warn('Failed to dispatch chatlink event', e);
      }
    } catch (err) {
      showStatus("Error updating guest ❌");
      console.error("Update error:", err);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const formatDate = (expiry) => {
    if (!expiry) return "No expiry";
    
    try {
      if (expiry.toDate) {
        return expiry.toDate().toLocaleString();
      } else if (expiry.seconds) {
        return new Date(expiry.seconds * 1000).toLocaleString();
      } else {
        return new Date(expiry).toLocaleString();
      }
    } catch (error) {
      return "Invalid date";
    }
  };

  if (loading) {
    // Show the header and table shell, but render the loader inside the
    // table container so it centers over the table area instead of the card
    return (
      <div className="guest-list-container">
        <div className="guest-list-header">
          <h2 className="guest-list-title">Guest List</h2>
          <button onClick={loadGuests} className="refresh-button" disabled aria-disabled>
            🔄 Refresh
          </button>
        </div>

        <div className="guest-list-table-container">
          {/* table shell with loader inside a full-width table cell so spinner aligns where 'no guests' appears */}
          <table className="guest-list-table" aria-hidden>
            <thead>
              <tr>
                <th>Name</th>
                <th>Room</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7} className="loading-cell">
                  <div className="loading-spinner" role="status" aria-live="polite">
                    <div className="spinner-circle" aria-hidden></div>
                    <div className="loading-text">Loading guests...</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="guest-list-container">
      <div className="guest-list-header">
        <h2 className="guest-list-title">Guest List</h2>
        <button onClick={loadGuests} className="refresh-button">
          🔄 Refresh
        </button>
      </div>

      {status && (
        <div className={`status-msg ${status.includes('✅') ? 'success' : 'error'}`}>
          {status}
        </div>
      )}

      <div className="guest-list-table-container">
        <table className="guest-list-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Room</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Expiry</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="no-guests">
                    <p>No guests currently available in the hotel.</p>
                  </div>
                </td>
              </tr>
            ) : (
              guests.map(guest => (
                <React.Fragment key={guest.id}>
                  <tr key={`${guest.id}-row`}>
                  <td>
                    {editingId === guest.id ? (
                      <input
                        type="text"
                        value={editForm.guestName}
                        onChange={(e) => setEditForm({...editForm, guestName: e.target.value})}
                        className="edit-input"
                      />
                    ) : (
                      guest.guestName
                    )}
                  </td>
                  <td>
                    {editingId === guest.id ? (
                      <input
                        type="text"
                        value={editForm.roomNo}
                        onChange={(e) => setEditForm({...editForm, roomNo: e.target.value})}
                        className="edit-input"
                      />
                    ) : (
                      guest.roomNo
                    )}
                  </td>
                  <td>
                    {editingId === guest.id ? (
                      <input
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                        className="edit-input"
                      />
                    ) : (
                      guest.phone
                    )}
                  </td>
                  <td>
                    {editingId === guest.id ? (
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                        className="edit-input"
                      />
                    ) : (
                      guest.email
                    )}
                  </td>
                  <td>
                    {editingId === guest.id ? (
                      <input
                        type="datetime-local"
                        value={editForm.expiry}
                        onChange={(e) => setEditForm({...editForm, expiry: e.target.value})}
                        className="edit-input"
                      />
                    ) : (
                      formatDate(guest.expiry)
                    )}
                    {editingId === guest.id && editForm.errorExpiry ? (
                      <div className="field-error">{editForm.errorExpiry}</div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`status-badge ${guest.isActive ? 'active' : 'expired'}`}>
                      {guest.isActive ? 'Active' : 'Expired'}
                    </span>
                  </td>
                  <td>
                    {editingId === guest.id ? (
                      <div className="edit-actions">
                        <button 
                          onClick={() => handleUpdateGuest(guest.id)}
                          className="save-button"
                          aria-label="Save guest"
                        >
                          <FiSave size={14} style={{ marginRight: 6 }} /> Save
                        </button>
                        <button 
                          onClick={handleCancelEdit}
                          className="cancel-button"
                          aria-label="Cancel edit"
                        >
                          <FiX size={14} style={{ marginRight: 6 }} /> Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        <button 
                          onClick={() => handleEditGuest(guest)}
                          className="edit-button"
                        >
                          <FiEdit size={14} style={{ marginRight: 6 }} /> Edit
                        </button>
                          <button 
                            onClick={() => handleDeleteGuest(guest.id)}
                            className="delete-button"
                          >
                            <FiTrash size={14} style={{ marginRight: 6 }} /> Delete
                          </button>
                          {guest.isActive && guest.token && (
                            <button
                              className="send-link-button"
                              onClick={async () => {
                                const chatUrl = `${window.location.origin}/?token=${encodeURIComponent(guest.token)}`;
                                console.log('Send Link clicked for guest, chatUrl:', chatUrl);
                                try {
                                    await sendChatLinkEmail(guest, chatUrl);
                                  addToast({ message: 'Chat link email sent', type: 'success', variant: 'floating', duration: 2800 });
                                } catch (err) {
                                  console.error('EmailJS send failed from GuestList:', err);
                                    addToast({
                                      message: err?.text || err?.message || 'Failed to send chat link email',
                                      type: 'error',
                                      variant: 'static'
                                    });
                                }
                              }}
                                disabled={!validateEmail((guest.email || '').trim()).isValid}
                                title={!validateEmail((guest.email || '').trim()).isValid ? 'Add a valid email to send the chat link' : 'Send chat link email'}
                            >
                              Send Link
                            </button>
                          )}
                      </div>
                    )}
                  </td>
                </tr>
                {/* If this guest had their chat link reactivated, render an inline row immediately after */}
                {shownChatLink && shownChatLink.id === guest.id && (
                  <tr key={`${guest.id}-chatlink`} className="chatlink-row">
                    <td colSpan={7}>
                      <ChatLinkContainer
                        chatUrl={shownChatLink.chatUrl}
                        onDismiss={() => {
                          if (chatLinkTimerRef.current) clearTimeout(chatLinkTimerRef.current);
                          setShownChatLink(null);
                        }}
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GuestList;
