const { useEffect, useMemo, useRef, useState } = React;

/* =========================
BACKEND CONFIG
========================= */
const API_BASE = (window.ST?.API_BASE || "https://api.strategythrust.com").replace(/\/+$/,"");

// ✅ SPA path: /auth/verify 404 fix: Pages will serve index.html; we still must parse token from URL
// Cloudflare Pages needs _redirects in root: /* /index.html 200

const ROUTES = {
  health: "/health",
  requestLink: "/auth/request-link",
  verify: "/auth/verify",
  access: "/access",

  uploadsInit: "/uploads/init",
  uploadsPut: "/uploads/put",
  uploadsList: "/uploads/list",

  jobsSubmit: "/jobs/submit",
  jobsStatus: "/jobs/status",
  jobsDownload: "/jobs/download",

  adminApprove: "/admin/approve",
  adminJobs: "/admin/jobs",
  chat: "/chat",
};

const JOB_TYPES = {
  SECTOR_REPORT: "sector_report",
  COMPANY_ANALYSIS: "company_analysis",
  MASTER_PLAN: "strategic_master_plan",
};

const LS_KEYS = {
  session: "st_session_v4", // { email, access, app_url, verified_at, session_token }
  sessionToken: "st_session_token_v1", // session token from backend
  autoDownload: "st_auto_download_v1",
};

/* =========================
Storage
========================= */
function safeJsonParse(raw) { try { return JSON.parse(raw); } catch { return null; } }
function loadSession() { try { return safeJsonParse(localStorage.getItem(LS_KEYS.session) || ""); } catch { return null; } }
function saveSession(sess) { try { localStorage.setItem(LS_KEYS.session, JSON.stringify(sess)); } catch {} }
function clearSession() { try { localStorage.removeItem(LS_KEYS.session); } catch {} }

function loadSessionToken() { try { return localStorage.getItem(LS_KEYS.sessionToken) || null; } catch { return null; } }
function saveSessionToken(t) { if (!t) return; try { localStorage.setItem(LS_KEYS.sessionToken, t); } catch {} }
function clearSessionToken() { try { localStorage.removeItem(LS_KEYS.sessionToken); } catch {} }

function loadAutoDownload() {
  try {
    const raw = localStorage.getItem(LS_KEYS.autoDownload);
    return raw === null ? true : raw === "true";
  } catch { return true; }
}
function saveAutoDownload(v) { try { localStorage.setItem(LS_KEYS.autoDownload, String(!!v)); } catch {} }

/* =========================
API Helper
========================= */
async function apiFetch(path, {
  method = "GET",
  body,
  headers = {},
  timeoutMs = 30000,
  token = null,          // ✅ will be SESSION token (Bearer)
  isFormData = false,
} = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const finalHeaders = {
      ...(isFormData ? {} : { "content-type": "application/json" }),
      ...headers,
    };
    if (token) finalHeaders["authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: finalHeaders,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
      signal: ctrl.signal,
      credentials: "include",
    });

    const ct = res.headers.get("content-type") || "";
    const isJson = ct.toLowerCase().includes("application/json");
    const payload = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

    if (!res.ok) {
      return { ok: false, status: res.status, error: payload?.error || payload || `HTTP ${res.status}`, raw: payload };
    }
    return { ok: true, status: res.status, data: payload, headers: res.headers };
  } catch (e) {
    return { ok: false, status: 0, error: e?.name === "AbortError" ? "timeout" : (e?.message || String(e)) };
  } finally {
    clearTimeout(t);
  }
}

async function healthCheck() { return apiFetch(ROUTES.health); }
async function requestMagicLink(email) { return apiFetch(ROUTES.requestLink, { method: "POST", body: { data: { email } } }); }
// ✅ backend verify expects GET /auth/verify?token=...
async function verifyMagicToken(magicToken) { return apiFetch(`${ROUTES.verify}?token=${encodeURIComponent(magicToken)}`, { method: "GET" }); }
async function accessCheck(sessionToken) { return apiFetch(ROUTES.access, { method: "GET", token: sessionToken }); }

