import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAspuSU6zNZk0ZTEj8mwG4tr4r0dPhsu2o",
  authDomain: "incident-2c0cb.firebaseapp.com",
  projectId: "incident-2c0cb",
  storageBucket: "incident-2c0cb.firebasestorage.app",
  messagingSenderId: "929181151636",
  appId: "1:929181151636:web:e72e54a54d9d1fea811f81",
  measurementId: "G-R1KJHESXP6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Global variables
let uploadedFiles = [];
let selectedPriority = 'medium';

// Priority selector functionality
document.querySelectorAll('.priority-option').forEach(option => {
    option.addEventListener('click', function() {
        document.querySelectorAll('.priority-option').forEach(opt => opt.classList.remove('selected'));
        this.classList.add('selected');
        selectedPriority = this.dataset.priority;
    });
});

// File upload functionality
const fileUploadArea = document.getElementById('fileUploadArea');
const fileInput = document.getElementById('fileInput');
const uploadedFilesContainer = document.getElementById('uploadedFiles');

fileUploadArea.addEventListener('click', () => fileInput.click());

fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.classList.add('dragover');
});

fileUploadArea.addEventListener('dragleave', () => {
    fileUploadArea.classList.remove('dragover');
});

fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
            showToast('File too large: ' + file.name, 'error');
            return;
        }

        const fileObj = {
            file: file,
            id: Date.now() + Math.random(),
            name: file.name,
            size: formatFileSize(file.size),
            type: file.type || 'unknown'
        };

        uploadedFiles.push(fileObj);
        displayUploadedFile(fileObj);
    });
}

function displayUploadedFile(fileObj) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.innerHTML = `
        <div class="file-info">
            <span>📄</span>
            <div>
                <div>${fileObj.name}</div>
                <small style="color: #9ca3af;">${fileObj.size}</small>
            </div>
        </div>
        <button class="remove-file" onclick="removeFile(${fileObj.id})">
            ✕
        </button>
    `;
    uploadedFilesContainer.appendChild(fileItem);
}

window.removeFile = function(fileId) {
    uploadedFiles = uploadedFiles.filter(file => file.id !== fileId);
    refreshUploadedFiles();
};

window.clearFiles = function() {
    uploadedFiles = [];
    uploadedFilesContainer.innerHTML = '';
    fileInput.value = '';
};

function refreshUploadedFiles() {
    uploadedFilesContainer.innerHTML = '';
    uploadedFiles.forEach(displayUploadedFile);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Form submission
document.getElementById('incidentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitIncident();
});

async function submitIncident() {
    const submitBtn = document.getElementById('submitBtn');
    const originalContent = submitBtn.innerHTML;
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="spinner"></div> Processing...';

    try {
        const formData = {
            incidentType: document.getElementById('incidentType').value,
            reporterName: document.getElementById('reporterName').value,
            reporterEmail: document.getElementById('reporterEmail').value,
            priority: selectedPriority,
            description: document.getElementById('description').value,
            affectedSystems: document.getElementById('affectedSystems').value,
            timestamp: serverTimestamp(),
            status: 'pending',
            fileUrls: []
        };

        // Upload files if any
        if (uploadedFiles.length > 0) {
            const uploadPromises = uploadedFiles.map(async (fileObj) => {
                const fileRef = ref(storage, `incident-files/${Date.now()}-${fileObj.file.name}`);
                const snapshot = await uploadBytes(fileRef, fileObj.file);
                const downloadURL = await getDownloadURL(snapshot.ref);
                return {
                    name: fileObj.file.name,
                    url: downloadURL,
                    size: fileObj.file.size,
                    type: fileObj.file.type
                };
            });

            formData.fileUrls = await Promise.all(uploadPromises);
        }

        // Save to Firestore
        const docRef = await addDoc(collection(db, 'incident-reports'), formData);
        
        // Generate ticket ID
        const ticketId = `INC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        
        // Send email notification via Formspree
        await fetch('https://formspree.io/f/xkgzaknk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...formData,
                ticketId: ticketId,
                documentId: docRef.id,
                _subject: `New Incident Report: ${ticketId}`,
                _replyto: formData.reporterEmail
            })
        });

        showTicketPreview(ticketId, formData);
        showToast('Incident reported successfully! Ticket created: ' + ticketId);
        
        // Reset form
        document.getElementById('incidentForm').reset();
        clearFiles();
        
    } catch (error) {
        console.error('Error submitting incident:', error);
        showToast('Error submitting incident. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;
    }
}

function showTicketPreview(ticketId, data) {
    document.getElementById('ticketId').textContent = ticketId;
    
    const details = `
        <p><strong>Type:</strong> ${data.incidentType.replace('_', ' ').toUpperCase()}</p>
        <p><strong>Reporter:</strong> ${data.reporterName}</p>
        <p><strong>Priority:</strong> ${data.priority.toUpperCase()}</p>
        <p><strong>Description:</strong> ${data.description}</p>
        ${data.affectedSystems ? `<p><strong>Affected Systems:</strong> ${data.affectedSystems}</p>` : ''}
        ${data.fileUrls.length > 0 ? `<p><strong>Attachments:</strong> ${data.fileUrls.length} file(s)</p>` : ''}
        <p><strong>Created:</strong> ${new Date().toLocaleString()}</p>
    `;
    
    document.getElementById('ticketDetails').innerHTML = details;
    document.getElementById('ticketPreview').style.display = 'block';
    document.getElementById('ticketPreview').scrollIntoView({ behavior: 'smooth' });
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.style.background = type === 'error' 
        ? 'linear-gradient(45deg, #ef4444, #dc2626)' 
        : 'linear-gradient(45deg, #10b981, #059669)';
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 5000);
}

// Make functions globally available
window.showToast = showToast;