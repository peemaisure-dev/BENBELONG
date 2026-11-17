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
let allPosts = [];

let currentCalendarDate = new Date(2026, 10, 1); 

const roleSelectionView = document.getElementById('roleSelectionView');
const mainDashboardView = document.getElementById('mainDashboardView');
const sidebar = document.getElementById('sidebar');

const calendarViewContainer = document.getElementById('calendarViewContainer');
const communityViewContainer = document.getElementById('communityViewContainer');
const studyHubViewContainer = document.getElementById('studyHubViewContainer');

const passwordModal = document.getElementById('passwordModal');
const eventModal = document.getElementById('eventModal');
const uploadModal = document.getElementById('uploadModal');
const eventDetailModal = document.getElementById('eventDetailModal');

const passwordForm = document.getElementById('passwordForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const eventForm = document.getElementById('eventForm');
const uploadForm = document.getElementById('uploadForm');
const postForm = document.getElementById('postForm');

const userRoleBadge = document.getElementById('userRoleBadge');
const userRoleIndicator = document.getElementById('userRoleIndicator');
const adminMenuSection = document.getElementById('adminMenuSection');
const addEventQuickBtn = document.getElementById('addEventQuickBtn');

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

const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

// รายการคำหยาบและคำไม่สุภาพที่ต้องการตรวจจับและบล็อก
const badWords = ["ควย", "หี", "เหี้ย", "สัส", "ควาย", "เย็ด", "โง่"];

function containsBadWord(text) {
    const cleanText = text.toLowerCase().replace(/[\s\-_.,!@#$%^&*()+=]/g, '');
    return badWords.some(word => {
        const cleanWord = word.toLowerCase();
        return cleanText.includes(cleanWord);
    });
}

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
    communityViewContainer.style.display = 'none';
    studyHubViewContainer.style.display = 'none';

    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));

    if (tabName === 'calendar') {
        calendarViewContainer.style.display = 'block';
        event.currentTarget.classList.add('active');
        fetchEvents();
    } else if (tabName === 'community') {
        communityViewContainer.style.display = 'block';
        event.currentTarget.classList.add('active');
        fetchPosts();
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
    monthSelect.value = currentCalendarDate.getMonth();
    yearSelect.value = currentCalendarDate.getFullYear() + 543;
    updateCalendarDisplay();
    filterAndRenderEvents();
}

window.onMonthSelectChange = function(monthVal) {
    if (monthVal !== 'all') {
        currentCalendarDate.setMonth(parseInt(monthVal));
    }
    updateCalendarDisplay();
    filterAndRenderEvents();
}

window.onYearSelectChange = function(yearVal) {
    if (yearVal !== 'all') {
        const ceYear = parseInt(yearVal) - 543;
        currentCalendarDate.setFullYear(ceYear);
    }
    updateCalendarDisplay();
    filterAndRenderEvents();
}

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
    if (e.target === eventDetailModal) eventDetailModal.style.display = 'none';
};

/* จัดการระบบปฏิทิน */
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

// ฟังก์ชันเปิด Modal ดูรายละเอียดอีเวนต์
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
            eventDetailModal.style.display = 'none';
            fetchEvents();
        } catch (error) {
            console.error("Error deleting event:", error);
            alert("เกิดข้อผิดพลาดในการลบอีเวนต์");
        }
    }
};

/* จัดการระบบกระดานพรรค (X Style Community Feed) */
async function fetchPosts() {
    try {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allPosts = [];
        querySnapshot.forEach((doc) => {
            allPosts.push({ id: doc.id, ...doc.data() });
        });
        postsLoading.style.display = 'none';
        renderPosts(allPosts);
        extractAndRenderTrends(allPosts);
    } catch (error) {
        console.error("Error loading posts:", error);
        postsLoading.innerText = "ยังไม่มีโพสต์ในระบบ";
        renderPosts([]);
    }
}

function renderPosts(posts) {
    postsFeed.innerHTML = '';
    if (posts.length === 0) {
        postsFeed.innerHTML = `
            <div style="text-align:center; padding: 3rem; background: white; border-radius: 16px; color: #64748b; margin: 1rem;">
                <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">💬 ไม่มีโพสต์ที่ค้นหา</p>
                <p style="font-size: 0.9rem;">ลองพิมพ์ค้นหาด้วยคำอื่น หรือสร้างโพสต์ใหม่ได้เลย!</p>
            </div>`;
        return;
    }

    const currentAuthorName = localStorage.getItem('benbelong_author') || "";

    posts.forEach(post => {
        const card = document.createElement('div');
        card.className = 'x-post-item';
        
        let deleteBtnHtml = '';
        if (currentUserRole === 'admin' || (currentAuthorName && post.author === currentAuthorName)) {
            deleteBtnHtml = `<button class="x-delete-btn" onclick="window.deletePost('${post.id}')">🗑️ ลบ</button>`;
        }

        let formattedContent = escapeHTML(post.content);
        formattedContent = formattedContent.replace(/#([A-Za-zก-ฮ0-9_]+)/g, '<span class="x-hashtag">#$1</span>');

        card.innerHTML = `
            <div class="x-post-avatar">👤</div>
            <div class="x-post-content-wrap">
                <div class="x-post-header">
                    <span class="x-post-author">${escapeHTML(post.author)}</span>
                    ${deleteBtnHtml}
                </div>
                <div class="x-post-text">${formattedContent}</div>
            </div>
        `;
        postsFeed.appendChild(card);
    });
}

window.filterPostsBySearch = function() {
    const keyword = searchInputFeed.value.toLowerCase().trim();
    const filtered = allPosts.filter(post => {
        return post.content.toLowerCase().includes(keyword) || post.author.toLowerCase().includes(keyword);
    });
    renderPosts(filtered);
}

window.filterByHashtag = function(tag) {
    searchInputFeed.value = tag;
    filterPostsBySearch();
}

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

postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = document.getElementById('postAuthorName').value.trim();
    const content = document.getElementById('postContentInput').value.trim();
    if (!author || !content) return;

    if (containsBadWord(author) || containsBadWord(content)) {
        alert("⚠️ ขออภัยครับ ตรวจพบคำที่ไม่สุภาพในโพสต์ ระบบไม่อนุญาตให้เผยแพร่ครับ");
        return; 
    }

    localStorage.setItem('benbelong_author', author);

    try {
        await addDoc(collection(db, "posts"), {
            author: author,
            content: content,
            createdAt: serverTimestamp()
        });

        document.getElementById('postContentInput').value = '';
        fetchPosts();
    } catch (error) {
        console.error("Firestore Error:", error);
        alert("เกิดข้อผิดพลาดในการโพสต์ข้อความ");
    }
});

window.deletePost = async function(id) {
    if (confirm("⚠️ คุณต้องการลบโพสต์นี้ใช่หรือไม่?")) {
        try {
            await deleteDoc(doc(db, "posts", id));
            fetchPosts();
        } catch (error) {
            console.error("Error deleting post:", error);
            alert("เกิดข้อผิดพลาดในการลบโพสต์");
        }
    }
};

/* จัดการคลังสรุป PDF */
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
