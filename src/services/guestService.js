// src/services/guestService.js
import { db } from "./firebaseconfig";
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  writeBatch
} from "firebase/firestore";

const guestCollection = collection(db, "guests");

/**
 * Generate a unique token for guest access
 */
export const generateGuestToken = () => {
  const array = new Uint32Array(4);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec => dec.toString(36)).join('');
};
  

/**
 * Add a new guest to Firestore
 * @param {Object} guestData - { guestName, roomNo, expiry }
 */
export const addGuest = async (guestData) => {
    try {
      // Generate a unique token for the guest
      const token = generateGuestToken();
      
      // Convert expiry to Firestore Timestamp if provided
      let expiryTimestamp = null;
      if (guestData.expiry) {
        const expiryDate = new Date(guestData.expiry);
        if (!isNaN(expiryDate.getTime())) { // Check if valid date
          expiryTimestamp = Timestamp.fromDate(expiryDate);
        }
      }
      
      // Prepare guest data with token
      const guestRecord = {
        guestName: guestData.guestName,
        roomNo: guestData.roomNo,
        phone: guestData.phone,
        email: guestData.email,
        expiry: expiryTimestamp,
        token: token,
        createdAt: Timestamp.now(),
        isActive: true
      };
      
      const docRef = await addDoc(guestCollection, guestRecord);
      
      // Return guest data with generated token
      return { 
        id: docRef.id, 
        ...guestRecord,
        chatUrl: `${window.location.origin}/?token=${token}`
      };
    } catch (error) {
      console.error("Error adding guest: ", error);
      throw error;
    }
};

/**
 * Get guest by ID
 */
