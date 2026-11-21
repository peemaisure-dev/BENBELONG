import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const SCHOOL_DOMAIN = "@ben.ac.th";
const ADMIN_PASSWORD = "PongpichiTLnwZa555";
const DEVICE_REGISTERED_KEY = "benefit_device_registered_account";
const NICKNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // คูลดาวน์ 1 เดือน (30 วัน)
const DRIVE_CHECK_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx82iP7Dx0qbeFOBEnCzNFJw053EyDOfXol705EP-wGR-_rcW9nT5YtSoWlLrx7pF8hMw/exec";

// ตั้งค่า Supabase Storage สำหรับรูปภาพอีเวนต์ (อนุญาตเฉพาะบัญชีของพรรคเท่านั้น)
const SUPABASE_URL = "https://hurjpkudocnapkdteokf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dzOK5hneWLpL4ZxQefP0vA_KCwBL1Mb";
const SUPABASE_EVENT_IMAGE_BUCKET = "EVENT-IMAGE";
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

// ตรวจสอบสิทธิ์เฉพาะบัญชีของพรรค / ทีมงาน
function isPartyAccountAuthorized() {
    return currentUserRole === 'admin' && currentUserProfile && currentUserProfile.uid === 'admin';
}

function assertPartyImageUploadPermission() {
    if (!isPartyAccountAuthorized()) {
        throw new Error("สิทธิ์ไม่เพียงพอ: อนุญาตเฉพาะบัญชีของพรรค / ทีมงานเท่านั้นที่สามารถอัปโหลดหรืออัปเดตรูปภาพอีเวนต์ได้ครับ");
    }
}

// ปุ่มดาวน์โหลดแอปขึ้นหน้าจอหลัก (โทรศัพท์ / iPad)
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

// ตรวจอีเมลนักเรียน: sXXXXX@ben.ac.th หรือ XXXXX@ben.ac.th (X คือเลข 5 ตัว)
function isStudentFormatEmail(email) {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return /^(s?\d{5})@ben\.ac\.th$/.test(clean);
}

// ตรวจอีเมลรูปแบบอื่นที่ลงท้าย @ben.ac.th (เช่น อีเมลคุณครู)
function isOtherBenEmail(email) {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return /^[^@\s]+@ben\.ac\.th$/.test(clean) && !isStudentFormatEmail(clean);
}

function isValidSchoolEmail(email) {
    return isStudentFormatEmail(email) || isOtherBenEmail(email);
}

// บังคับชื่อภาษาไทยล้วน (สระ พยัญชนะ วรรณยุกต์ และช่องว่างได้ ห้ามมีตัวอักษรภาษาอังกฤษ)
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
            if (userDoc.exists() && userDoc.data().nickname) {
                nickname = userDoc.data().nickname;
            } else {
                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid,
                    schoolEmail: email,
                    nickname: nickname,
                    accountType: isStudentFormatEmail(email) ? "student" : "other_ben",
                    createdAt: serverTimestamp()
                });
            }

            localStorage.setItem(DEVICE_REGISTERED_KEY, email);
            currentUserProfile = { uid: user.uid, email: email, nickname: nickname };
            studentAuthModal.style.display = 'none';
            loginForm.reset();
            selectRole('student');
        } catch (error) {
            alert("❌ อีเมลโรงเรียนหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้งครับ");
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerText = "เข้าสู่ระบบ BENEFIT";
        }
    });
}

window.openUserProfile = async function(uid, fallbackName, fallbackEmail) {
    if (!userProfileModal) return;
    const avatarEl = document.getElementById('profileAvatarCircle');
    const nameEl = document.getElementById('profileModalUsername');
    const emailEl = document.getElementById('profileModalEmail');

    let displayName = fallbackName || 'ผู้ใช้งาน';
    let displayEmail = fallbackEmail || 'ไม่ระบุอีเมล';

    if (uid === 'admin') {
        displayName = 'ทีมงานพรรค BENBELONG';
        displayEmail = 'admin@ben.ac.th';
    } else if (uid) {
        try {
            const snap = await getDoc(doc(db, "users", uid));
            if (snap.exists()) {
                const data = snap.data();
                displayName = data.nickname || displayName;
                displayEmail = data.schoolEmail || displayEmail;
            }
        } catch (e) {}
    }

    if (nameEl) nameEl.innerText = displayName;
    if (emailEl) emailEl.innerText = displayEmail;
    if (avatarEl) avatarEl.innerHTML = displayName.charAt(0).toUpperCase() || '👤';

    userProfileModal.style.display = 'flex';
};

window.openOwnProfile = function() {
    if (currentUserProfile) {
        openUserProfile(currentUserProfile.uid, currentUserProfile.nickname, currentUserProfile.email);
    }
};

window.openEditNicknameModal = function() {
    if (!currentUserProfile || !editNicknameModal) return;
    const cd = getNicknameCooldownInfo(currentUserProfile.uid);
    if (!cd.canChange) {
        alert(`⏳ แจ้งเตือน: คุณเปลี่ยนชื่อไปแล้วเมื่อไม่นานมานี้ ระบบจำกัดให้เปลี่ยนชื่อได้เดือนละ 1 ครั้ง (เหลือเวลาคูลดาวน์อีกประมาณ ${cd.remainingDays} วันครับ)`);
        return;
    }
    document.getElementById('newNicknameInput').value = currentUserProfile.nickname;
    editNicknameModal.style.display = 'flex';
};

if (editNicknameForm) {
    editNicknameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newNick = document.getElementById('newNicknameInput').value.trim();
        const saveBtn = document.getElementById('saveNicknameBtn');

        if (!newNick || !currentUserProfile) return;

        const cd = getNicknameCooldownInfo(currentUserProfile.uid);
        if (!cd.canChange) {
            alert(`⏳ แจ้งเตือน: ยังอยู่ในช่วงคูลดาวน์ 1 เดือนของการเปลี่ยนชื่อ (เหลืออีกประมาณ ${cd.remainingDays} วันครับ)`);
            return;
        }

        if (newNick === currentUserProfile.nickname) {
            alert("⚠️ ชื่อใหม่เหมือนกับชื่อเดิมครับ กรุณากรอกชื่อที่ต้องการเปลี่ยนใหม่");
            return;
        }

        if (!isStudentFormatEmail(currentUserProfile.email) && !isPureThaiName(newNick)) {
            alert("❌ สำหรับอีเมลรูปแบบนี้ ต้องใช้ชื่อภาษาไทยเท่านั้น ห้ามมีภาษาอังกฤษ และโปรดใส่ชื่อตัวเองครับ");
            return;
        }

        if (containsBadWord(newNick)) {
            alert("⚠️ ชื่อมีคำที่ไม่สุภาพ กรุณาตั้งชื่อใหม่ครับ");
            return;
        }

        const confirmChange = confirm(
            `⚠️ แจ้งเตือนการเปลี่ยนชื่อ\n\nคุณต้องการเปลี่ยนชื่อจาก "${currentUserProfile.nickname}" เป็น "${newNick}" ใช่หรือไม่?\n\nหลังจากเปลี่ยนชื่อแล้ว คุณจะเปลี่ยนชื่อได้อีกครั้งในอีก 1 เดือน (30 วัน) ข้างหน้าครับ`
        );
        if (!confirmChange) return;

        try {
            saveBtn.disabled = true;
            saveBtn.innerText = "กำลังบันทึก...";

            const nowMs = Date.now();
            await updateDoc(doc(db, "users", currentUserProfile.uid), {
                nickname: newNick,
                lastNicknameChangeAt: nowMs
            });

            localStorage.setItem(getNicknameCooldownKey(currentUserProfile.uid), String(nowMs));
            currentUserProfile.nickname = newNick;
            updateUserUI();
            editNicknameModal.style.display = 'none';
            alert("✅ แจ้งเตือน: เปลี่ยนชื่อเรียบร้อยแล้วครับ ระบบจะเริ่มนับคูลดาวน์ 1 เดือน (30 วัน) สำหรับการเปลี่ยนชื่อครั้งถัดไป");
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการเปลี่ยนชื่อ");
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerText = "บันทึกชื่อใหม่";
        }
    });
}