/* =========================
UI Helpers
========================= */
const Icon = ({ name, size = 22, className = "" }) => {
  const strokeProps = { strokeWidth:"2", strokeLinecap:"round", strokeLinejoin:"round" };
  const paths = {
    mail: <path d="M4 4h16v16H4V4zm0 4l8 5 8-5" {...strokeProps} />,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...strokeProps} />,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" {...strokeProps} />,
    logout: (
      <g {...strokeProps}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </g>
    ),
    download: (
      <g {...strokeProps}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </g>
    ),
    check: <polyline points="20 6 9 17 4 12" {...strokeProps} />,
    chat: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" {...strokeProps} />,
    x: (
      <g {...strokeProps}>
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </g>
    ),
    paperclip: (
      <g {...strokeProps}>
        <path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7.1-7.1L14 5.3a3.5 3.5 0 0 1 5 5L10.4 18a2 2 0 1 1-2.8-2.8l8.1-8.1"/>
      </g>
    ),
    list: (
      <g {...strokeProps}>
        <line x1="8" y1="6" x2="21" y2="6"/>
        <line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <circle cx="4" cy="6" r="1" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="4" cy="18" r="1" />
      </g>
    )
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor">
      {paths[name] || <circle cx="12" cy="12" r="10" {...strokeProps} />}
    </svg>
  );
};

const AppLogo = ({ className = "" }) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-40 animate-pulse"></div>
    <svg viewBox="0 0 100 100" width="100%" height="100%" className="text-white drop-shadow-lg relative z-10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="stGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      <path d="M50 18 C24 18, 8 50, 8 50 C8 50, 24 82, 50 82 C76 82, 92 50, 92 50 C92 50, 76 18, 50 18 Z" stroke="url(#stGrad)" fill="none" />
      <circle cx="50" cy="50" r="16" stroke="white" opacity="0.9" />
      <circle cx="50" cy="50" r="7" fill="white" opacity="0.95" />
      <path d="M46 50 H66" stroke="white" />
      <path d="M61 45 L66 50 L61 55" stroke="white" />
    </svg>
  </div>
);

const IntroAnimation = ({ onFinish }) => {
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => {
      setExiting(true);
      const t2 = setTimeout(onFinish, 900);
      return () => clearTimeout(t2);
    }, 900);
    return () => clearTimeout(t1);
  }, []);
  return (
    <div className={`intro-screen ${exiting ? "intro-fade-out" : ""}`}>
      <div className="flex flex-col items-center">
        <AppLogo className="w-28 h-28 mb-6" />
        <h1 className="text-5xl font-display font-bold text-white tracking-tighter fade-in">
          Strategy<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">Thrust</span>
        </h1>
        <div className="mt-6 text-xs font-mono uppercase tracking-[0.3em] text-blue-300">Executive Intelligence</div>
        <div className="mt-2 text-sm text-slate-300">Real Jobs • Word Deliverables • Admin Approval</div>
      </div>
    </div>
  );
};

/* =========================
Feature Gate
========================= */
function featureGate(access) {
  const feats = access?.features || {};
  return {
    app_access: !!feats.app_access,
    tier: feats.tier || access?.tier || "none",
    language_addon: !!feats.language_addon,
    strategic_master_plan: !!feats.strategic_master_plan,
    advisor_chatbot: !!feats.advisor_chatbot,
    // backend admin override: subscription.admin=true when ADMIN_EMAIL matches
    is_admin: !!access?.subscription?.admin,
  };
}

function StatusPill({ status }) {
  const map = {
    draft: "bg-slate-700 text-slate-200",
    pending_review: "bg-yellow-600/30 text-yellow-200 border border-yellow-500/20",
    generating: "bg-indigo-600/30 text-indigo-200 border border-indigo-500/20",
    delivered: "bg-emerald-600/30 text-emerald-200 border border-emerald-500/20",
    failed: "bg-red-600/30 text-red-200 border border-red-500/20",
  };
  const cls = map[status] || "bg-slate-700 text-slate-200";
  return <span className={`text-[10px] px-2 py-1 rounded-full ${cls}`}>{String(status || "unknown")}</span>;
}

