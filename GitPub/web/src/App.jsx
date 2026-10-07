import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Cloud / Google Drive link for direct Android APK download
const APK_DOWNLOAD_URL = import.meta.env.VITE_APK_DOWNLOAD_URL || 'https://drive.google.com/file/d/17TlGVAZnkX3IZI_ai12Cfyxrg75DRslH/view?usp=sharing';

export default function App() {
  // Navigation & Authentication State
  const [token, setToken] = useState(() => localStorage.getItem('gitpub_token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('gitpub_user')) || null;
    } catch {
      return null;
    }
  });
  const [currentView, setCurrentView] = useState('dashboard');
  const [sessionMessage, setSessionMessage] = useState('');

  // Forms & Auth UI State
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  // Dashboard State
  const [dashboardStats, setDashboardStats] = useState({
    totalProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    projectsInProgress: 0
  });

  // Projects State
  const [projects, setProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('All');
  const [selectedProject, setSelectedProject] = useState(null);

  // Tasks State
  const [tasks, setTasks] = useState([]);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('All');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('All');

  // Modal State
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectFormData, setProjectFormData] = useState({
    name: '',
    description: '',
    status: 'Not Started',
    start_date: '',
    end_date: ''
  });

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskFormData, setTaskFormData] = useState({
    project_id: '',
    name: '',
    description: '',
    priority: 'Medium',
    status: 'Pending',
    due_date: ''
  });

  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);

  // Global Notification / Error
  const [globalError, setGlobalError] = useState('');
  const [globalSuccess, setGlobalSuccess] = useState('');

  // Helper: Clear auth and notify
  const handleSessionExpired = useCallback(() => {
    setToken('');
    setUser(null);
    localStorage.removeItem('gitpub_token');
    localStorage.removeItem('gitpub_user');
    setSessionMessage('Session expired. Please log in again.');
    setCurrentView('login');
  }, []);

  // Universal API Request Wrapper
  const apiFetch = useCallback(async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      if (response.status === 401 && !endpoint.startsWith('/api/auth/')) {
        handleSessionExpired();
        throw new Error('Session expired');
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      return data;
    } catch (err) {
      if (err.message !== 'Session expired') {
        throw err;
      }
    }
  }, [token, handleSessionExpired]);

  // Save session when token/user change
  const saveAuthSession = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('gitpub_token', newToken);
    localStorage.setItem('gitpub_user', JSON.stringify(newUser));
    setSessionMessage('');
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      }
    } catch {}
    setToken('');
    setUser(null);
    localStorage.removeItem('gitpub_token');
    localStorage.removeItem('gitpub_user');
    setCurrentView('login');
  };

  const confirmDeleteAccount = async () => {
    setDeleteAccountLoading(true);
    try {
      await apiFetch('/api/auth/account', { method: 'DELETE' });
      setToken('');
      setUser(null);
      localStorage.removeItem('gitpub_token');
      localStorage.removeItem('gitpub_user');
      setDeleteAccountModalOpen(false);
      setAuthSuccess('Your account and all associated data have been permanently deleted.');
      setCurrentView('login');
    } catch (err) {
      setGlobalError(err.message || 'Failed to delete account');
      setDeleteAccountModalOpen(false);
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  // Auth Handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });

      if (res && res.token) {
        saveAuthSession(res.token, res.user);
        setAuthEmail('');
        setAuthPassword('');
        setCurrentView('dashboard');
      }
    } catch (err) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setAuthLoading(true);

    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: authFullName,
          email: authEmail,
          password: authPassword
        })
      });

      if (res && res.token) {
        saveAuthSession(res.token, res.user);
        setAuthFullName('');
        setAuthEmail('');
        setAuthPassword('');
        setCurrentView('dashboard');
      } else {
        const confirmationMessage = res?.message || 'A confirmation email has been sent to the specified email address. Please verify your email and try to log in.';
        setAuthSuccess(confirmationMessage);
        setAuthFullName('');
        setAuthPassword('');
        setCurrentView('login');
      }
    } catch (err) {
      setAuthError(err.message || 'Registration failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // Data Fetchers
  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const stats = await apiFetch('/api/dashboard');
      if (stats) setDashboardStats(stats);
    } catch (err) {
      setGlobalError(err.message);
    }
  }, [token, apiFetch]);

  const fetchProjects = useCallback(async () => {
    if (!token) return;
    try {
      let url = '/api/projects?';
      if (projectStatusFilter && projectStatusFilter !== 'All') {
        url += `status=${encodeURIComponent(projectStatusFilter)}&`;
      }
      if (projectSearch.trim()) {
        url += `search=${encodeURIComponent(projectSearch.trim())}&`;
      }
      const data = await apiFetch(url);
      if (data) setProjects(data);
    } catch (err) {
      setGlobalError(err.message);
    }
  }, [token, apiFetch, projectStatusFilter, projectSearch]);

  const fetchTasks = useCallback(async (projectId = null) => {
    if (!token) return;
    try {
      let url = '/api/tasks?';
      if (projectId) {
        url += `project_id=${encodeURIComponent(projectId)}&`;
      }
      if (taskStatusFilter && taskStatusFilter !== 'All') {
        url += `status=${encodeURIComponent(taskStatusFilter)}&`;
      }
      if (taskPriorityFilter && taskPriorityFilter !== 'All') {
        url += `priority=${encodeURIComponent(taskPriorityFilter)}&`;
      }
      if (taskSearch.trim()) {
        url += `search=${encodeURIComponent(taskSearch.trim())}&`;
      }
      const data = await apiFetch(url);
      if (data) setTasks(data);
    } catch (err) {
      setGlobalError(err.message);
    }
  }, [token, apiFetch, taskStatusFilter, taskPriorityFilter, taskSearch]);

  // Synchronize active view data
  useEffect(() => {
    if (!token) return;
    if (currentView === 'dashboard') {
      fetchDashboard();
    } else if (currentView === 'projects') {
      fetchProjects();
    } else if (currentView === 'tasks') {
      fetchTasks();
      fetchProjects(); // Needed for project dropdown in task modal
    } else if (currentView === 'project-details' && selectedProject) {
      fetchTasks(selectedProject.id);
    }
  }, [token, currentView, fetchDashboard, fetchProjects, fetchTasks, selectedProject]);

  // Clear global alerts after 4 seconds
  useEffect(() => {
    if (globalError || globalSuccess) {
      const timer = setTimeout(() => {
        setGlobalError('');
        setGlobalSuccess('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [globalError, globalSuccess]);

  // Project Actions
  const openCreateProjectModal = () => {
    setEditingProject(null);
    setProjectFormData({
      name: '',
      description: '',
      status: 'Not Started',
      start_date: '',
      end_date: ''
    });
    setProjectModalOpen(true);
  };

  const openEditProjectModal = (proj) => {
    setEditingProject(proj);
    setProjectFormData({
      name: proj.name || '',
      description: proj.description || '',
      status: proj.status || 'Not Started',
      start_date: proj.start_date || '',
      end_date: proj.end_date || ''
    });
    setProjectModalOpen(true);
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    try {
      if (editingProject) {
        await apiFetch(`/api/projects/${editingProject.id}`, {
          method: 'PUT',
          body: JSON.stringify(projectFormData)
        });
        setGlobalSuccess('Project updated successfully!');
      } else {
        await apiFetch('/api/projects', {
          method: 'POST',
          body: JSON.stringify(projectFormData)
        });
        setGlobalSuccess('Project created successfully!');
      }
      setProjectModalOpen(false);
      fetchProjects();
      fetchDashboard();
      if (selectedProject && editingProject?.id === selectedProject.id) {
        setSelectedProject({ ...selectedProject, ...projectFormData });
      }
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm('Are you sure you want to delete this project? All associated tasks will also be removed.')) return;
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      setGlobalSuccess('Project deleted successfully!');
      if (selectedProject?.id === id) {
        setSelectedProject(null);
        setCurrentView('projects');
      }
      fetchProjects();
      fetchDashboard();
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  // Task Actions
  const openCreateTaskModal = (defaultProjectId = null) => {
    setEditingTask(null);
    setTaskFormData({
      project_id: defaultProjectId || (projects[0]?.id || ''),
      name: '',
      description: '',
      priority: 'Medium',
      status: 'Pending',
      due_date: ''
    });
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (task) => {
    setEditingTask(task);
    setTaskFormData({
      project_id: task.project_id,
      name: task.name || '',
      description: task.description || '',
      priority: task.priority || 'Medium',
      status: task.status || 'Pending',
      due_date: task.due_date || ''
    });
    setTaskModalOpen(true);
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    try {
      if (editingTask) {
        await apiFetch(`/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          body: JSON.stringify(taskFormData)
        });
        setGlobalSuccess('Task updated successfully!');
      } else {
        await apiFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(taskFormData)
        });
        setGlobalSuccess('Task created successfully!');
      }
      setTaskModalOpen(false);
      if (currentView === 'project-details' && selectedProject) {
        fetchTasks(selectedProject.id);
      } else {
        fetchTasks();
      }
      fetchDashboard();
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      setGlobalSuccess('Task deleted successfully!');
      if (currentView === 'project-details' && selectedProject) {
        fetchTasks(selectedProject.id);
      } else {
        fetchTasks();
      }
      fetchDashboard();
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  const handleUpdateTaskStatus = async (task, newStatus) => {
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      if (currentView === 'project-details' && selectedProject) {
        fetchTasks(selectedProject.id);
      } else {
        fetchTasks();
      }
      fetchDashboard();
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  const handleUpdateTaskPriority = async (task, newPriority) => {
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ priority: newPriority })
      });
      if (currentView === 'project-details' && selectedProject) {
        fetchTasks(selectedProject.id);
      } else {
        fetchTasks();
      }
    } catch (err) {
      setGlobalError(err.message);
    }
  };

  // Helper: Get project name by ID
  const getProjectName = (projId) => {
    const p = projects.find(item => item.id === projId);
    return p ? p.name : 'Unknown Project';
  };

  // Helper: Status badge classes
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Not Started': return 'badge badge-not-started';
      case 'Pending': return 'badge badge-pending';
      case 'In Progress': return 'badge badge-in-progress';
      case 'Completed': return 'badge badge-completed';
      default: return 'badge';
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'Low': return 'badge badge-low';
      case 'Medium': return 'badge badge-medium';
      case 'High': return 'badge badge-high';
      default: return 'badge';
    }
  };

  // ===================================================================
  // RENDER: Unauthenticated Views (Login & Register)
  // ===================================================================
  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="brand" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
            GitPub <span className="brand-badge">PRO</span>
          </div>

          {sessionMessage && <div className="alert alert-error">{sessionMessage}</div>}
          {authError && <div className="alert alert-error">{authError}</div>}
          {authSuccess && <div className="alert alert-success">{authSuccess}</div>}

          {currentView === 'register' ? (
            <form onSubmit={handleRegister}>
              <h2 className="auth-title">Create Account</h2>
              <p className="auth-subtitle">Register to manage your projects and tasks</p>

              <div className="form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="John Doe"
                  value={authFullName}
                  onChange={(e) => setAuthFullName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder="john@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="form-input"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              <button type="submit" disabled={authLoading} className="btn btn-primary btn-full">
                {authLoading ? 'Registering...' : 'Register'}
              </button>

              <div className="auth-switch">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthError('');
                    setCurrentView('login');
                  }}
                >
                  Log In
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin}>
              <h2 className="auth-title">Welcome Back</h2>
              <p className="auth-subtitle">Log in to your GitPub dashboard</p>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder="john@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  className="form-input"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              <button type="submit" disabled={authLoading} className="btn btn-primary btn-full">
                {authLoading ? 'Logging In...' : 'Log In'}
              </button>

              <div className="auth-switch">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthError('');
                    setCurrentView('register');
                  }}
                >
                  Register
                </button>
              </div>

              <div className="auth-divider">
                <span>OR</span>
              </div>

              <div className="apk-download-box">
                <a
                  href={APK_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-apk-download btn-full"
                  id="apk-download-button"
                  title="Download the Android APK (Opens in new tab)"
                >
                  <svg
                    className="apk-download-icon"
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0003 0-.5517.4482-1.0003.9993-1.0003.5517 0 1.0003.4486 1.0003 1.0003 0 .5517-.4486 1.0003-1.0003 1.0003m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0003 0-.5517.4482-1.0003.9993-1.0003.5517 0 1.0003.4486 1.0003 1.0003 0 .5517-.4486 1.0003-1.0003 1.0003m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5682.1522l-2.0223 3.503C15.5902 8.4126 13.8563 8 12 8s-3.5902.4126-5.1362.9497L4.8415 5.4468a.416.416 0 00-.5682-.1522.416.416 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/>
                  </svg>
                  <span>Download Android APK</span>
                </a>
                <p className="apk-subtext">Install GitPub directly on your Android device</p>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ===================================================================
  // RENDER: Authenticated Views
  // ===================================================================
  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="brand" onClick={() => setCurrentView('dashboard')}>
          GitPub <span className="brand-badge">APP</span>
        </div>

        <nav className="nav-links">
          <button
            className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-btn ${currentView === 'projects' || currentView === 'project-details' ? 'active' : ''}`}
            onClick={() => setCurrentView('projects')}
          >
            Projects
          </button>
          <button
            className={`nav-btn ${currentView === 'tasks' ? 'active' : ''}`}
            onClick={() => setCurrentView('tasks')}
          >
            Tasks
          </button>
        </nav>

        <div className="nav-user">
          <span>{user?.fullName || user?.email}</span>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Logout
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setDeleteAccountModalOpen(true)}
            title="Permanently delete account"
          >
            Delete Account
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="main-content">
        {globalError && <div className="alert alert-error">{globalError}</div>}
        {globalSuccess && <div className="alert alert-success">{globalSuccess}</div>}

        {/* 1. DASHBOARD VIEW */}
        {currentView === 'dashboard' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Overview Dashboard</h1>
              <div className="page-actions">
                <button className="btn btn-primary" onClick={openCreateProjectModal}>
                  + New Project
                </button>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card blue">
                <div className="stat-label">Total Projects</div>
                <div className="stat-value">{dashboardStats.totalProjects}</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Total Tasks</div>
                <div className="stat-value">{dashboardStats.totalTasks}</div>
              </div>
              <div className="stat-card green">
                <div className="stat-label">Completed Tasks</div>
                <div className="stat-value">{dashboardStats.completedTasks}</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-label">Pending Tasks</div>
                <div className="stat-value">{dashboardStats.pendingTasks}</div>
              </div>
              <div className="stat-card cyan">
                <div className="stat-label">Projects In Progress</div>
                <div className="stat-value">{dashboardStats.projectsInProgress}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setCurrentView('projects')}>
                View All Projects →
              </button>
              <button className="btn btn-secondary" onClick={() => setCurrentView('tasks')}>
                View All Tasks →
              </button>
            </div>
          </div>
        )}

        {/* 2. PROJECTS VIEW */}
        {currentView === 'projects' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Projects</h1>
              <button className="btn btn-primary" onClick={openCreateProjectModal}>
                + Create Project
              </button>
            </div>

            <div className="filter-bar">
              <input
                type="text"
                placeholder="Search projects..."
                className="form-input search-input"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
              />
              <div className="filter-item">
                <label>Status:</label>
                <select
                  className="form-select"
                  value={projectStatusFilter}
                  onChange={(e) => setProjectStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="empty-state">
                <h4>No projects found</h4>
                <p>Get started by creating your first project above.</p>
              </div>
            ) : (
              <div className="items-grid">
                {projects.map((proj) => (
                  <div key={proj.id} className="item-card">
                    <div className="item-header">
                      <div
                        className="item-title"
                        onClick={() => {
                          setSelectedProject(proj);
                          setCurrentView('project-details');
                        }}
                      >
                        {proj.name}
                      </div>
                      <span className={getStatusBadge(proj.status)}>{proj.status}</span>
                    </div>

                    <div className="item-desc">{proj.description || 'No description provided.'}</div>

                    <div className="item-meta">
                      {proj.start_date && <div>Start: {proj.start_date}</div>}
                      {proj.end_date && <div>End: {proj.end_date}</div>}
                      <div>Created: {new Date(proj.created_at).toLocaleDateString()}</div>
                    </div>

                    <div className="item-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedProject(proj);
                          setCurrentView('project-details');
                        }}
                      >
                        View Details
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditProjectModal(proj)}>
                        Edit
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteProject(proj.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. PROJECT DETAILS VIEW */}
        {currentView === 'project-details' && selectedProject && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setCurrentView('projects')}>
                ← Back to Projects
              </button>
            </div>

            <div className="item-card" style={{ marginBottom: '2rem' }}>
              <div className="item-header">
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{selectedProject.name}</h2>
                <span className={getStatusBadge(selectedProject.status)}>{selectedProject.status}</span>
              </div>
              <p className="item-desc" style={{ fontSize: '1rem', marginTop: '0.5rem' }}>
                {selectedProject.description || 'No description provided.'}
              </p>
              <div className="item-meta" style={{ flexDirection: 'row', gap: '2rem' }}>
                <div><strong>Start Date:</strong> {selectedProject.start_date || 'N/A'}</div>
                <div><strong>End Date:</strong> {selectedProject.end_date || 'N/A'}</div>
              </div>
              <div className="item-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openEditProjectModal(selectedProject)}>
                  Edit Project
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteProject(selectedProject.id)}>
                  Delete Project
                </button>
              </div>
            </div>

            <div className="page-header">
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Project Tasks</h3>
              <button className="btn btn-primary btn-sm" onClick={() => openCreateTaskModal(selectedProject.id)}>
                + Add Task to Project
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="empty-state">
                <h4>No tasks in this project</h4>
                <p>Add a task to start tracking progress.</p>
              </div>
            ) : (
              <div className="task-table-wrapper">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>Task Name</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Due Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className={t.status === 'Completed' ? 'task-completed-text' : ''} style={{ fontWeight: 600 }}>
                            {t.name}
                          </div>
                          {t.description && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.description}</div>
                          )}
                        </td>
                        <td>
                          <select
                            className="form-select"
                            style={{ padding: '0.2rem 0.5rem', width: 'auto' }}
                            value={t.priority}
                            onChange={(e) => handleUpdateTaskPriority(t, e.target.value)}
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="form-select"
                            style={{ padding: '0.2rem 0.5rem', width: 'auto' }}
                            value={t.status}
                            onChange={(e) => handleUpdateTaskStatus(t, e.target.value)}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </td>
                        <td>{t.due_date || 'None'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {t.status !== 'Completed' ? (
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleUpdateTaskStatus(t, 'Completed')}
                              >
                                Complete
                              </button>
                            ) : (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleUpdateTaskStatus(t, 'Pending')}
                              >
                                Reopen
                              </button>
                            )}
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditTaskModal(t)}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTask(t.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 4. ALL TASKS VIEW */}
        {currentView === 'tasks' && (
          <div>
            <div className="page-header">
              <h1 className="page-title">Tasks</h1>
              <button
                className="btn btn-primary"
                onClick={() => openCreateTaskModal()}
                disabled={projects.length === 0}
              >
                + Create Task
              </button>
            </div>

            {projects.length === 0 && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                You must create at least one project before you can create tasks.
              </div>
            )}

            <div className="filter-bar">
              <input
                type="text"
                placeholder="Search tasks..."
                className="form-input search-input"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
              />
              <div className="filter-item">
                <label>Status:</label>
                <select
                  className="form-select"
                  value={taskStatusFilter}
                  onChange={(e) => setTaskStatusFilter(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div className="filter-item">
                <label>Priority:</label>
                <select
                  className="form-select"
                  value={taskPriorityFilter}
                  onChange={(e) => setTaskPriorityFilter(e.target.value)}
                >
                  <option value="All">All Priorities</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className="empty-state">
                <h4>No tasks found</h4>
                <p>Create a task or change the search/filter criteria.</p>
              </div>
            ) : (
              <div className="task-table-wrapper">
                <table className="task-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Project</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Due Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className={t.status === 'Completed' ? 'task-completed-text' : ''} style={{ fontWeight: 600 }}>
                            {t.name}
                          </div>
                          {t.description && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.description}</div>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {getProjectName(t.project_id)}
                          </span>
                        </td>
                        <td>
                          <select
                            className="form-select"
                            style={{ padding: '0.2rem 0.5rem', width: 'auto' }}
                            value={t.priority}
                            onChange={(e) => handleUpdateTaskPriority(t, e.target.value)}
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="form-select"
                            style={{ padding: '0.2rem 0.5rem', width: 'auto' }}
                            value={t.status}
                            onChange={(e) => handleUpdateTaskStatus(t, e.target.value)}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </td>
                        <td>{t.due_date || 'None'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {t.status !== 'Completed' ? (
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleUpdateTaskStatus(t, 'Completed')}
                              >
                                Complete
                              </button>
                            ) : (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => handleUpdateTaskStatus(t, 'Pending')}
                              >
                                Reopen
                              </button>
                            )}
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditTaskModal(t)}>
                              Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTask(t.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===============================================================
          MODALS: Create / Edit Project
          =============================================================== */}
      {projectModalOpen && (
        <div className="modal-overlay" onClick={() => setProjectModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingProject ? 'Edit Project' : 'Create New Project'}</h3>
              <button className="modal-close-btn" onClick={() => setProjectModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveProject}>
              <div className="form-group">
                <label>Project Name *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Website Redesign"
                  value={projectFormData.name}
                  onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Brief summary of the project..."
                  value={projectFormData.description}
                  onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  className="form-select"
                  value={projectFormData.status}
                  onChange={(e) => setProjectFormData({ ...projectFormData, status: e.target.value })}
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={projectFormData.start_date}
                    onChange={(e) => setProjectFormData({ ...projectFormData, start_date: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={projectFormData.end_date}
                    onChange={(e) => setProjectFormData({ ...projectFormData, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setProjectModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingProject ? 'Save Changes' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===============================================================
          MODALS: Create / Edit Task
          =============================================================== */}
      {taskModalOpen && (
        <div className="modal-overlay" onClick={() => setTaskModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTask ? 'Edit Task' : 'Create New Task'}</h3>
              <button className="modal-close-btn" onClick={() => setTaskModalOpen(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveTask}>
              {!editingTask && (
                <div className="form-group">
                  <label>Project *</label>
                  <select
                    required
                    className="form-select"
                    value={taskFormData.project_id}
                    onChange={(e) => setTaskFormData({ ...taskFormData, project_id: e.target.value })}
                  >
                    <option value="" disabled>Select a project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Task Name *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Implement authentication middleware"
                  value={taskFormData.name}
                  onChange={(e) => setTaskFormData({ ...taskFormData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Task details..."
                  value={taskFormData.description}
                  onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Priority</label>
                  <select
                    className="form-select"
                    value={taskFormData.priority}
                    onChange={(e) => setTaskFormData({ ...taskFormData, priority: e.target.value })}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    className="form-select"
                    value={taskFormData.status}
                    onChange={(e) => setTaskFormData({ ...taskFormData, status: e.target.value })}
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Due Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={taskFormData.due_date}
                  onChange={(e) => setTaskFormData({ ...taskFormData, due_date: e.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setTaskModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===============================================================
          MODALS: Delete Account Confirmation
          =============================================================== */}
      {deleteAccountModalOpen && (
        <div className="modal-overlay" onClick={() => !deleteAccountLoading && setDeleteAccountModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--danger)' }}>Delete Account</h3>
              <button
                className="modal-close-btn"
                disabled={deleteAccountLoading}
                onClick={() => setDeleteAccountModalOpen(false)}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Are you sure you want to permanently delete your account?
              </p>
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius)',
                padding: '0.85rem',
                color: '#fca5a5',
                fontSize: '0.875rem'
              }}>
                ⚠️ <strong>Warning:</strong> This will permanently delete your user profile, all your projects, and all your tasks from Supabase. This action cannot be undone.
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={deleteAccountLoading}
                onClick={() => setDeleteAccountModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleteAccountLoading}
                onClick={confirmDeleteAccount}
              >
                {deleteAccountLoading ? 'Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
