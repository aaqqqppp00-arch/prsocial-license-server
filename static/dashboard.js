let allLicenses = [];
let activeFilter = 'all';
let pendingConfirmCallback = null;

function openConfirmModal({ title, icon, message, key, subtext, btnText, isDanger, onConfirm }) {
    const titleEl = document.getElementById('confirmModalTitle');
    const iconEl = document.getElementById('confirmModalIcon');
    const msgEl = document.getElementById('confirmModalMessage');
    const keyBox = document.getElementById('confirmModalKeyBox');
    const keyEl = document.getElementById('confirmModalKeyCode');
    const subtextEl = document.getElementById('confirmModalSubtext');
    const actionBtn = document.getElementById('confirmModalActionBtn');

    if (titleEl) titleEl.innerText = title || 'تأكيد الإجراء';
    if (iconEl) iconEl.innerText = icon || '⚠️';
    if (msgEl) msgEl.innerText = message || '';

    if (key && keyEl && keyBox) {
        keyEl.innerText = key;
        keyBox.style.display = 'block';
    } else if (keyBox) {
        keyBox.style.display = 'none';
    }

    if (subtextEl) subtextEl.innerText = subtext || '';

    if (actionBtn) {
        actionBtn.innerText = btnText || 'تأكيد التنفيذ';
        if (isDanger) {
            actionBtn.style.background = '#DC2626';
            actionBtn.style.color = '#FFFFFF';
        } else {
            actionBtn.style.background = 'var(--accent-orange)';
            actionBtn.style.color = '#1A1B22';
        }
    }

    pendingConfirmCallback = onConfirm;
    const modal = document.getElementById('confirmModal');
    if (modal) modal.style.display = 'flex';
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.style.display = 'none';
    pendingConfirmCallback = null;
}

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadLicenses();
    loadTelemetry();

    // Auto-refresh telemetry & online status every 15 seconds
    setInterval(() => {
        loadStats();
        loadLicenses(true);
        loadTelemetry(true);
    }, 15000);

    // Confirmation Modal Action Button
    const confirmBtn = document.getElementById('confirmModalActionBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (pendingConfirmCallback) {
                const cb = pendingConfirmCallback;
                closeConfirmModal();
                cb();
            }
        });
    }

    // Event listeners
    const btnGen = document.getElementById('btnGenerateKey');
    if (btnGen) btnGen.addEventListener('click', generateKey);

    const btnRefList = document.getElementById('btnRefreshList');
    if (btnRefList) btnRefList.addEventListener('click', () => loadLicenses());

    const btnRefTelem = document.getElementById('btnRefreshTelemetry');
    if (btnRefTelem) btnRefTelem.addEventListener('click', () => loadTelemetry());

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', handleSearch);

    // Filter tabs
    document.querySelectorAll('.filter-tab, .filter-tab-btn').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-tab, .filter-tab-btn').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeFilter = e.currentTarget.getAttribute('data-filter');
            renderLicensesTable();
        });
    });
});

function showToast(msg) {
    const toast = document.getElementById('adminToast');
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3500);
}

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (data.success) {
            document.getElementById('statTotal').innerText = data.total ?? 0;
            document.getElementById('statOnline').innerText = data.active ?? 0;
            document.getElementById('statRevoked').innerText = data.revoked ?? 0;
            document.getElementById('statMultiDevice').innerText = data.multi_device ?? 0;
        }
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

async function loadLicenses(silent = false) {
    const tbody = document.getElementById('licensesTableBody');
    if (!tbody) return;
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading-td">جاري تحميل وتحديث المفاتيح من السيرفر...</td></tr>';
    }

    try {
        const res = await fetch('/api/admin/licenses');
        const data = await res.json();
        if (data.success) {
            allLicenses = data.licenses || [];
            renderLicensesTable();
        } else {
            if (!silent) tbody.innerHTML = '<tr><td colspan="10" class="loading-td">تعذر جلب البيانات.</td></tr>';
        }
    } catch (e) {
        console.error('Failed to load licenses:', e);
        if (!silent) tbody.innerHTML = '<tr><td colspan="10" class="loading-td">خطأ في الاتصال بقاعدة البيانات.</td></tr>';
    }
}

