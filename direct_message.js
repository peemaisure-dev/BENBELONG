import {
    collection,
    addDoc,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const IS_TEST_MODE = true;
const PREFIX = IS_TEST_MODE ? "test_" : "";
const COL_DM = `${PREFIX}direct_messages`;
const COL_FW_CHATS = `${PREFIX}fastwork_chats`;

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
    let fwMessages = [];
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

    function buildThreads(uid) {
        const map = new Map();

        dmMessages.forEach((m) => {
            const isParticipant = m.senderUid === uid || m.recipientUid === uid;
            if (!isParticipant) return;
            const otherName = m.senderUid === uid ? (m.recipientName || "คู่สนทนา") : (m.senderName || "คู่สนทนา");
            const otherUid = m.senderUid === uid ? m.recipientUid : m.senderUid;
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

        fwMessages.forEach((m) => {
            const roomKey = `fw_${m.shopId || "shop"}_${m.senderUid || "user"}`;
            const ts = Number(m.createdAtMillis || 0);
            const label = m.type === "order" ? `คำสั่งงาน: ${m.orderNote || "-"}` : (m.text || "");
            const prev = map.get(roomKey);
            if (!prev || ts >= prev.lastMillis) {
                map.set(roomKey, {
                    kind: "fw",
                    roomId: roomKey,
                    shopId: m.shopId,
                    title: `ร้าน BenFastwork • ${m.senderName || "ผู้ใช้งาน"}`,
                    lastText: label,
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
            listEl.innerHTML = `<div class="loading-text">ยังไม่มีประวัติแชท กด + เพื่อเริ่มคุยได้เลย</div>`;
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
        if (formEl) formEl.style.display = thread.kind === "dm" ? "flex" : "none";
        renderMessages();
    }

    function renderMessages() {
        const boxEl = els.box();
        const user = getCurrentUser();
        if (!boxEl || !activeThread) return;

        if (activeThread.kind === "fw") {
            const items = fwMessages.filter((m) => m.shopId === activeThread.shopId);
            boxEl.innerHTML = items.length
                ? items.map((m) => `
                    <div class="fw-msg-bubble theirs">
                        <div class="fw-msg-sender">${escapeHtml(m.senderName || "ผู้ใช้งาน")}</div>
                        <div>${escapeHtml(m.type === "order" ? `[คำสั่งงาน] ${m.orderNote || ""}` : (m.text || ""))}</div>
                    </div>
                `).join("")
                : `<div style="text-align:center; color:#64748B;">ยังไม่มีข้อความในห้องนี้</div>`;
            boxEl.scrollTop = boxEl.scrollHeight;
            return;
        }

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
            const [dmSnap, fwSnap] = await Promise.all([
                getDocs(collection(db, COL_DM)).catch(() => ({ docs: [] })),
                getDocs(collection(db, COL_FW_CHATS)).catch(() => ({ docs: [] }))
            ]);
            dmMessages = dmSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            fwMessages = fwSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
        if (!user || !user.uid || !activeThread || activeThread.kind !== "dm") return;
        const text = els.input()?.value.trim();
        if (!text) return;

        const payload = {
            roomId: activeThread.roomId,
            senderUid: user.uid,
            senderName: user.nickname || user.email || "นักเรียนเบญฯ",
            recipientUid: activeThread.otherUid || "",
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

    async function handleNewDirectChat() {
        const user = getCurrentUser();
        if (!user || !user.uid) {
            alert("กรุณาเข้าสู่ระบบก่อนเริ่มแชทส่วนตัวครับ");
            return;
        }
        const targetUid = prompt("กรอก UID ของผู้รับข้อความส่วนตัว (เช่น uid ของคู่สนทนาหรือเจ้าของร้าน):");
        if (!targetUid || !targetUid.trim()) return;
        const cleanUid = targetUid.trim();
        if (cleanUid === user.uid) {
            alert("ไม่สามารถส่งข้อความหาตัวเองได้ครับ");
            return;
        }
        const targetName = (prompt("ระบุชื่อคู่สนทนาที่ต้องการแสดง:") || "คู่สนทนา").trim();
        const roomId = buildDmRoomId(user.uid, cleanUid);
        selectThread({
            kind: "dm",
            roomId,
            title: targetName,
            otherUid: cleanUid,
            lastText: "",
            lastMillis: Date.now()
        });
    }

    function bindEvents() {
        els.form()?.addEventListener("submit", handleSend);
        els.newBtn()?.addEventListener("click", handleNewDirectChat);
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
            if (typeof onOpenTab === "function") onOpenTab();
            await loadMessages();
            const roomId = buildDmRoomId(user.uid, targetUid);
            selectThread({
                kind: "dm",
                roomId,
                title: targetName || "คู่สนทนา",
                otherUid: targetUid,
                lastText: "",
                lastMillis: Date.now()
            });
        }
    };
}
