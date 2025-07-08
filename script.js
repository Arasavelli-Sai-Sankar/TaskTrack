let assignments = [];
let editingAssignmentId = null;
const API_BASE_URL = 'http://localhost:5000/api';

document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndLoadUser();
    loadAssignments();
    setupEventListeners();
    updateMinDateTime();
});

async function checkAuthAndLoadUser() {
    try {
        const res = await fetch('/api/auth/user', { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            const userWelcome = document.getElementById('userWelcome');
            if (userWelcome) {
                userWelcome.textContent = `Welcome, ${data.user.firstName}!`;
            }
        } else {
            window.location.href = '/login';
        }
    } catch (err) {
        window.location.href = '/login';
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
        });
        showNotification('Logged out successfully!', 'success');
        setTimeout(() => (window.location.href = '/login'), 1000);
    } catch {
        showNotification('Logout failed!', 'error');
    }
}

function setupEventListeners() {
    const assignmentForm = document.getElementById('assignmentForm');
    const editForm = document.getElementById('editForm');
    const editModal = document.getElementById('editModal');

    if (assignmentForm) assignmentForm.addEventListener('submit', handleAssignmentSubmit);
    if (editForm) editForm.addEventListener('submit', handleEditSubmit);

    document.getElementById('statusFilter').addEventListener('change', renderAssignments);
    document.getElementById('sortOrder').addEventListener('change', renderAssignments);
    document.getElementById('closeNotification').addEventListener('click', hideNotification);

    document.querySelectorAll('.close-modal').forEach(btn =>
        btn.addEventListener('click', closeModal)
    );

    editModal?.addEventListener('click', e => {
        if (e.target === editModal) closeModal();
    });

    window.showNotification = (message, type = 'success') => {
        const toast = document.getElementById('notification');
        const msg = document.getElementById('notificationMessage');
        msg.textContent = message;
        toast.className = `notification ${type}`;
        toast.style.display = 'flex';
        setTimeout(() => (toast.style.display = 'none'), 4000);
    };
}

function updateMinDateTime() {
    const now = new Date().toISOString().slice(0, 16);
    document.getElementById('dueDate').min = now;
    document.getElementById('editDueDate').min = now;
}

async function loadAssignments() {
    try {
        const res = await fetch(`${API_BASE_URL}/assignments`, { credentials: 'include' });
        const data = await res.json();
        assignments = data.assignments || [];
        renderAssignments();
    } catch {
        assignments = [];
        renderAssignments();
    }
}

function renderAssignments() {
    const list = document.getElementById('assignmentsList');
    const empty = document.getElementById('emptyState');
    const filtered = filterAndSortAssignments();

    if (filtered.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'block';
    } else {
        list.style.display = 'grid';
        empty.style.display = 'none';
        list.innerHTML = filtered.map(renderAssignmentCard).join('');
    }
}

function filterAndSortAssignments() {
    let result = [...assignments];
    const status = document.getElementById('statusFilter').value;
    const order = document.getElementById('sortOrder').value;

    if (status !== 'all') {
        result = result.filter(a => {
            const overdue = new Date(a.dueDate) < new Date();
            return status === 'completed'
                ? a.completed
                : status === 'pending'
                ? !a.completed && !overdue
                : !a.completed && overdue;
        });
    }

    result.sort((a, b) =>
        order === 'asc'
            ? new Date(a.dueDate) - new Date(b.dueDate)
            : new Date(b.dueDate) - new Date(a.dueDate)
    );

    return result;
}

