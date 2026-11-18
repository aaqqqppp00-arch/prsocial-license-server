let allLicenses = [];
let activeFilter = 'all';

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

    // Event listeners
    document.getElementById('btnGenerateKey').addEventListener('click', generateKey);
    document.getElementById('btnRefreshList').addEventListener('click', () => loadLicenses());
    document.getElementById('btnRefreshTelemetry').addEventListener('click', () => loadTelemetry());
    document.getElementById('searchInput').addEventListener('input', handleSearch);

    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            activeFilter = e.target.getAttribute('data-filter');
            renderLicensesTable();
        });
    });
});

function showToast(msg) {
    const toast = document.getElementById('adminToast');
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
            document.getElementById('statTotal').innerText = data.total;
            document.getElementById('statOnline').innerText = data.active;
            document.getElementById('statRevoked').innerText = data.revoked;
            document.getElementById('statMultiDevice').innerText = data.multi_device;
        }
    } catch (e) {
        console.error('Failed to load stats:', e);
    }
}

async function loadLicenses(silent = false) {
    const tbody = document.getElementById('licensesTableBody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-td">جاري تحميل وتحديث المفاتيح من السيرفر...</td></tr>';
    }

    try {
        const res = await fetch('/api/admin/licenses');
        const data = await res.json();
        if (data.success) {
            allLicenses = data.licenses || [];
            renderLicensesTable();
        } else {
            if (!silent) tbody.innerHTML = '<tr><td colspan="9" class="loading-td">تعذر جلب البيانات.</td></tr>';
        }
    } catch (e) {
        console.error('Failed to load licenses:', e);
        if (!silent) tbody.innerHTML = '<tr><td colspan="9" class="loading-td">خطأ في الاتصال بقاعدة البيانات.</td></tr>';
    }
}

function handleSearch(e) {
    renderLicensesTable();
}