const AccessBadge = ({ access }) => {
  const g = featureGate(access);
  const ok = g.app_access || g.is_admin;
  return (
    <div className={`px-3 py-1 rounded-full text-[10px] border ${ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>
      {ok ? `ACCESS GRANTED • Tier: ${g.tier}${g.is_admin ? " • ADMIN" : ""}` : "NO ACTIVE SUBSCRIPTION"}
    </div>
  );
};
/* =========================
Job API helpers (backend compatible)
========================= */
async function jobsInit({ token, job_type, inputs }) {
  // backend expects { data:{ job_type, inputs } }
  return apiFetch(ROUTES.uploadsInit, { method:"POST", token, body: { data: { job_type, inputs } } });
}
async function jobsUpload({ token, job_id, file_set, file }) {
  const fd = new FormData();
  fd.append("job_id", job_id);
  fd.append("file_set", file_set);
  fd.append("file", file);
  return apiFetch(ROUTES.uploadsPut, { method:"POST", token, body: fd, isFormData: true });
}
async function jobsListUploads({ token, job_id }) {
  return apiFetch(`${ROUTES.uploadsList}?job_id=${encodeURIComponent(job_id)}`, { method:"GET", token });
}
async function jobsSubmit({ token, job_id }) {
  return apiFetch(ROUTES.jobsSubmit, { method:"POST", token, body: { data: { job_id } } });
}
async function jobsStatus({ token, job_id }) {
  const r1 = await apiFetch(`${ROUTES.jobsStatus}?job_id=${encodeURIComponent(job_id)}`, { method:"GET", token });
  if (r1.ok) return r1;
  if (r1.status === 404) return jobsListUploads({ token, job_id });
  return r1;
}
function buildDownloadUrl(job_id, sessionToken) {
  // backend supports ?token= as well (your requireAuthEmail checks query token)
  const t = sessionToken ? `&token=${encodeURIComponent(sessionToken)}` : "";
  return `${API_BASE}${ROUTES.jobsDownload}?job_id=${encodeURIComponent(job_id)}${t}`;
}
function triggerDownloadUrl(url) { window.location.href = url; }

/* =========================
Screens
========================= */
const LoginScreen = ({ onRequested, onError }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    (async () => {
      const h = await healthCheck();
      setHealth(h.ok ? "ok" : "fail");
    })();
  }, []);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !e.includes("@")) return onError("Please enter a valid email.");
    setLoading(true);
    const r = await requestMagicLink(e);
    setLoading(false);
    if (!r.ok) return onError(`Magic link failed: ${r.error}`);
    // backend returns { ok:true, email, ttl_seconds }
    const ttl = r.data?.ttl_seconds;
    onRequested(e, ttl);
  };

  return (
    <div className="min-h-screen aurora-bg flex items-center justify-center p-4">
      <div className="w-full max-w-xl glass p-8 rounded-3xl border border-white/10 shadow-2xl fade-in">
        <div className="flex justify-center mb-6"><AppLogo className="w-20 h-20" /></div>
        <h2 className="text-3xl font-display font-bold text-center mb-2">Sign in</h2>
        <p className="text-center text-slate-400 text-sm mb-6">We’ll email you a secure magic link. No passwords.</p>

        <div className="flex items-center justify-center mb-4">
          <span className={`text-[10px] px-2 py-1 rounded border ${health === "ok" ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>
            Backend health: {health || "checking..."}
          </span>
        </div>

        <label className="block text-slate-300 text-sm font-bold mb-2">Email</label>
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon name="mail" className="text-slate-500" size={20}/>
          </div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl py-4 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <span className="loader border-t-blue-500" style={{width:18,height:18,borderWidth:3}}/> : <Icon name="shield" size={18} />}
          Send magic link
        </button>

        <p className="text-xs text-slate-500 mt-4">
          Uses <span className="text-slate-300">POST {API_BASE}{ROUTES.requestLink}</span>
        </p>

        <div className="mt-4 text-xs text-slate-500">
          <div className="font-mono">
            Magic link must land on: <span className="text-slate-200">{window.ST?.APP_BASE || "https://app.strategythrust.com"}/auth/verify?token=...</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const VerifyScreen = ({ token, onVerified, onError }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const r = await verifyMagicToken(token);
      setLoading(false);
      if (!r.ok) return onError(`Verify failed: ${r.error}`);
      onVerified(r.data);
    })();
  }, [token]);

  return (
    <div className="min-h-screen aurora-bg flex items-center justify-center p-4">
      <div className="w-full max-w-xl glass-panel p-10 rounded-3xl border border-white/10 shadow-2xl fade-in text-center">
        <div className="flex justify-center mb-6"><AppLogo className="w-20 h-20" /></div>
        <h2 className="text-3xl font-display font-bold mb-2">Verifying…</h2>
        <p className="text-slate-400 mb-8 text-sm">Validating your access with the backend.</p>

        {loading ? (
          <div className="flex items-center justify-center gap-3 text-slate-300">
            <div className="loader border-t-indigo-500"></div>
            <div className="text-sm">Checking token…</div>
          </div>
        ) : (
          <div className="text-sm text-slate-300">Done.</div>
        )}
      </div>
    </div>
  );
};

