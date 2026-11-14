import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =========================================================================
// ตั้งค่ารหัสผ่านแอดมินสำหรับทีมงานพรรค
// =========================================================================
const ADMIN_PASSWORD = "PongpichiTLnwZa555";

// =========================================================================
// Firebase Config (ค่าจริงจากโปรเจกต์ของคุณ)
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyAZBNNxWgnkCH2RbmM-wJ4qDtuqW_pZWaQ",
    authDomain: "benbelong-fcd54.firebaseapp.com",
    projectId: "benbelong-fcd54",
    storageBucket: "benbelong-fcd54.firebasestorage.app",
    messagingSenderId: "245711706154",
    appId: "1:245711706154:web:ad95ed21159ec8a7164b53",
    measurementId: "G-XBN7VX3X3R"
};

// เริ่มต้น Firebase (เฉพาะ Firestore)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ตัวแปรและ Element ต่างๆ
const notesGrid = document.getElementById('notesGrid');
const loadingText = document.getElementById('loading');
const noteCount = document.getElementById('noteCount');
const searchInput = document.getElementById('searchInput');
const gradeFilter = document.getElementById('gradeFilter');
const subjectFilter = document.getElementById('subjectFilter');

// โมดัลแอดมิน
const adminLoginBtn = document.getElementById('adminLoginBtn');
const passwordModal = document.getElementById('passwordModal');
const closePassModal = document.getElementById('closePassModal');
const passwordForm = document.getElementById('passwordForm');
const adminPasswordInput = document.getElementById('adminPasswordInput');

// โมดัลเพิ่มข้อมูล
const uploadModal = document.getElementById('uploadModal');
const closeUploadModal = document.getElementById('closeUploadModal');
const uploadForm = document.getElementById('uploadForm');
const submitBtn = document.getElementById('submitBtn');

let allNotes = [];
let isAdminLoggedIn = false; // ตัวแปรเช็กสถานะแอดมิน

// จัดการเปิด-ปิดหน้าต่างรหัสผ่าน
adminLoginBtn.onclick = () => {
    if (isAdminLoggedIn) {
        // ถ้าล็อกอินอยู่แล้ว กดปุ่มเพื่อเปิดหน้าเพิ่มข้อมูลได้เลย
        uploadModal.style.display = 'flex';
    } else {
        passwordModal.style.display = 'flex';
    }
};

closePassModal.onclick = () => passwordModal.style.display = 'none';
closeUploadModal.onclick = () => uploadModal.style.display = 'none';
window.onclick = (e) => {
    if (e.target === passwordModal) passwordModal.style.display = 'none';
    if (e.target === uploadModal) uploadModal.style.display = 'none';
};

// ตรวจสอบรหัสผ่านแอดมิน
passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (adminPasswordInput.value === ADMIN_PASSWORD) {
        isAdminLoggedIn = true; // ยืนยันสถานะแอดมิน
        passwordModal.style.display = 'none';
        adminPasswordInput.value = '';
        
        // เปลี่ยนข้อความปุ่มด้านบนให้รู้ว่าอยู่ในโหมดแอดมินแล้ว
        adminLoginBtn.innerText = "⚙️ โหมดแอดมิน (จัดการข้อมูล)";
        adminLoginBtn.style.background = "#E0F2FE";
        adminLoginBtn.style.borderColor = "#0284C7";

        // เปิดหน้าต่างเพิ่มข้อมูลต่อทันที
        uploadModal.style.display = 'flex';
        renderNotes(allNotes); // เรนเดอร์การ์ดใหม่เพื่อให้ปุ่มลบแสดงขึ้นมา
    } else {
        alert("❌ รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
    }
});

// ดึงข้อมูลสรุปทั้งหมดจาก Firestore
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
        loadingText.innerText = "ยังไม่มีข้อมูลสรุปในระบบ หรือตรวจสอบการตั้งค่า Firestore";
    }
}

// แสดงผลการ์ดสรุปบนหน้าเว็บ (พร้อมปุ่มลบถ้าอยู่ในโหมดแอดมิน)
function renderNotes(notes) {
    notesGrid.innerHTML = '';
    noteCount.innerText = notes.length;

    if (notes.length === 0) {
        notesGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem; background: white; border-radius: 16px; color: #64748b;">
                <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">ยังไม่มีรายการสรุปในระบบ</p>
                <p style="font-size: 0.9rem;">ทีมงานพรรคกำลังทยอยเพิ่มชีทสรุปเร็วๆ นี้!</p>
            </div>`;
        return;
    }

    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        
        // เช็กว่าถ้าเป็นแอดมิน ให้แสดงปุ่มลบ (display: block)
        const deleteBtnStyle = isAdminLoggedIn ? 'display: block;' : 'display: none;';

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
                    <a href="${note.fileUrl}" target="_blank" class="btn-download">เปิดอ่าน / ดาวน์โหลดสรุป</a>
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

// ฟังก์ชันสำหรับลบข้อมูลสรุปออกจาก Firestore
window.deleteNote = async function(id) {
    if (confirm("⚠️ คุณต้องการลบชีทสรุปนี้ออกจากระบบใช่หรือไม่?")) {
        try {
            await deleteDoc(doc(db, "notes", id));
            alert("🗑️ ลบข้อมูลสำเร็จ!");
            fetchNotes(); // โหลดข้อมูลใหม่ทันที
        } catch (error) {
            console.error("Error deleting note: ", error);
            alert("เกิดข้อผิดพลาดในการลบข้อมูล");
        }
    }
};

// ระบบค้นหาและกรองข้อมูล
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

searchInput.addEventListener('input', filterNotes);
gradeFilter.addEventListener('change', filterNotes);
subjectFilter.addEventListener('change', filterNotes);

// ระบบบันทึกข้อมูลลิงก์ Google Drive เข้า Firestore
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

        alert("🎉 เพิ่มสรุปเข้าสู่ระบบสำเร็จ!");
        uploadForm.reset();
        uploadModal.style.display = 'none';
        fetchNotes();

    } catch (error) {
        console.error("Firestore Error:", error);
        alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาตรวจสอบการตั้งค่า Firestore");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "บันทึกสรุปขึ้นเว็บทันที";
    }
});

fetchNotes();