function updateUserUI() {
    if (isPartyAccountAuthorized()) {
        userRoleBadge.innerText = "⚙️ ทีมงานพรรค BENBELONG";
        userAccountSubInfo.innerText = "สิทธิ์ผู้ดูแลระบบ";
        editNicknameBtn.style.display = 'none';
        userRoleIndicator.innerText = "⚙️ ทีมงานพรรค";
        if (document.getElementById('composeDisplayNickname')) {
            document.getElementById('composeDisplayNickname').innerText = "ทีมงานพรรค BENBELONG";
            document.getElementById('changeNickShortcut').style.display = 'none';
        }
        if (document.getElementById('uploadDisplayNickname')) {
            document.getElementById('uploadDisplayNickname').innerText = "ทีมงานพรรค BENBELONG";
        }
    } else if (currentUserProfile) {
        userRoleBadge.innerText = `🎓 ${currentUserProfile.nickname}`;
        userAccountSubInfo.innerText = `บัญชี: ${currentUserProfile.email}`;
        editNicknameBtn.style.display = 'inline-block';
        userRoleIndicator.innerText = `🎓 ${currentUserProfile.nickname}`;
        if (document.getElementById('composeDisplayNickname')) {
            document.getElementById('composeDisplayNickname').innerText = currentUserProfile.nickname;
            document.getElementById('changeNickShortcut').style.display = 'inline-block';
        }
        if (document.getElementById('uploadDisplayNickname')) {
            document.getElementById('uploadDisplayNickname').innerText = currentUserProfile.nickname;
        }
    }
}

window.selectRole = function(role) {
    currentUserRole = role;
    roleSelectionView.style.display = 'none';
    mainDashboardView.style.display = 'flex';

    document.querySelectorAll('.add-event-quick-btn').forEach(btn => {
        btn.style.display = isPartyAccountAuthorized() ? 'inline-block' : 'none';
    });

    if (isPartyAccountAuthorized()) {
        if (sidebarFeedbackBtn) sidebarFeedbackBtn.innerText = "📖 อ่าน Feedback ทั้งหมด";
    } else {
        if (sidebarFeedbackBtn) sidebarFeedbackBtn.innerText = "💡 ส่ง Feedback / แจ้งบัค";
    }
    updateUserUI();
    updateCalendarDisplay('school');
    fetchEvents('school');
};

window.toggleSidebar = function() {
    sidebar.classList.toggle('sidebar-closed');
};

window.switchMainTab = function(tabName, clickedEl) {
    calendarViewContainer.style.display = 'none';
    outsideCalendarViewContainer.style.display = 'none';
    communityViewContainer.style.display = 'none';
    studyHubViewContainer.style.display = 'none';

    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    if (clickedEl) {
        clickedEl.classList.add('active');
    }

    if (tabName === 'calendar') {
        calendarViewContainer.style.display = 'block';
        updateCalendarDisplay('school');
        fetchEvents('school');
    } else if (tabName === 'outsideCalendar') {
        outsideCalendarViewContainer.style.display = 'block';
        updateCalendarDisplay('outside');
        fetchEvents('outside');
    } else if (tabName === 'community') {
        communityViewContainer.style.display = 'block';
        checkDailyPostLimit();
        fetchPosts();
    } else if (tabName === 'studyhub') {
        studyHubViewContainer.style.display = 'block';
        fetchNotes();
    }

    if (window.innerWidth <= 768) {
        sidebar.classList.add('sidebar-closed');
    }
};

function normalizeDateStr(val) {
    if (!val || typeof val !== 'string') return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val.trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function getEffectiveEndDate(startDateStr, endDateStr) {
    const start = normalizeDateStr(startDateStr);
    const end = normalizeDateStr(endDateStr);
    if (!start) return '';
    if (!end || end < start) return start;
    return end;
}

function formatEventDateRange(startDateStr, endDateStr) {
    const start = normalizeDateStr(startDateStr);
    const end = getEffectiveEndDate(start, endDateStr);
    if (!start) return '-';
    if (!end || end === start) return start;
    return `${start} ถึง ${end}`;
}

function eventMatchesMonthYear(ev, mVal, yVal) {
    const start = normalizeDateStr(ev.eventDate);
    const end = getEffectiveEndDate(start, ev.eventEndDate);
    if (!start || !end) return false;

    const sYear = parseInt(start.slice(0, 4), 10);
    const sMonth = parseInt(start.slice(5, 7), 10) - 1;
    const eYear = parseInt(end.slice(0, 4), 10);
    const eMonth = parseInt(end.slice(5, 7), 10) - 1;

    const targetMonth = mVal === 'all' ? null : parseInt(mVal, 10);
    const targetYear = yVal === 'all' ? null : parseInt(yVal, 10);

    if (targetYear !== null && targetMonth !== null) {
        const startCode = sYear * 12 + sMonth;
        const endCode = eYear * 12 + eMonth;
        const targetCode = targetYear * 12 + targetMonth;
        return targetCode >= startCode && targetCode <= endCode;
    }

    if (targetYear !== null) {
        return targetYear >= sYear && targetYear <= eYear;
    }

    if (targetMonth !== null) {
        if (sYear === eYear) {
            return targetMonth >= sMonth && targetMonth <= eMonth;
        }
        return true;
    }

    return true;
}

window.changeMonth = function(targetKey, direction) {
    const board = calendarBoards[targetKey] || calendarBoards.school;
    board.currentDate.setMonth(board.currentDate.getMonth() + direction);
    board.monthEl.value = String(board.currentDate.getMonth());
    board.yearEl.value = String(board.currentDate.getFullYear());
    updateCalendarDisplay(targetKey);
    filterAndRenderEvents(targetKey);
};

window.onMonthSelectChange = function(targetKey, monthVal) {
    const board = calendarBoards[targetKey] || calendarBoards.school;
    if (monthVal !== 'all') {
        board.currentDate.setMonth(parseInt(monthVal, 10));
    }
    updateCalendarDisplay(targetKey);
    filterAndRenderEvents(targetKey);
};

window.onYearSelectChange = function(targetKey, yearVal) {
    const board = calendarBoards[targetKey] || calendarBoards.school;
    if (yearVal !== 'all') {
        board.currentDate.setFullYear(parseInt(yearVal, 10));
    }
    updateCalendarDisplay(targetKey);
    filterAndRenderEvents(targetKey);
};

function updateCalendarDisplay(targetKey = 'school') {
    const board = calendarBoards[targetKey] || calendarBoards.school;
    const year = board.currentDate.getFullYear();
    const month = board.currentDate.getMonth();
    const mVal = board.monthEl.value;
    const yVal = board.yearEl.value;

    if (mVal === 'all' && yVal === 'all') {
        board.labelEl.innerText = "อีเวนต์ทั้งหมด";
    } else if (mVal === 'all') {
        board.labelEl.innerText = `ทุกเดือน ${yVal}`;
    } else if (yVal === 'all') {
        board.labelEl.innerText = `${thaiMonths[month]} (ทุกปี)`;
    } else {
        board.labelEl.innerText = `${thaiMonths[month]} ${year}`;
    }
}

if (passwordForm) {
    passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (adminPasswordInput.value === ADMIN_PASSWORD) {
            passwordModal.style.display = 'none';
            adminPasswordInput.value = '';
            currentUserProfile = { uid: 'admin', email: 'admin@ben.ac.th', nickname: 'ทีมงานพรรค BENBELONG' };
            selectRole('admin');
            alert("🎉 เข้าสู่ระบบสมาชิกพรรคสำเร็จ!");
        } else {
            alert("❌ รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
        }
    });
}

