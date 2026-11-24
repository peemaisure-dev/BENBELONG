import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    increment,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const IS_TEST_MODE = true;
const PREFIX = IS_TEST_MODE ? "test_" : "";
const COL_DM = `${PREFIX}direct_messages`;
const COL_FRIENDS = `${PREFIX}friends`;
const COL_FRIEND_REQUESTS = `${PREFIX}friend_requests`;
const COL_ORDERS = `${PREFIX}fastwork_orders`;
const COL_SHOPS = `${PREFIX}fastwork_shops`;

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

function formatDeadlineDisplay(order) {
    if (order.deadlineText) return order.deadlineText;
    if (order.deadlineMillis) {
        return new Date(Number(order.deadlineMillis)).toLocaleString("th-TH", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    }
    return order.deadlineIso || "-";
}

function getStatusBadge(status) {
    switch (status) {
        case "pending_shop":
            return { text: "⏳ รอเจ้าของร้านยืนยัน", bg: "#FEF3C7", color: "#92400E" };
        case "proposed_by_shop":
            return { text: "✏️ เจ้าของร้านแก้ไขรายละเอียด รอลูกค้าตกลง", bg: "#E0E7FF", color: "#1E40AF" };
        case "confirmed":
            return { text: "✅ ยืนยันออเดอร์แล้ว", bg: "#DCFCE7", color: "#166534" };
        case "cancelled":
            return { text: "🚫 ยกเลิกออเดอร์แล้ว", bg: "#FEE2E2", color: "#991B1B" };
        default:
            return { text: "📌 ออเดอร์", bg: "#F1F5F9", color: "#334155" };
    }
}

export function createDirectMessageController({ db, getCurrentUser }) {
    let dmMessages = [];
    let registeredUsers = [];
    let friends = [];
    let friendRequests = [];
    let orders = [];
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

    function ensurePinnedOrderBar() {
        const boxEl = els.box();
        if (!boxEl || !boxEl.parentElement) return null;
        let pinBar = document.getElementById("dmPinnedOrderBar");
        if (!pinBar) {
            pinBar = document.createElement("div");
            pinBar.id = "dmPinnedOrderBar";
            pinBar.style.cssText = "display:none; padding:10px 14px; background:#F8FAFC; border-bottom:1px solid #E2E8F0; max-height:240px; overflow-y:auto;";
            boxEl.parentElement.insertBefore(pinBar, boxEl);
        }
        return pinBar;
    }

    function ensureShopCancelCounterColumn(shopId) {
        if (!shopId) return;
        getDoc(doc(db, COL_SHOPS, shopId)).then((snap) => {
            if (snap.exists() && typeof snap.data().cancelledCount !== "number") {
                updateDoc(doc(db, COL_SHOPS, shopId), { cancelledCount: 0 }).catch(() => {});
            }
        }).catch(() => {});
    }

    function getMyFriends(uid) {
        return friends.filter((f) => f.ownerUid === uid && f.friendUid && f.friendUid !== uid);
    }

    function getIncomingRequests(uid) {
        return friendRequests.filter(
            (r) => r.toUid === uid && r.fromUid && r.fromUid !== uid && (r.status || "pending") === "pending"
        );
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

        const alreadyFriend = getMyFriends(user.uid).find((f) => f.friendUid === matchedUser.uid);
        if (alreadyFriend) {
            return {
                kind: "dm",
                roomId: buildDmRoomId(user.uid, matchedUser.uid),
                title: matchedUser.nickname || cleanEmail.split("@")[0],
                otherUid: matchedUser.uid,
                lastText: `เพื่อน • ${cleanEmail}`,
                lastMillis: Date.now()
            };
        }

        const existingReq = friendRequests.find(
            (r) => r.fromUid === user.uid && r.toUid === matchedUser.uid && (r.status || "pending") === "pending"
        );
        if (existingReq) {
            alert("ส่งคำขอเป็นเพื่อนให้อีเมลนี้ไปแล้ว รออีกฝ่ายกดรับเพื่อนครับ");
            return null;
        }

        const reqDoc = {
            fromUid: user.uid,
            fromName: user.nickname || user.email || "นักเรียนเบญฯ",
            fromEmail: String(user.email || "").toLowerCase(),
            toUid: matchedUser.uid,
            toName: matchedUser.nickname || cleanEmail.split("@")[0],
            toEmail: cleanEmail,
            status: "pending",
            createdAtMillis: Date.now(),
            createdAt: serverTimestamp()
        };

        const added = await addDoc(collection(db, COL_FRIEND_REQUESTS), reqDoc);
        friendRequests.push({ id: added.id, ...reqDoc });
        alert(`ส่งคำขอเป็นเพื่อนไปยัง ${reqDoc.toName} (${cleanEmail}) เรียบร้อยแล้วครับ`);
        return null;
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

    async function createOrderAndNotify(orderDraft) {
        const user = getCurrentUser();
        if (!user || !user.uid || !orderDraft) return;
        const roomId = buildDmRoomId(orderDraft.customerUid, orderDraft.shopOwnerUid);
        const nowMillis = Date.now();

        if (orderDraft.shopId) {
            ensureShopCancelCounterColumn(orderDraft.shopId);
        }

        const orderPayload = {
            roomId,
            shopId: orderDraft.shopId || "",
            shopTitle: orderDraft.shopTitle || "ร้านบริการ",
            shopOwnerUid: orderDraft.shopOwnerUid,
            shopOwnerName: orderDraft.shopOwnerName || "เจ้าของร้าน",
            customerUid: orderDraft.customerUid,
            customerName: orderDraft.customerName || "ลูกค้า",
            requirement: orderDraft.requirement,
            deadlineIso: orderDraft.deadlineIso || "",
            deadlineMillis: Number(orderDraft.deadlineMillis || nowMillis),
            deadlineText: orderDraft.deadlineText || "",
            status: "pending_shop",
            cancelledBy: "",
            countedOnShop: false,
            createdAtMillis: nowMillis,
            updatedAtMillis: nowMillis,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const added = await addDoc(collection(db, COL_ORDERS), orderPayload);
        orders.unshift({ id: added.id, ...orderPayload });

        const msgPayload = {
            roomId,
            senderUid: user.uid,
            senderName: user.nickname || user.email || "ลูกค้า",
            recipientUid: orderDraft.shopOwnerUid,
            recipientName: orderDraft.shopOwnerName || "เจ้าของร้าน",
            text: `📌 ส่งออเดอร์ใหม่ (${orderDraft.shopTitle}): "${orderDraft.requirement}" | Deadline: ${orderDraft.deadlineText}`,
            createdAtMillis: nowMillis,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, COL_DM), msgPayload);
        dmMessages.push(msgPayload);
    }

    async function updateOrderStatus(orderId, patch, notifyText = "") {
        const user = getCurrentUser();
        if (!user || !user.uid) return;
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return;
        const order = orders[idx];
        const nowMillis = Date.now();

        const fullPatch = {
            ...patch,
            updatedAtMillis: nowMillis,
            updatedAt: serverTimestamp()
        };

        if (order.id) {
            await updateDoc(doc(db, COL_ORDERS, order.id), fullPatch);
        }
        orders[idx] = { ...order, ...fullPatch };

        if (notifyText && activeThread) {
            const recipientUid = activeThread.otherUid || (user.uid === order.customerUid ? order.shopOwnerUid : order.customerUid);
            const msgPayload = {
                roomId: order.roomId,
                senderUid: user.uid,
                senderName: user.nickname || user.email || "ผู้ใช้งาน",
                recipientUid,
                recipientName: activeThread.title || "คู่สนทนา",
                text: notifyText,
                createdAtMillis: nowMillis,
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, COL_DM), msgPayload);
            dmMessages.push(msgPayload);
        }

        renderPinnedOrders();
        renderMessages();
        renderThreads();
    }

    async function handleOwnerConfirmOrder(orderId) {
        await updateOrderStatus(
            orderId,
            { status: "confirmed" },
            "✅ เจ้าของร้านยืนยันออเดอร์เรียบร้อยแล้วครับ"
        );
    }

    async function handleOwnerEditOrder(orderId) {
        const order = orders.find((o) => o.id === orderId);
        if (!order) return;

        const nextReq = prompt("แก้ไขรายละเอียดงาน/สิ่งที่ทำ:", order.requirement || "");
        if (nextReq === null) return;
        const cleanReq = nextReq.trim();
        if (!cleanReq) return;

        const defaultIso = order.deadlineIso || (order.deadlineMillis ? new Date(Number(order.deadlineMillis)).toISOString().slice(0, 16) : "");
        const nextDeadline = prompt("แก้ไข Deadline (รูปแบบ YYYY-MM-DDTHH:mm หรือข้อความกำหนดส่ง):", defaultIso);
        if (nextDeadline === null) return;
        const cleanDeadline = nextDeadline.trim() || order.deadlineIso || "";

        const parsedMillis = new Date(cleanDeadline).getTime();
        const deadlineMillis = Number.isFinite(parsedMillis) ? parsedMillis : order.deadlineMillis;
        const deadlineText = Number.isFinite(parsedMillis)
            ? new Date(parsedMillis).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
            : cleanDeadline;

        await updateOrderStatus(
            orderId,
            {
                requirement: cleanReq,
                deadlineIso: cleanDeadline,
                deadlineMillis,
                deadlineText,
                status: "proposed_by_shop"
            },
            `✏️ เจ้าของร้านแก้ไขรายละเอียด/Deadline: "${cleanReq}" | Deadline ใหม่: ${deadlineText} (รอลูกค้ากดตกลงหรือยกเลิก)`
        );
    }

    async function handleCustomerAcceptProposal(orderId) {
        await updateOrderStatus(
            orderId,
            { status: "confirmed" },
            "👍 ลูกค้าตกลงตามรายละเอียดและ Deadline ที่แก้ไขแล้ว ยืนยันออเดอร์สำเร็จครับ"
        );
    }

    async function handleCancelOrder(orderId, reasonType) {
        const user = getCurrentUser();
        if (!user || !user.uid) return;
        const order = orders.find((o) => o.id === orderId);
        if (!order) return;

        const shouldCountOnShop = reasonType === "shop_after_confirm" || reasonType === "customer_overdue";
        if (shouldCountOnShop && order.shopId && !order.countedOnShop) {
            await updateDoc(doc(db, COL_SHOPS, order.shopId), {
                cancelledCount: increment(1)
            }).catch(() => {});
        }

        let notifyMessage = "🚫 ยกเลิกออเดอร์ก่อนยืนยันเรียบร้อยแล้วครับ (ไม่นับยอดยกเลิกบนหน้าร้าน)";
        if (reasonType === "shop_after_confirm") {
            notifyMessage = "🚫 ร้านค้ายกเลิกออเดอร์หลังยืนยันแล้ว (ระบบนับยอดยกเลิกบนหน้าร้านค้า)";
        } else if (reasonType === "customer_overdue") {
            notifyMessage = "⏰ เกินกำหนด Deadline แล้ว ลูกค้ายกเลิกออเดอร์ (ระบบนับยอดยกเลิกบนหน้าร้านค้า)";
        }

        await updateOrderStatus(
            orderId,
            {
                status: "cancelled",
                cancelledBy: user.uid,
                cancelReason: reasonType,
                countedOnShop: order.countedOnShop || shouldCountOnShop
            },
            notifyMessage
        );
    }

    function renderPinnedOrders() {
        const pinBar = ensurePinnedOrderBar();
        const user = getCurrentUser();
        if (!pinBar || !activeThread || !user) {
            if (pinBar) {
                pinBar.style.display = "none";
                pinBar.innerHTML = "";
            }
            return;
        }

        const roomOrders = orders
            .filter((o) => o.roomId === activeThread.roomId)
            .sort((a, b) => (b.updatedAtMillis || b.createdAtMillis || 0) - (a.updatedAtMillis || a.createdAtMillis || 0));

        if (!roomOrders.length) {
            pinBar.style.display = "none";
            pinBar.innerHTML = "";
            return;
        }

        const nowMs = Date.now();
        pinBar.style.display = "block";
        pinBar.innerHTML = `
            <div style="font-size:0.78rem; font-weight:700; color:#1E40AF; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                <span>📌 ประกาศออเดอร์ปักหมุดด้านบนสุดของแชท (${roomOrders.length})</span>
            </div>
            ${roomOrders.map((o) => {
                const isShopOwner = user.uid === o.shopOwnerUid;
                const isCustomer = user.uid === o.customerUid;
                const badge = getStatusBadge(o.status);
                const deadlineMs = Number(o.deadlineMillis || 0);
                const isOverdue = deadlineMs > 0 && nowMs > deadlineMs;

                let actionsHtml = "";
                if (o.status === "pending_shop") {
                    if (isShopOwner) {
                        actionsHtml += `<button type="button" data-order-confirm="${escapeHtml(o.id)}" style="background:#16A34A; color:#FFF; border:none; border-radius:8px; padding:5px 10px; font-size:0.76rem; font-weight:600; cursor:pointer;">✓ ยืนยันออเดอร์</button>`;
                        actionsHtml += `<button type="button" data-order-edit="${escapeHtml(o.id)}" style="background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; border-radius:8px; padding:5px 10px; font-size:0.76rem; font-weight:600; cursor:pointer;">✏️ แก้ไขรายละเอียด / Deadline</button>`;
                    }
                    if (isCustomer) {
                        actionsHtml += `<button type="button" data-order-cancel-pre="${escapeHtml(o.id)}" style="background:#FEE2E2; color:#991B1B; border:none; border-radius:8px; padding:5px 10px; font-size:0.76rem; font-weight:600; cursor:pointer;">✕ ยกเลิก (ไม่นับบนร้าน)</button>`;
                    }
                } else if (o.status === "proposed_by_shop") {
                    if (isCustomer) {
                        actionsHtml += `<button type="button" data-order-accept-prop="${escapeHtml(o.id)}" style="background:#16A34A; color:#FFF; border:none; border-radius:8px; padding:5px 10px; font-size:0.76rem; font-weight:600; cursor:pointer;">✓ ตกลงออเดอร์ตามที่แก้ไข</button>`;
                        actionsHtml += `<button type="button" data-order-cancel-pre="${escapeHtml(o.id)}" style="background:#FEE2E2; color:#991B1B; border:none; border-radius:8px; padding:5px 10px; font-size:0.76rem; font-weight:600; cursor:pointer;">✕ ไม่โอเค / ยกเลิก</button>`;
                    }
                    if (isShopOwner) {
                        actionsHtml += `<button type="button" data-order-edit="${escapeHtml(o.id)}" style="background:#EFF6FF; color:#1D4ED8; border:1px solid #BFDBFE; border-radius:8px; padding:5px 10px; font-size:0.76rem; font-weight:600; cursor:pointer;">✏️ แก้ไขอีกครั้ง</button>`;
                    }
                } else if (o.status === "confirmed") {
                    if (isShopOwner) {
                        actionsHtml += `<button type="button" data-order-cancel-shop="${escapeHtml(o.id)}" style="background:#FEE2E2; color:#991B1B; border:none; border-radius:8px; padding:5px 10px; font-size:0.76rem; font-weight:600; cursor:pointer;">✕ ร้านค้ายกเลิกออเดอร์ (นับยอดยกเลิก)</button>`;
                    }
                    if (isCustomer && isOverdue) {
                        actionsHtml += `<button type="button" data-order-cancel-overdue="${escapeHtml(o.id)}" style="background:#DC2626; color:#FFF; border:none; border-radius:8px; padding:5px 10px; font-size:0.76rem; font-weight:600; cursor:pointer;">⏰ เกิน Deadline • ยกเลิกออเดอร์</button>`;
                    }
                }

                return `
                    <div style="background:#FFFFFF; border:1px solid #DBEAFE; border-radius:12px; padding:10px 12px; margin-bottom:8px; box-shadow:0 2px 6px rgba(15,23,42,0.04);">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                            <strong style="font-size:0.86rem; color:#0F172A;">🛍️ ${escapeHtml(o.shopTitle || "ออเดอร์")} (ลูกค้า: ${escapeHtml(o.customerName || "")})</strong>
                            <span style="background:${badge.bg}; color:${badge.color}; padding:2px 8px; border-radius:999px; font-size:0.74rem; font-weight:700;">${badge.text}</span>
                        </div>
                        <div style="font-size:0.83rem; color:#334155; margin-bottom:3px;"><strong>รายละเอียดที่ต้องการ:</strong> ${escapeHtml(o.requirement || "")}</div>
                        <div style="font-size:0.79rem; color:${isOverdue && o.status === "confirmed" ? "#DC2626" : "#475569"}; margin-bottom:6px;">
                            <strong>Deadline:</strong> ${escapeHtml(formatDeadlineDisplay(o))} ${isOverdue && o.status === "confirmed" ? "(เลยกำหนดแล้ว)" : ""}
                        </div>
                        ${actionsHtml ? `<div style="display:flex; gap:6px; flex-wrap:wrap;">${actionsHtml}</div>` : ""}
                    </div>
                `;
            }).join("")}
        `;

        pinBar.querySelectorAll("[data-order-confirm]").forEach((btn) => {
            btn.addEventListener("click", () => handleOwnerConfirmOrder(btn.dataset.orderConfirm));
        });
        pinBar.querySelectorAll("[data-order-edit]").forEach((btn) => {
            btn.addEventListener("click", () => handleOwnerEditOrder(btn.dataset.orderEdit));
        });
        pinBar.querySelectorAll("[data-order-accept-prop]").forEach((btn) => {
            btn.addEventListener("click", () => handleCustomerAcceptProposal(btn.dataset.orderAcceptProp));
        });
        pinBar.querySelectorAll("[data-order-cancel-pre]").forEach((btn) => {
            btn.addEventListener("click", () => handleCancelOrder(btn.dataset.orderCancelPre, "before_confirm"));
        });
        pinBar.querySelectorAll("[data-order-cancel-shop]").forEach((btn) => {
            btn.addEventListener("click", () => handleCancelOrder(btn.dataset.orderCancelShop, "shop_after_confirm"));
        });
        pinBar.querySelectorAll("[data-order-cancel-overdue]").forEach((btn) => {
            btn.addEventListener("click", () => handleCancelOrder(btn.dataset.orderCancelOverdue, "customer_overdue"));
        });
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

        orders.forEach((o) => {
            const isParticipant = o.customerUid === uid || o.shopOwnerUid === uid;
            if (!isParticipant) return;
            const otherUid = o.customerUid === uid ? o.shopOwnerUid : o.customerUid;
            const otherName = o.customerUid === uid ? (o.shopOwnerName || o.shopTitle || "เจ้าของร้าน") : (o.customerName || "ลูกค้า");
            if (!otherUid) return;
            const roomId = o.roomId || buildDmRoomId(uid, otherUid);
            const ts = Number(o.updatedAtMillis || o.createdAtMillis || 0);
            const prev = map.get(roomId);
            if (!prev || ts >= prev.lastMillis) {
                map.set(roomId, {
                    kind: "dm",
                    roomId,
                    title: otherName,
                    otherUid,
                    lastText: `ออเดอร์: ${o.requirement || ""}`,
                    lastMillis: ts
                });
            }
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
        renderPinnedOrders();
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
            const [dmSnap, usersSnap, friendsSnap, reqSnap, ordersSnap] = await Promise.all([
                getDocs(collection(db, COL_DM)).catch(() => ({ docs: [] })),
                getDocs(collection(db, "users")).catch(() => ({ docs: [] })),
                getDocs(collection(db, COL_FRIENDS)).catch(() => ({ docs: [] })),
                getDocs(collection(db, COL_FRIEND_REQUESTS)).catch(() => ({ docs: [] })),
                getDocs(collection(db, COL_ORDERS)).catch(() => ({ docs: [] }))
            ]);
            dmMessages = dmSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            registeredUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            friends = friendsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            friendRequests = reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (err) {
            console.error("DM load error:", err);
        }
        renderThreads();
        if (activeThread) {
            const updated = threads.find((t) => t.roomId === activeThread.roomId);
            if (updated) activeThread = { ...updated, otherUid: updated.otherUid || activeThread.otherUid };
            renderPinnedOrders();
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
        async openDirectWith({ targetUid, targetName, orderDraft, onOpenTab }) {
            const user = getCurrentUser();
            if (!user || !user.uid) return;
            await loadMessages();
            if (typeof onOpenTab === "function") onOpenTab();
            if (!targetUid) return;
            if (orderDraft) {
                await createOrderAndNotify(orderDraft);
            }
            const roomId = buildDmRoomId(user.uid, targetUid);
            selectThread({
                kind: "dm",
                roomId,
                title: targetName || "เจ้าของร้าน",
                otherUid: targetUid,
                lastText: orderDraft ? `ออเดอร์: ${orderDraft.requirement}` : "",
                lastMillis: Date.now()
            });
        }
    };
}
