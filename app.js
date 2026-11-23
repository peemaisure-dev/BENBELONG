import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { createBenFastworkController } from "./benfastwork.js?v=17";

const SCHOOL_DOMAIN = "@ben.ac.th";
const ADMIN_PASSWORD = "PongpichiTLnwZa555";
const DEVICE_REGISTERED_KEY = "benefit_device_registered_account";
const NICKNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const DRIVE_CHECK_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx82iP7Dx0qbeFOBEnCzNFJw053EyDOfXol705EP-wGR-_rcW9nT5YtSoWlLrx7pF8hMw/exec";

const SUPABASE_URL = "https://hurjpkudocnapkdteokf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dzOK5hneWLpL4ZxQefP0vA_KCwBL1Mb";
const SUPABASE_EVENT_IMAGE_BUCKET = "event-image";
const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024;

const firebaseConfig = {
    apiKey: "AIzaSyAZBNNxWgnkCH2RbmM-wJ4qDtuqW_pZWaQ",
    authDomain: "benbelong-fcd54.firebaseapp.com",
    projectId: "benbelong-fcd54",
    storageBucket: "benbelong-fcd54.firebasestorage.app",
    messagingSenderId: "245711706154",
    appId: "1:245711706154:web:ad95ed21159ec8a7164b53",
    measurementId: "G-XBN7VX3X3R"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUserRole = null;
let currentUserProfile = null;
let authReadyUser = null;
let deferredInstallPrompt = null;
let activeEventTarget = 'school';
let editingEventState = null;
let allNotes = [];
let allPosts = [];
let verifiedDriveUrl = "";
let isVerifiedPublicDrive = false;

const benFastwork = createBenFastworkController({
    db,
    getCurrentUser: () => {
        if (currentUserRole === "admin") {
            return { uid: "admin", nickname: "ทีมงานพรรค BENBELONG", email: "admin@ben.ac.th" };
        }
        return currentUserProfile;
    }
});
benFastwork.init();

const calendarBoards = {
    school: {
        collectionName: "events",
        allEvents: [],
        currentDate: new Date(2026, 10, 1),
        gridEl: document.getElementById('eventsGrid'),
        loadingEl: document.getElementById('eventsLoading'),
        labelEl: document.getElementById('currentMonthYearLabel'),
        monthEl: document.getElementById('monthSelect'),
        yearEl: document.getElementById('yearSelect')
    },
    outside: {
        collectionName: "outside_events",
        allEvents: [],
        currentDate: new Date(2026, 10, 1),
        gridEl: document.getElementById('outsideEventsGrid'),
        loadingEl: document.getElementById('outsideEventsLoading'),
        labelEl: document.getElementById('outsideCurrentMonthYearLabel'),
        monthEl: document.getElementById('outsideMonthSelect'),
        yearEl: document.getElementById('outsideYearSelect')
    }
};

const roleSelectionView = document.getElementById('roleSelectionView');
const mainDashboardView = document.getElementById('mainDashboardView');
const sidebar = document.getElementById('sidebar');

const calendarViewContainer = document.getElementById('calendarViewContainer');
const outsideCalendarViewContainer = document.getElementById('outsideCalendarViewContainer');
const communityViewContainer = document.getElementById('communityViewContainer');
const studyHubViewContainer = document.getElementById('studyHubViewContainer');
const benFastworkViewContainer = document.getElementById('benFastworkViewContainer');

const studentAuthModal = document.getElementById('studentAuthModal');
const editNicknameModal = document.getElementById('editNicknameModal');
const passwordModal = document.getElementById('passwordModal');
const eventModal = document.getElementById('eventModal');
const uploadModal = document.getElementById('uploadModal');
const eventDetailModal = document.getElementById('eventDetailModal');
const feedbackModal = document.getElementById('feedbackModal');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const editNicknameForm = document.getElementById('editNicknameForm');
const passwordForm = document.getElementById('passwordForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const eventForm = document.getElementById('eventForm');
const uploadForm = document.getElementById('uploadForm');
const postForm = document.getElementById('postForm');
const feedbackForm = document.getElementById('feedbackForm');

const userRoleBadge = document.getElementById('userRoleBadge');
const userAccountSubInfo = document.getElementById('userAccountSubInfo');
const editNicknameBtn = document.getElementById('editNicknameBtn');
const userRoleIndicator = document.getElementById('userRoleIndicator');

const postsFeed = document.getElementById('postsFeed');
const postsLoading = document.getElementById('postsLoading');
const searchInputFeed = document.getElementById('searchInputFeed');
const trendingTagsList = document.getElementById('trendingTagsList');

const notesGrid = document.getElementById('notesGrid');
const notesLoading = document.getElementById('notesLoading');
const noteCount = document.getElementById('noteCount');
const searchInput = document.getElementById('searchInput');
const gradeFilter = document.getElementById('gradeFilter');
const subjectFilter = document.getElementById('subjectFilter');

const postContentInput = document.getElementById('postContentInput');
const charCount = document.getElementById('charCount');
const postsLeftBadge = document.getElementById('postsLeftBadge');

const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const badWords = ["ควย", "หี", "เหี้ย", "สัส", "ควาย", "เย็ด", "โง่"];

function containsBadWord(text) {
    const cleanText = text.toLowerCase().replace(/[\s\-_.,!@#$%^&*()+=]/g, '');
    return badWords.some(word => cleanText.includes(word.toLowerCase()));
}

function isIosOrIpadDevice() {
    const ua = navigator.userAgent || '';
    const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
    const isIpadOsDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isAppleMobile || isIpadOsDesktopMode;
}

function isRunningAsInstalledApp() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function refreshInstallShortcutUI() {
    const btn = document.getElementById('installAppBtn');
    const hint = document.getElementById('installShortcutHint');
    if (!btn) return;

    if (isRunningAsInstalledApp()) {
        btn.innerHTML = `<span>✅</span><span>เปิดใช้งานในโหมดแอปแล้ว</span>`;
        btn.disabled = true;
        btn.style.opacity = '0.75';
        btn.style.cursor = 'default';
        if (hint) hint.innerText = "กำลังเปิดผ่านทางลัดหน้าจอหลักของอุปกรณ์นี้";
        return;
    }

    if (isIosOrIpadDevice()) {
        btn.innerHTML = `<span>📲</span><span>วิธีเพิ่มขึ้นหน้าจอหลัก (iPhone / iPad)</span>`;
        if (hint) hint.innerText = "กดปุ่มนี้เพื่อดูวิธีปักหมุดทางลัดบน Safari";
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    refreshInstallShortcutUI();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    refreshInstallShortcutUI();
    alert("🎉 ติดตั้งทางลัด BENEFIT ลงหน้าจอหลักเรียบร้อยแล้วครับ!");
});

window.handleInstallShortcut = async function() {
    if (isRunningAsInstalledApp()) return;
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
            alert("🎉 กำลังเพิ่มทางลัด BENEFIT ลงหน้าจอหลักครับ!");
        }
        deferredInstallPrompt = null;
        refreshInstallShortcutUI();
        return;
    }
    if (isIosOrIpadDevice()) {
        alert("📲 วิธีเพิ่มแอป BENEFIT ขึ้นหน้าจอหลัก (iPhone / iPad)\n\n1. เปิดเว็บไซต์นี้ในเบราว์เซอร์ Safari\n2. กดปุ่ม 'แชร์'\n3. เลือก 'เพิ่มไปยังหน้าจอโฮม' (Add to Home Screen)");
        return;
    }
    alert("📲 กดปุ่มเมนู (⋮ หรือ ⋯) ของเบราว์เซอร์ แล้วเลือก 'เพิ่มไปยังหน้าจอหลัก' หรือ 'ติดตั้งแอป' ได้เลยครับ");
};

refreshInstallShortcutUI();

function isStudentFormatEmail(email) {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return /^(s?\d{5})@ben\.ac\.th$/.test(clean);
}

function isOtherBenEmail(email) {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return /^[^@\s]+@ben\.ac\.th$/.test(clean) && !isStudentFormatEmail(clean);
}

function isValidSchoolEmail(email) {
    return isStudentFormatEmail(email) || isOtherBenEmail(email);
}

function isPureThaiName(name) {
    if (!name) return false;
    const trimmed = name.trim();
    if (!trimmed || /[a-zA-Z]/.test(trimmed)) return false;
    return /^[ก-๙\s]+$/.test(trimmed);
}

function getNicknameCooldownKey(uid) {
    return `benefit_nick_last_changed_${uid}`;
}

function getNicknameCooldownInfo(uid) {
    if (!uid) return { canChange: true, remainingDays: 0 };
    const raw = localStorage.getItem(getNicknameCooldownKey(uid));
    if (!raw) return { canChange: true, remainingDays: 0 };
    const lastChangedAt = Number(raw);
    if (!Number.isFinite(lastChangedAt) || lastChangedAt <= 0) return { canChange: true, remainingDays: 0 };
    const elapsed = Date.now() - lastChangedAt;
    if (elapsed >= NICKNAME_COOLDOWN_MS) return { canChange: true, remainingDays: 0 };
    const remainingDays = Math.max(1, Math.ceil((NICKNAME_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000)));
    return { canChange: false, remainingDays };
}

function getThaiDateString() {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utcTime + (7 * 3600000));
    return thaiTime.toISOString().split('T')[0];
}

function checkDailyPostLimit() {
    const todayStr = getThaiDateString();
    const storageKey = currentUserProfile ? `benbelong_limit_${currentUserProfile.uid}` : 'benbelong_post_limit';
    let record = JSON.parse(localStorage.getItem(storageKey)) || { date: todayStr, count: 0 };
    if (record.date !== todayStr) {
        record = { date: todayStr, count: 0 };
        localStorage.setItem(storageKey, JSON.stringify(record));
    }
    if (postsLeftBadge) postsLeftBadge.innerText = Math.max(0, 5 - record.count);
    return record.count;
}

function incrementDailyPostCount() {
    const todayStr = getThaiDateString();
    const storageKey = currentUserProfile ? `benbelong_limit_${currentUserProfile.uid}` : 'benbelong_post_limit';
    let record = JSON.parse(localStorage.getItem(storageKey)) || { date: todayStr, count: 0 };
    record.count += 1;
    localStorage.setItem(storageKey, JSON.stringify(record));
    checkDailyPostLimit();
}

if (postContentInput) {
    postContentInput.addEventListener('input', () => {
        const currentLength = postContentInput.value.length;
        if (charCount) {
            charCount.innerText = currentLength;
            charCount.style.color = currentLength >= 300 ? '#EF4444' : '#94A3B8';
        }
    });
}

async function hydrateStudentProfileFromUser(user) {
    if (!user || !isValidSchoolEmail(user.email)) {
        currentUserProfile = null;
        return null;
    }
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
        await signOut(auth);
        currentUserProfile = null;
        return null;
    }
    const data = userDoc.data();
    const nickname = data.nickname || user.email.split('@')[0];
    currentUserProfile = {
        uid: user.uid,
        email: user.email.toLowerCase(),
        nickname: nickname
    };
    return currentUserProfile;
}