window.logoutToLanding = function() {
    const confirmed = confirm(
        "คุณต้องการกลับไปหน้าเลือกบทบาทใช่ไหม?\n\nหากล็อกอินบัญชีคุณครู/นักเรียนไว้แล้ว รอบหน้ากดปุ่ม 'คุณครู / นักเรียนโรงเรียนเบญฯ' จะเข้าบัญชีเดิมได้ทันทีครับ"
    );
    if (!confirmed) return;

    currentUserRole = null;
    if (sidebar) sidebar.classList.add('sidebar-closed');
    if (mainDashboardView) mainDashboardView.style.display = 'none';
    if (roleSelectionView) roleSelectionView.style.display = 'flex';
};

window.closeModal = function(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
};

window.openEventModal = function(targetKey = 'school') {
    if (!isPartyAccountAuthorized()) {
        alert("❌ สิทธิ์ไม่เพียงพอ: เฉพาะบัญชีของพรรค / ทีมงานเท่านั้นที่สามารถเพิ่มอีเวนต์หรืออัปโหลดรูปภาพกิจกรรมได้ครับ");
        return;
    }
    activeEventTarget = calendarBoards[targetKey] ? targetKey : 'school';
    const titleEl = document.getElementById('eventModalTitle');
    if (titleEl) {
        titleEl.innerText = activeEventTarget === 'outside'
            ? "🗓️ เพิ่มอีเวนต์กิจกรรมนอกโรงเรียน"
            : "📅 เพิ่มอีเวนต์ / กิจกรรมสำคัญในปฏิทิน";
    }
    if (eventModal) eventModal.style.display = 'flex';
};

window.openUploadModal = function() {
    updateUserUI();
    isVerifiedPublicDrive = false;
    verifiedDriveUrl = "";
    window.resetDriveVerificationState();
    if (uploadModal) uploadModal.style.display = 'flex';
};

window.openFeedbackModal = function() {
    const studentView = document.getElementById('studentFeedbackView');
    const adminView = document.getElementById('adminFeedbackView');

    if (isPartyAccountAuthorized()) {
        studentView.style.display = 'none';
        adminView.style.display = 'block';
        fetchFeedbacksForAdmin();
    } else {
        studentView.style.display = 'block';
        adminView.style.display = 'none';
        if (currentUserProfile) {
            document.getElementById('feedbackAuthor').value = currentUserProfile.nickname;
        }
    }
    feedbackModal.style.display = 'flex';
};

if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textInput = document.getElementById('feedbackText');
        const submitBtn = document.getElementById('submitFeedbackBtn');

        const author = currentUserProfile ? currentUserProfile.nickname : "นิรนาม";
        const schoolEmail = currentUserProfile ? currentUserProfile.email : "ไม่ระบุ";
        const text = textInput.value.trim();
        if (!text) return;

        if (containsBadWord(text)) {
            alert("⚠️ ขออภัยครับ ตรวจพบคำที่ไม่สุภาพ ระบบไม่อนุญาตให้ส่งครับ");
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerText = "กำลังส่ง Feedback...";

            await addDoc(collection(db, "feedbacks"), {
                author: author,
                schoolEmail: schoolEmail,
                text: text,
                createdAt: serverTimestamp()
            });

            alert("❤️ ขอบคุณสำหรับ Feedback ดีๆ นะครับ ทีมงานได้รับเรียบร้อยแล้ว!");
            feedbackForm.reset();
            feedbackModal.style.display = 'none';
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการส่ง Feedback กรุณาลองใหม่อีกครั้ง");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "ส่ง Feedback ให้ทีมงาน";
        }
    });
}