function renderAssignmentCard(a) {
    const overdue = new Date(a.dueDate) < new Date() && !a.completed;
    const status = a.completed ? 'Completed' : overdue ? 'Overdue' : 'Pending';
    const statusClass = a.completed ? 'completed' : overdue ? 'overdue' : 'pending';

    return `
    <div class="assignment-card ${statusClass}">
        <div class="assignment-header"><h3>${escapeHtml(a.title)}</h3></div>
        <p>${escapeHtml(a.description)}</p>
        <div class="assignment-due-date"><i class="fas fa-calendar-alt"></i> Due: ${new Date(a.dueDate).toLocaleString()}</div>
        <span class="assignment-status status-${statusClass}">${status}</span>
        <div class="assignment-actions">
            <button onclick="toggleComplete('${a._id}')" class="btn ${a.completed ? 'btn-secondary' : 'btn-success'}">
                <i class="fas ${a.completed ? 'fa-undo' : 'fa-check'}"></i> ${a.completed ? 'Mark Pending' : 'Mark Complete'}
            </button>
            <button onclick="editAssignment('${a._id}')" class="btn btn-primary"><i class="fas fa-edit"></i> Edit</button>
            <button onclick="removeAssignment('${a._id}')" class="btn btn-danger"><i class="fas fa-trash"></i> Delete</button>
        </div>
    </div>`;
}

async function handleAssignmentSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!validateForm(form)) return;

    const formData = new FormData(form);
    const data = {
        title: formData.get('title').trim(),
        description: formData.get('description').trim(),
        dueDate: formData.get('dueDate'),
    };

    try {
        const res = await fetch(`${API_BASE_URL}/assignments`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const result = await res.json();
        assignments.push(result.assignment);
        form.reset();
        renderAssignments();
        showNotification('Task added successfully!');
    } catch (err) {
        showNotification('Failed to save task', 'error');
    }
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const form = e.target;
    if (!validateForm(form) || !editingAssignmentId) return;

    const formData = new FormData(form);
    const data = {
        title: formData.get('title').trim(),
        description: formData.get('description').trim(),
        dueDate: formData.get('dueDate'),
    };

    try {
        const res = await fetch(`${API_BASE_URL}/assignments/${editingAssignmentId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const updated = await res.json();
        assignments = assignments.map(a => (a._id === editingAssignmentId ? updated.assignment : a));
        renderAssignments();
        closeModal();
        showNotification('Task updated successfully!');
    } catch {
        showNotification('Update failed', 'error');
    }
}

function validateForm(form) {
    const title = form.querySelector('[name="title"]').value.trim();
    const desc = form.querySelector('[name="description"]').value.trim();
    const due = form.querySelector('[name="dueDate"]').value;
    let valid = true;

    form.querySelectorAll('.error-message').forEach(e => (e.textContent = ''));

    if (!title || title.length < 3) {
        showFieldError(form, 'title', 'Title must be at least 3 characters');
        valid = false;
    }
    if (!desc || desc.length < 10) {
        showFieldError(form, 'description', 'Description must be at least 10 characters');
        valid = false;
    }
    if (!due || new Date(due) <= new Date()) {
        showFieldError(form, 'dueDate', 'Due date must be in the future');
        valid = false;
    }
    return valid;
}

function showFieldError(form, name, msg) {
    const el = form.querySelector(`#${name}Error`) || form.querySelector(`#edit${capitalize(name)}Error`);
    if (el) el.textContent = msg;
}

async function toggleComplete(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/assignments/${id}/toggle`, {
            method: 'PATCH',
            credentials: 'include',
        });
        const result = await res.json();
        assignments = assignments.map(a => (a._id === id ? result.assignment : a));
        renderAssignments();
    } catch {
        showNotification('Error toggling task', 'error');
    }
}

async function removeAssignment(id) {
    if (!confirm('Delete this task?')) return;
    try {
        await fetch(`${API_BASE_URL}/assignments/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        assignments = assignments.filter(a => a._id !== id);
        renderAssignments();
        showNotification('Task deleted successfully!');
    } catch {
        showNotification('Failed to delete task', 'error');
    }
}

function editAssignment(id) {
    const task = assignments.find(a => a._id === id);
    if (!task) return;
    editingAssignmentId = id;

    document.getElementById('editTitle').value = task.title;
    document.getElementById('editDescription').value = task.description;
    document.getElementById('editDueDate').value = new Date(task.dueDate).toISOString().slice(0, 16);

    document.getElementById('editModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editForm').reset();
    editingAssignmentId = null;
}

function hideNotification() {
    document.getElementById('notification').style.display = 'none';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

window.editAssignment = editAssignment;
window.removeAssignment = removeAssignment;
window.toggleComplete = toggleComplete;
window.logout = logout;
