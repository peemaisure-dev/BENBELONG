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

const roleSelectionView = document.getElementById('roleSelectionView');
const hubDashboardView = document.getElementById('hubDashboardView');
const studyHubView = document.getElementById('studyHubView');
const aiTutorView = document.getElementById('aiTutorView');

const passwordModal = document.getElementById('passwordModal');
const uploadModal = document.getElementById('uploadModal');
const passwordForm = document.getElementById('passwordForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const uploadForm = document.getElementById('uploadForm');
const submitBtn = document.getElementById('submitBtn');

const notesGrid = document.getElementById('notesGrid');
const loadingText = document.getElementById('loading');
const noteCount = document.getElementById('noteCount');
const searchInput = document.getElementById('searchInput');
const gradeFilter = document.getElementById('gradeFilter');
const subjectFilter = document.getElementById('subjectFilter');
const adminActionBtn = document.getElementById('adminActionBtn');
const userRoleBadge = document.getElementById('userRoleBadge');

window.selectRole = function(role) {
    currentUserRole = role;
    roleSelectionView.style.display = 'none';
    hubDashboardView.style.display = 'block';
    
    if (role === 'admin') {
        userRoleBadge.innerText = "⚙️ สมาชิกพรรค / ทีมงาน";
        userRoleBadge.style.background = "#E0F2FE";
        adminActionBtn.style.display = 'block';
    } else {
        userRoleBadge.innerText = "🎓 นักเรียน / คุณครู";
        adminActionBtn.style.display = 'none';
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
    hubDashboardView.style.display = 'none';
    studyHubView.style.display = 'none';
    aiTutorView.style.display = 'none';
    roleSelectionView.style.display = 'flex';
}

window.goToStudyHub = function() {
    hubDashboardView.style.display = 'none';
    studyHubView.style.display = 'block';
    fetchNotes();
}

window.goToAITutor = function() {
    hubDashboardView.style.display = 'none';
    aiTutorView.style.display = 'block';
}

window.backToHub = function() {
    studyHubView.style.display = 'none';
    aiTutorView.style.display = 'none';
    hubDashboardView.style.display = 'block';
}

window.closeModal = function(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

window.handleAdminAction = function() {
    if (currentUserRole === 'admin') {
        uploadModal.style.display = 'flex';
    } else {
        passwordModal.style.display = 'flex';
    }
}

window.onclick = (e) => {
    if (e.target === passwordModal) passwordModal.style.display = 'none';
    if (e.target === uploadModal) uploadModal.style.display = 'none';
};

// 🤖 ระบบ AI ติวเตอร์อัจฉริยะ (เรียกผ่าน Vercel Backend Proxy ดึง AI ของจริง 100%)
window.askAI = async function(type) {
    const subject = document.getElementById('aiSubjectInput').value.trim();
    const topic = document.getElementById('aiTopicInput').value.trim();
    const aiLoading = document.getElementById('aiLoading');
    const aiResultBox = document.getElementById('aiResultBox');
    const aiOutputContent = document.getElementById('aiOutputContent');

    if (!subject || !topic) {
        alert("กรุณากรอกข้อมูลทั้ง 'วิชาและระดับชั้น' และ 'บทเรียนหรือหัวข้อ' ให้ครบถ้วนก่อนใช้งานครับ!");
        return;
    }

    aiLoading.style.display = 'block';
    aiResultBox.style.display = 'none';

    let promptText = "";
    if (type === 'summary') {
        promptText = `คุณคือ AI ติวเตอร์อัจฉริยะประจำพรรค BENBELONG โรงเรียนเบญจมราชูทิศ ราชบุรี จงสรุปเนื้อหาสำคัญของวิชา "${subject}" ในบทเรียนเรื่อง "${topic}" ออกมาให้สั้นกระชับ เป็นข้อๆ (Bullet points) เข้าใจง่าย ตรงประเด็น เหมาะสำหรับนักเรียนอ่านเตรียมสอบ`;
    } else {
        promptText = `คุณคือ AI ติวเตอร์อัจฉริยะประจำพรรค BENBELONG โรงเรียนเบญจมราชูทิศ ราชบุรี จงจำลองโจทย์ข้อสอบเตรียมสอบของวิชา "${subject}" ในบทเรียนเรื่อง "${topic}" จำนวน 3 ข้อ พร้อมเฉลยและคำอธิบายอย่างละเอียด เพื่อให้นักเรียนฝึกทำ`;
    }

    try {
        const response = await fetch('/api/tutor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promptText })
        });

        const data = await response.json();

        if (response.ok && data.text) {
            aiOutputContent.innerText = data.text;
            aiResultBox.style.display = 'block';
        } else {
            alert("AI Error: " + (data.error || "ไม่สามารถดึงข้อมูลจาก AI ได้"));
        }

    } catch (error) {
        console.error("AI Error:", error);
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI ติวเตอร์ กรุณาตรวจสอบอินเทอร์เน็ต");
    } finally {
        aiLoading.style.display = 'none';
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
        loadingText.style.display = 'none';
        renderNotes(allNotes);
    } catch (error) {
        console.error("Error loading notes:", error);
        loadingText.innerText = "ยังไม่มีข้อมูลสรุป PDF ในระบบ หรือตรวจสอบการตั้งค่า Firestore";
    }
}

function renderNotes(notes) {
    notesGrid.innerHTML = '';
    noteCount.innerText = notes.length;

    if (notes.length === 0) {
        notesGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem; background: white; border-radius: 16px; color: #64748b;">
                <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">ยังไม่มีรายการสรุป PDF ในระบบ</p>
                <p style="font-size: 0.9rem;">ทีมงานพรรคกำลังทยอยเพิ่มชีทสรุปเร็วๆ นี้!</p>
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
                    <button class="btn-delete" style="${deleteBtnStyle}" onclick="window.deleteNote('${note.id}')">🗑️ ลบสรุปนี้ออกจากระบบ</button>
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
    if (confirm("⚠️ คุณต้องการลบชีทสรุป PDF นี้ออกจากระบบใช่หรือไม่?")) {
        try {
            await deleteDoc(doc(db, "notes", id));
            alert("🗑️ ลบข้อมูลสำเร็จ!");
            fetchNotes();
        } catch (error) {
            console.error("Error deleting note: ", error);
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
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาตรวจสอบการตั้งค่า Firestore");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "บันทึกสรุป PDF ขึ้นเว็บทันที";
    }
});
