import axios from 'axios';

// In dev: Vite proxies /api → localhost:3000 (see vite.config.js)
// In prod: set VITE_API_URL to your server origin
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Dev auth header (DEV_AUTH=true on server — no CAC needed locally)
const devEdipi = import.meta.env.VITE_DEV_EDIPI || '0000000001';
api.interceptors.request.use((config) => {
  if (import.meta.env.DEV) {
    config.headers['X-Dev-EDIPI'] = devEdipi;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

export default api;

// --- Parts ---
export const parts = {
  list:     (params) => api.get('/api/parts', { params }),
  get:      (nsn)   => api.get(`/api/parts/${nsn}`),
  flisLookup: (query) => api.post('/api/parts/flis-lookup', { query }),
  add:      (data)  => api.post('/api/parts', data),
  approve:  (nsn, data) => api.put(`/api/parts/${nsn}/approve`, data),
  update:   (nsn, data) => api.put(`/api/parts/${nsn}`, data),
};

// --- Inventory ---
export const inventory = {
  list:      (params) => api.get('/api/inventory', { params }),
  issue:     (data)   => api.post('/api/inventory/issue', data),
  receive:   (data)   => api.post('/api/inventory/receive', data),
  turnIn:    (data)   => api.post('/api/inventory/turn-in', data),
  exchange:  (data)   => api.post('/api/inventory/repairable-exchange', data),
  transfer:  (data)   => api.post('/api/inventory/transfer', data),
  adjust:    (data)   => api.post('/api/inventory/adjustment', data),
  icrl:        (nsn)    => api.get(`/api/inventory/icrl/${nsn}`),
  icrlUpload:  (data)   => api.post('/api/inventory/icrl', data),
  partHistory: (nsn)    => api.get(`/api/inventory/part-history/${nsn}`),
  drmo:        ()        => api.get('/api/inventory/drmo'),
};

// --- Requisitions ---
export const reqs = {
  mov:        ()           => api.get('/api/requisitions/mov'),
  movBulk:    (data)       => api.post('/api/requisitions/mov-bulk', data),
  list:     (params) => api.get('/api/requisitions', { params }),
  get:      (id)     => api.get(`/api/requisitions/${id}`),
  submit:   (data)   => api.post('/api/requisitions', data),
  followup: (id)     => api.post(`/api/requisitions/${id}/followup`),
  cancel:   (id)     => api.post(`/api/requisitions/${id}/cancel`),
  status:   (id, status) => api.put(`/api/requisitions/${id}/status`, { status }),
  milstripUrl: (id, type) => `${api.defaults.baseURL}/api/requisitions/${id}/milstrip?type=${type || ''}`,
  dd2765Url: () => `${api.defaults.baseURL}/api/requisitions/dd2765`,
  otsSync:  () => api.post('/api/requisitions/ots-sync'),
};

// --- Aircraft ---
export const aircraft = {
  list:       (params) => api.get('/api/aircraft', { params }),
  get:        (id)     => api.get(`/api/aircraft/${id}`),
  add:        (data)   => api.post('/api/aircraft', data),
  setStatus:  (id, status) => api.put(`/api/aircraft/${id}/status`, { status }),
  history:    (id)     => api.get(`/api/aircraft/${id}/history`),
  detLoad:    (id)     => api.get(`/api/aircraft/${id}/det-load`),
  openNmcs:   (id, data) => api.post(`/api/aircraft/${id}/nmcs`, data),
  closeNmcs:  (id, eid)  => api.put(`/api/aircraft/${id}/nmcs/${eid}/close`),
  nmcsOpen:   ()       => api.get('/api/aircraft/nmcs/open'),
};

// --- Reports ---
export const reports = {
  nmcsBrief:     (params) => api.get('/api/reports/nmcs-brief', { params }),
  openDocuments: (params) => api.get('/api/reports/open-documents', { params }),
  stockStatus:   (params) => api.get('/api/reports/stock-status', { params }),
  usageTrends:   (params) => api.get('/api/reports/usage-trends', { params }),
  costByJcn:     (params) => api.get('/api/reports/parts-cost-jcn', { params }),
  tat:           (params) => api.get('/api/reports/tat', { params }),
  awop:          (params) => api.get('/api/reports/awop', { params }),
};

// --- Repairables ---
export const repairables = {
  serialized:   (params)    => api.get('/api/repairables/serialized', { params }),
  addSerialized:(data)       => api.post('/api/repairables/serialized', data),
  updateItem:   (id, data)   => api.put(`/api/repairables/serialized/${id}`, data),
  difm:         (params)    => api.get('/api/repairables/difm', { params }),
  sendToShop:   (data)       => api.post('/api/repairables/difm', data),
  receiveBack:  (id, data)   => api.put(`/api/repairables/difm/${id}/receive`, data),
  routing:      (pn)         => api.get(`/api/repairables/routing/${encodeURIComponent(pn)}`),
  icrl:         ()           => api.get('/api/repairables/icrl'),
  icrlUpload:   (file)       => { const fd = new FormData(); fd.append('file', file); return api.post('/api/repairables/icrl/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); },
  crl:          ()           => api.get('/api/repairables/crl'),
  crlUpload:    (file)       => { const fd = new FormData(); fd.append('file', file); return api.post('/api/repairables/crl/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); },
};

// --- Users ---
export const users = {
  me:         ()     => api.get('/api/users/me'),
  list:       ()     => api.get('/api/users'),
  update:     (id, data) => api.put(`/api/users/${id}`, data),
  units:      ()     => api.get('/api/users/units'),
  createUnit: (data) => api.post('/api/users/units', data),
  audit:      (params) => api.get('/api/users/audit', { params }),
};
