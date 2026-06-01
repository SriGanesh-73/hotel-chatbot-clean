import { db } from "./firebaseconfig";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDocs,
  Timestamp
} from "firebase/firestore";
import { arrayUnion, limit } from "firebase/firestore";

const escalationCollection = collection(db, "escalations");

/**
 * Create a new escalation document when chatbot can't answer
 * data: { token, guestId, guestName, roomNo, question }
 */
export const createEscalation = async (data) => {
  try {
    const payload = {
      token: data.token || null,
      guestId: data.guestId || null,
      guestName: data.guestName || null,
      roomNo: data.roomNo || null,
      question: data.question || "",
      status: "pending",
      adminReply: null,
      adminId: null,
      createdAt: Timestamp.now(),
      repliedAt: null,
      // Initialize conversation messages so admin can view the thread
      messages: [
        {
          sender: 'guest',
          text: data.question || "",
          timestamp: Timestamp.now()
        }
      ]
    };

    const ref = await addDoc(escalationCollection, payload);
    return { id: ref.id, ...payload };
  } catch (error) {
    console.error("Error creating escalation:", error);
    throw error;
  }
};

/**
 * Find an existing pending escalation for a token or guestId (single instance per conversation)
 */
export const findOpenEscalation = async (token, guestId) => {
  // Attempt an ordered query first; if it fails (requires index), fall back to where-only + client-side sort
  try {
    if (guestId) {
      try {
        const q = query(escalationCollection, where('guestId', '==', guestId), where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      } catch (err) {
        console.warn('Ordered guestId query failed, falling back to where-only:', err);
        const q2 = query(escalationCollection, where('guestId', '==', guestId), where('status', '==', 'pending'));
        const snap2 = await getDocs(q2);
        const items = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a,b) => {
          const at = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0);
          const bt = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0);
          return bt - at;
        });
        if (items.length) return items[0];
      }
    }

    if (token) {
      try {
        const q3 = query(escalationCollection, where('token', '==', token), where('status', '==', 'pending'), orderBy('createdAt', 'desc'), limit(1));
        const snapshot3 = await getDocs(q3);
        if (!snapshot3.empty) return { id: snapshot3.docs[0].id, ...snapshot3.docs[0].data() };
      } catch (err) {
        console.warn('Ordered token query failed, falling back to where-only:', err);
        const q4 = query(escalationCollection, where('token', '==', token), where('status', '==', 'pending'));
        const snap4 = await getDocs(q4);
        const items = snap4.docs.map(d => ({ id: d.id, ...d.data() }));
        items.sort((a,b) => {
          const at = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0);
          const bt = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0);
          return bt - at;
        });
        if (items.length) return items[0];
      }
    }

    return null;
  } catch (err) {
    console.warn('findOpenEscalation failed unexpectedly', err);
    return null;
  }
};

/**
 * Append a message object to escalation.messages using arrayUnion
 * message: { sender: 'guest'|'bot'|'admin', text: string, timestamp: Timestamp }
 */
export const appendMessageToEscalation = async (escalationId, message) => {
  try {
    if (!escalationId) throw new Error('escalationId required');
    const ref = doc(db, 'escalations', escalationId);
    // normalize timestamp to Firestore Timestamp if it's a Date
    const msg = { ...message };
    if (msg.timestamp && msg.timestamp instanceof Date) {
      msg.timestamp = Timestamp.fromDate(msg.timestamp);
    }
    await updateDoc(ref, { messages: arrayUnion(msg) });
    return true;
  } catch (err) {
    console.error('Failed to append message to escalation:', err);
    throw err;
  }
};

/**
 * Set adminReply on escalation without marking it resolved. This allows admin to send
 * replies that guests can see while keeping the escalation open until manually resolved.
 */
export const setAdminReply = async (escalationId, adminId, replyText) => {
  try {
    const ref = doc(db, 'escalations', escalationId);
    await updateDoc(ref, {
      adminReply: replyText,
      adminId: adminId || null,
      repliedAt: Timestamp.now(),
      // add a small helper object so clients can observe last admin message easily
      lastAdminMessage: {
        text: replyText,
        adminId: adminId || null,
        ts: Timestamp.now()
      }
    });
    return true;
  } catch (err) {
    console.error('Failed to set adminReply on escalation:', err);
    throw err;
  }
};

