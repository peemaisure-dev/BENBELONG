import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const SCHOOL_DOMAIN = "@ben.ac.th";
const ADMIN_PASSWORD = "PongpichiTLnwZa555";
const DEVICE_REGISTERED_KEY = "benefit_device_registered_account";

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
let allNotes = [];
let allEvents = [];
let allPosts = [];
let currentCalendarDate = new Date(2026, 10, 1);

const roleSelectionView = document.getElementById('roleSelectionView');
const mainDashboardView = document.getElementById('mainDashboardView');
const sidebar = document.getElementById('sidebar');

const calendarViewContainer = document.getElementById('calendarViewContainer');
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
const adminAddEventSidebarBtn = document.getElementById('adminAddEventSidebarBtn');
const addEventQuickBtn = document.getElementById('addEventQuickBtn');
const sidebarFeedbackBtn = document.getElementById('sidebarFeedbackBtn');

const eventsGrid = document.getElementById('eventsGrid');
const eventsLoading = document.getElementById('eventsLoading');
const currentMonthYearLabel = document.getElementById('currentMonthYearLabel');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');

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

// โหลดบัญชีที่ล็อกอินไว้ในเครื่องอัตโนมัติ (เปิดเว็บครั้งต่อไปเข้าใช้งานได้ทันทีโดยไม่ต้องล็อกอินซ้ำ)
onAuthStateChanged(auth, async (user) => {
    const subtext = document.getElementById('studentEntrySubtext');
    if (user && isValidSchoolEmail(user.email)) {
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists()) {
                await signOut(auth);
                currentUserProfile = null;
                if (subtext) subtext.innerText = "เข้าสู่ระบบ หรือ สร้างบัญชีด้วยอีเมลโรงเรียน";
                return;
            }
            const nickname = userDoc.data().nickname || user.email.split('@')[0];
            currentUserProfile = {
                uid: user.uid,
                email: user.email.toLowerCase(),
                nickname: nickname
            };
            if (subtext) {
                subtext.innerText = `เข้าใช้งานต่อในชื่อ: ${nickname} (${user.email})`;
            }
            if (roleSelectionView && roleSelectionView.style.display !== 'none' && !sessionStorage.getItem('benbelong_logged_out')) {
                selectRole('student');
            }
        } catch (e) {}
    } else {
        currentUserProfile = null;
        if (subtext) subtext.innerText = "เข้าสู่ระบบ หรือ สร้างบัญชีด้วยอีเมลโรงเรียน";
    }
});

// กดปุ่ม คุณครู / นักเรียนโรงเรียนเบญฯ บนหน้าแรก
window.handleStudentEntry = function() {
    sessionStorage.removeItem('benbelong_logged_out');
    if (currentUserProfile && isValidSchoolEmail(currentUserProfile.email)) {
        selectRole('student');
        return;
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

// ปรับคำแนะนำเมื่อตรวจพบอีเมลรูปแบบอื่นที่ไม่ใช่ sXXXXX@ben.ac.th หรือ XXXXX@ben.ac.th
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
        labelEl.innerText = "ตั้งชื่อแสดงผล (Username) *";
    }
};

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('regEmail').value.trim().toLowerCase();
        const nickname = document.getElementById('regNickname').value.trim();
        const password = document.getElementById('regPassword').value;
        const regBtn = document.getElementById('regSubmitBtn');

        // 1. ตรวจว่าลงท้าย @ben.ac.th หรือไม่
        if (!email.endsWith('@ben.ac.th') || !/^[^@\s]+@ben\.ac\.th$/.test(email)) {
            alert("❌ สร้างบัญชีไม่สำเร็จ: อีเมลต้องลงท้ายด้วย @ben.ac.th เท่านั้นครับ");
            return;
        }

        // 2. ตรวจว่าอุปกรณ์นี้เคยสร้างบัญชีในเครื่องแล้วหรือไม่ (1 คน / 1 device)
        const registeredDeviceEmail = localStorage.getItem(DEVICE_REGISTERED_KEY);
        if (registeredDeviceEmail && registeredDeviceEmail !== email) {
            alert(`❌ สร้างบัญชีไม่สำเร็จ: อุปกรณ์นี้เคยสร้างบัญชีไปแล้ว (${registeredDeviceEmail}) จำกัด 1 คน ต่อ 1 เครื่องครับ หากเป็นบัญชีของคุณเองให้กดแท็บ "เข้าสู่ระบบ"`);
            return;
        }

        // 3. หากอีเมลไม่ใช่รูปแบบ sXXXXX หรือ XXXXX (5 หลัก) ต้องบังคับชื่อภาษาไทยล้วน ห้ามมีภาษาอังกฤษ และใส่ชื่อตัวเอง
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
            sessionStorage.removeItem('benbelong_logged_out');
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
            sessionStorage.removeItem('benbelong_logged_out');
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