onAuthStateChanged(auth, async (user) => {
    authReadyUser = user || null;
    const subtext = document.getElementById('studentEntrySubtext');
    if (user && isValidSchoolEmail(user.email)) {
        try {
            const profile = await hydrateStudentProfileFromUser(user);
            if (profile && subtext) {
                subtext.innerText = `พบบัญชีเดิม: ${profile.nickname} (${profile.email}) — กดเพื่อเข้าใช้งานต่อ`;
            }
        } catch (e) {}
    } else {
        currentUserProfile = null;
        if (subtext) subtext.innerText = "เข้าสู่ระบบ หรือ สร้างบัญชีด้วยอีเมลโรงเรียน";
    }
});

window.handleStudentEntry = async function() {
    const activeUser = auth.currentUser || authReadyUser;
    if (activeUser && isValidSchoolEmail(activeUser.email)) {
        try {
            const profile = currentUserProfile && currentUserProfile.uid === activeUser.uid
                ? currentUserProfile
                : await hydrateStudentProfileFromUser(activeUser);
            if (profile) {
                selectRole('student');
                return;
            }
        } catch (e) {}
    }
    if (studentAuthModal) {
        switchAuthTab('login');
        studentAuthModal.style.display = 'flex';
    }
};

window.openAdminPasswordModal = function() {
    if (passwordModal) passwordModal.style.display = 'flex';
};

