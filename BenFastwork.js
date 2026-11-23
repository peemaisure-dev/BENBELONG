import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// เปลี่ยนเป็น false เมื่อทดสอบผ่านแล้วและพร้อมใช้งานกับฐานข้อมูลจริง
const IS_TEST_MODE = true;
const PREFIX = IS_TEST_MODE ? "test_" : "";

const COL_SHOPS = `${PREFIX}fastwork_shops`;
const COL_CHATS = `${PREFIX}fastwork_chats`;
const COL_REVIEWS = `${PREFIX}fastwork_reviews`;

export const FASTWORK_CATEGORIES = [
    "รับจ้างติว",
    "ช่างภาพ",
    "เล่นเกมเป็นเพื่อน",
    "ช่วยทำงาน",
    "ช่วยทำการตลาดขายของ",
    "ช่วยกราฟฟิก",
    "ทำเว็ปไซต์",
    "บริการอื่นๆ ในโรงเรียน"
];

export function createBenFastworkController({ db, getCurrentUser }) {
    let shops = [];
    let reviews = [];
    let chats = [];
    let selectedCategory = "all";
    let activeShopId = null;
    let editingShop = null;
    let activeChatShopId = null;

    const els = {
        view: () => document.getElementById("benFastworkViewContainer"),
        pills: () => document.getElementById("fwCategoryPills"),
        search: () => document.getElementById("fwSearchInput"),
        categorySelect: () => document.getElementById("fwCategorySelect"),
        myShopBtn: () => document.getElementById("fwMyShopActionBtn"),
        loading: () => document.getElementById("fwLoading"),
        grid: () => document.getElementById("fwShopsGrid"),
        detail: () => document.getElementById("fwDetailContainer"),
        shopModal: () => document.getElementById("fwShopModal"),
        shopForm: () => document.getElementById("fwShopForm"),
        shopTitle: () => document.getElementById("fwShopTitle"),
        shopCategory: () => document.getElementById("fwShopCategory"),
        shopDesc: () => document.getElementById("fwShopDesc"),
        shopPayment: () => document.getElementById("fwShopPayment"),
        chatModal: () => document.getElementById("fwChatModal"),
        chatTitle: () => document.getElementById("fwChatModalTitle"),
        chatMessages: () => document.getElementById("fwChatMessages"),
        chatForm: () => document.getElementById("fwChatForm"),
        chatInput: () => document.getElementById("fwChatInput"),
        orderNote: () => document.getElementById("fwOrderNoteInput"),
        orderDeadline: () => document.getElementById("fwOrderDeadlineInput"),
        requestOrderBtn: () => document.getElementById("fwRequestOrderBtn"),
        reviewModal: () => document.getElementById("fwReviewModal"),
        reviewForm: () => document.getElementById("fwReviewForm"),
        reviewPreview: () => document.getElementById("fwReviewAvgPreview"),
        reviewComment: () => document.getElementById("fwReviewComment")
    };

    function requireSignedInUser() {
        const user = getCurrentUser();
        if (!user || !user.uid) {
            alert("กรุณาเข้าสู่ระบบด้วยอีเมลโรงเรียน (@ben.ac.th) ก่อนใช้งานฟีเจอร์นี้ครับ");
            return null;
        }
        return user;
    }

    function getShopReviews(shopId) {
        return reviews.filter((r) => r.shopId === shopId);
    }

    function computeAverageRating(shopId) {
        const list = getShopReviews(shopId);
        if (!list.length) return { avgText: "ใหม่", count: 0 };
        const sum = list.reduce((acc, item) => {
            const fourAvg = (
                Number(item.quality || 5) +
                Number(item.timeliness || 5) +
                Number(item.communication || 5) +
                Number(item.value || 5)
            ) / 4;
            return acc + fourAvg;
        }, 0);
        return { avgText: (sum / list.length).toFixed(1), count: list.length };
    }

    function initCategoryControls() {
        const selectEl = els.categorySelect();
        const formSelectEl = els.shopCategory();
        const pillsEl = els.pills();
        if (!selectEl || !formSelectEl || !pillsEl) return;

        selectEl.innerHTML = `<option value="all">ทุกหมวดหมู่บริการ</option>` +
            FASTWORK_CATEGORIES.map((cat) => `<option value="${cat}">${cat}</option>`).join("");

        formSelectEl.innerHTML = FASTWORK_CATEGORIES
            .map((cat) => `<option value="${cat}">${cat}</option>`)
            .join("");

        const allPill = `<button type="button" class="fw-pill ${selectedCategory === "all" ? "active" : ""}" data-cat="all">ทั้งหมด</button>`;
        const catPills = FASTWORK_CATEGORIES
            .map((cat) => `<button type="button" class="fw-pill ${selectedCategory === cat ? "active" : ""}" data-cat="${cat}">${cat}</button>`)
            .join("");
        pillsEl.innerHTML = allPill + catPills;

        pillsEl.querySelectorAll(".fw-pill").forEach((btn) => {
            btn.addEventListener("click", () => {
                selectedCategory = btn.dataset.cat;
                selectEl.value = selectedCategory;
                initCategoryControls();
                renderShops();
            });
        });
    }

    async function loadData() {
        const loadingEl = els.loading();
        if (loadingEl) loadingEl.style.display = "block";
        try {
            const [shopsSnap, reviewsSnap, chatsSnap] = await Promise.all([
                getDocs(query(collection(db, COL_SHOPS), orderBy("createdAt", "desc"))).catch(() => getDocs(collection(db, COL_SHOPS))),
                getDocs(collection(db, COL_REVIEWS)).catch(() => ({ docs: [] })),
                getDocs(collection(db, COL_CHATS)).catch(() => ({ docs: [] }))
            ]);

            shops = shopsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            reviews = reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            chats = chatsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (err) {
            console.error("BenFastwork load error:", err);
        } finally {
            if (loadingEl) loadingEl.style.display = "none";
        }
        refreshMyShopButton();
        if (activeShopId) {
            renderShopDetail(activeShopId);
        } else {
            renderShops();
        }
    }

    function refreshMyShopButton() {
        const btn = els.myShopBtn();
        const user = getCurrentUser();
        if (!btn) return;
        const myShop = user ? shops.find((s) => s.ownerUid === user.uid) : null;
        btn.innerText = myShop ? "✏️ จัดการร้านของฉัน" : "+ เปิดร้านบริการของฉัน";
    }

    function renderShops() {
        const gridEl = els.grid();
        const detailEl = els.detail();
        if (!gridEl) return;
        if (detailEl) detailEl.style.display = "none";
        gridEl.style.display = "grid";

        const keyword = (els.search()?.value || "").trim().toLowerCase();
        const catFilter = els.categorySelect()?.value || selectedCategory || "all";
        const user = getCurrentUser();

        const filtered = shops.filter((shop) => {
            const matchCat = catFilter === "all" || shop.category === catFilter;
            const hay = `${shop.title || ""} ${shop.description || ""} ${shop.category || ""} ${shop.ownerName || ""}`.toLowerCase();
            const matchSearch = !keyword || hay.includes(keyword);
            return matchCat && matchSearch;
        });

        if (!filtered.length) {
            gridEl.innerHTML = `<div class="loading-text" style="grid-column: 1 / -1;">ยังไม่มีร้านบริการในหมวดนี้ หรือลองค้นหาด้วยคำอื่นดูครับ</div>`;
            return;
        }

        gridEl.innerHTML = filtered.map((shop) => {
            const rating = computeAverageRating(shop.id);
            const likedBy = Array.isArray(shop.likedBy) ? shop.likedBy : [];
            const isLiked = user ? likedBy.includes(user.uid) : false;
            return `
                <article class="fw-shop-card" data-shop-id="${shop.id}">
                    <div class="fw-card-img-placeholder">${shop.category || "บริการ"}</div>
                    <div class="fw-card-body">
                        <div class="fw-card-top-row">
                            <span class="fw-cat-badge">${shop.category || "ทั่วไป"}</span>
                            <span class="fw-rating-pill">⭐ ${rating.avgText} (${rating.count})</span>
                        </div>
                        <h3 class="fw-shop-title">${shop.title || "ร้านบริการ"}</h3>
                        <p class="fw-shop-desc">${shop.description || ""}</p>
                        <div class="fw-shop-meta">
                            <span>ผู้ให้บริการ: ${shop.ownerName || "นักเรียนเบญฯ"}</span>
                            <span>สำเร็จ: ${Number(shop.completedCount || 0)} งาน</span>
                        </div>
                        <div class="fw-card-actions">
                            <button type="button" class="fw-like-btn ${isLiked ? "liked" : ""}" data-like-id="${shop.id}">
                                ${isLiked ? "❤️" : "🤍"} <span>${likedBy.length}</span>
                            </button>
                            <button type="button" class="fw-chat-trigger-btn" data-open-shop="${shop.id}">ดูรายละเอียด</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        gridEl.querySelectorAll("[data-like-id]").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleLikeShop(btn.dataset.likeId);
            });
        });

        gridEl.querySelectorAll("[data-open-shop], .fw-shop-card").forEach((el) => {
            el.addEventListener("click", () => {
                const shopId = el.dataset.openShop || el.dataset.shopId;
                if (shopId) openShopDetail(shopId);
            });
        });
    }

    function openShopDetail(shopId) {
        activeShopId = shopId;
        renderShopDetail(shopId);
    }

    function renderShopDetail(shopId) {
        const shop = shops.find((s) => s.id === shopId);
        const gridEl = els.grid();
        const detailEl = els.detail();
        if (!shop || !detailEl) {
            activeShopId = null;
            renderShops();
            return;
        }

        if (gridEl) gridEl.style.display = "none";
        detailEl.style.display = "block";

        const user = getCurrentUser();
        const isOwner = Boolean(user && shop.ownerUid === user.uid);
        const rating = computeAverageRating(shop.id);
        const shopReviews = getShopReviews(shop.id);
        const likedBy = Array.isArray(shop.likedBy) ? shop.likedBy : [];
        const isLiked = user ? likedBy.includes(user.uid) : false;

        detailEl.innerHTML = `
            <div class="fw-detail-card">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:1rem; flex-wrap:wrap;">
                    <button type="button" class="fw-back-btn" id="fwBackToListBtn">← กลับหน้ารวมร้าน</button>
                    ${isOwner ? `<button type="button" class="btn-primary-sm" id="fwEditThisShopBtn">✏️ แก้ไขร้านของฉัน</button>` : ""}
                </div>
                <div class="fw-detail-header-row">
                    <div>
                        <span class="fw-cat-badge">${shop.category || "บริการ"}</span>
                        <h2 style="margin-top:0.45rem; font-size:1.3rem;">${shop.title || ""}</h2>
                        <div style="font-size:0.85rem; color:#64748B; margin-top:4px;">เจ้าของร้าน: <strong>${shop.ownerName || "นักเรียนเบญฯ"}</strong></div>
                    </div>
                    <div class="fw-score-big-box">
                        <div class="fw-score-big-num">⭐ ${rating.avgText}</div>
                        <div style="font-size:0.76rem; color:#92400E;">จาก ${rating.count} รีวิว</div>
                    </div>
                </div>
                <p class="fw-detail-desc">${shop.description || ""}</p>
                ${shop.paymentNote ? `<div class="fw-payment-note"><strong>การนัดแนะ / ชำระเงิน:</strong> ${shop.paymentNote}</div>` : ""}
                <div class="fw-detail-action-bar">
                    <button type="button" class="fw-like-btn ${isLiked ? "liked" : ""}" id="fwDetailLikeBtn">
                        ${isLiked ? "❤️ ถูกใจแล้ว" : "🤍 ถูกใจร้าน"} (${likedBy.length})
                    </button>
                    <span class="fw-sold-counter-badge">ปิดงานสำเร็จ: ${Number(shop.completedCount || 0)}</span>
                    <span class="fw-cancel-counter-badge">ยกเลิก: ${Number(shop.cancelledCount || 0)}</span>
                    ${!isOwner ? `<button type="button" class="fw-chat-trigger-btn" id="fwOpenChatBtn">💬 แชท / สั่งงาน</button>` : `<button type="button" class="fw-chat-trigger-btn" id="fwOpenChatBtn">💬 ดูแชทและคำสั่งซื้อ</button>`}
                    ${!isOwner ? `<button type="button" class="fw-review-trigger-btn" id="fwOpenReviewBtn">⭐ ให้คะแนน / รีวิว</button>` : ""}
                </div>
                <div style="margin-top:1.4rem;">
                    <h4 style="margin-bottom:0.7rem;">รีวิวจากผู้ใช้งาน (${shopReviews.length})</h4>
                    ${shopReviews.length ? shopReviews.map((r) => {
                        const avg = ((Number(r.quality || 5) + Number(r.timeliness || 5) + Number(r.communication || 5) + Number(r.value || 5)) / 4).toFixed(1);
                        return `
                            <div class="fw-comment-card">
                                <div style="display:flex; justify-content:space-between; font-size:0.84rem; font-weight:600;">
                                    <span>${r.reviewerName || "ผู้ใช้งาน"}</span>
                                    <span style="color:#D97706;">⭐ ${avg}</span>
                                </div>
                                <p style="margin-top:0.35rem; font-size:0.86rem; color:#334155;">${r.comment || "ไม่ได้ระบุข้อความเพิ่มเติม"}</p>
                            </div>
                        `;
                    }).join("") : `<p style="font-size:0.86rem; color:#64748B;">ยังไม่มีรีวิวสำหรับร้านนี้ครับ</p>`}
                </div>
            </div>
        `;

        document.getElementById("fwBackToListBtn")?.addEventListener("click", () => {
            activeShopId = null;
            renderShops();
        });

        document.getElementById("fwEditThisShopBtn")?.addEventListener("click", () => {
            openShopModal(shop);
        });

        document.getElementById("fwDetailLikeBtn")?.addEventListener("click", () => {
            toggleLikeShop(shop.id);
        });

        document.getElementById("fwOpenChatBtn")?.addEventListener("click", () => {
            openChatModal(shop.id);
        });

        document.getElementById("fwOpenReviewBtn")?.addEventListener("click", () => {
            openReviewModal(shop.id);
        });
    }

    async function toggleLikeShop(shopId) {
        const user = requireSignedInUser();
        if (!user) return;
        const shop = shops.find((s) => s.id === shopId);
        if (!shop) return;

        const currentLikes = Array.isArray(shop.likedBy) ? [...shop.likedBy] : [];
        const exists = currentLikes.includes(user.uid);
        const nextLikes = exists ? currentLikes.filter((id) => id !== user.uid) : [...currentLikes, user.uid];

        shop.likedBy = nextLikes;
        await updateDoc(doc(db, COL_SHOPS, shopId), { likedBy: nextLikes });
        if (activeShopId === shopId) {
            renderShopDetail(shopId);
        } else {
            renderShops();
        }
    }

    function openShopModal(existing = null) {
        const user = requireSignedInUser();
        if (!user) return;

        const myExistingShop = existing || shops.find((s) => s.ownerUid === user.uid) || null;
        editingShop = myExistingShop;

        const modal = els.shopModal();
        if (!modal) return;
        document.getElementById("fwShopModalTitle").innerText = myExistingShop ? "แก้ไขร้านบริการของฉัน" : "เปิดร้านบริการ BenFastwork";
        els.shopTitle().value = myExistingShop?.title || "";
        els.shopCategory().value = myExistingShop?.category || FASTWORK_CATEGORIES[0];
        els.shopDesc().value = myExistingShop?.description || "";
        els.shopPayment().value = myExistingShop?.paymentNote || "";
        modal.style.display = "flex";
    }

    async function handleShopSubmit(e) {
        e.preventDefault();
        const user = requireSignedInUser();
        if (!user) return;

        const payload = {
            title: els.shopTitle().value.trim(),
            category: els.shopCategory().value,
            description: els.shopDesc().value.trim(),
            paymentNote: els.shopPayment().value.trim(),
            ownerUid: user.uid,
            ownerName: user.nickname || user.email || "นักเรียนเบญฯ"
        };
        if (!payload.title || !payload.description) return;

        if (editingShop) {
            await updateDoc(doc(db, COL_SHOPS, editingShop.id), {
                ...payload,
                updatedAt: serverTimestamp()
            });
        } else {
            await addDoc(collection(db, COL_SHOPS), {
                ...payload,
                likedBy: [],
                completedCount: 0,
                cancelledCount: 0,
                createdAt: serverTimestamp()
            });
        }

        els.shopModal().style.display = "none";
        els.shopForm().reset();
        editingShop = null;
        await loadData();
    }

    function openChatModal(shopId) {
        const user = requireSignedInUser();
        if (!user) return;
        activeChatShopId = shopId;
        const shop = shops.find((s) => s.id === shopId);
        els.chatTitle().innerText = `แชทกับร้าน: ${shop?.title || "ร้านบริการ"}`;
        renderChatMessages();
        els.chatModal().style.display = "flex";
    }

    function renderChatMessages() {
        const box = els.chatMessages();
        const user = getCurrentUser();
        if (!box || !activeChatShopId) return;

        const list = chats
            .filter((m) => m.shopId === activeChatShopId)
            .sort((a, b) => (a.createdAtMillis || 0) - (b.createdAtMillis || 0));

        if (!list.length) {
            box.innerHTML = `<div style="text-align:center; color:#64748B; font-size:0.84rem;">เริ่มพูดคุยหรือส่งคำขอสั่งงานได้เลยครับ</div>`;
            return;
        }

        box.innerHTML = list.map((m) => {
            const isMine = user && m.senderUid === user.uid;
            if (m.type === "order") {
                return `
                    <div class="fw-order-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                            <strong>คำขอสั่งงาน: ${m.orderNote || "-"}</strong>
                            <span class="fw-order-status ${m.status || "pending"}">${m.status || "pending"}</span>
                        </div>
                        <div style="font-size:0.78rem; color:#64748B; margin-top:4px;">กำหนดส่ง: ${m.deadline || "ไม่ได้ระบุ"} • โดย ${m.senderName || "ผู้สั่ง"}</div>
                    </div>
                `;
            }
            return `
                <div class="fw-msg-bubble ${isMine ? "mine" : "theirs"}">
                    <div class="fw-msg-sender">${m.senderName || "ผู้ใช้งาน"}</div>
                    <div>${m.text || ""}</div>
                </div>
            `;
        }).join("");
        box.scrollTop = box.scrollHeight;
    }

    async function handleChatSubmit(e) {
        e.preventDefault();
        const user = requireSignedInUser();
        if (!user || !activeChatShopId) return;
        const text = els.chatInput().value.trim();
        if (!text) return;

        const docData = {
            shopId: activeChatShopId,
            type: "message",
            text,
            senderUid: user.uid,
            senderName: user.nickname || user.email || "นักเรียนเบญฯ",
            createdAtMillis: Date.now(),
            createdAt: serverTimestamp()
        };
        await addDoc(collection(db, COL_CHATS), docData);
        chats.push(docData);
        els.chatInput().value = "";
        renderChatMessages();
    }

    async function handleRequestOrder() {
        const user = requireSignedInUser();
        if (!user || !activeChatShopId) return;
        const note = els.orderNote().value.trim();
        const deadline = els.orderDeadline().value;
        if (!note) {
            alert("กรุณาระบุรายละเอียดงานที่ต้องการสั่งก่อนครับ");
            return;
        }

        const docData = {
            shopId: activeChatShopId,
            type: "order",
            orderNote: note,
            deadline: deadline || "-",
            status: "pending",
            senderUid: user.uid,
            senderName: user.nickname || user.email || "นักเรียนเบญฯ",
            createdAtMillis: Date.now(),
            createdAt: serverTimestamp()
        };
        await addDoc(collection(db, COL_CHATS), docData);
        chats.push(docData);
        els.orderNote().value = "";
        els.orderDeadline().value = "";
        renderChatMessages();
    }

    function updateReviewPreview() {
        const previewEl = els.reviewPreview();
        if (!previewEl) return;
        const vals = Array.from(document.querySelectorAll(".fw-score-input")).map((el) => Number(el.value || 5));
        const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
        previewEl.innerText = `คะแนนเฉลี่ยโดยประมาณ: ${avg} / 5.0`;
    }

    function openReviewModal(shopId) {
        const user = requireSignedInUser();
        if (!user) return;
        activeShopId = shopId;
        els.reviewForm()?.reset();
        updateReviewPreview();
        els.reviewModal().style.display = "flex";
    }

    async function handleReviewSubmit(e) {
        e.preventDefault();
        const user = requireSignedInUser();
        if (!user || !activeShopId) return;

        const reviewData = {
            shopId: activeShopId,
            reviewerUid: user.uid,
            reviewerName: user.nickname || user.email || "นักเรียนเบญฯ",
            quality: Number(document.getElementById("fwScoreQuality")?.value || 5),
            timeliness: Number(document.getElementById("fwScoreTime")?.value || 5),
            communication: Number(document.getElementById("fwScoreComm")?.value || 5),
            value: Number(document.getElementById("fwScoreValue")?.value || 5),
            comment: els.reviewComment()?.value.trim() || "",
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, COL_REVIEWS), reviewData);
        reviews.push(reviewData);
        els.reviewModal().style.display = "none";
        renderShopDetail(activeShopId);
    }

    function bindEvents() {
        initCategoryControls();
        els.search()?.addEventListener("input", renderShops);
        els.categorySelect()?.addEventListener("change", (e) => {
            selectedCategory = e.target.value;
            initCategoryControls();
            renderShops();
        });
        els.myShopBtn()?.addEventListener("click", () => openShopModal(null));
        els.shopForm()?.addEventListener("submit", handleShopSubmit);
        els.chatForm()?.addEventListener("submit", handleChatSubmit);
        els.requestOrderBtn()?.addEventListener("click", handleRequestOrder);
        els.reviewForm()?.addEventListener("submit", handleReviewSubmit);

        document.querySelectorAll(".fw-score-input").forEach((el) => {
            el.addEventListener("change", updateReviewPreview);
        });

        document.getElementById("fwCloseShopModalBtn")?.addEventListener("click", () => {
            if (els.shopModal()) els.shopModal().style.display = "none";
        });
        document.getElementById("fwCloseChatModalBtn")?.addEventListener("click", () => {
            if (els.chatModal()) els.chatModal().style.display = "none";
        });
        document.getElementById("fwCloseReviewModalBtn")?.addEventListener("click", () => {
            if (els.reviewModal()) els.reviewModal().style.display = "none";
        });
    }

    return {
        init() {
            bindEvents();
        },
        async onTabOpen() {
            activeShopId = null;
            await loadData();
        }
    };
}