async function fetchFeedbacksForAdmin() {
    const container = document.getElementById('feedbackListContainer');
    const loading = document.getElementById('feedbackLoading');
    loading.style.display = 'block';
    container.innerHTML = '';

    try {
        const q = query(collection(db, "feedbacks"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        loading.style.display = 'none';

        if (querySnapshot.empty) {
            container.innerHTML = `<p style="text-align: center; color: #64748b; padding: 2rem;">📭 ยังไม่มี Feedback ส่งเข้ามาในระบบ</p>`;
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement('div');
            card.className = 'feedback-item-card';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div>
                        <span style="font-weight: 700; color: var(--royal-blue); font-size: 0.9rem;">👤 ${escapeHTML(data.author)}</span>
                        <span style="font-size: 0.75rem; color: #64748B; margin-left: 6px;">(${escapeHTML(data.schoolEmail || 'ไม่ระบุอีเมล')})</span>
                    </div>
                    <button onclick="window.deleteFeedback('${docSnap.id}')" style="background:none; border:none; color:#EF4444; font-size:0.8rem; cursor:pointer; font-weight:600;">🗑️ ลบ</button>
                </div>
                <p style="font-size: 0.9rem; color: #334155; word-break: break-word; white-space: pre-wrap;">${escapeHTML(data.text)}</p>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        loading.innerText = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
    }
}

window.deleteFeedback = async function(id) {
    if (confirm("⚠️ คุณต้องการลบ Feedback นี้ใช่หรือไม่?")) {
        try {
            await deleteDoc(doc(db, "feedbacks", id));
            fetchFeedbacksForAdmin();
        } catch (error) {}
    }
};

window.onclick = (e) => {
    if (e.target === studentAuthModal) studentAuthModal.style.display = 'none';
    if (e.target === userProfileModal) userProfileModal.style.display = 'none';
    if (e.target === editNicknameModal) editNicknameModal.style.display = 'none';
    if (e.target === passwordModal) passwordModal.style.display = 'none';
    if (e.target === eventModal) eventModal.style.display = 'none';
    if (e.target === uploadModal) uploadModal.style.display = 'none';
    if (e.target === eventDetailModal) eventDetailModal.style.display = 'none';
    if (e.target === feedbackModal) feedbackModal.style.display = 'none';
};

// อัปโหลดและจัดการรูปภาพอีเวนต์บน Supabase Storage (อนุญาตเฉพาะบัญชีของพรรคเท่านั้น)
async function uploadEventImageToSupabaseStorage(file) {
    assertPartyImageUploadPermission();

    if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR_PROJECT_REF") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
        throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_URL หรือ SUPABASE_ANON_KEY ใน app.js ครับ");
    }

    const extMatch = (file.name || '').toLowerCase().match(/\.(jpg|jpeg|png|webp)$/);
    const ext = extMatch ? extMatch[1] : (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');
    const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    const safeBaseName = (file.name || 'event_banner')
        .replace(/\.(jpg|jpeg|png|webp)$/i, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 35) || "event_banner";
    const filePath = `party_admin/${activeEventTarget}/${Date.now()}_${safeBaseName}.${ext}`;

    const uploadEndpoint = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(SUPABASE_EVENT_IMAGE_BUCKET)}/${filePath}`;
    const res = await fetch(uploadEndpoint, {
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
        throw new Error(errText || "อัปโหลดรูปภาพกิจกรรมไม่สำเร็จ");
    }

    return `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(SUPABASE_EVENT_IMAGE_BUCKET)}/${filePath}`;
}

async function deleteEventImageFromSupabaseStorage(imageUrl) {
    assertPartyImageUploadPermission();
    if (!imageUrl || !SUPABASE_URL || SUPABASE_URL.includes("YOUR_PROJECT_REF") || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")) {
        return;
    }
    const prefix = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${SUPABASE_EVENT_IMAGE_BUCKET}/`;
    if (!imageUrl.startsWith(prefix)) return;

    const objectPath = decodeURIComponent(imageUrl.slice(prefix.length));
    const deleteEndpoint = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(SUPABASE_EVENT_IMAGE_BUCKET)}/${objectPath}`;
    await fetch(deleteEndpoint, {
        method: "DELETE",
        headers: {
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY
        }
    });
}

async function fetchEvents(targetKey = 'school') {
    const board = calendarBoards[targetKey] || calendarBoards.school;
    try {
        const q = query(collection(db, board.collectionName), orderBy("eventDate", "asc"));
        const querySnapshot = await getDocs(q);
        board.allEvents = [];
        querySnapshot.forEach((docSnap) => {
            board.allEvents.push({ id: docSnap.id, ...docSnap.data() });
        });
        board.loadingEl.style.display = 'none';
        filterAndRenderEvents(targetKey);
    } catch (error) {
        board.loadingEl.innerText = "ยังไม่มีอีเวนต์ในระบบ";
        renderEvents(targetKey, []);
    }
}

function filterAndRenderEvents(targetKey = 'school') {
    const board = calendarBoards[targetKey] || calendarBoards.school;
    const mVal = board.monthEl.value;
    const yVal = board.yearEl.value;
    const filtered = board.allEvents.filter(ev => eventMatchesMonthYear(ev, mVal, yVal));
    renderEvents(targetKey, filtered);
}

function renderEvents(targetKey = 'school', events = []) {
    const board = calendarBoards[targetKey] || calendarBoards.school;
    board.gridEl.innerHTML = '';
    if (events.length === 0) {
        board.gridEl.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem; background: white; border-radius: 16px; color: #64748b;">
                <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">📅 ไม่มีกิจกรรมในเงื่อนไขเวลานี้</p>
                <p style="font-size: 0.9rem;">สามารถเลือก "ทุกเดือน / ทุกปี" หรือเพิ่มอีเวนต์ใหม่ได้เลย!</p>
            </div>`;
        return;
    }

    events.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'event-card clickable-card';
        card.onclick = () => openEventDetail(targetKey, ev);

        const dateLabel = formatEventDateRange(ev.eventDate, ev.eventEndDate);
        const safeImageUrl = escapeHTML(ev.imageUrl || '');
        const bannerHtml = safeImageUrl
            ? `<div style="margin-bottom: 0.75rem; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0; background: #F8FAFC;">
                   <img src="${safeImageUrl}" alt="${escapeHTML(ev.title)}" style="width: 100%; max-height: 210px; object-fit: cover; display: block;">
               </div>`
            : '';

        card.innerHTML = `
            ${bannerHtml}
            <div class="event-date-badge">
                <span class="ev-day">🗓️ ${escapeHTML(dateLabel)}</span>
                <span class="ev-time">⏰ ${escapeHTML(ev.eventTime)}</span>
            </div>
            <div class="event-details">
                <h3>${escapeHTML(ev.title)}</h3>
                <p class="ev-loc">📍 <strong>สถานที่:</strong> ${escapeHTML(ev.location)}</p>
                <p class="ev-desc">${escapeHTML(ev.desc)}</p>
            </div>
            <div class="event-card-footer">
                <span style="font-size: 0.8rem; color: var(--royal-blue); font-weight: 600;">🔍 คลิกเพื่อดูรายละเอียดเต็มๆ</span>
            </div>
        `;
        board.gridEl.appendChild(card);
    });
}

window.openEventDetail = function(targetKey, ev) {
    const boardKey = calendarBoards[targetKey] ? targetKey : 'school';
    document.getElementById('modalEventTitle').innerText = ev.title;
    document.getElementById('modalEventDate').innerText = formatEventDateRange(ev.eventDate, ev.eventEndDate);
    document.getElementById('modalEventTime').innerText = ev.eventTime;
    document.getElementById('modalEventLocation').innerText = ev.location;
    document.getElementById('modalEventDesc').innerText = ev.desc;

    const modalBody = document.querySelector('#eventDetailModal .event-detail-body');
    if (modalBody) {
        let previewWrap = document.getElementById('modalEventImageWrap');
        if (!previewWrap) {
            previewWrap = document.createElement('div');
            previewWrap.id = 'modalEventImageWrap';
            previewWrap.style.marginBottom = '1rem';
            modalBody.prepend(previewWrap);
        }
        const safeImageUrl = escapeHTML(ev.imageUrl || '');
        previewWrap.innerHTML = safeImageUrl
            ? `<img src="${safeImageUrl}" alt="${escapeHTML(ev.title)}" style="width: 100%; max-height: 320px; object-fit: contain; border-radius: 12px; border: 1px solid #E2E8F0; background: #F8FAFC; display: block;">`
            : '';
    }

    const deleteContainer = document.getElementById('modalDeleteActionContainer');
    if (isPartyAccountAuthorized()) {
        deleteContainer.innerHTML = `<button class="btn-delete-event" onclick="window.deleteEvent('${boardKey}', '${ev.id}')">🗑️ ลบอีเวนต์นี้</button>`;
    } else {
        deleteContainer.innerHTML = '';
    }

    eventDetailModal.style.display = 'flex';
};