// เปิด Pop-up โปรไฟล์ผู้ใช้งานเมื่อกดที่ชื่อหรือรูปโปรไฟล์
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
    if (currentUserProfile && editNicknameModal) {
        document.getElementById('newNicknameInput').value = currentUserProfile.nickname;
        editNicknameModal.style.display = 'flex';
    }
};

if (editNicknameForm) {
    editNicknameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newNick = document.getElementById('newNicknameInput').value.trim();
        const saveBtn = document.getElementById('saveNicknameBtn');

        if (!newNick) return;
        if (currentUserProfile && !isStudentFormatEmail(currentUserProfile.email) && !isPureThaiName(newNick)) {
            alert("❌ สำหรับอีเมลรูปแบบนี้ ต้องใช้ชื่อภาษาไทยเท่านั้น ห้ามมีภาษาอังกฤษ และโปรดใส่ชื่อตัวเองครับ");
            return;
        }
        if (containsBadWord(newNick)) {
            alert("⚠️ ชื่อมีคำที่ไม่สุภาพ กรุณาตั้งชื่อใหม่ครับ");
            return;
        }

        if (currentUserProfile) {
            try {
                saveBtn.disabled = true;
                saveBtn.innerText = "กำลังบันทึก...";

                await updateDoc(doc(db, "users", currentUserProfile.uid), {
                    nickname: newNick
                });

                currentUserProfile.nickname = newNick;
                updateUserUI();
                editNicknameModal.style.display = 'none';
                alert("✅ เปลี่ยน Username เรียบร้อยแล้ว!");
            } catch (error) {
                alert("เกิดข้อผิดพลาดในการเปลี่ยนชื่อ");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerText = "บันทึกชื่อใหม่";
            }
        }
    });
}

