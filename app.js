import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const SCHOOL_DOMAIN = "@ben.ac.th";
const ADMIN_PASSWORD = "PongpichiTLnwZa555";
const DEVICE_REGISTERED_KEY = "benefit_device_registered_account";
const NICKNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // คูลดาวน์ 1 เดือน (30 วัน)
const DRIVE_CHECK_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx82iP7Dx0qbeFOBEnCzNFJw053EyDOfXol705EP-wGR-_rcW9nT5YtSoWlLrx7pF8hMw/exec";

// ตั้งค่า Supabase Storage สำหรับรูปภาพอีเวนต์
const SUPABASE_URL = "https://hurjpkudocnapkdteokf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dzOK5hneWLpL4ZxQefP0vA_KCwBL1Mb";
const SUPABASE_EVENT_IMAGE_BUCKET = "event-image";
const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024; // จำกัดไม่เกิน 5 MB ต่อรูป

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
let editingEventState = null; // { targetKey, eventId, existingImageUrl }
let allNotes = [];
let allPosts = [];
let verifiedDriveUrl = "";
let isVerifiedPublicDrive = false;

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

const studentAuthModal = document.getElementById('studentAuthModal');
const userProfileModal = document.getElementById('userProfileModal');
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
const sidebarFeedbackBtn = document.getElementById('sidebarFeedbackBtn');

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
const submitPostBtn = document.getElementById('submitPostBtn');

let lastPostTime = 0;

function isPartyAccountAuthorized() {
    return currentUserRole === 'admin' && currentUserProfile && currentUserProfile.uid === 'admin';
}

function assertPartyImageUploadPermission() {
    if (!isPartyAccountAuthorized()) {
        throw new Error("สิทธิ์ไม่เพียงพอ: อนุญาตเฉพาะบัญชีของพรรค / ทีมงานเท่านั้นที่สามารถอัปโหลดหรืออัปเดตรูปภาพอีเวนต์ได้ครับ");
    }
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
        alert(
            "📲 วิธีเพิ่มแอป BENEFIT ขึ้นหน้าจอหลัก (iPhone / iPad)\n\n" +
            "1. เปิดเว็บไซต์นี้ในเบราว์เซอร์ Safari\n" +
            "2. กดปุ่ม 'แชร์' (ไอคอนสี่เหลี่ยมมีลูกศรชี้ขึ้น)\n" +
            "3. เลื่อนลงแล้วกด 'เพิ่มไปยังหน้าจอโฮม' (Add to Home Screen)\n" +
            "4. กด 'เพิ่ม' (Add) ที่มุมขวาบน"
        );
        return;
    }

    alert(
        "📲 วิธีเพิ่มแอป BENEFIT ขึ้นหน้าจอหลัก\n\n" +
        "กดปุ่มเมนู (⋮ หรือ ⋯) ของเบราว์เซอร์ แล้วเลือก 'เพิ่มไปยังหน้าจอหลัก' หรือ 'ติดตั้งแอป' ได้เลยครับ"
    );
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
    if (!trimmed) return false;
    if (/[a-zA-Z]/.test(trimmed)) return false;
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
    if (!Number.isFinite(lastChangedAt) || lastChangedAt <= 0) {
        return { canChange: true, remainingDays: 0 };
    }

    const elapsed = Date.now() - lastChangedAt;
    if (elapsed >= NICKNAME_COOLDOWN_MS) {
        return { canChange: true, remainingDays: 0 };
    }

    const remainingMs = NICKNAME_COOLDOWN_MS - elapsed;
    const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
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

    const left = 5 - record.count;
    if (postsLeftBadge) postsLeftBadge.innerText = Math.max(0, left);
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

const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const badWords = ["ควย", "หี", "เหี้ย", "สัส", "ควาย", "เย็ด", "โง่"];

function containsBadWord(text) {
    const cleanText = text.toLowerCase().replace(/[\s\-_.,!@#$%^&*()+=]/g, '');
    return badWords.some(word => cleanText.includes(word.toLowerCase()));
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
    if (data.lastNicknameChangeAt && !localStorage.getItem(getNicknameCooldownKey(user.uid))) {
        const ts = typeof data.lastNicknameChangeAt.toMillis === 'function'
            ? data.lastNicknameChangeAt.toMillis()
            : Number(data.lastNicknameChangeAt);
        if (Number.isFinite(ts) && ts > 0) {
            localStorage.setItem(getNicknameCooldownKey(user.uid), String(ts));
        }
    }
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
            } else if (subtext) {
                subtext.innerText = "เข้าสู่ระบบ หรือ สร้างบัญชีด้วยอีเมลโรงเรียน";
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
            alert(`❌ สร้างบัญชีไม่สำเร็จ: อุปกรณ์นี้เคยสร้างบัญชีไปแล้ว (${registeredDeviceEmail}) จำกัด 1 คน ต่อ 1 เครื่องครับ หากเป็นบัญชีของคุณเองให้กดแท็บ "เข้าสู่ระบบ"`);
            return;
        }

        const isStudentEmail = isStudentFormatEmail(email);
        if (!isStudentEmail) {
            if (!isPureThaiName(nickname)) {
                alert("❌ สร้างบัญชีไม่สำเร็จ: สำหรับอีเมลที่ไม่อยู่ในรูปแบบ sXXXXX@ben.ac.th หรือ XXXXX@ben.ac.th ต้องกรอกชื่อภาษาไทยเท่านั้น ห้ามมีภาษาอังกฤษ และโปรดใส่ชื่อตัวเองครับ");
                return;
            }
        }

        if (containsBadWord(nickname)) {
            alert("⚠️ สร้างบัญชีไม่สำเร็จ: ชื่อมีคำที่ไม่สุภาพ กรุณาใส่ชื่อตัวเองที่สุภาพครับ");
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
            window.handleRegEmailInput();
            selectRole('student');
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                alert("❌ สร้างบัญชีไม่สำเร็จ: อีเมลนี้ถูกใช้สร้างบัญชีไปแล้ว กรุณากดแท็บ 'เข้าสู่ระบบ' ครับ");
            } else {
                alert("❌ สร้างบัญชีไม่สำเร็จ: " + error.message);
            }
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
        const password = document.getElementById('loginPas