if (eventForm) {
    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isPartyAccountAuthorized()) {
            alert("❌ สิทธิ์ไม่เพียงพอ: เฉพาะบัญชีของพรรค / ทีมงานเท่านั้นที่สามารถสร้างอีเวนต์หรืออัปโหลดรูปภาพกิจกรรมได้ครับ");
            return;
        }

        const board = calendarBoards[activeEventTarget] || calendarBoards.school;
        const startDate = normalizeDateStr(document.getElementById('eventDate').value);
        const rawEndDate = normalizeDateStr(document.getElementById('eventEndDate').value);
        const imageInput = document.getElementById('eventImageInput');
        const selectedImage = imageInput && imageInput.files ? imageInput.files[0] : null;

        if (!startDate) {
            alert("⚠️ กรุณาเลือกวันที่เริ่มจัดงานครับ");
            return;
        }

        if (rawEndDate && rawEndDate < startDate) {
            alert("⚠️ วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มจัดงานครับ (หากจัดวันเดียวให้เว้นว่างไว้ได้เลย)");
            return;
        }

        if (selectedImage) {
            const validTypes = ["image/jpeg", "image/png", "image/webp"];
            const hasValidExt = /\.(jpg|jpeg|png|webp)$/i.test(selectedImage.name || '');
            if (!validTypes.includes(selectedImage.type) && !hasValidExt) {
                alert("⚠️ รองรับเฉพาะไฟล์รูปภาพ .jpg, .png หรือ .webp เท่านั้นครับ");
                return;
            }
            if (selectedImage.size > MAX_EVENT_IMAGE_BYTES) {
                alert("⚠️ ขนาดรูปภาพเกิน 5 MB กรุณาเลือกรูปที่ขนาดเล็กลงครับ");
                return;
            }
        }

        const submitBtn = document.getElementById('eventSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.innerText = selectedImage ? "กำลังอัปโหลดรูปภาพ..." : "กำลังบันทึกอีเวนต์...";

        try {
            let imageUrl = "";
            if (selectedImage) {
                imageUrl = await uploadEventImageToSupabaseStorage(selectedImage);
                submitBtn.innerText = "กำลังบันทึกอีเวนต์...";
            }

            await addDoc(collection(db, board.collectionName), {
                title: document.getElementById('eventTitle').value.trim(),
                eventDate: startDate,
                eventEndDate: rawEndDate || startDate,
                eventTime: document.getElementById('eventTime').value.trim(),
                location: document.getElementById('eventLocation').value.trim(),
                desc: document.getElementById('eventDesc').value.trim(),
                imageUrl: imageUrl,
                createdByRole: "admin",
                createdAt: serverTimestamp()
            });

            alert("🎉 เพิ่มอีเวนต์ลงปฏิทินสำเร็จ!");
            eventForm.reset();
            eventModal.style.display = 'none';
            fetchEvents(activeEventTarget);
        } catch (error) {
            alert("❌ เกิดข้อผิดพลาดในการบันทึกอีเวนต์: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "บันทึกอีเวนต์ลงปฏิทิน";
        }
    });
}

window.deleteEvent = async function(targetKey, id) {
    if (!isPartyAccountAuthorized()) {
        alert("❌ สิทธิ์ไม่เพียงพอ: เฉพาะบัญชีของพรรค / ทีมงานเท่านั้นที่สามารถลบอีเวนต์หรือรูปภาพกิจกรรมได้ครับ");
        return;
    }
    const board = calendarBoards[targetKey] || calendarBoards.school;
    if (confirm("⚠️ คุณต้องการลบอีเวนต์นี้ออกจากปฏิทินใช่หรือไม่?")) {
        try {
            const targetEvent = board.allEvents.find(ev => ev.id === id);
            if (targetEvent && targetEvent.imageUrl) {
                try {
                    await deleteEventImageFromSupabaseStorage(targetEvent.imageUrl);
                } catch (imgErr) {}
            }
            await deleteDoc(doc(db, board.collectionName, id));
            alert("🗑️ ลบอีเวนต์สำเร็จ!");
            eventDetailModal.style.display = 'none';
            fetchEvents(targetKey);
        } catch (error) {}
    }
};

// ระบบจัดอันดับฟีด BenX (For You / เทรนด์ และความสนใจของผู้ใช้)
function getUserInterestStorageKey() {
    const uid = currentUserProfile && currentUserProfile.uid ? currentUserProfile.uid : 'guest';
    return `benbelong_interest_profile_${uid}`;
}

function loadUserInterestProfile() {
    try {
        const raw = localStorage.getItem(getUserInterestStorageKey());
        const parsed = raw ? JSON.parse(raw) : {};
        return {
            tags: parsed.tags || {},
            keywords: parsed.keywords || {}
        };
    } catch (e) {
        return { tags: {}, keywords: {} };
    }
}

function saveUserInterestProfile(profile) {
    try {
        localStorage.setItem(getUserInterestStorageKey(), JSON.stringify(profile));
    } catch (e) {}
}

