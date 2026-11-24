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

const IS_TEST_MODE = true;
const PREFIX = IS_TEST_MODE ? "test_" : "";

const COL_SHOPS = `${PREFIX}fastwork_shops`;
const COL_REVIEWS = `${PREFIX}fastwork_reviews`;

const SUPABASE_URL = "https://hurjpkudocnapkdteokf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dzOK5hneWLpL4ZxQefP0vA_KCwBL1Mb";
const FW_IMAGE_BUCKET = "fastwork-shop-images";
const MAX_FW_IMAGE_BYTES = 5 * 1024 * 1024;

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

export function createBenFastworkController({ db, getCurrentUser, onNavigateToDm }) {
    let shops = [];
    let reviews = [];
    let selectedCategory = "all";
    let activeShopId = null;
    let editingShop = null;
    let pendingOrderShop = null;

    const els = {
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
        shopHiddenInput: () => document.getElementById("fwShopHiddenInput"),
        shopImageInput: () => document.getElementById("fwShopImageInput"),
        shopImagePreviewWrap: () => document.getElementById("fwShopImagePreviewWrap"),
        shopImagePreview: () => document.getElementById("fwShopImagePreview"),
        currentImageHint: () => document.getElementById("fwCurrentImageHint"),
        saveShopBtn: () => document.getElementById("fwSaveShopBtn"),
        reviewModal: () => document.getElementById("fwReviewModal"),
        reviewForm: () => document.getElementById("fwReviewForm"),
        reviewPreview: () => document.getElementById("fwReviewAvgPreview"),
        reviewComment: () => document.getElementById("fwReviewComment")
    };

    function ensureOrderModalExists() {
        let modal = document.getElementById("fwCreateOrderModal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "fwCreateOrderModal";
        modal.style.cssText = "display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:9999; align-items:center; justify-content:center; padding:16px;";
        modal.innerHTML = `
            <div style="background:#FFFFFF; border-radius:18px; width:100%; max-width:460px; padding:20px; box-shadow:0 20px 45px rgba(15,23,42,0.22); font-family:'Prompt',sans-serif;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <h3 id="fwOrderModalTitle" style="margin:0; font-size:1.05rem; color:#0F172A;">📦 ส่งรายละเอียดออเดอร์ให้เจ้าของร้าน</h3>
                    <button type="button" id="fwCloseOrderModalBtn" style="background:none; border:none; font-size:1.2rem; cursor:pointer; color:#64748B;">✕</button>
                </div>
                <form id="fwCreateOrderForm" style="display:flex; flex-direction:column; gap:12px;">
                    <div>
                        <label style="display:block; font-size:0.84rem; font-weight:600; color:#334155; margin-bottom:4px;">สิ่งที่อยากได้ / รายละเอียดงาน *</label>
                        <textarea id="fwOrderRequirementInput" rows="3" required placeholder="เช่น ติวฟิสิกส์บท SHM และคลื่น 2 ชม. หรือทำโปสเตอร์ 1 ชิ้น..." style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #CBD5E1; border-radius:10px; font-family:inherit; font-size:0.9rem;"></textarea>
                    </div>
                    <div>
                        <label style="display:block; font-size:0.84rem; font-weight:600; color:#334155; margin-bottom:4px;">Deadline ที่ต้องการ *</label>
                        <input type="datetime-local" id="fwOrderDeadlineInput" required style="width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #CBD5E1; border-radius:10px; font-family:inherit; font-size:0.9rem;">
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">
                        <button type="button" id="fwCancelOrderModalBtn" style="padding:8px 14px; border-radius:10px; border:1px solid #CBD5E1; background:#F8FAFC; color:#475569; font-weight:600; cursor:pointer;">ยกเลิก</button>
                        <button type="submit" style="padding:8px 16px; border-radius:10px; border:none; background:linear-gradient(135deg,#2563EB,#1D4ED8); color:#FFFFFF; font-weight:600; cursor:pointer;">ส่งออเดอร์เข้าแชท</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        const closeFn = () => {
            modal.style.display = "none";
            pendingOrderShop = null;
        };
        modal.querySelector("#fwCloseOrderModalBtn")?.addEventListener("click", closeFn);
        modal.querySelector("#fwCancelOrderModalBtn")?.addEventListener("click", closeFn);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeFn();
        });

        modal.querySelector("#fwCreateOrderForm")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const user = requireSignedInUser();
            if (!user || !pendingOrderShop) return;

            const requirement = modal.querySelector("#fwOrderRequirementInput")?.value.trim() || "";
            const deadlineRaw = modal.querySelector("#fwOrderDeadlineInput")?.value || "";
            if (!requirement || !deadlineRaw) return;

            const deadlineMillis = new Date(deadlineRaw).getTime();
            const deadlineText = Number.isFinite(deadlineMillis)
                ? new Date(deadlineMillis).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
                : deadlineRaw;

            const shop = pendingOrderShop;
            modal.style.display = "none";
            pendingOrderShop = null;
            modal.querySelector("#fwCreateOrderForm")?.reset();

            if (typeof onNavigateToDm === "function") {
                await onNavigateToDm({
                    targetUid: shop.ownerUid || "",
                    targetName: shop.ownerName || shop.title || "เจ้าของร้าน",
                    orderDraft: {
                        shopId: shop.id,
                        shopTitle: shop.title || "ร้านบริการ",
                        shopOwnerUid: shop.ownerUid || "",
                        shopOwnerName: shop.ownerName || "เจ้าของร้าน",
                        customerUid: user.uid,
                        customerName: user.nickname || user.email || "ลูกค้า",
                        requirement,
                        deadlineIso: deadlineRaw,
                        deadlineMillis: Number.isFinite(deadlineMillis) ? deadlineMillis : Date.now(),
                        deadlineText
                    }
                });
            }
        });

        return modal;
    }

    function openOrderFormForShop(shop) {
        const user = requireSignedInUser();
        if (!user) return;
        if (!shop || !shop.ownerUid) {
            alert("ไม่พบข้อมูลเจ้าของร้านสำหรับส่งออเดอร์ครับ");
            return;
        }
        if (shop.ownerUid === user.uid) {
            if (typeof onNavigateToDm === "function") {
                onNavigateToDm({ targetUid: "", targetName: "" });
            }
            return;
        }
        pendingOrderShop = shop;
        const modal = ensureOrderModalExists();
        const titleEl = modal.querySelector("#fwOrderModalTitle");
        if (titleEl) titleEl.innerText = `📦 ส่งออเดอร์ให้ร้าน: ${shop.title || "เจ้าของร้าน"}`;
        modal.style.display = "flex";
    }

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

    async function uploadShopImage(file, uid) {
        const validTypes = ["image/jpeg", "image/png", "image/webp"];
        const hasValidExt = /\.(jpg|jpeg|png|webp)$/i.test(file.name || "");
        if (!validTypes.includes(file.type) && !hasValidExt) {
            throw new Error("รองรับเฉพาะไฟล์รูปภาพ .jpg, .png หรือ .webp เท่านั้นครับ");
        }
        if (file.size > MAX_FW_IMAGE_BYTES) {
            throw new Error("ขนาดรูปภาพเกิน 5 MB กรุณาเลือกรูปที่ขนาดเล็กลงครับ");
        }

        const extMatch = (file.name || "").toLowerCase().match(/\.(jpg|jpeg|png|webp)$/);
        const ext = extMatch ? extMatch[1] : (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
        const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        const safeName = (file.name || "shop_cover")
            .replace(/\.(jpg|jpeg|png|webp)$/i, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 30) || "shop_cover";
        const folder = IS_TEST_MODE ? `test/${uid}` : `shops/${uid}`;
        const filePath = `${folder}/${Date.now()}_${safeName}.${ext}`;

        const endpoint = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(FW_IMAGE_BUCKET)}/${filePath}`;
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                "apikey": SUPABASE_ANON_KEY,
                "Content-Type": contentType,
                "x-upsert": "false"
            },
            body: file
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || "อัปโหลดรูปภาพร้านค้าไม่สำเร็จ");
        }

        return `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(FW_IMAGE_BUCKET)}/${filePath}`;
    }

    function updateImagePreview(url = "") {
        const wrap = els.shopImagePreviewWrap();
        const img = els.shopImagePreview();
        if (!wrap || !img) return;
        if (url) {
            img.src = url;
            wrap.style.display = "block";
        } else {
            img.src = "";
            wrap.style.display = "none";
        }
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
            const [shopsSnap, reviewsSnap] = await Promise.all([
                getDocs(query(collection(db, COL_SHOPS), orderBy("createdAt", "desc"))).catch(() => getDocs(collection(db, COL_SHOPS))),
                getDocs(collection(db, COL_REVIEWS)).catch(() => ({ docs: [] }))
            ]);

            shops = shopsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            reviews = reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
            const isOwner = Boolean(user && shop.ownerUid === user.uid);
            if (shop.isHidden && !isOwner) return false;
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
            const isHidden = Boolean(shop.isHidden);
            const safeTitle = escapeHtml(shop.title || "ร้านบริการ");
            const safeCat = escapeHtml(shop.category || "ทั่วไป");
            const safeDesc = escapeHtml(shop.description || "");
            const safeOwner = escapeHtml(shop.ownerName || "นักเรียนเบญฯ");
            const imgBlock = shop.imageUrl
                ? `<div class="fw-card-img-wrap"><img src="${escapeHtml(shop.imageUrl)}" alt="${safeTitle}"></div>`
                : `<div class="fw-card-img-wrap"><span class="fw-card-img-placeholder">${safeCat}</span></div>`;
            const hiddenBadge = isHidden ? `<span class="fw-hidden-badge">🙈 กำลังซ่อนอยู่</span>` : "";

            return `
                <article class="fw-shop-card ${isHidden ? "hidden-shop" : ""}" data-shop-id="${escapeHtml(shop.id)}">
                    ${imgBlock}
                    <div class="fw-card-body">
                        <div class="fw-card-top-row">
                            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                                <span class="fw-cat-badge">${safeCat}</span>
                                ${hiddenBadge}
                            </div>
                            <span class="fw-rating-pill">⭐ ${rating.avgText} (${rating.count})</span>
                        </div>
                        <h3 class="fw-shop-title">${safeTitle}</h3>
                        <p class="fw-shop-desc">${safeDesc}</p>
                        <div class="fw-shop-meta">
                            <span>ผู้ให้บริการ: ${safeOwner}</span>
                            <span>สำเร็จ: ${Number(shop.completedCount || 0)} | ยกเลิก: ${Number(shop.cancelledCount || 0)}</span>
                        </div>
                        <div class="fw-card-actions">
                            <button type="button" class="fw-like-btn ${isLiked ? "liked" : ""}" data-like-id="${escapeHtml(shop.id)}">
                                ${isLiked ? "❤️" : "🤍"} <span>${likedBy.length}</span>
                            </button>
                            <button type="button" class="fw-chat-trigger-btn" data-open-shop="${escapeHtml(shop.id)}">ดูรายละเอียด</button>
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
        const isHidden = Boolean(shop.isHidden);
        const rating = computeAverageRating(shop.id);
        const shopReviews = getShopReviews(shop.id);
        const likedBy = Array.isArray(shop.likedBy) ? shop.likedBy : [];
        const isLiked = user ? likedBy.includes(user.uid) : false;
        const safeTitle = escapeHtml(shop.title || "");
        const bannerHtml = shop.imageUrl
            ? `<img src="${escapeHtml(shop.imageUrl)}" alt="${safeTitle}" class="fw-detail-banner">`
            : "";

        const ownerControlsHtml = isOwner
            ? `
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <button type="button" class="fw-toggle-hide-btn" id="fwToggleHideShopBtn">
                        ${isHidden ? "👁️ แสดงร้านค้าต่อสาธารณะ" : "🙈 ซ่อนร้านค้าจากสาธารณะ"}
                    </button>
                    <button type="button" class="btn-primary-sm" id="fwEditThisShopBtn">✏️ แก้ไขร้านของฉัน</button>
                </div>
            `
            : "";

        const dmButtonLabel = !isOwner
            ? "📦 ทักแชท / กรอกออเดอร์ (DM)"
            : "✉️ เปิดกล่องข้อความส่วนตัว (DM)";

        detailEl.innerHTML = `
            <div class="fw-detail-card">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:1rem; flex-wrap:wrap;">
                    <button type="button" class="fw-back-btn" id="fwBackToListBtn">← กลับหน้ารวมร้าน</button>
                    ${ownerControlsHtml}
                </div>
                ${bannerHtml}
                <div class="fw-detail-header-row">
                    <div>
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <span class="fw-cat-badge">${escapeHtml(shop.category || "บริการ")}</span>
                            ${isHidden ? `<span class="fw-hidden-badge">🙈 กำลังซ่อนอยู่จากสาธารณะ</span>` : ""}
                        </div>
                        <h2 style="margin-top:0.45rem; font-size:1.3rem;">${safeTitle}</h2>
                        <div style="font-size:0.85rem; color:#64748B; margin-top:4px;">เจ้าของร้าน: <strong>${escapeHtml(shop.ownerName || "นักเรียนเบญฯ")}</strong></div>
                    </div>
                    <div class="fw-score-big-box">
                        <div class="fw-score-big-num">⭐ ${rating.avgText}</div>
                        <div style="font-size:0.76rem; color:#92400E;">จาก ${rating.count} รีวิว</div>
                    </div>
                </div>
                <p class="fw-detail-desc">${escapeHtml(shop.description || "")}</p>
                ${shop.paymentNote ? `<div class="fw-payment-note"><strong>การนัดแนะ / ชำระเงิน:</strong> ${escapeHtml(shop.paymentNote)}</div>` : ""}
                <div class="fw-detail-action-bar">
                    <button type="button" class="fw-like-btn ${isLiked ? "liked" : ""}" id="fwDetailLikeBtn">
                        ${isLiked ? "❤️ ถูกใจแล้ว" : "🤍 ถูกใจร้าน"} (${likedBy.length})
                    </button>
                    <span class="fw-sold-counter-badge">ปิดงานสำเร็จ: ${Number(shop.completedCount || 0)}</span>
                    <span class="fw-cancel-counter-badge">ยกเลิก: ${Number(shop.cancelledCount || 0)}</span>
                    <button type="button" class="fw-chat-trigger-btn" id="fwGoToDmBtn">${dmButtonLabel}</button>
                    ${!isOwner ? `<button type="button" class="fw-review-trigger-btn" id="fwOpenReviewBtn">⭐ ให้คะแนน / รีวิว</button>` : ""}
                </div>
                <div style="margin-top:1.4rem;">
                    <h4 style="margin-bottom:0.7rem;">รีวิวจากผู้ใช้งาน (${shopReviews.length})</h4>
                    ${shopReviews.length ? shopReviews.map((r) => {
                        const avg = ((Number(r.quality || 5) + Number(r.timeliness || 5) + Number(r.communication || 5) + Number(r.value || 5)) / 4).toFixed(1);
                        return `
                            <div class="fw-comment-card">
                                <div style="display:flex; justify-content:space-between; font-size:0.84rem; font-weight:600;">
                                    <span>${escapeHtml(r.reviewerName || "ผู้ใช้งาน")}</span>
                                    <span style="color:#D97706;">⭐ ${avg}</span>
                                </div>
                                <p style="margin-top:0.35rem; font-size:0.86rem; color:#334155;">${escapeHtml(r.comment || "ไม่ได้ระบุข้อความเพิ่มเติม")}</p>
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

        document.getElementById("fwToggleHideShopBtn")?.addEventListener("click", async () => {
            await toggleHideShop(shop.id);
        });

        document.getElementById("fwEditThisShopBtn")?.addEventListener("click", () => {
            openShopModal(shop);
        });

        document.getElementById("fwDetailLikeBtn")?.addEventListener("click", () => {
            toggleLikeShop(shop.id);
        });

        document.getElementById("fwGoToDmBtn")?.addEventListener("click", () => {
            openOrderFormForShop(shop);
        });

        document.getElementById("fwOpenReviewBtn")?.addEventListener("click", () => {
            openReviewModal(shop.id);
        });
    }

    async function toggleHideShop(shopId) {
        const user = requireSignedInUser();
        if (!user) return;
        const shop = shops.find((s) => s.id === shopId);
        if (!shop || shop.ownerUid !== user.uid) {
            alert("เฉพาะเจ้าของร้านเท่านั้นที่สามารถซ่อนหรือแสดงร้านค้านี้ได้ครับ");
            return;
        }
        const nextHidden = !Boolean(shop.isHidden);
        await updateDoc(doc(db, COL_SHOPS, shopId), {
            isHidden: nextHidden,
            updatedAt: serverTimestamp()
        });
        shop.isHidden = nextHidden;
        renderShopDetail(shopId);
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
        if (els.shopHiddenInput()) els.shopHiddenInput().checked = Boolean(myExistingShop?.isHidden);
        if (els.shopImageInput()) els.shopImageInput().value = "";

        const hint = els.currentImageHint();
        if (hint) {
            if (myExistingShop?.imageUrl) {
                hint.style.display = "block";
                hint.innerText = "ร้านนี้มีรูปอยู่แล้ว หากไม่เลือกไฟล์ใหม่จะใช้รูปเดิมครับ";
            } else {
                hint.style.display = "none";
                hint.innerText = "";
            }
        }
        updateImagePreview(myExistingShop?.imageUrl || "");
        modal.style.display = "flex";
    }

    async function handleShopSubmit(e) {
        e.preventDefault();
        const user = requireSignedInUser();
        if (!user) return;

        const btn = els.saveShopBtn();
        const file = els.shopImageInput()?.files?.[0] || null;

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerText = file ? "กำลังอัปโหลดรูปภาพ..." : "กำลังบันทึกร้าน...";
            }

            let imageUrl = editingShop?.imageUrl || "";
            if (file) {
                imageUrl = await uploadShopImage(file, user.uid);
            }

            const payload = {
                title: els.shopTitle().value.trim(),
                category: els.shopCategory().value,
                description: els.shopDesc().value.trim(),
                paymentNote: els.shopPayment().value.trim(),
                isHidden: Boolean(els.shopHiddenInput()?.checked),
                imageUrl,
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
            updateImagePreview("");
            editingShop = null;
            await loadData();
        } catch (err) {
            alert("❌ บันทึกร้านไม่สำเร็จ: " + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "บันทึกร้านบริการ";
            }
        }
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
        els.shopImageInput()?.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) {
                updateImagePreview(editingShop?.imageUrl || "");
                return;
            }
            const reader = new FileReader();
            reader.onload = () => updateImagePreview(String(reader.result || ""));
            reader.readAsDataURL(file);
        });
        els.shopForm()?.addEventListener("submit", handleShopSubmit);
        els.reviewForm()?.addEventListener("submit", handleReviewSubmit);

        document.querySelectorAll(".fw-score-input").forEach((el) => {
            el.addEventListener("change", updateReviewPreview);
        });

        document.getElementById("fwCloseShopModalBtn")?.addEventListener("click", () => {
            if (els.shopModal()) els.shopModal().style.display = "none";
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