/* =========================
Deliverable Builder (BCG workflow)
========================= */
const JobWizard = ({ session, toastError, toastOk, autoDownloadEnabled }) => {
  const token = session?.session_token || loadSessionToken() || null;
  const access = session?.access;
  const g = featureGate(access);

  const [jobType, setJobType] = useState(JOB_TYPES.SECTOR_REPORT);
  const [inputs, setInputs] = useState({ topic: "", company_or_url: "", notes: "", auto_design: true });

  const [jobId, setJobId] = useState(null);
  const [jobMeta, setJobMeta] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [missingRequired, setMissingRequired] = useState([]);
  const [status, setStatus] = useState("draft");
  const [busy, setBusy] = useState(false);

  const autoDownloadedRef = useRef(false);

  const requiredSets = jobMeta?.required || [];
  const optionalSets = jobMeta?.optional || [];
  const allSets = [...requiredSets, ...optionalSets];

  const refreshUploads = async (id = jobId) => {
    if (!id) return;
    const r = await jobsListUploads({ token, job_id: id });
    if (!r.ok) return toastError(`uploads/list failed: ${r.error}`);
    setUploads(r.data?.files || []);
    setMissingRequired(r.data?.missing_required_sets || []);
    setStatus(r.data?.status || status);
  };

  const pollOnce = async (id = jobId) => {
    if (!id) return;
    const r = await jobsStatus({ token, job_id: id });
    if (!r.ok) return;

    const st = r.data?.status || r.data?.job?.status || null;
    if (st) setStatus(st);

    if (r.data?.files) {
      setUploads(r.data.files || []);
      setMissingRequired(r.data?.missing_required_sets || []);
    }

    if (autoDownloadEnabled && !autoDownloadedRef.current && st === "delivered") {
      autoDownloadedRef.current = true;
      const url = buildDownloadUrl(id, token);
      toastOk("Delivered! Auto-download started.");
      triggerDownloadUrl(url);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    const interval = setInterval(() => pollOnce(jobId), 3500);
    return () => clearInterval(interval);
  }, [jobId, autoDownloadEnabled]);

  const onInit = async () => {
    if ((!g.app_access && !g.is_admin)) return toastError("Access blocked: subscription is not active.");
    if (!token) return toastError("Missing session token. Please sign in via magic link again.");

    setBusy(true);
    autoDownloadedRef.current = false;

    const payloadInputs = {
      auto_design: !!inputs.auto_design,
      topic: inputs.topic,
      company_or_url: inputs.company_or_url,
      notes: inputs.notes,
    };

    const r = await jobsInit({ token, job_type: jobType, inputs: payloadInputs });
    setBusy(false);
    if (!r.ok) return toastError(`uploads/init failed: ${r.error}`);

    setJobId(r.data?.job_id);
    setJobMeta({ required: r.data?.required || [], optional: r.data?.optional || [], warnings: r.data?.warnings || [] });
    setUploads([]);
    setMissingRequired(r.data?.required || []);
    setStatus("draft");
    toastOk(`Job created: ${r.data?.job_id}`);
  };

  const onUpload = async (fileSet, file) => {
    if (!jobId) return toastError("Create a job first (Init).");
    if (!file) return;
    setBusy(true);
    const r = await jobsUpload({ token, job_id: jobId, file_set: fileSet, file });
    setBusy(false);
    if (!r.ok) return toastError(`upload failed: ${r.error}`);
    toastOk(`Uploaded: ${file.name}`);
    await refreshUploads(jobId);
  };

  const onSubmit = async () => {
    if (!jobId) return toastError("Create a job first (Init).");
    await refreshUploads(jobId);
    if ((missingRequired || []).length) return toastError(`Missing required file sets: ${missingRequired.join(", ")}`);

    setBusy(true);
    const r = await jobsSubmit({ token, job_id: jobId });
    setBusy(false);
    if (!r.ok) return toastError(`jobs/submit failed: ${r.error}`);

    toastOk("Submitted for admin approval.");
    setStatus("pending_review");
    await pollOnce(jobId);
  };

  const manualDownload = () => {
    if (!jobId) return toastError("No job yet.");
    if (status !== "delivered") return toastError("Not delivered yet.");
    triggerDownloadUrl(buildDownloadUrl(jobId, token));
  };

  const setChecklistIcon = (setName) => {
    const present = new Set((uploads || []).map(x => x.file_set));
    const ok = present.has(setName);
    const required = requiredSets.includes(setName);
    const color = ok ? "text-emerald-300" : (required ? "text-red-300" : "text-slate-400");
    return <span className={`font-mono text-xs ${color}`}>{ok ? "✅" : "❌"}</span>;
  };

  return (
    <div className="glass-panel p-6 rounded-2xl mb-8">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-lg font-bold">Deliverable Builder</div>
        <div className="ml-auto flex items-center gap-2">
          <button className="icon-btn" onClick={manualDownload} title="Download">
            <Icon name="download" size={18}/>
          </button>
        </div>
      </div>

      {/* Job type + Init */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <select
          value={jobType}
          onChange={(e)=>setJobType(e.target.value)}
          className="bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
        >
          <option value={JOB_TYPES.SECTOR_REPORT}>Sector Report</option>
          <option value={JOB_TYPES.COMPANY_ANALYSIS}>Company Analysis</option>
          <option value={JOB_TYPES.MASTER_PLAN}>Strategic Master Plan</option>
        </select>

        <div className="md:col-span-2 flex items-center gap-3">
          <label className="text-xs text-slate-400 flex items-center gap-2">
            <input type="checkbox" checked={!!inputs.auto_design} onChange={(e)=>setInputs(p=>({...p, auto_design:e.target.checked}))}/>
            Auto design with consulting best practice
          </label>

          <button
            onClick={onInit}
            disabled={busy}
            className="ml-auto px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold disabled:opacity-50"
          >
            {busy ? "Working..." : "Init Job"}
          </button>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <input
          value={inputs.topic}
          onChange={(e)=>setInputs(p=>({...p, topic:e.target.value}))}
          placeholder="Topic / Sector (e.g., Aviation in Turkey)"
          className="bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
        />
        <input
          value={inputs.company_or_url}
          onChange={(e)=>setInputs(p=>({...p, company_or_url:e.target.value}))}
          placeholder="Company name or URL (for Company Analysis)"
          className="bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
        />
        <input
          value={inputs.notes}
          onChange={(e)=>setInputs(p=>({...p, notes:e.target.value}))}
          placeholder="Notes (optional)"
          className="bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Status */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="text-xs text-slate-400">Job:</div>
        <div className="text-xs text-slate-200 font-mono">{jobId || "(not created)"}</div>
        <StatusPill status={status || "draft"} />
      </div>

      {/* Required/Optional checklist + upload controls */}
      {jobId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-4">
            <div className="text-sm font-bold mb-2">File-set checklist</div>
            <div className="text-xs text-slate-400 mb-3">Required sets must be uploaded before submit. Optional sets improve quality.</div>

            {(jobMeta?.warnings || []).length > 0 && (
              <div className="text-xs text-yellow-200 bg-yellow-600/10 border border-yellow-500/20 rounded-xl p-3 mb-3">
                {(jobMeta.warnings || []).map((w,i)=><div key={i}>• {w}</div>)}
              </div>
            )}

            <div className="space-y-2">
              {allSets.length === 0 && (
                <div className="text-xs text-slate-400">No file sets required for this job type/tier.</div>
              )}

              {allSets.map(setName => {
                const required = requiredSets.includes(setName);
                return (
                  <div key={setName} className="flex items-center gap-3 bg-slate-800/40 border border-white/5 rounded-xl p-3">
                    {setChecklistIcon(setName)}
                    <div className="text-sm font-semibold">
                      {setName.toUpperCase()} {required ? <span className="text-red-300 text-xs">(required)</span> : <span className="text-slate-400 text-xs">(optional)</span>}
                    </div>
                    <div className="ml-auto">
                      <label className="icon-btn cursor-pointer" title="Upload">
                        <Icon name="paperclip" size={18}/>
                        <input type="file" className="hidden" onChange={(e)=>onUpload(setName, e.target.files?.[0])}/>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                disabled={busy || !jobId}
                onClick={() => refreshUploads(jobId)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-sm"
              >
                Refresh
              </button>

              <button
                disabled={busy || !jobId}
                onClick={onSubmit}
                className="ml-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold disabled:opacity-50"
              >
                Submit for approval
              </button>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-white/10 rounded-2xl p-4">
            <div className="text-sm font-bold mb-2">Uploaded files</div>
            <div className="text-xs text-slate-400 mb-3">Stored in R2 under your job.</div>

            <div className="h-[260px] overflow-auto custom-scroll space-y-2">
              {(uploads || []).length === 0 ? (
                <div className="text-xs text-slate-400">No uploads yet.</div>
              ) : (
                uploads.map((f, i) => (
                  <div key={i} className="bg-slate-800/40 border border-white/5 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-mono text-slate-300">{f.file_set}</div>
                      <div className="text-[10px] text-slate-500">{f.size ? `${Math.round(f.size/1024)} KB` : ""}</div>
                    </div>
                    <div className="text-sm font-semibold truncate">{f.filename}</div>
                    <div className="text-[10px] text-slate-500 truncate">{f.key}</div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Download available when status becomes <span className="text-emerald-300 font-bold">delivered</span>.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
/* =========================
Advisor Chat Dock (backend /chat expects {data:{messages:[{role,content}]}})
========================= */
const AdvisorChatDock = ({ session, toastError }) => {
  const token = session?.session_token || loadSessionToken() || null;
  const access = session?.access;
  const g = featureGate(access);

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role:"assistant", text:"Hi — I’m your Advisor. Ask me anything about your analysis, assumptions, or next steps." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, open, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;

    if (!g.advisor_chatbot && !g.is_admin) {
      toastError("Advisor Chatbot is not included in your tier.");
      return;
    }
    if (!token) {
      toastError("Missing session token. Please sign in again.");
      return;
    }

    setInput("");
    setMsgs(m => [...m, { role:"user", text }]);
    setLoading(true);

    // backend handleChat expects body: { data:{ messages:[{role,content}] } }
    const payload = {
      data: {
        messages: [
          ...msgs.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
          { role: "user", content: text }
        ]
      }
    };

    const r = await apiFetch(ROUTES.chat, { method:"POST", token, body: payload, timeoutMs: 45000 });
    setLoading(false);

    if (!r.ok) {
      setMsgs(m => [...m, { role:"assistant", text:`(Error) ${r.error}` }]);
      return;
    }

    const reply = r.data?.reply || "No reply.";
    setMsgs(m => [...m, { role:"assistant", text: String(reply) }]);
  };

  return (
    <div className="chat-dock">
      {open && (
        <div className="chat-panel mb-3">
          <div className="chat-header">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/40 border border-indigo-500/20 flex items-center justify-center">
                <Icon name="chat" size={16}/>
              </div>
              <div>
                <div className="text-sm font-bold">Advisor Chatbot</div>
                <div className="text-[10px] text-slate-400">
                  {g.advisor_chatbot || g.is_admin ? "Enabled" : "Not in tier"}
                </div>
              </div>
            </div>
            <button className="icon-btn" onClick={()=>setOpen(false)} title="Close">
              <Icon name="x" size={18}/>
            </button>
          </div>

          <div className="chat-body custom-scroll" ref={bodyRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role === "user" ? "msg-user ml-10" : "msg-bot mr-10"}`}>
                {m.text}
              </div>
            ))}
            {loading && <div className="msg msg-bot mr-10">(thinking...)</div>}
          </div>

          <div className="chat-input">
            <input
              value={input}
              onChange={(e)=>setInput(e.target.value)}
              placeholder="Ask your advisor..."
              className="flex-1 bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none"
              onKeyDown={(e)=>{ if(e.key==="Enter") send(); }}
            />
            <button onClick={send} className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm">
              Send
            </button>
          </div>
        </div>
      )}

      <div className="chat-bubble" onClick={()=>setOpen(o=>!o)} title="Advisor Chatbot">
        <Icon name="chat" size={22}/>
      </div>
    </div>
  );
};

/* =========================
Admin Panel
========================= */
const AdminPanel = ({ session, toastError, toastOk }) => {
  const token = session?.session_token || loadSessionToken() || null;
  const access = session?.access;
  const g = featureGate(access);

  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState([]);

  if (!g.is_admin) return null;

  const approve = async () => {
    const id = jobId.trim();
    if (!id) return toastError("Enter a job_id.");
    setBusy(true);
    const r = await apiFetch(ROUTES.adminApprove, { method:"POST", token, body: { data: { job_id: id } }, timeoutMs: 60000 });
    setBusy(false);
    if (!r.ok) return toastError(`admin/approve failed: ${r.error}`);
    toastOk(`Approved & generated: ${id}`);
  };

  const loadQueue = async () => {
    const r = await apiFetch(`${ROUTES.adminJobs}?status=pending_review`, { method:"GET", token });
    if (!r.ok) return toastError(`admin/jobs failed: ${r.error}`);
    setQueue(r.data?.jobs || []);
    toastOk(`Queue loaded: ${(r.data?.jobs || []).length}`);
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border-l-4 border-indigo-500 mb-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-indigo-300 font-bold">Admin Panel</div>
          <div className="text-sm text-slate-300">Approve a job and generate the Word report.</div>
        </div>
        <div className="text-[10px] px-2 py-1 rounded-full border border-indigo-500/30 text-indigo-200">ADMIN</div>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={jobId}
          onChange={(e)=>setJobId(e.target.value)}
          placeholder="job_xxxxxxxx"
          className="flex-1 bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 font-mono text-sm"
        />
        <button
          onClick={approve}
          disabled={busy}
          className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold disabled:opacity-50"
        >
          {busy ? "Working..." : "Approve"}
        </button>
        <button
          onClick={loadQueue}
          className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 font-bold"
        >
          <Icon name="list" size={16} />
        </button>
      </div>

      {(queue || []).length > 0 && (
        <div className="mt-4 bg-slate-900/40 border border-white/10 rounded-2xl p-3">
          <div className="text-xs text-slate-400 mb-2">Pending review jobs</div>
          <div className="max-h-48 overflow-auto custom-scroll space-y-2">
            {queue.map((j, i) => (
              <div key={i} className="bg-slate-800/40 border border-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-slate-200">{j.id}</div>
                  <StatusPill status={j.status} />
                </div>
                <div className="text-xs text-slate-400">{j.job_type} • {j.email}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500 mt-2">
        Calls <span className="text-slate-300">POST {API_BASE}{ROUTES.adminApprove}</span>
      </div>
    </div>
  );
};

/* =========================
Dashboard Shell
========================= */
const Dashboard = ({ session, onLogout, toastError, toastOk }) => {
  const access = session?.access;
  const g = featureGate(access);
  const [autoDownload, setAutoDownload] = useState(loadAutoDownload);

  useEffect(() => { saveAutoDownload(autoDownload); }, [autoDownload]);

  return (
    <div className="min-h-screen aurora-bg pb-24">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <AppLogo className="w-10 h-10" />
            <div>
              <div className="text-xl font-display font-bold">StrategyThrust</div>
              <div className="text-[11px] text-slate-400">
                Signed in as <span className="text-slate-200">{session?.email}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {window.ST?.VERSION} • API: {API_BASE}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AccessBadge access={access} />

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-white/10">
              <span className="text-[11px] text-slate-300">Auto-download</span>
              <button
                onClick={() => setAutoDownload(v => !v)}
                className={`w-10 h-6 rounded-full transition relative ${autoDownload ? "bg-emerald-600" : "bg-slate-600"}`}
                title="When a job is delivered, download starts automatically (you can turn this off)."
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${autoDownload ? "left-5" : "left-0.5"}`} />
              </button>
            </div>

            <button
              onClick={onLogout}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-sm flex items-center gap-2"
            >
              <Icon name="logout" size={18} />
              Log out
            </button>
          </div>
        </header>

        {!g.app_access && !g.is_admin && (
          <div className="glass-panel p-6 rounded-2xl mb-8 border-l-4 border-red-500">
            <div className="text-red-300 font-bold uppercase text-xs tracking-widest mb-2">Access blocked</div>
            <p className="text-slate-300 text-sm">Your subscription is not active. Please complete purchase or renew.</p>
          </div>
        )}

        <AdminPanel session={session} toastError={toastError} toastOk={toastOk} />

        <JobWizard
          session={session}
          toastError={toastError}
          toastOk={toastOk}
          autoDownloadEnabled={autoDownload}
        />

        <AdvisorChatDock session={session} toastError={toastError} />
      </div>
    </div>
  );
};

/* =========================
App Root (Magic link handling)
========================= */
const App = () => {
  const [step, setStep] = useState("intro"); // intro | login | verify | app
  const [session, setSession] = useState(() => loadSession());
  const [toast, setToast] = useState(null);

  // ✅ token always comes from URL ?token=...
  const tokenFromUrl = useMemo(() => {
    try {
      const u = new URL(window.location.href);
      return (u.searchParams.get("token") || "").trim() || null;
    } catch { return null; }
  }, []);

  const toastError = (msg) => { setToast({ type: "error", msg }); setTimeout(() => setToast(null), 4500); };
  const toastOk = (msg) => { setToast({ type: "ok", msg }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    // ✅ if user opens /auth/verify?token=... (or any path with token), go verify
    if (tokenFromUrl) { setStep("verify"); return; }
    if (session?.access && (session?.session_token || loadSessionToken())) { setStep("app"); return; }
    setStep("login");
  }, []);

  const onRequested = (email, ttl) => {
    const mins = Math.round(((ttl || 1800) / 60));
    toastOk(`Magic link sent to ${email}. Expires in ~${mins} min.`);
  };

  const onVerified = async (payload) => {
    // backend verify returns: { ok:true, email, access, app_url, session_token, session_ttl_seconds }
    const sessionToken = payload?.session_token || null;
    if (!sessionToken) {
      toastError("Verify response missing session_token. Check backend /auth/verify output.");
      setStep("login");
      return;
    }
    saveSessionToken(sessionToken);

    const sess = {
      email: payload.email,
      access: payload.access,
      app_url: payload.app_url,
      verified_at: new Date().toISOString(),
      session_token: sessionToken,
    };
    saveSession(sess);
    setSession(sess);

    // ✅ Clean token from URL (prevents re-verify loop)
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("token");
      window.history.replaceState({}, document.title, u.toString());
    } catch {}

    toastOk("Verified. Welcome!");
    setStep("app");
  };

  const logout = () => {
    clearSession();
    clearSessionToken();
    setSession(null);
    setStep("login");
  };

  return (
    <div className="min-h-screen">
      {step === "intro" && (
        <IntroAnimation onFinish={() => {
          if (tokenFromUrl) setStep("verify");
          else if (session?.access && (session?.session_token || loadSessionToken())) setStep("app");
          else setStep("login");
        }} />
      )}

      {step === "login" && <LoginScreen onRequested={onRequested} onError={toastError} />}

      {step === "verify" && (
        <VerifyScreen
          token={tokenFromUrl}
          onVerified={onVerified}
          onError={(m) => { toastError(m); setStep("login"); }}
        />
      )}

      {step === "app" && session && (
        <Dashboard session={session} onLogout={logout} toastError={toastError} toastOk={toastOk} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999]">
          <div className={`px-4 py-3 rounded-xl shadow-2xl border text-sm ${
            toast.type === "error"
              ? "bg-red-950/80 border-red-500/30 text-red-200"
              : "bg-emerald-950/80 border-emerald-500/30 text-emerald-200"
          }`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