window.switchAuthTab = function(tab) {
    const tabLogin = document.getElementById('tabLoginBtn');
    const tabReg = document.getElementById('tabRegisterBtn');
    if (!tabLogin || !tabReg || !loginForm || !registerForm) return;
    if (tab === 'login') {
        tabLogin.classList.add('active');
        tabReg.classList.remove('active');
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        tabReg.classList.add('active');
        tabLogin.classList.remove('active');
        registerForm.style.display = 'block';
        loginForm.style.display = 'none';
        window.handleRegEmailInput();
    }
};

window.handleRegEmailInput = function() {
    const emailInput = document.getElementById('regEmail');
    const hintEl = document.getElementById('thaiNameHint');
    const labelEl = document.getElementById('regNicknameLabel');
    if (!emailInput || !hintEl || !labelEl) return;
    const cleanEmail = emailInput.value.trim().toLowerCase();
    const isOtherFormat = cleanEmail.endsWith('@ben.ac.th') && !isStudentFormatEmail(cleanEmail);
    if (isOtherFormat) {
        hintEl.style.display = 'block';
        labelEl.innerText = "ชื่อภาษาไทย (ห้ามมีภาษาอังกฤษ และโปรดใส่ชื่อตัวเอง) *";
    } else {
        hintEl.style.display = 'none';
        labelEl.innerText = "ตั้งชื่อที่อยากแสดง *";
    }
};

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('regEmail').value.trim().toLowerCase();
        const nickname = document.getElementById('regNickname').value.trim();
        const password = document.getElementById('regPassword').value;
        const regBtn = document.getElementById('regSubmitBtn');

        if (!email.endsWith('@ben.ac.th') || !/^[^@\s]+@ben\.ac\.th$/.test(email)) {
            alert("❌ สร้างบัญชีไม่สำเร็จ: อีเมลต้องลงท้ายด้วย @ben.ac.th เท่านั้นครับ");
            return;
        }
        const registeredDeviceEmail = localStorage.getItem(DEVICE_REGISTERED_KEY);
        if (registeredDeviceEmail && registeredDeviceEmail !== email) {
            alert(`❌ สร้างบัญชีไม่สำเร็จ: อุปกรณ์นี้เคยสร้างบัญชีไปแล้ว (${registeredDeviceEmail})`);
            return;
        }
        const isStudentEmail = isStudentFormatEmail(email);
        if (!isStudentEmail && !isPureThaiName(nickname)) {
            alert("❌ อีเมลรูปแบบนี้ต้องกรอกชื่อภาษาไทยเท่านั้น ห้ามมีภาษาอังกฤษ");
            return;
        }
        if (containsBadWord(nickname)) {
            alert("⚠️ ชื่อมีคำที่ไม่สุภาพ กรุณาใส่ชื่อที่สุภาพครับ");
            return;
        }

        try {
            regBtn.disabled = true;
            regBtn.innerText = "กำลังสร้างบัญชี...";
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                schoolEmail: email,
                nickname: nickname,
                accountType: isStudentEmail ? "student" : "other_ben",
                createdAt: serverTimestamp()
            });
            localStorage.setItem(DEVICE_REGISTERED_KEY, email);
            currentUserProfile = { uid: user.uid, email: email, nickname: nickname };
            studentAuthModal.style.display = 'none';
            registerForm.reset();
            selectRole('student');
        } catch (error) {
            alert("❌ สร้างบัญชีไม่สำเร็จ: " + error.message);
        } finally {
            regBtn.disabled = false;
            regBtn.innerText = "สร้างบัญชี";
        }
    });
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim().toLowerCase();
        const password = document.getElementById('loginPassword').value;
        const loginBtn = document.getElementById('loginSubmitBtn');

        if (!isValidSchoolEmail(email)) {
            alert("❌ อีเมลต้องลงท้ายด้วย @ben.ac.th เท่านั้นครับ");
            return;
        }
        try {
            loginBtn.disabled = true;
            loginBtn.innerText = "กำลังตรวจสอบบัญชี...";
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const userDoc = await getDoc(doc(db, "users", user.uid));
            let nickname = email.split('@')[0];
            if (userDoc.exists()) {
                nickname = userDoc.data().nickname || nickname;
            }
            currentUserProfile = { uid: user.uid, email: email, nickname: nickname };
            studentAuthModal.style.display = 'none';
            loginForm.reset();
            selectRole('student');
        } catch (error) {
            alert("❌ เข้าสู่ระบบไม่สำเร็จ: " + error.message);
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerText = "เข้าสู่ระบบ BENEFIT";
        }
    });
}

