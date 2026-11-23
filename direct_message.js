import {
    collection,
    addDoc,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const IS_TEST_MODE = true;
const PREFIX = IS_TEST_MODE ? "test_" : "";
const COL_DM = `${PREFIX}direct_messages`;
const COL_FRIENDS = `${PREFIX}friends`;

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

    async function addFriendByEmail(emailInput) {
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

        const alreadyFriend = getMyFriends(user.uid).find((f) => f.friendUid === matchedUser.uid);
        const friendName = matchedUser.nickname || cleanEmail.split("@")[0];

        if (!alreadyFriend) {
            const friendDoc = {
                ownerUid: user.uid,
                friendUid: matchedUser.uid,
                friendEmail: cleanEmail,
                friendName,
                createdAtMillis: Date.now(),
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, COL_FRIENDS), friendDoc);
            friends.push(friendDoc);
        }

        return {
            kind: "dm",
            roomId: buildDmRoomId(user.uid, matchedUser.uid),
            title: friendName,
            otherUid: matchedUser.uid,
            lastText: `อีเมล: ${cleanEmail}`,
            lastMillis: Date.now()
        };
    }

    function buildThreads(uid) {
        const map = new Map();

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

        threads = buildThreads(user.uid);
        if (!threads.length) {
            listEl.innerHTML = `<div class="loading-text">ยังไม่มีรายชื่อเพื่อนหรือแชท กด + เพื่อแอดเพื่อนด้วยอีเมล</div>`;
            return;
        }

        listEl.innerHTML = threads.map((t) => {
            const isActive = activeThread && activeThread.roomId === t.roomId;
            return `
                <div class="dm-thread-item ${isActive ? "active" : ""}" data-room-id="${escapeHtml(t.roomId)}">
                    <div class="dm-thread-title">${escapeHtml(t.title)}</div>
                    <div class="dm-thread-sub">${escapeHtml(t.lastText || "")}</div>
                </div>
            `;
        }).join("");

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
            const [dmSnap, usersSnap, friendsSnap] = await Promise.all([
                getDocs(collection(db, COL_DM)).catch(() => ({ docs: [] })),
                getDocs(collection(db, "users")).catch(() => ({ docs: [] })),
                getDocs(collection(db, COL_FRIENDS)).catch(() => ({ docs: [] }))
            ]);
            dmMessages = dmSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            registeredUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            friends = friendsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (err) {
            console.error("DM load error:", err);
        }
        renderThreads();
        if (activeThread) {
            const updated = threads.find((t) => t.roomId === activeThread.roomId);
            if (updated) activeThread = updated;
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
        const emailInput = prompt("กรอกอีเมลโรงเรียนที่เพื่อนใช้สมัคร (เช่น s12345@ben.ac.th):");
        if (!emailInput || !emailInput.trim()) return;
        const thread = await addFriendByEmail(emailInput);
        if (thread) {
            renderThreads();
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
        async openDirectWith({ targetUid, targetName, onOpenTab }) {
            const user = getCurrentUser();
            if (!user || !user.uid) return;
            await loadMessages();
            if (typeof onOpenTab === "function") onOpenTab();
            if (!targetUid) return;
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