function extractPostTagsAndKeywords(content) {
    const text = (content || '').toLowerCase();
    const tags = (text.match(/#([a-zA-Zก-ฮ0-9_]+)/g) || []).map(t => t.toLowerCase());
    const cleanWords = text
        .replace(/#([a-zA-Zก-ฮ0-9_]+)/g, ' ')
        .replace(/[^a-zA-Zก-๙0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2);
    const keywords = [...new Set(cleanWords)].slice(0, 12);
    return { tags, keywords };
}

function recordUserInterestFromPost(post, weight = 1) {
    if (!post || !post.content) return;
    const profile = loadUserInterestProfile();
    const { tags, keywords } = extractPostTagsAndKeywords(post.content);

    tags.forEach(tag => {
        profile.tags[tag] = (profile.tags[tag] || 0) + (3 * weight);
    });

    keywords.forEach(word => {
        profile.keywords[word] = (profile.keywords[word] || 0) + (1 * weight);
    });

    saveUserInterestProfile(profile);
}

function getPostTimestampMs(createdAt) {
    if (!createdAt) return Date.now();
    if (typeof createdAt.toMillis === 'function') return createdAt.toMillis();
    if (typeof createdAt === 'number') return createdAt;
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : Date.now();
}

function computeTagPopularityMap(posts) {
    const tagCounts = {};
    posts.forEach(post => {
        const matches = (post.content || '').match(/#([A-Za-zก-ฮ0-9_]+)/g);
        if (matches) {
            const uniqueInPost = [...new Set(matches.map(t => t.toLowerCase()))];
            uniqueInPost.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });
    return tagCounts;
}

function rankPostsForFeed(posts) {
    const tagCounts = computeTagPopularityMap(posts);
    const interestProfile = loadUserInterestProfile();
    const nowMs = Date.now();

    return [...posts]
        .map((post, idx) => {
            const likesCount = Number(post.likes) || 0;
            const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;

            const engagementScore = (likesCount * 4) + (commentsCount * 7);
            const { tags, keywords } = extractPostTagsAndKeywords(post.content || '');
            let trendTagScore = 0;
            tags.forEach(tag => {
                const count = tagCounts[tag] || 0;
                if (count >= 2) {
                    trendTagScore += count * 5;
                }
            });

            let personalInterestScore = 0;
            tags.forEach(tag => {
                personalInterestScore += (interestProfile.tags[tag] || 0) * 2.5;
            });
            keywords.forEach(word => {
                personalInterestScore += (interestProfile.keywords[word] || 0) * 1.2;
            });

            const tsMs = getPostTimestampMs(post.createdAt);
            const ageHours = Math.max(0, (nowMs - tsMs) / (1000 * 60 * 60));
            const freshnessScore = Math.max(0, 24 - (ageHours * 0.45));

            const totalScore = engagementScore + trendTagScore + personalInterestScore + freshnessScore;
            return { post, totalScore, idx };
        })
        .sort((a, b) => {
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            return a.idx - b.idx;
        })
        .map(item => item.post);
}

async function fetchPosts() {
    try {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allPosts = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allPosts.push({
                id: docSnap.id,
                ...data,
                likes: data.likes || 0,
                likedBy: data.likedBy || [],
                comments: data.comments || []
            });
        });
        postsLoading.style.display = 'none';
        const rankedPosts = rankPostsForFeed(allPosts);
        renderPosts(rankedPosts);
        extractAndRenderTrends(allPosts);
    } catch (error) {
        postsLoading.innerText = "ยังไม่มีโพสต์ในระบบ";
        renderPosts([]);
    }
}

function renderPosts(posts) {
    postsFeed.innerHTML = '';
    if (posts.length === 0) {
        postsFeed.innerHTML = `
            <div style="text-align:center; padding: 3rem; background: white; border-radius: 16px; color: #64748b; margin: 1rem;">
                <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">💬 ไม่มีโพสต์ในขณะนี้</p>
                <p style="font-size: 0.9rem;">เริ่มต้นโพสต์พูดคุยกับเพื่อนๆ ในโรงเรียนได้เลย!</p>
            </div>`;
        return;
    }

    const currentUid = currentUserProfile ? currentUserProfile.uid : '';
    const currentNickname = currentUserProfile ? currentUserProfile.nickname : 'ผู้ใช้งาน';
    const tagCounts = computeTagPopularityMap(allPosts);

    posts.forEach(post => {
        const card = document.createElement('div');
        card.className = 'x-post-item';

        let deleteBtnHtml = '';
        if (isPartyAccountAuthorized() || (currentUid && post.authorUid === currentUid)) {
            deleteBtnHtml = `<button class="x-delete-btn" onclick="window.deletePost('${post.id}')">🗑️ ลบ</button>`;
        }

        let formattedContent = escapeHTML(post.content);
        formattedContent = formattedContent.replace(/#([A-Za-zก-ฮ0-9_]+)/g, '<span class="x-hashtag" onclick="window.filterByHashtag(\'#$1\')" style="cursor:pointer;">#$1</span>');

        const hasLiked = post.likedBy && post.likedBy.includes(currentUid);
        const heartIcon = hasLiked ? '❤️' : '🤍';

        const likesCount = Number(post.likes) || 0;
        const commentsCount = Array.isArray(post.comments) ? post.comments.length : 0;
        const postTags = ((post.content || '').match(/#([A-Za-zก-ฮ0-9_]+)/g) || []).map(t => t.toLowerCase());
        const isTrendingPost = (likesCount + commentsCount >= 3) || postTags.some(t => (tagCounts[t] || 0) >= 2);
        const trendBadgeHtml = isTrendingPost
            ? `<span style="margin-left: 8px; background: #FFF1F2; color: #E11D48; border: 1px solid #FECDD3; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 999px;">🔥 กำลังมาแรง</span>`
            : '';

        const safeAuthor = escapeHTML(post.author);
        const safeEmail = escapeHTML(post.schoolEmail || '');
        const safeAuthorUid = escapeHTML(post.authorUid || '');

        let commentsHtml = '';
        if (post.comments && post.comments.length > 0) {
            post.comments.forEach((comm, cIndex) => {
                let commentDeleteBtn = '';
                if (isPartyAccountAuthorized() || (currentUid && comm.authorUid === currentUid)) {
                    commentDeleteBtn = `<button class="comm-delete-btn" onclick="window.deleteComment('${post.id}', ${cIndex})">✕</button>`;
                }
                const cAuthor = escapeHTML(comm.author);
                const cEmail = escapeHTML(comm.schoolEmail || '');
                const cUid = escapeHTML(comm.authorUid || '');

                commentsHtml += `
                    <div class="x-comment-item">
                        <div class="comm-header">
                            <span class="comm-author" style="cursor: pointer; text-decoration: underline;" onclick="window.openUserProfile('${cUid}', '${cAuthor}', '${cEmail}')">${cAuthor}</span>
                            ${commentDeleteBtn}
                        </div>
                        <div class="comm-text">${escapeHTML(comm.text)}</div>
                    </div>
                `;
            });
        }

        card.innerHTML = `
            <div class="x-post-avatar" style="cursor: pointer;" onclick="window.openUserProfile('${safeAuthorUid}', '${safeAuthor}', '${safeEmail}')">👤</div>
            <div class="x-post-content-wrap">
                <div class="x-post-header">
                    <div>
                        <span class="x-post-author" style="cursor: pointer;" onclick="window.openUserProfile('${safeAuthorUid}', '${safeAuthor}', '${safeEmail}')">${safeAuthor}</span>
                        ${trendBadgeHtml}
                    </div>
                    ${deleteBtnHtml}
                </div>
                <div class="x-post-text">${formattedContent}</div>
                
                <div class="x-post-actions">
                    <button class="x-action-btn" onclick="window.toggleLike('${post.id}')">
                        ${heartIcon} <span>${likesCount}</span>
                    </button>
                    <button class="x-action-btn" onclick="window.toggleCommentBox('${post.id}')">
                        💬 <span>${commentsCount}</span>
                    </button>
                </div>

                <div id="commentBox_${post.id}" class="x-comment-section" style="display: none;">
                    <div class="x-comments-list">${commentsHtml}</div>
                    <form class="x-comment-form" onsubmit="window.submitComment(event, '${post.id}')">
                        <span class="x-comment-user-badge">${escapeHTML(currentNickname)}</span>
                        <input type="text" class="x-comment-input" placeholder="เขียนคอมเม้นต์..." required maxlength="150">
                        <button type="submit" class="x-comment-btn">ส่ง</button>
                    </form>
                </div>
            </div>
        `;
        postsFeed.appendChild(card);
    });
}

window.toggleLike = async function(postId) {
    if (!currentUserProfile) return;
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        if (!postSnap.exists()) return;

        const data = postSnap.data();
        let likedBy = data.likedBy || [];
        let likes = data.likes || 0;

        const uid = currentUserProfile.uid;
        const index = likedBy.indexOf(uid);

        if (index > -1) {
            likedBy.splice(index, 1);
            likes = Math.max(0, likes - 1);
        } else {
            likedBy.push(uid);
            likes += 1;
            recordUserInterestFromPost(data, 1.5);
        }

        await updateDoc(postRef, { likes, likedBy });
        fetchPosts();
    } catch (error) {}
};

window.toggleCommentBox = function(postId) {
    const box = document.getElementById(`commentBox_${postId}`);
    if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
};

window.submitComment = async function(e, postId) {
    e.preventDefault();
    if (!currentUserProfile) return;

    const form = e.target;
    const textInput = form.querySelector('.x-comment-input');

    const author = currentUserProfile.nickname;
    const text = textInput.value.trim();
    if (!text) return;

    if (containsBadWord(text)) {
        alert("⚠️ ขออภัยครับ ตรวจพบคำที่ไม่สุภาพในคอมเม้นต์");
        return;
    }

    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        if (!postSnap.exists()) return;

        const data = postSnap.data();
        let comments = data.comments || [];
        comments.push({
            author,
            authorUid: currentUserProfile.uid,
            schoolEmail: currentUserProfile.email,
            text,
            createdAt: new Date().toISOString()
        });

        recordUserInterestFromPost(data, 2);
        await updateDoc(postRef, { comments });
        textInput.value = '';
        fetchPosts();
    } catch (error) {}
};

window.deleteComment = async function(postId, commentIndex) {
    if (confirm("⚠️ คุณต้องการลบคอมเม้นต์นี้ใช่หรือไม่?")) {
        try {
            const postRef = doc(db, "posts", postId);
            const postSnap = await getDoc(postRef);
            if (!postSnap.exists()) return;

            const data = postSnap.data();
            let comments = data.comments || [];
            comments.splice(commentIndex, 1);

            await updateDoc(postRef, { comments });
            fetchPosts();
        } catch (error) {}
    }
};

window.filterPostsBySearch = function() {
    const keyword = searchInputFeed.value.toLowerCase().trim();
    const ranked = rankPostsForFeed(allPosts);
    if (!keyword) {
        renderPosts(ranked);
        return;
    }
    const filtered = ranked.filter(post => {
        return post.content.toLowerCase().includes(keyword) || post.author.toLowerCase().includes(keyword);
    });
    renderPosts(filtered);
};

window.filterByHashtag = function(tag) {
    searchInputFeed.value = tag;
    filterPostsBySearch();
};

function extractAndRenderTrends(posts) {
    const tagCounts = computeTagPopularityMap(posts);

    const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
    trendingTagsList.innerHTML = '';
    if (sortedTags.length === 0) {
        trendingTagsList.innerHTML = `<p style="font-size: 0.85rem; color: #64748B;">ยังไม่มีเทรนด์แฮชแท็ก</p>`;
        return;
    }

    sortedTags.slice(0, 5).forEach(tag => {
        const item = document.createElement('div');
        item.className = 'x-trend-item';
        item.innerHTML = `
            <span class="x-trend-tag" onclick="window.filterByHashtag('${tag}')">${tag}</span>
            <span class="x-trend-count">${tagCounts[tag]} Posts</span>
        `;
        trendingTagsList.appendChild(item);
    });
}

if (postForm) {
    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUserProfile) return;

        const nowTime = Date.now();
        if (nowTime - lastPostTime < 3000) {
            alert("⏳ กรุณารอสักครู่ (ระบบป้องกันการสแปม)");
            return;
        }

        const content = postContentInput.value.trim();
        if (!content) return;

        const currentCount = checkDailyPostLimit();
        if (currentCount >= 5) {
            alert("⚠️ คุณโพสต์ครบโควตา 5 ครั้งสำหรับวันนี้แล้ว กรุณารอรีเซ็ตในวันพรุ่งนี้ครับ!");
            return;
        }

        if (content.length > 300) {
            alert("⚠️ ข้อความยาวเกินกำหนด (จำกัดไม่เกิน 300 ตัวอักษร)");
            return;
        }

        if (containsBadWord(content)) {
            alert("⚠️ ขออภัยครับ ตรวจพบคำที่ไม่สุภาพในโพสต์ ระบบไม่อนุญาตให้เผยแพร่ครับ");
            return;
        }

        lastPostTime = nowTime;

        try {
            submitPostBtn.disabled = true;
            submitPostBtn.innerText = "Posting...";

            await addDoc(collection(db, "posts"), {
                author: currentUserProfile.nickname,
                authorUid: currentUserProfile.uid,
                schoolEmail: currentUserProfile.email,
                content: content,
                likes: 0,
                likedBy: [],
                comments: [],
                createdAt: serverTimestamp()
            });

            incrementDailyPostCount();
            postContentInput.value = '';
            if (charCount) charCount.innerText = '0';
            fetchPosts();
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการโพสต์ข้อความ");
        } finally {
            submitPostBtn.disabled = false;
            submitPostBtn.innerText = "Post";
        }
    });
}

window.deletePost = async function(id) {
    if (confirm("⚠️ คุณต้องการลบโพสต์นี้ใช่หรือไม่?")) {
        try {
            await deleteDoc(doc(db, "posts", id));
            fetchPosts();
        } catch (error) {}
    }
};

// ตรวจสอบสิทธิ์ไฟล์/โฟลเดอร์ Google Drive ผ่าน Apps Script
window.resetDriveVerificationState = function() {
    const inputEl = document.getElementById('noteFileUrl');
    const statusEl = document.getElementById('driveVerifyStatus');
    const currentVal = inputEl ? inputEl.value.trim() : "";

    if (currentVal !== verifiedDriveUrl) {
        isVerifiedPublicDrive = false;
        verifiedDriveUrl = "";
    }

    if (statusEl) {
        statusEl.style.color = "#64748B";
        statusEl.innerText = 'ระบบจะตรวจสอบสิทธิ์ "ทุกคนที่มีลิงก์" อัตโนมัติก่อนบันทึกชีทครับ';
    }
};

async function verifyGoogleDrivePublicAccess(driveUrl) {
    const endpoint = `${DRIVE_CHECK_SCRIPT_URL}?url=${encodeURIComponent(driveUrl)}`;
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
        throw new Error("เชื่อมต่อระบบตรวจสอบสิทธิ์ Google Drive ไม่สำเร็จครับ");
    }
    return await response.json();
}

async function fetchNotes() {
    try {
        const q = query(collection(db, "notes"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allNotes = [];
        querySnapshot.forEach((docSnap) => {
            allNotes.push({ id: docSnap.id, ...docSnap.data() });
        });
        notesLoading.style.display = 'none';
        renderNotes(allNotes);
    } catch (error) {
        notesLoading.innerText = "ยังไม่มีข้อมูลสรุป PDF ในระบบ";
    }
}

function renderNotes(notes) {
    notesGrid.innerHTML = '';
    noteCount.innerText = notes.length;

    if (notes.length === 0) {
        notesGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem; background: white; border-radius: 16px; color: #64748b;">
                <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">ยังไม่มีรายการสรุป PDF ในระบบ</p>
            </div>`;
        return;
    }

    const currentUid = currentUserProfile ? currentUserProfile.uid : '';

    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        const canDelete = isPartyAccountAuthorized() || (currentUid && note.authorUid === currentUid);
        const deleteBtnStyle = canDelete ? 'display: block;' : 'display: none;';

        const safeAuthor = escapeHTML(note.author);
        const safeEmail = escapeHTML(note.schoolEmail || '');
        const safeAuthorUid = escapeHTML(note.authorUid || '');
        const safeUrl = escapeHTML(note.fileUrl || '#');

        card.innerHTML = `
            <div>
                <div class="card-tags">
                    <span class="tag tag-grade">${note.grade}</span>
                    <span class="tag tag-subject">${note.subject}</span>
                </div>
                <h3 class="note-title">${escapeHTML(note.title)}</h3>
            </div>
            <div>
                <div class="note-meta">
                    <span>✍️ จัดทำโดย: <strong style="color: var(--royal-blue); cursor: pointer; text-decoration: underline;" onclick="window.openUserProfile('${safeAuthorUid}', '${safeAuthor}', '${safeEmail}')">${safeAuthor}</strong></span>
                </div>
                <div class="card-actions">
                    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="btn-download">📥 ดาวน์โหลดไฟล์ PDF สรุป</a>
                    <button class="btn-delete" style="${deleteBtnStyle}" onclick="window.deleteNote('${note.id}')">🗑️ ลบสรุปนี้</button>
                </div>
            </div>
        `;
        notesGrid.appendChild(card);
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

window.deleteNote = async function(id) {
    if (confirm("⚠️ คุณต้องการลบชีทสรุป PDF นี้ใช่หรือไม่?")) {
        try {
            await deleteDoc(doc(db, "notes", id));
            alert("🗑️ ลบข้อมูลสำเร็จ!");
            fetchNotes();
        } catch (error) {}
    }
};

function filterNotes() {
    const keyword = searchInput.value.toLowerCase().trim();
    const grade = gradeFilter.value;
    const subject = subjectFilter.value;

    const filtered = allNotes.filter(note => {
        const matchKeyword = note.title.toLowerCase().includes(keyword) || note.author.toLowerCase().includes(keyword);
        const matchGrade = grade === 'all' || note.grade === grade;
        const matchSubject = subject === 'all' || note.subject === subject;
        return matchKeyword && matchGrade && matchSubject;
    });

    renderNotes(filtered);
}

if (searchInput) {
    searchInput.addEventListener('input', filterNotes);
    gradeFilter.addEventListener('change', filterNotes);
    subjectFilter.addEventListener('change', filterNotes);
}

if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUserProfile) return;

        const fileUrlInput = document.getElementById('noteFileUrl');
        const statusEl = document.getElementById('driveVerifyStatus');
        const fileUrl = fileUrlInput ? fileUrlInput.value.trim() : "";

        if (!fileUrl) {
            alert("⚠️ กรุณาวางลิงก์ไฟล์ PDF จาก Google Drive ก่อนครับ");
            return;
        }

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.innerText = "กำลังตรวจสอบสิทธิ์ไฟล์...";

        try {
            if (!isVerifiedPublicDrive || verifiedDriveUrl !== fileUrl) {
                if (statusEl) {
                    statusEl.style.color = "#1D56B8";
                    statusEl.innerText = "⏳ กำลังตรวจสอบสิทธิ์การเข้าถึงไฟล์บน Google Drive...";
                }

                const checkResult = await verifyGoogleDrivePublicAccess(fileUrl);
                if (!checkResult.ok || !checkResult.isPublic) {
                    const msg = checkResult.reason || "ไฟล์นี้ยังไม่ได้เปิดสิทธิ์ให้ 'ทุกคนที่มีลิงก์' เข้าถึงได้ครับ";
                    if (statusEl) {
                        statusEl.style.color = "#DC2626";
                        statusEl.innerText = "❌ " + msg;
                    }
                    alert("❌ อัปโหลดไม่สำเร็จ: " + msg + "\n\nกรุณาไปที่ Google Drive แล้วตั้งค่าเป็น 'ทุกคนที่มีลิงก์ (Anyone with the link)' แบบผู้มีสิทธิ์ดู ก่อนแล้วลองใหม่อีกครั้งครับ");
                    return;
                }

                isVerifiedPublicDrive = true;
                verifiedDriveUrl = fileUrl;
                if (statusEl) {
                    statusEl.style.color = "#047857";
                    statusEl.innerText = "✅ " + (checkResult.reason || "ยืนยันแล้วว่าเปิดสิทธิ์ทุกคนที่มีลิงก์เรียบร้อยครับ");
                }
            }

            submitBtn.innerText = "กำลังบันทึกข้อมูล...";
            await addDoc(collection(db, "notes"), {
                title: document.getElementById('noteTitle').value.trim(),
                grade: document.getElementById('noteGrade').value,
                subject: document.getElementById('noteSubject').value,
                author: currentUserProfile.nickname,
                authorUid: currentUserProfile.uid,
                schoolEmail: currentUserProfile.email,
                fileUrl: fileUrl,
                createdAt: serverTimestamp()
            });

            alert("🎉 เพิ่มสรุป PDF เข้าสู่ระบบสำเร็จ!");
            uploadForm.reset();
            isVerifiedPublicDrive = false;
            verifiedDriveUrl = "";
            window.resetDriveVerificationState();
            uploadModal.style.display = 'none';
            fetchNotes();
        } catch (error) {
            if (statusEl) {
                statusEl.style.color = "#DC2626";
                statusEl.innerText = "❌ " + error.message;
            }
            alert("❌ ไม่สามารถตรวจสอบหรือบันทึกไฟล์ได้: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "บันทึกสรุป PDF ขึ้นเว็บทันที";
        }
    });
}