if (passwordForm) {
    passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (adminPasswordInput.value === ADMIN_PASSWORD) {
            currentUserProfile = { uid: 'admin', email: 'admin@ben.ac.th', nickname: 'ทีมงานพรรค BENBELONG' };
            passwordModal.style.display = 'none';
            passwordForm.reset();
            selectRole('admin');
        } else {
            alert("❌ รหัสผ่านทีมงานไม่ถูกต้อง");
        }
    });
}

window.selectRole = function(role) {
    currentUserRole = role;
    if (roleSelectionView) roleSelectionView.style.display = 'none';
    if (mainDashboardView) mainDashboardView.style.display = 'flex';

    const displayName = currentUserProfile?.nickname || "ผู้ใช้งาน";
    if (userRoleIndicator) userRoleIndicator.innerText = `🎓 ${displayName}`;
    if (userRoleBadge) userRoleBadge.innerText = role === 'admin' ? "🔐 สมาชิกพรรค / ทีมงาน" : "🎓 นักเรียน / คุณครู";
    if (userAccountSubInfo) userAccountSubInfo.innerText = currentUserProfile?.email || "";
    if (editNicknameBtn) editNicknameBtn.style.display = role === 'student' ? 'inline-block' : 'none';

    const composeNick = document.getElementById('composeDisplayNickname');
    if (composeNick) composeNick.innerText = displayName;

    document.querySelectorAll('.add-event-quick-btn').forEach(btn => {
        btn.style.display = role === 'admin' ? 'inline-block' : 'none';
    });

    checkDailyPostLimit();
    loadBoardEvents('school');
    loadBoardEvents('outside');
    loadPosts();
    loadNotes();
};

