import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const IS_TEST_MODE = true;
const PREFIX = IS_TEST_MODE ? "test_" : "";
const COL_DM = `${PREFIX}direct_messages`;
const COL_FRIENDS = `${PREFIX}friends`;
const COL_FRIEND_REQUESTS = `${PREFIX}friend_requests`;

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>'"]/g, (tag) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[tag]));
}

export function buildDmRoomId(uidA, uidB) {
    return [String(uidA), String(uidB)].sort().join("__");
}

export function createDirectMessageController({ db, getCurrentUser }) {
    let dmMessages = [];
    let registeredUsers = [];
    let friends = [];
    let friendRequests = [];
    let threads = [];
    let activeThread = null;

    const els = {
        list: () => document.getElementById("dmThreadList"),
        header: () => document.getElementById("dmActiveHeader"),
        box: () => document.getElementById("dmMessagesBox"),
        form: () => document.getElementById("dmSendForm"),
        input: () => document.getElementById("dmMessageInput"),
        newBtn: () => document.getElementById("dmNewChatBtn")
    };

    function getMyFriends(uid) {
        return friends.filter((f) => f.ownerUid === uid && f.friendUid && f.friendUid !== uid);
    }

    function getIncomingRequests(uid) {
        return friendRequests.filter(
            (r) => r.toUid === uid && r.fromUid && r.fromUid !== uid && (r.status || "pending") === "pending"
        );
    }

    async function sendFriendRequestToUid(targetUid, targetNameFallback = "เจ้าของร้าน") {
        const user = getCurrentUser();
        if (!user || !user.uid) {
            alert("กรุณาเข้าสู่ระบบก่อนแอดเพื่อนครับ");
            return { status: "error", thread: null };
        }
        if (!targetUid || targetUid === user.uid) {
            return { status: "error", thread: null };
        }

        const matchedUser = registeredUsers.find((u) => u.uid === targetUid) || {};
        const targetName = matchedUser.nickname || targetNameFallback || "เจ้าของร้าน";
        const targetEmail = String(matchedUser.schoolEmail || matchedUser.email || "").toLowerCase();

        const alreadyFriend = getMyFriends(user.uid).find((f) => f.friendUid === targetUid);
        if (alreadyFriend) {
            return {
                status: "already_friend",
                thread: {
                    kind: "dm",
                    roomId: buildDmRoomId(user.uid, targetUid),
                    title: targetName,
                    otherUid: targetUid,
                    lastText: targetEmail ? `เพื่อน • ${targetEmail}` : "เพื่อนในระบบ",
                    lastMillis: Date.now()
                }
            };
        }

        const existingReq = friendRequests.find(
            (r) => r.fromUid === user.uid && r.toUid === targetUid && (r.status || "pending") === "pending"
        );
        if (existingReq) {
            alert(`ส่งคำขอแอดเพื่อนไปยัง ${targetName} แล้วครับ รอเจ้าของร้านกดรับเพื่อนในหน้า DM`);
            return { status: "pending", thread: null };
        }

        const reqDoc = {
            fromUid: user.uid,
            fromName: user.nickname || user.email || "นักเรียนเบญฯ",
            fromEmail: String(user.email || "").toLowerCase(),
            toUid: targetUid,
            toName: targetName,
            toEmail: targetEmail,
            status: "pending",
            createdAtMillis: Date.now(),
            createdAt: serverTimestamp()
        };

        const added = await addDoc(collection(db, COL_FRIEND_REQUESTS), reqDoc);
        friendRequests.push({ id: added.id, ...reqDoc });
        alert(`ส่งคำขอแอดเพื่อนไปยัง ${targetName} เรียบร้อยแล้วครับ เมื่อเจ้าของร้านกดรับเพื่อนแล้วสามารถทักแชทคุยกันได้เลย`);
        return { status: "sent", thread: null };
    }

    async function sendFriendRequestByEmail(emailInput) {
        const user = getCurrentUser();
        if (!user || !user.uid) {
            alert("กรุณาเข้าสู่ระบบก่อนแอดเพื่อนครับ");
            return null;
        }
        const cleanEmail = String(emailInput || "").trim().toLowerCase();
        if (!cleanEmail) return null;
        if (cleanEmail === String(user.email || "").toLowerCase()) {
            alert("ไม่สามารถแอดอีเมลตัวเองเป็นเพื่อนได้ครับ");
            return null;
        }

        const matchedUser = registeredUsers.find(
            (u) => String(u.schoolEmail || u.email || "").trim().toLowerCase() === cleanEmail
        );

        if (!matchedUser || !matchedUser.uid) {
            alert("ไม่พบบัญชีที่สมัครด้วยอีเมลนี้ในระบบครับ (ต้องใช้อีเมลที่สมัครบัญชี BENEFIT แล้ว)");
            return null;
        }

        const res = await sendFriendRequestToUid(
            matchedUser.uid,
            matchedUser.nickname || cleanEmail.split("@")[0]
        );
        return res.thread;
    }

    async function acceptFriendRequest(reqId) {
        const user = getCurrentUser();
        if (!user || !user.uid) return;
        const reqItem = friendRequests.find((r) => r.id === reqId);
        if (!reqItem) return;

        if (reqItem.id) {
            await updateDoc(doc(db, COL_FRIEND_REQUESTS, reqItem.id), {
                status: "accepted",
                acceptedAt: serverTimestamp()
            }).catch(() => {});
        }
        reqItem.status = "accepted";

        const nowMillis = Date.now();
        const myFriendEntry = {
            ownerUid: user.uid,
            friendUid: reqItem.fromUid,
            friendEmail: reqItem.fromEmail || "",
            friendName: reqItem.fromName || "เพื่อนในโรงเรียน",
            createdAtMillis: nowMillis,
            createdAt: serverTimestamp()
        };
        const theirFriendEntry = {
            ownerUid: reqItem.fromUid,
            friendUid: user.uid,
            friendEmail: String(user.email || "").toLowerCase(),
            friendName: user.nickname || user.email || "นักเรียนเบญฯ",
            createdAtMillis: nowMillis,
            createdAt: serverTimestamp()
        };

        if (!getMyFriends(user.uid).some((f) => f.friendUid === reqItem.fromUid)) {
            await addDoc(collection(db, COL_FRIENDS), myFriendEntry);
            friends.push(myFriendEntry);
        }
        if (!friends.some((f) => f.ownerUid === reqItem.fromUid && f.friendUid === user.uid)) {
            await addDoc(collection(db, COL_FRIENDS), theirFriendEntry);
            friends.push(theirFriendEntry);
        }

        const roomId = buildDmRoomId(user.uid, reqItem.fromUid);
        renderThreads();
        selectThread({
            kind: "dm",
            roomId,
            title: reqItem.fromName || "เพื่อนในโรงเรียน",
            otherUid: reqItem.fromUid,
            lastText: reqItem.fromEmail ? `เพื่อน • ${reqItem.fromEmail}` : "เพื่อนในระบบ",
            lastMillis: nowMillis
        });
    }

    async function rejectFriendRequest(reqId) {
        const reqItem = friendRequests.find((r) => r.id === reqId);
        if (!reqItem) return;

        if (reqItem.id) {
            await deleteDoc(doc(db, COL_FRIEND_REQUESTS, reqItem.id)).catch(() => {});
        }
        friendRequests = friendRequests.filter((r) => r.id !== reqId);
        renderThreads();
    }

    function buildThreads(uid) {
        const map = new Map();

        if (activeThread && activeThread.roomId && activeThread.otherUid) {
            map.set(activeThread.roomId, { ...activeThread });
        }

        getMyFriends(uid).forEach((f) => {
            const roomId = buildDmRoomId(uid, f.friendUid);
            map.set(roomId, {
                kind: "dm",
                roomId,
                title: f.friendName || f.friendEmail || "เพื่อนในโรงเรียน",
                otherUid: f.friendUid,
                lastText: f.friendEmail ? `เพื่อน • ${f.friendEmail}` : "เพื่อนในระบบ",
                lastMillis: Number(f.createdAtMillis || 0)
            });
        });

        dmMessages.forEach((m) => {
            const isParticipant = m.senderUid === uid || m.recipientUid === uid;
            if (!isParticipant) return;
            const otherName = m.senderUid === uid ? (m.recipientName || "คู่สนทนา") : (m.senderName || "คู่สนทนา");
            const otherUid = m.senderUid === uid ? m.recipientUid : m.senderUid;
            if (!otherUid) return;
            const roomId = m.roomId || buildDmRoomId(uid, otherUid);
            const ts = Number(m.createdAtMillis || 0);

            const prev = map.get(roomId);
            if (!prev || ts >= prev.lastMillis) {
                map.set(roomId, {
                    kind: "dm",
                    roomId,
                    title: otherName,
                    otherUid,
                    lastText: m.text || "",
                    lastMillis: ts
                });
            }
        });

        return Array.from(map.values()).sort((a, b) => b.lastMillis - a.lastMillis);
    }

    function renderThreads() {
        const listEl = els.list();
        const user = getCurrentUser();
        if (!listEl) return;
        if (!user || !user.uid) {
            listEl.innerHTML = `<div class="loading-text">กรุณาเข้าสู่ระบบก่อนใช้งาน DM</div>`;
            return;
        }

        const incoming = getIncomingRequests(user.uid);
        const requestsHtml = incoming.length
            ? `
                <div style="padding: 8px; margin-bottom: 10px; border-radius: 12px; background: #EFF6FF; border: 1px solid #BFDBFE;">
                    <div style="font-size: 0.78rem; font-weight: 700; color: #1D4ED8; margin-bottom: 6px;">
                        📩 คำขอเป็นเพื่อน (${incoming.length})
                    </div>
                    ${incoming.map((r) => `
                        <div style="background: #FFFFFF; border-radius: 10px; padding: 8px; margin-bottom: 6px; border: 1px solid #DBEAFE;">
                            <div style="font-size: 0.84rem; font-weight: 700; color: #0F172A;">${escapeHtml(r.fromName || "ผู้ใช้งาน")}</div>
                            <div style="font-size: 0.74rem; color: #64748B; margin-bottom: 6px;">${escapeHtml(r.fromEmail || "")}</div>
                            <div style="display:flex; gap:6px;">
                                <button type="button" data-accept-req="${escapeHtml(r.id)}" style="flex:1; background:#16A34A; color:#FFF; border:none; border-radius:8px; padding:4px 8px; font-size:0.76rem; font-weight:600; cursor:pointer;">✓ รับเพื่อน</button>
                                <button type="button" data-reject-req="${escapeHtml(r.id)}" style="background:#FEE2E2; color:#B91C1C; border:none; border-radius:8px; padding:4px 8px; font-size:0.76rem; font-weight:600; cursor:pointer;">✕ ปฏิเสธ</button>
                            </div>
                        </div>
                    `).join("")}
                </div>
            `
            : "";

        threads = buildThreads(user.uid);
        const threadsHtml = threads.length
            ? threads.map((t) => {
                const isActive = activeThread && activeThread.roomId === t.roomId;
                return `
                    <div class="dm-thread-item ${isActive ? "active" : ""}" data-room-id="${escapeHtml(t.roomId)}">
                        <div class="dm-thread-title">${escapeHtml(t.title)}</div>
                        <div class="dm-thread-sub">${escapeHtml(t.lastText || "")}</div>
                    </div>
                `;
            }).join("")
            : `<div class="loading-text">ยังไม่มีรายชื่อเพื่อนหรือแชท กด + เพื่อแอดเพื่อนด้วยอีเมล</div>`;

        listEl.innerHTML = requestsHtml + threadsHtml;

        listEl.querySelectorAll("[data-accept-req]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await acceptFriendRequest(btn.dataset.acceptReq);
            });
        });

        listEl.querySelectorAll("[data-reject-req]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                await rejectFriendRequest(btn.dataset.rejectReq);
            });
        });

        listEl.querySelectorAll("[data-room-id]").forEach((el) => {
            el.addEventListener("click", () => {
                const found = threads.find((x) => x.roomId === el.dataset.roomId);
                if (found) selectThread(found);
            });
        });
    }

    function selectThread(thread) {
        activeThread = thread;
        renderThreads();
        const headerEl = els.header();
        const formEl = els.form();
        if (headerEl) headerEl.innerText = thread.title;
        if (formEl) formEl.style.display = "flex";
        renderMessages();
    }

    function renderMessages() {
        const boxEl = els.box();
        const user = getCurrentUser();
        if (!boxEl || !activeThread) return;

        const items = dmMessages
            .filter((m) => m.roomId === activeThread.roomId)
            .sort((a, b) => (a.createdAtMillis || 0) - (b.createdAtMillis || 0));

        boxEl.innerHTML = items.length
            ? items.map((m) => {
                const mine = user && m.senderUid === user.uid;
                return `
                    <div class="fw-msg-bubble ${mine ? "mine" : "theirs"}">
                        <div class="fw-msg-sender">${escapeHtml(m.senderName || "ผู้ใช้งาน")}</div>
                        <div>${escapeHtml(m.text || "")}</div>
                    </div>
                `;
            }).join("")
            : `<div style="text-align:center; color:#64748B;">เริ่มส่งข้อความส่วนตัวได้เลยครับ</div>`;
        boxEl.scrollTop = boxEl.scrollHeight;
    }

    async function loadMessages() {
        const user = getCurrentUser();
        if (!user || !user.uid) return;
        try {
            const [dmSnap, usersSnap, friendsSnap, reqSnap] = await Promise.all([
                getDocs(collection(db, COL_DM)).catch(() => ({ docs: [] })),
                getDocs(collection(db, "users")).catch(() => ({ docs: [] })),
                getDocs(collection(db, COL_FRIENDS)).catch(() => ({ docs: [] })),
                getDocs(collection(db, COL_FRIEND_REQUESTS)).catch(() => ({ docs: [] }))
            ]);
            dmMessages = dmSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            registeredUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            friends = friendsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            friendRequests = reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (err) {
            console.error("DM load error:", err);
        }
        renderThreads();
        if (activeThread) {
            const updated = threads.find((t) => t.roomId === activeThread.roomId);
            if (updated) activeThread = { ...updated, otherUid: updated.otherUid || activeThread.otherUid };
            renderMessages();
        }
    }

    async function handleSend(e) {
        e.preventDefault();
        const user = getCurrentUser();
        if (!user || !user.uid || !activeThread || !activeThread.otherUid) return;
        const text = els.input()?.value.trim();
        if (!text) return;

        const payload = {
            roomId: activeThread.roomId,
            senderUid: user.uid,
            senderName: user.nickname || user.email || "นักเรียนเบญฯ",
            recipientUid: activeThread.otherUid,
            recipientName: activeThread.title || "คู่สนทนา",
            text,
            createdAtMillis: Date.now(),
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, COL_DM), payload);
        dmMessages.push(payload);
        if (els.input()) els.input().value = "";
        renderThreads();
        renderMessages();
    }

    async function handleAddFriendPrompt() {
        const user = getCurrentUser();
        if (!user || !user.uid) {
            alert("กรุณาเข้าสู่ระบบก่อนแอดเพื่อนครับ");
            return;
        }
        await loadMessages();
        const emailInput = prompt("กรอกอีเมลโรงเรียนที่เพื่อนใช้สมัครเพื่อส่งคำขอแอดเพื่อน (เช่น s12345@ben.ac.th):");
        if (!emailInput || !emailInput.trim()) return;
        const thread = await sendFriendRequestByEmail(emailInput);
        renderThreads();
        if (thread) {
            selectThread(thread);
        }
    }

    function bindEvents() {
        els.form()?.addEventListener("submit", handleSend);
        els.newBtn()?.addEventListener("click", handleAddFriendPrompt);
    }

    return {
        init() {
            bindEvents();
        },
        async onTabOpen() {
            await loadMessages();
        },
        async openDirectWith({ targetUid, targetName, addFriendOwner, onOpenTab }) {
            const user = getCurrentUser();
            if (!user || !user.uid) return;
            await loadMessages();
            if (typeof onOpenTab === "function") onOpenTab();
            if (!targetUid) return;

            if (addFriendOwner) {
                const res = await sendFriendRequestToUid(targetUid, targetName);
                renderThreads();
                if (res.thread) {
                    selectThread(res.thread);
                }
                return;
            }

            const roomId = buildDmRoomId(user.uid, targetUid);
            selectThread({
                kind: "dm",
                roomId,
                title: targetName || "เจ้าของร้าน",
                otherUid: targetUid,
                lastText: "",
                lastMillis: Date.now()
            });
        }
    };
}
