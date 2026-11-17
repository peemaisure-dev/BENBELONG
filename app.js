import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const ADMIN_PASSWORD = "PongpichiTLnwZa555";

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

let currentUserRole = null;
let allNotes = [];
let allEvents = [];

let currentCalendarDate = new Date(2026, 10, 1); 

const roleSelectionView = document.getElementById('roleSelectionView');
const mainDashboardView = document.getElementById('mainDashboardView');
const sidebar = document.getElementById('sidebar');

const calendarViewContainer = document.getElementById('calendarViewContainer');
const studyHubViewContainer = document.getElementById('studyHubViewContainer');

const passwordModal = document.getElementById('passwordModal');
const eventModal = document.getElementById('eventModal');
const uploadModal = document.getElementById('uploadModal');

const passwordForm = document.getElementById('passwordForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const eventForm = document.getElementById('eventForm');
const uploadForm = document.getElementById('uploadForm');

const userRoleBadge = document.getElementById('userRoleBadge');
const userRoleIndicator = document.getElementById('userRoleIndicator');
const adminMenuSection = document.getElementById('adminMenuSection');
const addEventQuickBtn = document.getElementById('addEventQuickBtn');

const eventsGrid = document.getElementById('eventsGrid');
const eventsLoading = document.getElementById('eventsLoading');
const currentMonthYearLabel = document.getElementById('currentMonthYearLabel');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');

const notesGrid = document.getElementById('notesGrid');
const notesLoading = document.getElementById('notesLoading');
const noteCount = document.getElementById('noteCount');
const searchInput = document.getElementById('searchInput');
const gradeFilter = document.getElementById('gradeFilter');
const subjectFilter = document.getElementById('subjectFilter');

const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

window.selectRole = function(role) {
    currentUserRole = role;
    roleSelectionView.style.display = 'none';
    mainDashboardView.style.display = 'flex';
    
    if (role === 'admin') {
        userRoleBadge.innerText = "⚙️ ทีมงานพรรค";
        userRoleIndicator.innerText = "⚙️ ทีมงานพรรค";
        adminMenuSection.style.display = 'block';
        addEventQuickBtn.style.display = 'inline-block';
    } else {
        userRoleBadge.innerText = "🎓 นักเรียน / คุณครู";
        userRoleIndicator.innerText = "🎓 นักเรียน / คุณครู";
        adminMenuSection.style.display = 'none';
        addEventQuickBtn.style.display = 'none';
    }
    updateCalendarDisplay();
    fetchEvents();
}

window.toggleSidebar = function() {
    sidebar.classList.toggle('sidebar-closed');
}

window.switchMainTab = function(tabName) {
    calendarViewContainer.style.display = 'none';
    studyHubViewContainer.style.display = 'none';

    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));

    if (tabName === 'calendar') {
        calendarViewContainer.style.display = 'block';
        event.currentTarget.classList.add('active');
        fetchEvents();
    } else if (tabName === 'studyhub') {
        studyHubViewContainer.style.display = 'block';
        event.currentTarget.classList.add('active');
        fetchNotes();
    }
    
    if (window.innerWidth <= 768) {
        sidebar.classList.add('sidebar-closed');
    }
}

window.changeMonth = function(direction) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
    updateCalendarDisplay();
    filterAndRenderEvents();
}

window.onMonthSelectChange = function(monthVal) {
    currentCalendarDate.setMonth(parseInt(monthVal));
    updateCalendarDisplay();
    filterAndRenderEvents();
}

window.onYearSelectChange = function(yearVal) {
    const ceYear = parseInt(yearVal) - 543;
    currentCalendarDate.setFullYear(ceYear);
    updateCalendarDisplay();
    filterAndRenderEvents();
}

function updateCalendarDisplay() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    currentMonthYearLabel.innerText = `${thaiMonths[month]} ${year + 543}`;
    
    monthSelect.value = month;
    yearSelect.value = year + 543;
}

window.openAdminPasswordModal = function() {
    passwordModal.style.display = 'flex';
}

passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (adminPasswordInput.value === ADMIN_PASSWORD) {
        passwordModal.style.display = 'none';
        adminPasswordInput.value = '';
        selectRole('admin');
        alert("🎉 เข้าสู่ระบบสมาชิกพรรคสำเร็จ!");
    } else {
        alert("❌ รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
    }
});

window.logoutToLanding = function() {
    currentUserRole = null;
    mainDashboardView.style.display = 'none';
    roleSelectionView.style.display = 'flex';
}

window.closeModal = function(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

window.openEventModal = function() {
    eventModal.style.display = 'flex';
}

window.openUploadModal = function() {
    uploadModal.style.display = 'flex';
}

window.onclick = (e) => {
    if (e.target === passwordModal) passwordModal.style.display = 'none';
    if (e.target === eventModal) eventModal.style.display = 'none';
    if (e.target === uploadModal) uploadModal.style.display = 'none';
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
        console.error("Error loading events:", error);
        eventsLoading.innerText = "ยังไม่มีอีเวนต์ในระบบ";
        renderEvents([]);
    }
}

function filterAndRenderEvents() {
    const targetYear = currentCalendarDate.getFullYear();
    const targetMonth = currentCalendarDate.getMonth();

    const filtered = allEvents.filter(ev => {
        if (!ev.eventDate) return false;
        const evDate = new Date(ev.eventDate);
        return evDate.getFullYear() === targetYear && evDate.getMonth() === targetMonth;
    });

    renderEvents(filtered);
}

function renderEvents(events) {
    eventsGrid.innerHTML = '';
    if (events.length === 0) {
        eventsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem; background: white; border-radius: 16px; color: #64748b;">
                <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">📅 ไม่มีกิจกรรมในเดือน${thaiMonths[currentCalendarDate.getMonth()]}นี้</p>
                <p style="font-size: 0.9rem;">สามารถเลือกเดือนอื่นด้านบน หรือเพิ่มอีเวนต์ใหม่ได้เลย!</p>
            </div>`;
        return;
    }

    events.forEach(ev => {
        const card = document.createElement('div');
        card.className = 'event-card';
        const deleteBtnHtml = (currentUserRole === 'admin') ? `<button class="btn-delete-event" onclick="window.deleteEvent('${ev.id}')">🗑️ ลบอีเวนต์</button>` : '';

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
            ${deleteBtnHtml}
        `;
        eventsGrid.appendChild(card);
    });
}

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
        console.error("Firestore Error:", error);
        alert("เกิดข้อผิดพลาดในการบันทึกอีเวนต์");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "บันทึกอีเวนต์ลงปฏิทิน";
    }
});

window.deleteEvent = async function(id) {
    if (confirm("⚠️ คุณต้องการลบอีเวนต์นี้ออกจากปฏิทินใช่หรือไม่?")) {
        try {
            await deleteDoc(doc(db, "events", id));
            alert("🗑️ ลบอีเวนต์สำเร็จ!");
            fetchEvents();
        } catch (error) {
            console.error("Error deleting event:", error);
            alert("เกิดข้อผิดพลาดในการลบอีเวนต์");
        }
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
        console.error("Error loading notes:", error);
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

    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        const deleteBtnStyle = (currentUserRole === 'admin') ? 'display: block;' : 'display: none;';

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
                    <span>✍️ จัดทำโดย: <strong>${escapeHTML(note.author)}</strong></span>
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
        } catch (error) {
            console.error("Error deleting note:", error);
            alert("เกิดข้อผิดพลาดในการลบข้อมูล");
        }
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

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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
            author: document.getElementById('noteAuthor').value.trim(),
            fileUrl: fileUrlInput,
            createdAt: serverTimestamp()
        });

        alert("🎉 เพิ่มสรุป PDF เข้าสู่ระบบสำเร็จ!");
        uploadForm.reset();
        uploadModal.style.display = 'none';
        fetchNotes();
    } catch (error) {
        console.error("Firestore Error:", error);
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "บันทึกสรุป PDF ขึ้นเว็บทันที";
    }
});