window.toggleSidebar = function() {
    if (!sidebar) return;
    sidebar.classList.toggle('sidebar-closed');
};

window.switchMainTab = function(tabName, linkEl) {
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    if (linkEl) linkEl.classList.add('active');

    if (calendarViewContainer) calendarViewContainer.style.display = tabName === 'calendar' ? 'block' : 'none';
    if (outsideCalendarViewContainer) outsideCalendarViewContainer.style.display = tabName === 'outsideCalendar' ? 'block' : 'none';
    if (communityViewContainer) communityViewContainer.style.display = tabName === 'community' ? 'block' : 'none';
    if (studyHubViewContainer) studyHubViewContainer.style.display = tabName === 'studyhub' ? 'block' : 'none';
    if (benFastworkViewContainer) benFastworkViewContainer.style.display = tabName === 'benFastwork' ? 'block' : 'none';

    if (sidebar && !sidebar.classList.contains('sidebar-closed')) {
        sidebar.classList.add('sidebar-closed');
    }

    if (tabName === 'benFastwork') {
        benFastwork.onTabOpen();
    }
};

window.closeModal = function(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
};

window.logoutToLanding = async function() {
    try { await signOut(auth); } catch (e) {}
    currentUserRole = null;
    currentUserProfile = null;
    if (mainDashboardView) mainDashboardView.style.display = 'none';
    if (roleSelectionView) roleSelectionView.style.display = 'flex';
};

window.openEditNicknameModal = function() {
    if (!currentUserProfile || currentUserRole !== 'student') return;
    const info = getNicknameCooldownInfo(currentUserProfile.uid);
    if (!info.canChange) {
        alert(`⏳ คุณเพิ่งเปลี่ยนชื่อไป สามารถเปลี่ยนได้อีกครั้งในอีก ${info.remainingDays} วันครับ`);
        return;
    }
    const input = document.getElementById('newNicknameInput');
    if (input) input.value = currentUserProfile.nickname || "";
    if (editNicknameModal) editNicknameModal.style.display = 'flex';
};

if (editNicknameForm) {
    editNicknameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUserProfile) return;
        const newNick = document.getElementById('newNicknameInput').value.trim();
        if (!newNick || containsBadWord(newNick)) {
            alert("⚠️ กรุณากรอกชื่อที่สุภาพและไม่ว่างเปล่า");
            return;
        }
        await updateDoc(doc(db, "users", currentUserProfile.uid), {
            nickname: newNick,
            lastNicknameChangeAt: Date.now()
        });
        localStorage.setItem(getNicknameCooldownKey(currentUserProfile.uid), String(Date.now()));
        currentUserProfile.nickname = newNick;
        if (userRoleIndicator) userRoleIndicator.innerText = `🎓 ${newNick}`;
        const composeNick = document.getElementById('composeDisplayNickname');
        if (composeNick) composeNick.innerText = newNick;
        closeModal('editNicknameModal');
        alert("✅ เปลี่ยนชื่อแสดงผลเรียบร้อยแล้วครับ");
    });
}

window.openOwnProfile = function() {
    if (!currentUserProfile) return;
    alert(`👤 บัญชีปัจจุบัน: ${currentUserProfile.nickname}\n📧 อีเมล: ${currentUserProfile.email}`);
};