function handleSearch(e) {
    renderLicensesTable();
}

function renderLicensesTable() {
    const tbody = document.getElementById('licensesTableBody');
    if (!tbody) return;
    const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

    let filtered = allLicenses.filter(item => {
        // Tab filtering
        if (activeFilter === 'active' && item.status !== 'active') return false;
        if (activeFilter === 'app' && (item.client_type || 'app') !== 'app') return false;
        if (activeFilter === 'script' && item.client_type !== 'script') return false;
        if (activeFilter === 'revoked' && (item.status !== 'revoked' && item.status !== 'blocked')) return false;
        if (activeFilter === 'fraud' && !item.multi_device_detected) return false;

        // Search filtering
        if (query) {
            const matchKey = (item.key || '').toLowerCase().includes(query);
            const matchDev = (item.bound_device_id || '').toLowerCase().includes(query);
            const matchModel = (item.device_model || '').toLowerCase().includes(query);
            const matchIp = (item.bound_ip || '').toLowerCase().includes(query);
            const matchLoc = (item.location || '').toLowerCase().includes(query);
            return matchKey || matchDev || matchModel || matchIp || matchLoc;
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading-td">لا توجد أي مفاتيح ترخيص حالياً - يمكنك إنشاء مفتاح جديد من الأعلى للبدء من الصفر.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        let statusBadge = '';
        if (item.status === 'active') statusBadge = '<span class="badge-chip chip-active">نشط (Active)</span>';
        else if (item.status === 'revoked') statusBadge = '<span class="badge-chip chip-revoked">ملغى (Revoked)</span>';
        else if (item.status === 'blocked') statusBadge = '<span class="badge-chip chip-blocked">محظور (Blocked)</span>';
        else if (item.status === 'expired') statusBadge = '<span class="badge-chip chip-expired">منتهي (Expired)</span>';

        const testedBadge = item.is_tested
            ? '<span class="badge-chip chip-online">تمت التجربة</span>'
            : '<span class="badge-chip chip-offline">جديد لم يُجرب</span>';

        const onlineBadge = item.is_online
            ? '<span class="badge-chip chip-online">🟢 متصل الآن</span>'
            : `<span class="badge-chip chip-offline">⚫ غير متصل (${item.last_heartbeat ? item.last_heartbeat.split(' ')[1] || item.last_heartbeat : 'لم يتصل'})</span>`;

        const fraudWarning = item.multi_device_detected
            ? '<span class="badge-chip chip-fraud" title="تم فتح المفتاح على أكثر من جهاز عتادي!">⚠️ تعدد أجهزة!</span>'
            : '';

        const deviceDisplay = item.bound_device_id
            ? `<strong>${item.device_model || 'Android'}</strong><br><code style="font-family:monospace; font-size:11px; background:#F3F4F7; padding:2px 4px; border:1px solid #1A1B22;">${item.bound_device_id.substring(0, 14)}...</code>`
            : '<span style="color:#9CA3AF;">غير مربوط بجهاز</span>';

        const netDisplay = item.bound_ip
            ? `<span style="font-family:monospace; font-size:12px; font-weight:700;">${item.bound_ip}</span><br><span style="font-size:11px; color:#4A4D5A;">[${item.connection_type || 'WiFi'}]</span>`
            : '<span style="color:#9CA3AF;">--</span>';

        const clientBadge = (item.client_type === 'script')
            ? '<span class="badge-chip" style="background:#EDE9FE; color:#6D28D9; border:1px solid #C4B5FD;">💻 ويندوز / سكربت</span>'
            : '<span class="badge-chip" style="background:#E0F2FE; color:#0369A1; border:1px solid #BAE6FD;">📱 تطبيق أندرويد</span>';

        return `
            <tr>
                <td>
                    <code style="font-family:monospace; font-size:13px; font-weight:700; background:#F3F4F7; padding:2px 6px; border:1px solid #1A1B22; display:inline-block; margin-bottom:4px;">${item.key}</code>
                    <br>
                    <button class="btn-action-small" onclick="copyKey('${item.key}')">نسخ 📋</button>
                    ${fraudWarning}
                </td>
                <td>${clientBadge}</td>
                <td>${statusBadge}</td>
                <td>
                    <strong>${formatDuration(item.duration_type)}</strong>
                    <div style="font-size:11px; color:#4A4D5A;">ينتهي: ${item.expires_at}</div>
                </td>
                <td>${testedBadge}</td>
                <td>${onlineBadge}</td>
                <td>${deviceDisplay}</td>
                <td>${netDisplay}</td>
                <td>
                    <span style="font-size:12px; font-weight:600;">${item.location || 'غير محدد'}</span>
                </td>
                <td>
                    <div class="action-btn-group">
                        <button class="btn-action-small" onclick="showKeyDetails('${item.key}')">تفاصيل</button>
                        ${item.status === 'active' ? `
                            <button class="btn-action-small btn-action-revoke" onclick="revokeKey('${item.key}')">إلغاء</button>
                            <button class="btn-action-small btn-action-revoke" onclick="blockKey('${item.key}')">حظر</button>
                        ` : `
                            <button class="btn-action-small btn-action-activate" onclick="activateKey('${item.key}')">تنشيط</button>
                        `}
                        <button class="btn-action-small btn-action-delete" onclick="deleteKey('${item.key}')">حذف</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function formatDuration(type) {
    if (type === 'week') return 'أسبوع (7 أيام)';
    if (type === 'month') return 'شهر (30 يوم)';
    if (type === 'quarter') return '3 شهور (90 يوم)';
    if (type === 'year') return 'سنة (365 يوم)';
    return 'مدى الحياة (Lifetime)';
}

function copyKey(key) {
    navigator.clipboard.writeText(key);
    showToast(`تم نسخ المفتاح إلى الحافظة: ${key}`);
}

function copyNewKey() {
    const key = document.getElementById('newKeyCode').innerText;
    navigator.clipboard.writeText(key);
    showToast(`تم نسخ المفتاح المنشأ حديثاً: ${key}`);
}

async function generateKey() {
    const duration = document.getElementById('selectDuration').value;
    const clientType = document.getElementById('selectClientType') ? document.getElementById('selectClientType').value : 'app';
    const btn = document.getElementById('btnGenerateKey');
    btn.disabled = true;
    btn.innerHTML = '<span>جاري التوليد والحفظ في السيرفر...</span>';

    try {
        const res = await fetch('/api/admin/licenses/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duration, client_type: clientType })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('newKeyCode').innerText = data.key;
            document.getElementById('newKeyMeta').innerText = `(${data.duration_label} - ينتهي: ${data.expires_at} - ${data.client_type === 'script' ? 'ويندوز/سكربت' : 'أندرويد'})`;
            document.getElementById('newKeyBanner').style.display = 'flex';
            showToast(data.message);
            loadStats();
            loadLicenses();
        } else {
            alert(data.message || 'فشل توليد المفتاح');
        }
    } catch (e) {
        alert('خطأ في الاتصال بالسيرفر أثناء التوليد');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1A1B22" aria-hidden="true">
                <path d="M13 2L5 13.5h6L10 22l9-12h-6z"></path>
            </svg>
            <span>توليد وحفظ المفتاح فوراً</span>
        `;
    }
}

function revokeKey(key) {
    openConfirmModal({
        title: 'إلغاء الترخيص وإيقاف الجلسة',
        icon: '🛑',
        message: 'هل أنت متأكد من إلغاء الترخيص لهذا المفتاح؟',
        key: key,
        subtext: '⚠️ سيتم إيقاف المحرك والبوت فوراً على جهاز المستخدم بمجرد التحقق!',
        btnText: 'تأكيد الإلغاء (Revoke)',
        isDanger: true,
        onConfirm: async () => {
            try {
                const res = await fetch('/api/admin/licenses/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key })
                });
                const data = await res.json();
                showToast(data.message || 'تم إلغاء الترخيص بنجاح');
                loadStats();
                loadLicenses();
            } catch (e) {
                showToast('خطأ أثناء إلغاء الترخيص');
            }
        }
    });
}

function blockKey(key) {
    openConfirmModal({
        title: 'حظر المفتاح والعتاد المربوط',
        icon: '🚫',
        message: 'هل أنت متأكد من حظر هذا المفتاح والعتاد المسجل عليه؟',
        key: key,
        subtext: '⛔ لن يُسمح لهذا الجهاز أو المفتاح بالدخول أو العمل مطلقاً حتى يتم فك الحظر!',
        btnText: 'تأكيد الحظر الشامل (Block)',
        isDanger: true,
        onConfirm: async () => {
            try {
                const res = await fetch('/api/admin/licenses/block', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key })
                });
                const data = await res.json();
                showToast(data.message || 'تم حظر المفتاح والعتاد بنجاح');
                loadStats();
                loadLicenses();
            } catch (e) {
                showToast('خطأ أثناء حظر المفتاح');
            }
        }
    });
}