export const getGuestById = async (id) => {
  try {
    const docRef = doc(db, "guests", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching guest: ", error);
    throw error;
  }
};

/**
 * Get guest by token (used in ChatPage)
 */
export const getGuestByToken = async (token) => {
  try {
    const q = query(guestCollection, where("token", "==", token));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching guest by token: ", error);
    throw error;
  }
};

/**
 * Update guest info
 */
export const updateGuest = async (id, updatedData) => {
  try {
    const docRef = doc(db, "guests", id);
    await updateDoc(docRef, updatedData);
    return true;
  } catch (error) {
    console.error("Error updating guest: ", error);
    throw error;
  }
};

/**
 * Delete guest
 */
export const deleteGuest = async (id) => {
  try {
    await deleteDoc(doc(db, "guests", id));
    return true;
  } catch (error) {
    console.error("Error deleting guest: ", error);
    throw error;
  }
};

/**
 * Check if guest token is valid and not expired
 * This function is used in ChatPage to validate access
 */
/**
 * Check if guest token is valid and not expired
 * This function is used in ChatPage to validate access
 */
export const checkGuestValidity = async () => {
    try {
      // Get token from URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      
      if (!token) {
        console.log("No token found in URL");
        return { isValid: false, reason: "No token provided" };
      }
      
      // Get guest by token
      const guest = await getGuestByToken(token);
      
      if (!guest) {
        console.log("Guest not found for token:", token);
        return { isValid: false, reason: "Invalid token" };
      }
      
      // Check if guest is active
      if (guest.isActive === false) {
        console.log("Guest access is deactivated");
        return { isValid: false, reason: "Access deactivated" };
      }
      
      // Get current time
      const now = new Date();
      
      // Check expiry date (handle both Timestamp and Date objects)
      if (guest.expiry) {
        let expiryDate;
        
        // Convert Firestore Timestamp to JavaScript Date if needed
        if (guest.expiry.toDate) {
          expiryDate = guest.expiry.toDate(); // Firestore Timestamp
        } else if (guest.expiry instanceof Date) {
          expiryDate = guest.expiry; // Already a Date object
        } else {
          console.log("Invalid expiry format:", guest.expiry);
          return { isValid: false, reason: "Invalid expiry date format" };
        }
        
        if (now > expiryDate) {
          console.log("Guest access expired:", expiryDate);
          return { isValid: false, reason: "Access expired" };
        }
      }
      
      console.log("Guest access valid:", guest);
      return { isValid: true, guest: guest };
      
    } catch (error) {
      console.error("Error checking guest validity: ", error);
      return { isValid: false, reason: "Server error" };
    }
};

/**
 * Get all guests
 */
export const getAllGuests = async () => {
  try {
    const querySnapshot = await getDocs(guestCollection);
    return querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.error("Error fetching all guests: ", error);
    throw error;
  }
};

/**
 * Check if a room is already occupied by an active guest
 */
export const checkRoomOccupancy = async (roomNo) => {
  try {
    const q = query(
      guestCollection, 
      where("roomNo", "==", roomNo),
      where("isActive", "==", true)
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const guest = querySnapshot.docs[0].data();
      return {
        isOccupied: true,
        guest: { id: querySnapshot.docs[0].id, ...guest }
      };
    }
    
    return { isOccupied: false, guest: null };
  } catch (error) {
    console.error("Error checking room occupancy: ", error);
    throw error;
  }
};

/**
 * Expire guests whose expiry timestamp is in the past and are still active.
 * Sets isActive = false for those records.
 */
export const expireGuestsIfNeeded = async () => {
  try {
    // find active guests with expiry <= now
    const now = Timestamp.now();
    const q = query(guestCollection, where('isActive', '==', true), where('expiry', '<=', now));
    const snapshot = await getDocs(q);
    const updates = [];
    const expiredGuests = [];
    snapshot.forEach(docSnap => {
      const ref = doc(db, 'guests', docSnap.id);
      updates.push(updateDoc(ref, { isActive: false }));
      expiredGuests.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (updates.length) await Promise.all(updates);

    // Fallback: if no results (or to catch records stored with non-Timestamp expiry formats),
    // scan active guests client-side and compare expiry values. This handles older/incorrect
    // data formats and avoids relying solely on server-side inequality queries which may
    // fail due to missing composite indexes or differing stored types.
    try {
      const foundIds = new Set(expiredGuests.map(g => g.id));
      const needClientScan = true; // always run scan to be resilient
      if (needClientScan) {
        const qActive = query(guestCollection, where('isActive', '==', true));
        const activeSnap = await getDocs(qActive);
        const clientUpdates = [];
        for (const docSnap of activeSnap.docs) {
          if (foundIds.has(docSnap.id)) continue; // already handled by server-side query
          const data = docSnap.data();
          if (!data || !data.expiry) continue;
          // normalize expiry to JS Date
          let expiryDate = null;
          try {
            if (data.expiry && typeof data.expiry.toDate === 'function') {
              expiryDate = data.expiry.toDate();
            } else if (typeof data.expiry === 'string') {
              const d = new Date(data.expiry);
              if (!isNaN(d.getTime())) expiryDate = d;
            } else if (data.expiry instanceof Date) {
              expiryDate = data.expiry;
            }
          } catch (e) {
            // ignore parse errors
            expiryDate = null;
          }
          if (expiryDate && expiryDate.getTime() <= (new Date()).getTime()) {
            const ref = doc(db, 'guests', docSnap.id);
            clientUpdates.push(updateDoc(ref, { isActive: false }));
            expiredGuests.push({ id: docSnap.id, ...data });
            foundIds.add(docSnap.id);
          }
        }
        if (clientUpdates.length) await Promise.all(clientUpdates);
      }
    } catch (clientScanErr) {
      console.warn('Client-side expiry scan failed:', clientScanErr);
    }

    // For each expired guest, mark any pending escalations tied to them as 'expired'
    // and write an audit log entry for each change (safer than hard-deleting docs).
    let totalEscalationsExpired = 0;
    if (expiredGuests.length) {
      const escalationCol = collection(db, 'escalations');
      for (const g of expiredGuests) {
        try {
          // find pending escalations by guestId
          const q1 = query(escalationCol, where('guestId', '==', g.id), where('status', '==', 'pending'));
          const snap1 = await getDocs(q1);
          // find pending escalations by token if present
          let snap2 = { docs: [] };
          if (g.token) {
            const q2 = query(escalationCol, where('token', '==', g.token), where('status', '==', 'pending'));
            snap2 = await getDocs(q2);
          }

          // collect unique doc refs to update
          const toExpire = new Map();
          snap1.docs.forEach(d => toExpire.set(d.id, d.ref));
          snap2.docs.forEach(d => toExpire.set(d.id, d.ref));

          if (toExpire.size) {
            const batch = writeBatch(db);
            const nowTs = Timestamp.now();
            for (const [id, ref] of toExpire.entries()) {
              // update escalation status to expired
              batch.update(ref, { status: 'expired', expiredAt: nowTs, expiredReason: 'guest_expired' });
              // create an audit log document for this expiration
              const auditRef = doc(collection(db, 'auditLogs'));
              batch.set(auditRef, {
                type: 'escalation_expired',
                escalationId: id,
                guestId: g.id || null,
                token: g.token || null,
                reason: 'guest_expired',
                ts: nowTs
              });
            }
            await batch.commit();
            totalEscalationsExpired += toExpire.size;
            console.debug(`Marked ${toExpire.size} pending escalations as expired for guest ${g.id}`);
          }
        } catch (err) {
          console.warn('Failed to expire escalations for expired guest', g.id, err);
        }
      }
    }

    return { updated: updates.length, expiredGuests: expiredGuests.length, expiredEscalations: totalEscalationsExpired };
  } catch (error) {
    console.error('Error expiring guests:', error);
    throw error;
  }
};

// Additional helper: scan pending escalations and expire any that reference guests that are missing
// or expired. This is a fallback that helps when the guest expiry query can't run due to
// index/type mismatches. It is safe to run periodically.
export const expirePendingEscalationsLinkedToExpiredGuests = async () => {
  try {
    const escalationCol = collection(db, 'escalations');
    const qPending = query(escalationCol, where('status', '==', 'pending'));
    const pendingSnap = await getDocs(qPending);
    if (pendingSnap.empty) return { scanned: 0, expired: 0 };

    const batch = writeBatch(db);
    const nowTs = Timestamp.now();
    let expiredCount = 0;

    for (const docSnap of pendingSnap.docs) {
      const esc = { id: docSnap.id, ...docSnap.data() };
      let shouldExpire = false;

      // If escalation references a guestId, fetch that guest doc and inspect expiry/isActive
      if (esc.guestId) {
        try {
          const guestRef = doc(db, 'guests', esc.guestId);
          const guestSnap = await getDoc(guestRef);
          if (!guestSnap.exists()) {
            // guest removed — expire escalation
            shouldExpire = true;
          } else {
            const g = guestSnap.data();
            if (g.isActive === false) shouldExpire = true;
            else if (g.expiry) {
              // normalize expiry to JS Date
              let expiryDate = null;
              if (typeof g.expiry.toDate === 'function') expiryDate = g.expiry.toDate();
              else if (typeof g.expiry === 'string') {
                const d = new Date(g.expiry);
                if (!isNaN(d.getTime())) expiryDate = d;
              } else if (g.expiry instanceof Date) expiryDate = g.expiry;
              if (expiryDate && expiryDate.getTime() <= (new Date()).getTime()) shouldExpire = true;
            }
          }
        } catch (err) {
          console.warn('Failed to fetch guest for escalation check', esc.guestId, err);
        }
      } else if (esc.token) {
        // No guestId — try to find guest by token
        try {
          const guest = await getGuestByToken(esc.token);
          if (!guest) {
            shouldExpire = true;
          } else {
            if (guest.isActive === false) shouldExpire = true;
            else if (guest.expiry) {
              let expiryDate = null;
              if (typeof guest.expiry.toDate === 'function') expiryDate = guest.expiry.toDate();
              else if (typeof guest.expiry === 'string') {
                const d = new Date(guest.expiry);
                if (!isNaN(d.getTime())) expiryDate = d;
              } else if (guest.expiry instanceof Date) expiryDate = guest.expiry;
              if (expiryDate && expiryDate.getTime() <= (new Date()).getTime()) shouldExpire = true;
            }
          }
        } catch (err) {
          console.warn('Failed to query guest by token for escalation', esc.id, err);
        }
      }

      if (shouldExpire) {
        batch.update(doc(db, 'escalations', esc.id), { status: 'expired', expiredAt: nowTs, expiredReason: 'guest_expired' });
        const auditRef = doc(collection(db, 'auditLogs'));
        batch.set(auditRef, {
          type: 'escalation_expired',
          escalationId: esc.id,
          guestId: esc.guestId || null,
          token: esc.token || null,
          reason: 'guest_expired',
          ts: nowTs
        });
        expiredCount += 1;
      }
    }

    if (expiredCount) await batch.commit();
    return { scanned: pendingSnap.size, expired: expiredCount };
  } catch (err) {
    console.error('Failed to expire pending escalations via fallback scan:', err);
    throw err;
  }
};