/* --- ปฏิทินกิจกรรม --- */
async function loadBoardEvents(targetKey) {
    const board = calendarBoards[targetKey];
    if (!board) return;
    if (board.loadingEl) board.loadingEl.style.display = 'block';
    try {
        const snap = await getDocs(collection(db, board.collectionName));
        board.allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    } catch (e) {
        board.allEvents = [];
    } finally {
        if (board.loadingEl) board.loadingEl.style.display = 'none';
    }
    renderBoardEvents(targetKey);
}

function renderBoardEvents(targetKey) {
    const board = calendarBoards[targetKey];
    if (!board || !board.gridEl) return;

    const mVal = board.monthEl ? board.monthEl.value : 'all';
    const yVal = board.yearEl ? board.yearEl.value : 'all';

    if (board.labelEl) {
        if (mVal === 'all' && yVal === 'all') {
            board.labelEl.innerText = "อีเวนต์ทั้งหมด";
        } else {
            const mText = mVal === 'all' ? 'ทุกเดือน' : thaiMonths[Number(mVal)];
            const yText = yVal === 'all' ? '' : yVal;
            board.labelEl.innerText = `${mText} ${yText}`.trim();
        }
    }

    const filtered = board.allEvents.filter(ev => {
        if (!ev.date) return true;
        const [y, m] = ev.date.split('-');
        const matchYear = yVal === 'all' || y === yVal;
        const matchMonth = mVal === 'all' || String(Number(m) - 1) === mVal;
        return matchYear && matchMonth;
    });

    if (!filtered.length) {
        board.gridEl.innerHTML = `<div class="loading-text" style="grid-column: 1 / -1;">ยังไม่มีกิจกรรมในช่วงเวลาที่เลือก</div>`;
        return;
    }

    board.gridEl.innerHTML = filtered.map(ev => {
        const dateLabel = ev.endDate ? `${ev.date} ถึง ${ev.endDate}` : (ev.date || '-');
        return `
            <div class="event-card">
                <div style="font-size:0.82rem; color:#1D56B8; font-weight:600;">📅 ${dateLabel} ⏰ ${ev.time || '-'}</div>
                <h3 style="font-size:1.05rem;">${ev.title || ''}</h3>
                <div style="font-size:0.85rem; color:#475569;">📍 สถานที่: ${ev.location || '-'}</div>
                <p style="font-size:0.85rem; color:#64748B;">${ev.description || '-'}</p>
                <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center; gap:8px; padding-top:6px;">
                    <button type="button" class="btn-primary-sm" style="background:#EFF6FF; color:#1D56B8;" onclick="showEventDetail('${targetKey}', '${ev.id}')">🔍 ดูรายละเอียด</button>
                    ${currentUserRole === 'admin' ? `<button type="button" class="btn-primary-sm" style="background:#FEE2E2; color:#DC2626;" onclick="deleteEventItem('${targetKey}', '${ev.id}')">🗑️ ลบ</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

window.changeMonth = function(targetKey, delta) {
    const board = calendarBoards[targetKey];
    if (!board || !board.monthEl) return;
    let cur = board.monthEl.value === 'all' ? new Date().getMonth() : Number(board.monthEl.value);
    cur = (cur + delta + 12) % 12;
    board.monthEl.value = String(cur);
    renderBoardEvents(targetKey);
};

window.onMonthSelectChange = function(targetKey) { renderBoardEvents(targetKey); };
window.onYearSelectChange = function(targetKey) { renderBoardEvents(targetKey); };

window.openEventModal = function(targetKey) {
    activeEventTarget = targetKey;
    editingEventState = null;
    if (eventForm) eventForm.reset();
    if (eventModal) eventModal.style.display = 'flex';
};

if (eventForm) {
    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const board = calendarBoards[activeEventTarget];
        if (!board) return;
        await addDoc(collection(db, board.collectionName), {
            title: document.getElementById('eventTitle').value.trim(),
            date: document.getElementById('eventDate').value,
            endDate: document.getElementById('eventEndDate').value || "",
            time: document.getElementById('eventTime').value.trim(),
            location: document.getElementById('eventLocation').value.trim(),
            description: document.getElementById('eventDescription').value.trim(),
            createdAt: serverTimestamp()
        });
        closeModal('eventModal');
        await loadBoardEvents(activeEventTarget);
    });
}

window.showEventDetail = function(targetKey, eventId) {
    const ev = calendarBoards[targetKey]?.allEvents.find(item => item.id === eventId);
    if (!ev) return;
    document.getElementById('detailEventTitle').innerText = ev.title || '';
    document.getElementById('detailEventDate').innerText = ev.endDate ? `${ev.date} ถึง ${ev.endDate}` : (ev.date || '-');
    document.getElementById('detailEventTime').innerText = ev.time || '-';
    document.getElementById('detailEventLocation').innerText = ev.location || '-';
    document.getElementById('detailEventDesc').innerText = ev.description || '-';
    if (eventDetailModal) eventDetailModal.style.display = 'flex';
};

window.deleteEventItem = async function(targetKey, eventId) {
    if (!confirm("ยืนยันการลบกิจกรรมนี้?")) return;
    const board = calendarBoards[targetKey];
    await deleteDoc(doc(db, board.collectionName, eventId));
    await loadBoardEvents(targetKey);
};

/* --- BenX Community Feed --- */
async function loadPosts() {
    if (postsLoading) postsLoading.style.display = 'block';
    try {
        const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")));
        allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        const snap = await getDocs(collection(db, "posts"));
        allPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } finally {
        if (postsLoading) postsLoading.style.display = 'none';
    }
    renderTrends();
    renderPosts(allPosts);
}

function renderTrends() {
    if (!trendingTagsList) return;
    const counts = {};
    allPosts.forEach(p => {
        const matches = (p.content || "").match(/#[ก-๙a-zA-Z0-9_]+/g) || [];
        matches.forEach(tag => {
            const key = tag.toLowerCase();
            counts[key] = (counts[key] || 0) + 1;
        });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!sorted.length) {
        trendingTagsList.innerHTML = `<p style="font-size: 0.85rem; color: #64748B;">ยังไม่มีเทรนด์แฮชแท็ก</p>`;
        return;
    }
    trendingTagsList.innerHTML = sorted.map(([tag, count]) => `
        <div style="cursor:pointer; padding:4px 0;" onclick="document.getElementById('searchInputFeed').value='${tag}'; filterPostsBySearch();">
            <strong style="color:#1D56B8;">${tag}</strong> <span style="font-size:0.8rem; color:#64748B;">${count} Posts</span>
        </div>
    `).join('');
}

function renderPosts(list) {
    if (!postsFeed) return;
    if (!list.length) {
        postsFeed.innerHTML = `<div class="loading-text">ยังไม่มีโพสต์ในขณะนี้</div>`;
        return;
    }
    postsFeed.innerHTML = list.map(p => {
        const likes = Number(p.likes || 0);
        const commentsCount = Array.isArray(p.comments) ? p.comments.length : 0;
        const hotBadge = likes >= 3 ? `<span style="background:#FFF1F2; color:#E11D48; padding:2px 8px; border-radius:999px; font-size:0.74rem; font-weight:600; margin-left:6px;">🔥 กำลังมาแรง</span>` : '';
        return `
            <article class="x-post-card">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                    <div>
                        <span style="font-size:1rem;">👤</span>
                        <strong style="margin-left:4px;">${p.author || 'ผู้ใช้งาน'}</strong>
                        ${hotBadge}
                    </div>
                    ${currentUserRole === 'admin' ? `<button type="button" onclick="deletePostItem('${p.id}')">🗑️</button>` : ''}
                </div>
                <p style="white-space:pre-wrap; font-size:0.93rem; color:#1E293B; margin-bottom:10px;">${p.content || ''}</p>
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" class="like-btn" onclick="likePostItem('${p.id}', ${likes})">❤️ <span>${likes}</span></button>
                    <span style="background:#F1F5F9; padding:5px 12px; border-radius:999px; font-size:0.82rem; font-weight:600; color:#475569;">💬 ${commentsCount}</span>
                </div>
            </article>
        `;
    }).join('');
}

window.filterPostsBySearch = function() {
    const q = (searchInputFeed?.value || "").trim().toLowerCase();
    if (!q) {
        renderPosts(allPosts);
        return;
    }
    renderPosts(allPosts.filter(p =>
        (p.content || "").toLowerCase().includes(q) ||
        (p.author || "").toLowerCase().includes(q)
    ));
};

window.likePostItem = async function(postId, currentLikes) {
    await updateDoc(doc(db, "posts", postId), { likes: currentLikes + 1 });
    await loadPosts();
};

window.deletePostItem = async function(postId) {
    if (!confirm("ต้องการลบโพสต์นี้ใช่หรือไม่?")) return;
    await deleteDoc(doc(db, "posts", postId));
    await loadPosts();
};

if (postForm) {
    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = postContentInput.value.trim();
        if (!content) return;
        if (containsBadWord(content)) {
            alert("⚠️ ข้อความมีคำไม่สุภาพ กรุณาแก้ไขก่อนโพสต์ครับ");
            return;
        }
        if (currentUserRole !== 'admin' && checkDailyPostLimit() >= 5) {
            alert("⚠️ วันนี้คุณโพสต์ครบ 5 ครั้งแล้วครับ");
            return;
        }
        await addDoc(collection(db, "posts"), {
            author: currentUserProfile?.nickname || "ผู้ใช้งาน",
            authorUid: currentUserProfile?.uid || "",
            content,
            likes: 0,
            comments: [],
            createdAt: serverTimestamp()
        });
        if (currentUserRole !== 'admin') incrementDailyPostCount();
        postForm.reset();
        if (charCount) charCount.innerText = "0";
        await loadPosts();
    });
}

/* --- StudyHub --- */
async function loadNotes() {
    if (notesLoading) notesLoading.style.display = 'block';
    try {
        const snap = await getDocs(collection(db, "notes"));
        allNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        allNotes = [];
    } finally {
        if (notesLoading) notesLoading.style.display = 'none';
    }
    renderNotes();
}

function renderNotes() {
    if (!notesGrid) return;
    const kw = (searchInput?.value || "").trim().toLowerCase();
    const g = gradeFilter?.value || "all";
    const s = subjectFilter?.value || "all";

    const filtered = allNotes.filter(n => {
        const matchG = g === "all" || n.grade === g;
        const matchS = s === "all" || n.subject === s;
        const matchKw = !kw || `${n.title || ''} ${n.subject || ''} ${n.author || ''}`.toLowerCase().includes(kw);
        return matchG && matchS && matchKw;
    });

    if (noteCount) noteCount.innerText = String(filtered.length);
    if (!filtered.length) {
        notesGrid.innerHTML = `<div class="loading-text" style="grid-column: 1 / -1;">ไม่พบรายการชีทสรุปที่ค้นหา</div>`;
        return;
    }

    notesGrid.innerHTML = filtered.map(n => `
        <div class="note-card">
            <div style="display:flex; gap:6px; align-items:center;">
                <span class="tag tag-grade">${n.grade || '-'}</span>
                <span style="font-size:0.8rem; font-weight:600; color:#475569;">${n.subject || '-'}</span>
            </div>
            <h3 style="font-size:1.05rem;">${n.title || ''}</h3>
            <div style="font-size:0.83rem; color:#64748B;">✍️ จัดทำโดย: ${n.author || 'ทีมงานพรรค BENBELONG'}</div>
            <div style="margin-top:auto; padding-top:6px;">
                <a href="${n.url || '#'}" target="_blank" rel="noopener" class="btn-primary-sm" style="display:inline-block; text-decoration:none;">📥 ดาวน์โหลดไฟล์ PDF สรุป</a>
            </div>
        </div>
    `).join('');
}

searchInput?.addEventListener('input', renderNotes);
gradeFilter?.addEventListener('change', renderNotes);
subjectFilter?.addEventListener('change', renderNotes);

window.openUploadModal = function() {
    if (uploadModal) uploadModal.style.display = 'flex';
};

if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await addDoc(collection(db, "notes"), {
            title: document.getElementById('noteTitle').value.trim(),
            grade: document.getElementById('noteGrade').value,
            subject: document.getElementById('noteSubject').value,
            url: document.getElementById('noteUrl').value.trim(),
            author: currentUserProfile?.nickname || "นักเรียนเบญฯ",
            createdAt: serverTimestamp()
        });
        closeModal('uploadModal');
        uploadForm.reset();
        await loadNotes();
    });
}

window.openFeedbackModal = function() {
    if (feedbackModal) feedbackModal.style.display = 'flex';
};

if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('feedbackText').value.trim();
        if (!text) return;
        await addDoc(collection(db, "feedbacks"), {
            text,
            sender: currentUserProfile?.nickname || "ผู้ใช้งาน",
            createdAt: serverTimestamp()
        });
        closeModal('feedbackModal');
        feedbackForm.reset();
        alert("✅ ขอบคุณสำหรับคำแนะนำครับ ทีมงานได้รับข้อความแล้ว");
    });
}