function activateKey(key) {
    openConfirmModal({
        title: 'تنشيط مفتاح الترخيص',
        icon: '✅',
        message: 'سيتم إعادة تفعيل هذا المفتاح ليتمكن المستخدم من استئناف العمل.',
        key: key,
        subtext: '💡 سيتم فك ربط العتاد تلقائياً للسماح بتفعيله على أي جهاز جديد.',
        btnText: 'تنشيط المفتاح الآن',
        isDanger: false,
        onConfirm: async () => {
            try {
                const res = await fetch('/api/admin/licenses/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key, reset_device: true })
                });
                const data = await res.json();
                showToast(data.message || 'تم تنشيط المفتاح بنجاح');
                loadStats();
                loadLicenses();
            } catch (e) {
                showToast('خطأ أثناء تنشيط المفتاح');
            }
        }
    });
}

function deleteKey(key) {
    openConfirmModal({
        title: 'حذف الترخيص نهائياً',
        icon: '🗑️',
        message: 'هل تريد حذف هذا المفتاح وسجلاته بالكامل من قاعدة البيانات؟',
        key: key,
        subtext: '⚠️ هذا الإجراء نهائي ولا يمكن التراجع عنه بعد تنفيذه!',
        btnText: 'حذف نهائي من السيرفر',
        isDanger: true,
        onConfirm: async () => {
            try {
                const res = await fetch('/api/admin/licenses/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key })
                });
                const data = await res.json();
                showToast(data.message || 'تم حذف المفتاح نهائياً');
                loadStats();
                loadLicenses();
            } catch (e) {
                showToast('خطأ أثناء حذف المفتاح');
            }
        }
    });
}