function renderLicensesTable() {
    const tbody = document.getElementById('licensesTableBody');
    const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();

    let filtered = allLicenses.filter(item => {
        // Tab filtering
        if (activeFilter === 'active' && item.status !== 'active') return false;
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
        tbody.innerHTML = '<tr><td colspan="9" class="loading-td">لا توجد مفاتيح مطابقة للمعايير المحددة.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        let statusBadge = '';
        if (item.status === 'active') statusBadge = '<span class="badge badge-active">نشط (Active)</span>';
        else if (item.status === 'revoked') statusBadge = '<span class="badge badge-revoked">ملغى (Revoked)</span>';
        else if (item.status === 'blocked') statusBadge = '<span class="badge badge-blocked">محظور (Blocked)</span>';
        else if (item.status === 'expired') statusBadge = '<span class="badge badge-expired">منتهي (Expired)</span>';

        const testedBadge = item.is_tested
            ? '<span class="badge badge-online">تمت التجربة</span>'
            : '<span class="badge badge-offline">جديد لم يُجرب</span>';

        const onlineBadge = item.is_online
            ? '<span class="badge badge-online">🟢 متصل الآن</span>'
            : `<span class="badge badge-offline">⚫ غير متصل (${item.last_heartbeat ? item.last_heartbeat.split(' ')[1] || item.last_heartbeat : 'لم يتصل'})</span>`;

        const fraudWarning = item.multi_device_detected
            ? '<span class="badge badge-fraud" title="تم فتح المفتاح على أكثر من جهاز عتادي!">⚠️ تعدد أجهزة!</span>'
            : '';

        const deviceDisplay = item.bound_device_id
            ? `<strong>${item.device_model || 'Android'}</strong><br><code class="code-snippet">${item.bound_device_id.substring(0, 14)}...</code>`
            : '<span style="color:#9CA3AF;">غير مربوط بجهاز</span>';

        const netDisplay = item.bound_ip
            ? `<span style="font-family:monospace;">${item.bound_ip}</span><br><span style="font-size:11px; color:#4B5563;">[${item.connection_type || 'WiFi'}]</span>`
            : '<span style="color:#9CA3AF;">--</span>';

        return `
            <tr>
                <td>
                    <code class="code-snippet">${item.key}</code>
                    <button class="btn btn-outline btn-sm" style="padding: 2px 6px; font-size:11px;" onclick="copyKey('${item.key}')">نسخ</button>
                    ${fraudWarning}
                </td>
                <td>${statusBadge}</td>
                <td>
                    <strong>${formatDuration(item.duration_type)}</strong><br>
                    <span style="font-size:11px; color:#6B7280;">ينتهي: ${item.expires_at}</span>
                </td>
                <td>${testedBadge}</td>
                <td>${onlineBadge}</td>
                <td>${deviceDisplay}</td>
                <td>${netDisplay}</td>
                <td>${item.location || 'غير محدد'}</td>
                <td>
                    <div class="table-ops">
                        <button class="btn btn-outline btn-sm" onclick="showKeyDetails('${item.key}')">التفاصيل 🔍</button>
                        ${item.status === 'active' ? `
                            <button class="btn btn-outline btn-sm" style="color:#DC2626; border-color:#FCA5A5;" onclick="revokeKey('${item.key}')">إلغاء</button>
                            <button class="btn btn-danger btn-sm" onclick="blockKey('${item.key}')">حظر</button>
                        ` : `
                            <button class="btn btn-primary btn-sm" onclick="activateKey('${item.key}')">تنشيط</button>
                        `}
                        <button class="btn btn-outline btn-sm" style="color:#991B1B;" onclick="deleteKey('${item.key}')">حذف</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function formatDuration(type) {
    if (type === 'week') return 'أسبوع (7 أيام)';
    if (type === 'month') return 'شهر (30 يوم)';
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
    const btn = document.getElementById('btnGenerateKey');
    btn.disabled = true;
    btn.innerText = 'جاري التوليد والحفظ في السيرفر...';

    try {
        const res = await fetch('/api/admin/licenses/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duration })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('newKeyCode').innerText = data.key;
            document.getElementById('newKeyMeta').innerText = `(${data.duration_label} - ينتهي: ${data.expires_at})`;
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
        btn.innerHTML = '<span>⚡</span><span>توليد وحفظ المفتاح فوراً</span>';
    }
}

async function revokeKey(key) {
    if (!confirm(`هل أنت متأكد من إلغاء الترخيص للمفتاح:\n${key}\nسيتم قفل التطبيق فوراً عند المستخدم!`)) return;
    try {
        const res = await fetch('/api/admin/licenses/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        showToast(data.message);
        loadStats();
        loadLicenses();
    } catch (e) {
        alert('خطأ أثناء إلغاء الترخيص');
    }
}

async function blockKey(key) {
    if (!confirm(`تحذير: هل أنت متأكد من حظر المفتاح والجهاز المربوط:\n${key}\nلن يُسمح لهذا الجهاز أو المفتاح بالدخول مطلقاً!`)) return;
    try {
        const res = await fetch('/api/admin/licenses/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        showToast(data.message);
        loadStats();
        loadLicenses();
    } catch (e) {
        alert('خطأ أثناء حظر المفتاح');
    }
}

async function activateKey(key) {
    const resetDevice = confirm(`هل ترغب في فك ربط العتاد (Reset Device ID) أيضاً مع التنشيط؟\n\nاضغط "موافق" لفك ربط العتاد والسماح بتفعيله على جهاز جديد.\nاضغط "إلغاء" للتنشيط على نفس الجهاز السابق فقط.`);
    try {
        const res = await fetch('/api/admin/licenses/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, reset_device: resetDevice })
        });
        const data = await res.json();
        showToast(data.message);
        loadStats();
        loadLicenses();
    } catch (e) {
        alert('خطأ أثناء تنشيط المفتاح');
    }
}

async function deleteKey(key) {
    if (!confirm(`⚠️ تحذير نهائي: هل تريد حذف المفتاح:\n${key}\nوسجلاته بالكامل من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء!`)) return;
    try {
        const res = await fetch('/api/admin/licenses/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        showToast(data.message);
        loadStats();
        loadLicenses();
    } catch (e) {
        alert('خطأ أثناء حذف المفتاح');
    }
}

function showKeyDetails(key) {
    const item = allLicenses.find(l => l.key === key);
    if (!item) return;

    document.getElementById('modalTitle').innerText = `تفاصيل العتاد والتتبع للمفتاح: ${item.key}`;
    const body = document.getElementById('modalBody');
    body.innerHTML = `
        <div class="detail-row">
            <div class="detail-label">مفتاح الترخيص:</div>
            <div class="detail-val"><code class="code-snippet">${item.key}</code></div>
        </div>
        <div class="detail-row">
            <div class="detail-label">الحالة والصلاحية:</div>
            <div class="detail-val">${item.status} (${formatDuration(item.duration_type)}) - ينتهي: ${item.expires_at}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">معرف الجهاز (Device ID):</div>
            <div class="detail-val"><code class="code-snippet">${item.bound_device_id || 'غير مربوط'}</code></div>
        </div>
        <div class="detail-row">
            <div class="detail-label">موديل الهاتف والعتاد:</div>
            <div class="detail-val"><strong>${item.device_model || 'Unknown'}</strong></div>
        </div>
        <div class="detail-row">
            <div class="detail-label">نوع الاتصال بالإنترنت:</div>
            <div class="detail-val"><strong>${item.connection_type || 'WiFi'}</strong></div>
        </div>
        <div class="detail-row">
            <div class="detail-label">عنوان IP والموقع:</div>
            <div class="detail-val">${item.bound_ip || 'غير معروف'} - <em>${item.location || 'غير محدد'}</em></div>
        </div>
        <div class="detail-row">
            <div class="detail-label">إصدار Android WebView:</div>
            <div class="detail-val">${item.webview_version || 'Android System WebView'}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">بصمة المتصفح (Fingerprint):</div>
            <div class="detail-val"><code class="code-snippet">${item.browser_fingerprint || 'غير متوفرة'}</code></div>
        </div>
        <div class="detail-row">
            <div class="detail-label">عنوان العتاد (MAC / UID):</div>
            <div class="detail-val"><code class="code-snippet">${item.mac_address || 'محمي بواسطة أندرويد'}</code></div>
        </div>
        <div class="detail-row">
            <div class="detail-label">عدد مرات التفعيل (Activations):</div>
            <div class="detail-val">${item.activation_count} مرات</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">آخر Heartbeat مسجل:</div>
            <div class="detail-val">${item.last_heartbeat || 'لم يتصل بعد'}</div>
        </div>
        <div class="detail-row">
            <div class="detail-label">تنبيه الاحتيال وتعدد الأجهزة:</div>
            <div class="detail-val">${item.multi_device_detected ? '<span style="color:#DC2626; font-weight:bold;">⚠️ تم رصد محاولة تشغيل على أكثر من جهاز!</span>' : '<span style="color:#16A34A;">✔ آمن - مربوط بجهاز واحد فقط</span>'}</div>
        </div>
    `;

    document.getElementById('detailsModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('detailsModal').style.display = 'none';
}

async function loadTelemetry(silent = false) {
    const tbody = document.getElementById('telemetryTableBody');
    if (!silent) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-td">جاري تحديث سجل التتبع اللحظي...</td></tr>';
    }

    try {
        const res = await fetch('/api/admin/telemetry');
        const data = await res.json();
        if (data.success && data.logs && data.logs.length > 0) {
            tbody.innerHTML = data.logs.map(log => `
                <tr>
                    <td style="font-size:11px; white-space:nowrap;">${log.created_at || '--'}</td>
                    <td><span class="badge ${log.event_type.includes('verify') ? 'badge-active' : 'badge-offline'}">${log.event_type}</span></td>
                    <td><code class="code-snippet">${(log.license_key || '').substring(0, 14)}...</code></td>
                    <td><strong>${log.device_model || 'Android'}</strong></td>
                    <td><span class="badge ${log.connection_type === 'WiFi' ? 'badge-active' : 'badge-warning'}">${log.connection_type || 'WiFi'}</span></td>
                    <td>${log.ip || '--'} (${log.location || 'Local'})</td>
                    <td><span style="font-size:11px;">${log.webview_version || 'WebView'}</span></td>
                    <td><code class="code-snippet" style="font-size:10px;">${(log.browser_fingerprint || '--').substring(0, 16)}</code></td>
                </tr>
            `).join('');
        } else {
            if (!silent) tbody.innerHTML = '<tr><td colspan="8" class="loading-td">لا توجد سجلات تتبع حتى الآن.</td></tr>';
        }
    } catch (e) {
        console.error('Failed to load telemetry:', e);
        if (!silent) tbody.innerHTML = '<tr><td colspan="8" class="loading-td">تعذر جلب سجل التتبع.</td></tr>';
    }
}