function updateUserUI() {
    if (currentUserRole === 'admin') {
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

    if (role === 'admin') {
        if (adminAddEventSidebarBtn) adminAddEventSidebarBtn.style.display = 'block';
        addEventQuickBtn.style.display = 'inline-block';
        if (sidebarFeedbackBtn) sidebarFeedbackBtn.innerText = "📖 อ่าน Feedback ทั้งหมด";
    } else {
        if (adminAddEventSidebarBtn) adminAddEventSidebarBtn.style.display = 'none';
        addEventQuickBtn.style.display = 'none';
        if (sidebarFeedbackBtn) sidebarFeedbackBtn.innerText = "💡 ส่ง Feedback / แจ้งบัค";
    }
    updateUserUI();
    updateCalendarDisplay();
    fetchEvents();
};

window.toggleSidebar = function() {
    sidebar.classList.toggle('sidebar-closed');
};

window.switchMainTab = function(tabName, clickedEl) {
    calendarViewContainer.style.display = 'none';
    communityViewContainer.style.display = 'none';
    studyHubViewContainer.style.display = 'none';

    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    if (clickedEl) {
        clickedEl.classList.add('active');
    }

    if (tabName === 'calendar') {
        calendarViewContainer.style.display = 'block';
        fetchEvents();
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

window.changeMonth = function(direction) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
    monthSelect.value = currentCalendarDate.getMonth();
    yearSelect.value = currentCalendarDate.getFullYear() + 543;
    updateCalendarDisplay();
    filterAndRenderEvents();
};

window.onMonthSelectChange = function(monthVal) {
    if (monthVal !== 'all') {
        currentCalendarDate.setMonth(parseInt(monthVal));
    }
    updateCalendarDisplay();
    filterAndRenderEvents();
};

window.onYearSelectChange = function(yearVal) {
    if (yearVal !== 'all') {
        const ceYear = parseInt(yearVal) - 543;
        currentCalendarDate.setFullYear(ceYear);
    }
    updateCalendarDisplay();
    filterAndRenderEvents();
};

function updateCalendarDisplay() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const mVal = monthSelect.value;
    const yVal = yearSelect.value;

    if (mVal === 'all' && yVal === 'all') {
        currentMonthYearLabel.innerText = "อีเวนต์ทั้งหมด";
    } else if (mVal === 'all') {
        currentMonthYearLabel.innerText = `ทุกเดือน ${yVal}`;
    } else if (yVal === 'all') {
        currentMonthYearLabel.innerText = `${thaiMonths[month]} (ทุกปี)`;
    } else {
        currentMonthYearLabel.innerText = `${thaiMonths[month]} ${year + 543}`;
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

// กดปุ่มออกจากระบบ: แจ้งเตือนยืนยันก่อนออกจากระบบจริง
window.logoutToLanding = async function() {
    const confirmed = confirm(
        "คุณต้องการออกจากระบบจริงๆ ใช่ไหม?\n\n⚠️ หากคุณจำรหัสผ่านไม่ได้ คุณต้องติดต่อเรามาทางไอจี (IG) เท่านั้นนะครับ"
    );
    if (!confirmed) return;

    try {
        await signOut(auth);
    } catch (e) {}

    currentUserRole = null;
    currentUserProfile = null;
    if (sidebar) sidebar.classList.add('sidebar-closed');
    if (mainDashboardView) mainDashboardView.style.display = 'none';
    if (roleSelectionView) roleSelectionView.style.display = 'flex';
};

window.closeModal = function(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
};

window.openEventModal = function() {
    if (eventModal) eventModal.style.display = 'flex';
};

window.openUploadModal = function() {
    updateUserUI();
    if (uploadModal) uploadModal.style.display = 'flex';
};

window.openFeedbackModal = function() {
    const studentView = document.getElementById('studentFeedbackView');
    const adminView = document.getElementById('adminFeedbackView');

    if (currentUserRole === 'admin') {
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

async function fetchEvents() {
    try {
        const q = query(collection(db, "events"), orderBy("eventDate", "asc"));
        const querySnapshot = await getDocs(q);
        allEvents = [];
        querySnapshot.forEach((doc) => {
            allEvents.push({ id: doc.id, ...doc.data() });
        });
        eventsLoading.style.display = 'none';
        filterAndRenderEvents();
    } catch (error) {
        eventsLoading.innerText = "ยังไม่มีอีเวนต์ในระบบ";
        renderEvents([]);
    }
}

function filterAndRenderEvents() {
    const mVal = monthSelect.value;
    const yVal = yearSelect.value;

    const filtered = allEvents.filter(ev => {
        if (!ev.eventDate) return false;
        const evDate = new Date(ev.eventDate);
        const evYear = evDate.getFullYear();
        const evMonth = evDate.getMonth();

        const matchMonth = (mVal === 'all') || (evMonth === parseInt(mVal));
        const matchYear = (yVal === 'all') || (evYear === (parseInt(yVal) - 543));

        return matchMonth && matchYear;
    });

    renderEvents(filtered);
}

function renderEvents(events) {
    eventsGrid.innerHTML = '';
    if (events.length === 0) {
        eventsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem; background: white; border-radius: 16px; color: #64748b;">
                <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">📅 ไม่มีกิจกรรมในเงื่อนไขเวลานี้</p>
                <p style="font-size: 0.9rem;">สามารถเลือก "ทุกเดือน / ทุกปี" หรือเพิ่มอีเวนต์ใหม่ได้เลย!</p>
            </div>`;
        return;
    }

    events.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'event-card clickable-card';
        card.onclick = () => openEventDetail(ev);

        card.innerHTML = `
            <div class="event-date-badge">
                <span class="ev-day">🗓️ ${ev.eventDate}</span>
                <span class="ev-time">⏰ ${ev.eventTime}</span>
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
        eventsGrid.appendChild(card);
    });
}

window.openEventDetail = function(ev) {
    document.getElementById('modalEventTitle').innerText = ev.title;
    document.getElementById('modalEventDate').innerText = ev.eventDate;
    document.getElementById('modalEventTime').innerText = ev.eventTime;
    document.getElementById('modalEventLocation').innerText = ev.location;
    document.getElementById('modalEventDesc').innerText = ev.desc;

    const deleteContainer = document.getElementById('modalDeleteActionContainer');
    if (currentUserRole === 'admin') {
        deleteContainer.innerHTML = `<button class="btn-delete-event" onclick="window.deleteEvent('${ev.id}')">🗑️ ลบอีเวนต์นี้</button>`;
    } else {
        deleteContainer.innerHTML = '';
    }

    eventDetailModal.style.display = 'flex';
};

if (eventForm) {
    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('eventSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.innerText = "กำลังบันทึกอีเวนต์...";

        try {
            await addDoc(collection(db, "events"), {
                title: document.getElementById('eventTitle').value.trim(),
                eventDate: document.getElementById('eventDate').value,
                eventTime: document.getElementById('eventTime').value.trim(),
                location: document.getElementById('eventLocation').value.trim(),
                desc: document.getElementById('eventDesc').value.trim(),
                createdAt: serverTimestamp()
            });

            alert("🎉 เพิ่มอีเวนต์ลงปฏิทินสำเร็จ!");
            eventForm.reset();
            eventModal.style.display = 'none';
            fetchEvents();
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการบันทึกอีเวนต์");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "บันทึกอีเวนต์ลงปฏิทิน";
        }
    });
}

window.deleteEvent = async function(id) {
    if (confirm("⚠️ คุณต้องการลบอีเวนต์นี้ออกจากปฏิทินใช่หรือไม่?")) {
        try {
            await deleteDoc(doc(db, "events", id));
            alert("🗑️ ลบอีเวนต์สำเร็จ!");
            eventDetailModal.style.display = 'none';
            fetchEvents();
        } catch (error) {}
    }
};

async function fetchPosts() {
    try {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allPosts = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            allPosts.push({
                id: doc.id,
                ...data,
                likes: data.likes || 0,
                likedBy: data.likedBy || [],
                comments: data.comments || []
            });
        });
        postsLoading.style.display = 'none';
        renderPosts(allPosts);
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

    posts.forEach(post => {
        const card = document.createElement('div');
        card.className = 'x-post-item';

        let deleteBtnHtml = '';
        if (currentUserRole === 'admin' || (currentUid && post.authorUid === currentUid)) {
            deleteBtnHtml = `<button class="x-delete-btn" onclick="window.deletePost('${post.id}')">🗑️ ลบ</button>`;
        }

        let formattedContent = escapeHTML(post.content);
        formattedContent = formattedContent.replace(/#([A-Za-zก-ฮ0-9_]+)/g, '<span class="x-hashtag">#$1</span>');

        const hasLiked = post.likedBy && post.likedBy.includes(currentUid);
        const heartIcon = hasLiked ? '❤️' : '🤍';

        const safeAuthor = escapeHTML(post.author);
        const safeEmail = escapeHTML(post.schoolEmail || '');
        const safeAuthorUid = escapeHTML(post.authorUid || '');

        let commentsHtml = '';
        if (post.comments && post.comments.length > 0) {
            post.comments.forEach((comm, cIndex) => {
                let commentDeleteBtn = '';
                if (currentUserRole === 'admin' || (currentUid && comm.authorUid === currentUid)) {
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
                    </div>
                    ${deleteBtnHtml}
                </div>
                <div class="x-post-text">${formattedContent}</div>
                
                <div class="x-post-actions">
                    <button class="x-action-btn" onclick="window.toggleLike('${post.id}')">
                        ${heartIcon} <span>${post.likes || 0}</span>
                    </button>
                    <button class="x-action-btn" onclick="window.toggleCommentBox('${post.id}')">
                        💬 <span>${post.comments ? post.comments.length : 0}</span>
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
    const filtered = allPosts.filter(post => {
        return post.content.toLowerCase().includes(keyword) || post.author.toLowerCase().includes(keyword);
    });
    renderPosts(filtered);
};

window.filterByHashtag = function(tag) {
    searchInputFeed.value = tag;
    filterPostsBySearch();
};

function extractAndRenderTrends(posts) {
    const tagCounts = {};
    posts.forEach(post => {
        const matches = post.content.match(/#([A-Za-zก-ฮ0-9_]+)/g);
        if (matches) {
            matches.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

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

async function fetchNotes() {
    try {
        const q = query(collection(db, "notes"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allNotes = [];
        querySnapshot.forEach((doc) => {
            allNotes.push({ id: doc.id, ...doc.data() });
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
        const canDelete = (currentUserRole === 'admin') || (currentUid && note.authorUid === currentUid);
        const deleteBtnStyle = canDelete ? 'display: block;' : 'display: none;';

        const safeAuthor = escapeHTML(note.author);
        const safeEmail = escapeHTML(note.schoolEmail || '');
        const safeAuthorUid = escapeHTML(note.authorUid || '');

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
                    <a href="${note.fileUrl}" target="_blank" class="btn-download">📥 ดาวน์โหลดไฟล์ PDF สรุป</a>
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

        const fileUrlInput = document.getElementById('noteFileUrl').value.trim();
        if (!fileUrlInput) return;

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.innerText = "กำลังบันทึกข้อมูล...";

        try {
            await addDoc(collection(db, "notes"), {
                title: document.getElementById('noteTitle').value.trim(),
                grade: document.getElementById('noteGrade').value,
                subject: document.getElementById('noteSubject').value,
                author: currentUserProfile.nickname,
                authorUid: currentUserProfile.uid,
                schoolEmail: currentUserProfile.email,
                fileUrl: fileUrlInput,
                createdAt: serverTimestamp()
            });

            alert("🎉 เพิ่มสรุป PDF เข้าสู่ระบบสำเร็จ!");
            uploadForm.reset();
            uploadModal.style.display = 'none';
            fetchNotes();
        } catch (error) {
            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = "บันทึกสรุป PDF ขึ้นเว็บทันที";
        }
    });
}