function showKeyDetails(key) {
    const item = allLicenses.find(l => l.key === key);
    if (!item) return;

    document.getElementById('modalTitle').innerText = `تفاصيل العتاد والتتبع للمفتاح: ${item.key}`;
    const body = document.getElementById('modalBody');
    body.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px; font-size:14px;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">مفتاح الترخيص:</span>
                <code style="font-family:monospace; font-weight:800; background:#F3F4F7; padding:2px 8px; border:1px solid #1A1B22;">${item.key}</code>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">الحالة والصلاحية:</span>
                <span><strong>${item.status}</strong> (${formatDuration(item.duration_type)}) - ينتهي: ${item.expires_at}</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">نوع العميل المخصص:</span>
                <span>${item.client_type === 'script' ? '💻 ويندوز / سكربت' : '📱 تطبيق أندرويد'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">معرف الجهاز (Device ID):</span>
                <code style="font-family:monospace; font-size:12px; background:#F3F4F7; padding:2px 6px;">${item.bound_device_id || 'غير مربوط حتى الآن'}</code>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">موديل الهاتف والعتاد:</span>
                <span><strong>${item.device_model || 'Unknown'}</strong></span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">نوع الاتصال بالإنترنت:</span>
                <span><strong>${item.connection_type || 'WiFi'}</strong></span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">عنوان IP والموقع:</span>
                <span>${item.bound_ip || 'غير معروف'} - <em>${item.location || 'غير محدد'}</em></span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">إصدار Android WebView:</span>
                <span>${item.webview_version || 'Android System WebView'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">بصمة المتصفح (Fingerprint):</span>
                <code style="font-family:monospace; font-size:11px; max-width:280px; overflow:hidden; text-overflow:ellipsis; display:inline-block;">${item.browser_fingerprint || 'غير متوفرة'}</code>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">عدد مرات التفعيل (Activations):</span>
                <span>${item.activation_count || 0} مرات</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #E5E7EB; padding-bottom:8px;">
                <span style="font-weight:700; color:#4A4D5A;">آخر Heartbeat مسجل:</span>
                <span>${item.last_heartbeat || 'لم يتصل بعد'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding-top:4px;">
                <span style="font-weight:700; color:#4A4D5A;">تنبيه الاحتيال وتعدد الأجهزة:</span>
                <span>${item.multi_device_detected ? '<span style="color:#DC2626; font-weight:800;">⚠️ تم رصد محاولة تشغيل على أكثر من جهاز!</span>' : '<span style="color:#16A34A; font-weight:700;">✔ آمن - مربوط بجهاز واحد فقط</span>'}</span>
            </div>
        </div>
    `;
    document.getElementById('detailsModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('detailsModal').style.display = 'none';
}

async function loadTelemetry(silent = false) {
    const tbody = document.getElementById('telemetryTableBody');
    if (!tbody) return;
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-td">جاري تحديث سجل التتبع اللحظي...</td></tr>';
    }

    try {
        const res = await fetch('/api/admin/telemetry');
        const data = await res.json();
        if (data.success && data.logs && data.logs.length > 0) {
            tbody.innerHTML = data.logs.map(log => {
                const clientTypeBadge = (log.client_type === 'script')
                    ? '<span class="badge-chip" style="background:#EDE9FE; color:#6D28D9; font-size:11px;">💻 سكربت</span>'
                    : '<span class="badge-chip" style="background:#E0F2FE; color:#0369A1; font-size:11px;">📱 تطبيق</span>';

                return `
                    <tr>
                        <td style="font-size:12px; font-weight:600; white-space:nowrap;">${log.created_at || '--'}</td>
                        <td>${clientTypeBadge}</td>
                        <td><span class="badge-chip ${log.event_type.includes('verify') ? 'chip-active' : 'chip-offline'}">${log.event_type}</span></td>
                        <td><code style="font-family:monospace; font-size:12px; background:#F3F4F7; padding:2px 4px; border:1px solid #1A1B22;">${(log.license_key || '').substring(0, 14)}...</code></td>
                        <td><strong>${log.device_model || 'Android'}</strong></td>
                        <td><span class="badge-chip ${log.connection_type === 'WiFi' ? 'chip-active' : 'chip-expired'}">${log.connection_type || 'WiFi'}</span></td>
                        <td><strong>${log.ip || '--'}</strong><br><span style="font-size:11px; color:#4A4D5A;">(${log.location || 'Local'})</span></td>
                        <td><span style="font-size:11.5px;">${log.webview_version || 'WebView'}</span></td>
                        <td><code style="font-family:monospace; font-size:10px; max-width:140px; overflow:hidden; text-overflow:ellipsis; display:inline-block;">${(log.browser_fingerprint || '--').substring(0, 16)}</code></td>
                    </tr>
                `;
            }).join('');
        } else {
            if (!silent) tbody.innerHTML = '<tr><td colspan="9" class="loading-td">السجل فارغ حالياً - سيتم تسجيل أي اتصال جديد فور تشغيل التطبيق أو الاسكربت.</td></tr>';
        }
    } catch (e) {
        console.error('Failed to load telemetry:', e);
        if (!silent) tbody.innerHTML = '<tr><td colspan="9" class="loading-td">تعذر جلب سجل التتبع.</td></tr>';
    }
}

function openAdminSecurityModal() {
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('pwdErrorMsg').style.display = 'none';
    document.getElementById('pwdSuccessMsg').style.display = 'none';
    document.getElementById('adminSecurityModal').style.display = 'flex';
}

function closeAdminSecurityModal() {
    document.getElementById('adminSecurityModal').style.display = 'none';
}

async function handlePasswordChange(e) {
    e.preventDefault();
    const curPass = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;
    const errBox = document.getElementById('pwdErrorMsg');
    const successBox = document.getElementById('pwdSuccessMsg');
    const submitBtn = document.getElementById('btnSubmitPassword');

    errBox.style.display = 'none';
    successBox.style.display = 'none';

    if (newPass !== confirmPass) {
        errBox.innerText = 'كلمة المرور الجديدة وتأكيدها غير متطابقين!';
        errBox.style.display = 'block';
        return;
    }

    if (newPass.length < 6) {
        errBox.innerText = 'كلمة المرور الجديدة يجب أن تحتوي على 6 أحرف على الأقل!';
        errBox.style.display = 'block';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'جاري التحديث والتشفير...';

    try {
        const res = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password: curPass, new_password: newPass })
        });
        const data = await res.json();
        if (data.success) {
            successBox.innerText = data.message;
            successBox.style.display = 'block';
            showToast('✔ تم تحديث كلمة مرور الأدمن وتشفيرها بنجاح!');
            setTimeout(() => {
                closeAdminSecurityModal();
            }, 1800);
        } else {
            errBox.innerText = data.message || 'فشل تحديث كلمة المرور';
            errBox.style.display = 'block';
        }
    } catch (err) {
        errBox.innerText = 'حدث خطأ في الاتصال بالسيرفر';
        errBox.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'تحديث وتشفير كلمة المرور فوراً';
    }
}

// --- Script Release & Version Management ---
async function loadScriptVersionConfig() {
    try {
        const res = await fetch('/api/admin/script/config');
        const data = await res.json();
        if (data.success && data.config) {
            const cfg = data.config;
            const lbl = document.getElementById('lblCurrentVer');
            if (lbl) {
                lbl.innerText = `v${cfg.version_name || '2.0.0'} (Build ${cfg.version_code || 200})${cfg.update_required ? ' [إلزامي]' : ''}`;
            }
            const vcInput = document.getElementById('scVersionCode');
            if (vcInput && !vcInput.dataset.touched) {
                vcInput.value = (cfg.version_code || 200) + 1;
            }
            const vnInput = document.getElementById('scVersionName');
            if (vnInput && !vnInput.dataset.touched) {
                const parts = (cfg.version_name || '2.0.0').split('.');
                if (parts.length === 3) {
                    vnInput.value = `${parts[0]}.${parts[1]}.${parseInt(parts[2]) + 1}`;
                }
            }
            const enf = document.getElementById('scEnforce');
            if (enf) enf.checked = cfg.update_required !== false;
            const notes = document.getElementById('scNotes');
            if (notes && !notes.dataset.touched && cfg.release_notes) {
                notes.value = cfg.release_notes;
            }
        }
    } catch(e) {
        console.error("Error loading script version config:", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadScriptVersionConfig();

    const form = document.getElementById('scriptPublishForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnPublishUpdate');
            btn.disabled = true;
            btn.innerText = 'جاري النشر والتشفير...';

            const formData = new FormData();
            formData.append('version_code', document.getElementById('scVersionCode').value);
            formData.append('version_name', document.getElementById('scVersionName').value);
            formData.append('release_notes', document.getElementById('scNotes').value);
            formData.append('enforce_update', document.getElementById('scEnforce').checked ? 'true' : 'false');

            const fileInput = document.getElementById('scFile');
            if (fileInput && fileInput.files[0]) {
                formData.append('script_file', fileInput.files[0]);
            }

            try {
                const res = await fetch('/api/admin/script/publish', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    showToast('🚀 ' + data.message);
                    loadScriptVersionConfig();
                    if (fileInput) fileInput.value = '';
                } else {
                    alert('خطأ: ' + (data.message || 'فشل نشر التحديث'));
                }
            } catch(err) {
                alert('خطأ في الاتصال: ' + err.toString());
            } finally {
                btn.disabled = false;
                btn.innerText = '🚀 نشر وتعميم التحديث (Broadcast Update)';
            }
        });
    }
});
