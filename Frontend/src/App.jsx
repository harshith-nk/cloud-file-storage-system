import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Auth from './components/Auth';
import './App.css';
import Footer from './components/Footer';

const API_URL = `${import.meta.env.VITE_API_BASE_URL}/api/files`;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function CloudIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  ); 
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [toast, setToast] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState({ loaded: 0, total: 0 });
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileToDelete, setFileToDelete] = useState(null);
  const [fileToRename, setFileToRename] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [stats, setStats] = useState(null);

  const abortControllerRef = useRef(null);

  const authHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` },
  });

  const handleLogin = (newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setFiles([]);
  };

  const showToast = (text, type = 'success') => {
  setToast({ text, type });
  setTimeout(() => setToast(null), 3000);
};

const fetchFiles = async (search = '') => {
  try {
    const url = search ? `${API_URL}?search=${encodeURIComponent(search)}` : API_URL;
    const response = await axios.get(url, authHeaders());
    setFiles(response.data);
  } catch (err) {
    console.error('Failed to fetch files:', err);
    if (err.response?.status === 401) handleLogout();
  }
};  

const fetchStats = async () => {
  try {
    const response = await axios.get(`${API_URL}/stats`, authHeaders());
    setStats(response.data);
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
};

useEffect(() => {
  if (token) {
    fetchFiles();
    fetchStats();
  }
}, [token]);

// Debounced server-side search — waits 400ms after typing stops before hitting the backend
useEffect(() => {
  if (!token) return;
  const timer = setTimeout(() => {
    fetchFiles(searchQuery);
  }, 400);
  return () => clearTimeout(timer);
}, [searchQuery, token]);  



  const handleFileChange = (e) => {
  const files = Array.from(e.target.files);

  if (files.length > 10) {
    setMessage('Maximum 10 files can be uploaded at once');
    setIsError(true);
    setSelectedFiles([]);
    return;
  }

  const oversizedFile = files.find(
    (file) => file.size > MAX_FILE_SIZE
  );

  if (oversizedFile) {
    setMessage(
      `"${oversizedFile.name}" is too large — max size is 50MB`
    );
    setIsError(true);
    setSelectedFiles([]);
    return;
  }

  setSelectedFiles(files);
  setMessage('');
  setIsError(false);
};

const handleDrop = (e) => {
  e.preventDefault();
  setIsDragging(false);

  const files = Array.from(e.dataTransfer.files);

  if (files.length === 0) return;

  if (files.length > 10) {
    setMessage('Maximum 10 files can be uploaded at once');
    setIsError(true);
    setSelectedFiles([]);
    return;
  }

  const oversizedFile = files.find(
    (file) => file.size > MAX_FILE_SIZE
  );

  if (oversizedFile) {
    setMessage(
      `"${oversizedFile.name}" is too large — max size is 50MB`
    );
    setIsError(true);
    setSelectedFiles([]);
    return;
  }

  setSelectedFiles(files);
  setMessage('');
  setIsError(false);
};

  const handleUpload = async () => {
  if (selectedFiles.length === 0) {
    setMessage('Select a file to upload first');
    setIsError(true);
    return;
  }

  const formData = new FormData();
  selectedFiles.forEach((file) => {
  formData.append('files', file);
});

  setUploading(true);
  setMessage('');
  setIsError(false);
  setUploadProgress(0);
  setIsFinalizing(false);
  const totalBytes = selectedFiles.reduce(
  (sum, file) => sum + file.size,
  0
);

setUploadedBytes({
  loaded: 0,
  total: totalBytes
});


  abortControllerRef.current = new AbortController();

  try {
    const response = await axios.post(`${API_URL}/upload`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      signal: abortControllerRef.current.signal,
      onUploadProgress: (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percent);
        setUploadedBytes({ loaded: progressEvent.loaded, total: progressEvent.total });
        if (percent >= 100) setIsFinalizing(true);
      },
    });
    setMessage(
  `${response.data.files.length} file${response.data.files.length !== 1 ? 's' : ''} uploaded successfully`
);

setSelectedFiles([]);
    setUploadProgress(0);
    setIsFinalizing(false);
    fetchFiles();
    } catch (err) {
    if (axios.isCancel(err) || err.code === 'ERR_CANCELED') {
      setMessage('Upload cancelled');
      setIsError(true);
    } else if (err.response?.status === 413) {
      setMessage('File exceeds the 50MB limit');
      setIsError(true);
    } else {
      console.error(err);
      setMessage('Upload failed — try again');
      setIsError(true);
    }
    setUploadProgress(0);
    setIsFinalizing(false);
  } finally {
    setUploading(false);
    abortControllerRef.current = null;
  }
};

  const handleCancelUpload = () => {
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
  }
};

  const handleDownload = async (id) => {
    try {
      const response = await axios.get(`${API_URL}/download/${id}`, authHeaders());
      window.open(response.data.downloadUrl, '_blank');
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleDelete = async (id, fileName) => {
  try {
    await axios.delete(`${API_URL}/${id}`, authHeaders());
    fetchFiles();
    showToast(`"${fileName}" deleted successfully`, 'success');
  } catch (err) {
    console.error('Delete failed:', err);
    showToast('Failed to delete file', 'error');
  }
}

const handleRename = async (id, newName) => {
  try {
    const response = await axios.patch(
      `${API_URL}/${id}/rename`,
      { newName },
      authHeaders()
    );
    fetchFiles();
    showToast(`Renamed to "${response.data.file.originalName}"`, 'success');
  } catch (err) {
    console.error('Rename failed:', err);
    showToast('Failed to rename file', 'error');
  }
};

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getExtTag = (name) => {
    const ext = name.split('.').pop();
    return ext ? ext.toUpperCase().slice(0, 4) : 'FILE';
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  

  if (!token) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-mark">
          <div className="topbar-mark-glyph"><CloudIcon /></div>
          <div className="topbar-mark-text">Cloud File Storage System</div>
        </div>
        <div className="topbar-user">
          <span className="topbar-email">{user?.email}</span>
          <button className="btn-ghost" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      <div className="dashboard">
        <div className="upload-panel">
          <p className="panel-eyebrow">Upload a file</p>
          <div
            className={`upload-zone ${isDragging ? 'is-dragging' : ''} ${selectedFiles.length > 0 ? 'has-file' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="upload-icon"><UploadIcon /></div>
            <p className="upload-text">Drag a file here, or</p>
            <label className="upload-browse">
              Browse files
              <input type="file" className="upload-input" onChange={handleFileChange} multiple />
            </label>
            {selectedFiles.length > 0 && <p className="upload-filename">{selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files selected`}</p>}

            <button className="upload-submit" onClick={handleUpload} disabled={uploading}>
  {uploading
  ? 'Uploading…'
  : selectedFiles.length > 1
    ? 'Upload files'
    : 'Upload file'}
</button>

{uploading && (
  <button className="upload-cancel" onClick={handleCancelUpload}>
    Cancel upload
  </button>
)}

{uploading && (
  <div className="progress-wrap">
    <div className="progress-track">
      <div
        className={`progress-fill ${isFinalizing ? 'is-finalizing' : ''}`}
        style={{ width: `${uploadProgress}%` }}
      />
    </div>
    <div className="progress-label">
      <span>
        {isFinalizing
          ? 'Finalizing upload to cloud storage…'
          : `${formatSize(uploadedBytes.loaded)} / ${formatSize(uploadedBytes.total)}`}
      </span>
      <span>{isFinalizing ? '' : `${uploadProgress}%`}</span>
    </div>
  </div>
)}

{message && (
  <p className={`upload-message ${isError ? 'is-error' : ''}`}>{message}</p>
)}

          </div>
        </div>

        <div className="docs">
          <p className="docs-eyebrow">
  {!stats || stats.totalFiles === 0
    ? 'No files uploaded'
    : `${stats.totalFiles} file${stats.totalFiles !== 1 ? 's' : ''} · ${formatSize(stats.totalSize)} used · average ${formatSize(stats.avgSize)} · largest ${formatSize(stats.maxSize)}`}
</p>
  
<h1 className="docs-title">Your documents</h1>

{files.length > 0 && (
  <div className="search-wrap">
    <span className="search-icon"><SearchIcon /></span>
    <input
      className="search-input"
      type="text"
      placeholder="Search your documents…"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
    />
    {searchQuery && (
      <button className="search-clear" onClick={() => setSearchQuery('')}>
        <XIcon />
      </button>
    )}
  </div>
)}

{files.length === 0 ? (
  <div className="docs-empty">No documents yet — your first upload will appear here.</div>
) : files.length === 0 ? (
  <div className="docs-empty">No documents match "{searchQuery}"</div>
) : (
  <ul className="docs-list">
    {files.map((file) => (
                <li className="docs-row" key={file._id}>
                  <div className="docs-file-icon"><FileIcon /></div>
                  <div className="docs-info">
                    <div className="docs-name">{file.originalName}</div>
                    <div className="docs-meta">
                      {formatSize(file.size)} · {formatDate(file.uploadDate)}
                    </div>
                  </div>
                  <span className="docs-tag">{getExtTag(file.originalName)}</span>
                  
                  <div className="docs-actions">
  <button className="btn-download" onClick={() => handleDownload(file._id)}>
    Download
  </button>
  <button
    className="btn-rename"
    onClick={() => {
      setFileToRename(file);
      setRenameValue(file.originalName);
    }}
  >
    Rename
  </button>
  <button className="btn-delete" onClick={() => setFileToDelete(file)}>Delete</button>
</div>
                  
                  
                  
                  
                  
                  
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {fileToDelete && (
  <div className="modal-overlay">
    <div className="delete-modal">
      <h2>Delete file?</h2>

      <p>
        Are you sure you want to delete
        <strong> "{fileToDelete.originalName}"</strong>?
        This action cannot be undone.
      </p>

      <div className="modal-actions">
        <button
          className="modal-cancel"
          onClick={() => setFileToDelete(null)}
        >
          Cancel
        </button>

        <button
          className="modal-delete"
          onClick={() => {
            handleDelete(fileToDelete._id, fileToDelete.originalName);
            setFileToDelete(null);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  </div>
)}

  {fileToRename && (
  <div className="modal-overlay">
    <div className="delete-modal">
      <h2>Rename file</h2>

      <input
        type="text"
        className="rename-input"
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        autoFocus
      />

      <div className="modal-actions">
        <button
          className="modal-cancel"
          onClick={() => setFileToRename(null)}
        >
          Cancel
        </button>

        <button
          className="modal-delete"
          onClick={() => {
            handleRename(fileToRename._id, renameValue.trim());
            setFileToRename(null);
          }}
        >
          Save
        </button>
      </div>
    </div>
  </div>
)}
      {toast && (
  <div className={`toast ${toast.type === 'success' ? 'is-success' : 'is-error'}`}>
    {toast.text}
  </div>
)}
      <Footer/>
    </div>
  );
}

export default App;