/**
 * Set/clear guestTyping flag on an escalation so admin UI can show a typing indicator
 */
export const setGuestTyping = async (escalationId, isTyping = true) => {
  try {
    const ref = doc(db, 'escalations', escalationId);
    await updateDoc(ref, { guestTyping: !!isTyping, guestTypingUpdatedAt: Timestamp.now() });
    return true;
  } catch (err) {
    console.error('Failed to set guestTyping flag on escalation:', err);
    throw err;
  }
};

/**
 * Set/clear adminTyping flag on an escalation so guest UI can show admin typing indicator
 */
export const setAdminTyping = async (escalationId, isTyping = true) => {
  try {
    const ref = doc(db, 'escalations', escalationId);
    await updateDoc(ref, { adminTyping: !!isTyping, adminTypingUpdatedAt: Timestamp.now() });
    return true;
  } catch (err) {
    console.error('Failed to set adminTyping flag on escalation:', err);
    throw err;
  }
};

/**
 * Listen for pending escalations (for admin dashboard)
 * callback receives array of escalation docs
 */
export const listenPendingEscalations = (callback) => {
  try {
    const q = query(escalationCollection, where("status", "==", "pending"), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(items);
    }, (err) => {
      console.error('Escalation listen error:', err);
      callback([]);
    });
    return unsub;
  } catch (error) {
    console.error('Error setting up pending escalations listener:', error);
    return () => {};
  }
};

/**
 * Listen for escalations for a specific guest token (for guest chat page)
 * Calls callback with updated doc when adminReply is set
 */
export const listenEscalationsForGuest = (token, callback) => {
  try {
    if (!token) return () => {};
    const q = query(escalationCollection, where('token', '==', token), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(items);
    }, (err) => {
      console.error('Guest escalation listen error:', err);
      callback([]);
    });
    return unsub;
  } catch (error) {
    console.error('Error setting up guest escalation listener:', error);
    return () => {};
  }
};

/**
 * Reply to an escalation: set adminReply, adminId, status and repliedAt
 */
export const replyToEscalation = async (escalationId, adminId, replyText) => {
  try {
    const ref = doc(db, 'escalations', escalationId);
    await updateDoc(ref, {
      adminReply: replyText,
      adminId: adminId || null,
      status: 'resolved',
      repliedAt: Timestamp.now()
    });
    return true;
  } catch (error) {
    console.error('Error replying to escalation:', error);
    throw error;
  }
};

/**
 * Mark an escalation resolved without sending a textual reply (admin acknowledged/handled the issue)
 */
export const markEscalationResolved = async (escalationId, adminId) => {
  try {
    const ref = doc(db, 'escalations', escalationId);
    await updateDoc(ref, {
      status: 'resolved',
      adminId: adminId || null,
      repliedAt: Timestamp.now()
    });
    return true;
  } catch (error) {
    console.error('Error marking escalation resolved:', error);
    throw error;
  }
};

/**
 * Helper: get recent escalations (one-off)
 */
export const getRecentEscalations = async (limit = 20) => {
  try {
    const q = query(escalationCollection, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error fetching escalations:', error);
    throw error;
  }
};

/**
 * Get escalations for a specific token (one-off fetch)
 */
export const getEscalationsByToken = async (token) => {
  try {
    if (!token) return [];
    const q = query(escalationCollection, where('token', '==', token), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    // If Firestore requires a composite index for this query, fall back to a where-only query
    // and sort client-side so client polling still works while the index is created.
    console.warn('getEscalationsByToken failed, attempting fallback where-only query:', error);
    try {
      const q2 = query(escalationCollection, where('token', '==', token));
      const snapshot2 = await getDocs(q2);
      const items = snapshot2.docs.map(d => ({ id: d.id, ...d.data() }));
      // sort by createdAt desc (handle Timestamp objects)
      items.sort((a, b) => {
        const at = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0);
        const bt = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0);
        return bt - at;
      });
      return items;
    } catch (err2) {
      console.error('Fallback where-only query also failed for token escalations:', err2);
      throw err2;
    }
  }
};

/**
 * Get escalations for a specific guestId (one-off fetch)
 */
export const getEscalationsByGuestId = async (guestId) => {
  try {
    if (!guestId) return [];
    const q = query(escalationCollection, where('guestId', '==', guestId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('getEscalationsByGuestId failed, attempting fallback where-only query:', error);
    try {
      const q2 = query(escalationCollection, where('guestId', '==', guestId));
      const snapshot2 = await getDocs(q2);
      const items = snapshot2.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => {
        const at = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0);
        const bt = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0);
        return bt - at;
      });
      return items;
    } catch (err2) {
      console.error('Fallback where-only query also failed for guestId escalations:', err2);
      throw err2;
    }
  }
};

/**
 * Listen for escalations by token and/or guestId and merge results.
 * Returns an unsubscribe function that removes underlying listeners.
 */
export const listenEscalationsForGuestCombined = (token, guestId, callback) => {
  try {
    const subs = [];
    const seen = new Map();

    const emit = () => {
      // merge seen map values and sort by createdAt desc
      const items = Array.from(seen.values()).sort((a,b) => {
        const at = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0);
        const bt = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0);
        return bt - at;
      });
      callback(items);
    };

    if (token) {
      try {
        const q1 = query(escalationCollection, where('token', '==', token), orderBy('createdAt', 'desc'));
        const unsub1 = onSnapshot(q1, (snapshot) => {
          snapshot.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() }));
          emit();
        }, (err) => console.error('listenEscalationsForGuestCombined token error:', err));
        subs.push(unsub1);
      } catch (err) {
        // Firestore may require a composite index for this query. Fall back to a where-only
        // snapshot (no orderBy) so the client still receives updates and we can sort client-side.
        console.warn('Ordered token query failed in combined listener; falling back to where-only snapshot. This usually means a composite index is required:', err);
        try {
          const q1b = query(escalationCollection, where('token', '==', token));
          const unsub1b = onSnapshot(q1b, (snapshot) => {
            snapshot.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() }));
            emit();
          }, (err2) => console.error('listenEscalationsForGuestCombined token (fallback) error:', err2));
          subs.push(unsub1b);
        } catch (err2) {
          console.error('Failed to set up fallback token snapshot listener:', err2);
        }
      }
    }

    if (guestId) {
      try {
        const q2 = query(escalationCollection, where('guestId', '==', guestId), orderBy('createdAt', 'desc'));
        const unsub2 = onSnapshot(q2, (snapshot) => {
          snapshot.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() }));
          emit();
        }, (err) => console.error('listenEscalationsForGuestCombined guestId error:', err));
        subs.push(unsub2);
      } catch (err) {
        console.warn('Ordered guestId query failed in combined listener; falling back to where-only snapshot. This usually means a composite index is required:', err);
        try {
          const q2b = query(escalationCollection, where('guestId', '==', guestId));
          const unsub2b = onSnapshot(q2b, (snapshot) => {
            snapshot.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() }));
            emit();
          }, (err2) => console.error('listenEscalationsForGuestCombined guestId (fallback) error:', err2));
          subs.push(unsub2b);
        } catch (err2) {
          console.error('Failed to set up fallback guestId snapshot listener:', err2);
        }
      }
    }

    // If neither token nor guestId provided, return noop
    if (subs.length === 0) return () => {};

    return () => subs.forEach(s => s());
  } catch (error) {
    console.error('Error setting up combined escalation listener:', error);
    return () => {};
  }
};

/**
 * Listen for a single escalation document by id and call callback with the doc data
 */
export const listenEscalationById = (escalationId, callback) => {
  try {
    if (!escalationId) return () => {};
    const dref = doc(db, 'escalations', escalationId);
    const unsub = onSnapshot(dref, (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...snap.data() });
    }, (err) => {
      console.error('listenEscalationById error:', err);
      callback(null);
    });
    return unsub;
  } catch (err) {
    console.error('Failed to set up escalation doc listener:', err);
    return () => {};
  }
};
