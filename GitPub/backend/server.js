const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const jose = require('jose');
require('dotenv').config();

const app = express();

// =====================================================================
// Configuration & Environment Variables
// =====================================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dvgzoowmliilmmcjucbg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || 'placeholder_supabase_key';
if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_PUBLISHABLE_KEY) {
  console.warn('⚠️ Warning: Neither SUPABASE_SECRET_KEY nor SUPABASE_PUBLISHABLE_KEY is set in environment.');
}
const JWKS_URL = process.env.SUPABASE_JWKS_URL || `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

// Initialize JWKS remote key set for JWT verification
let remoteJWKS;
try {
  remoteJWKS = jose.createRemoteJWKSet(new URL(JWKS_URL));
} catch (err) {
  console.warn('JWKS initialization notice:', err.message);
}

// =====================================================================
// Middleware
// =====================================================================
app.use(cors());
app.use(express.json());

// Basic rate limiting on authentication routes
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per window
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Authentication Middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header with Bearer token is required' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token is missing' });
  }

  try {
    // 1. Primary verification using Supabase JWKS
    if (remoteJWKS) {
      try {
        const { payload } = await jose.jwtVerify(token, remoteJWKS);
        req.user = {
          id: payload.sub,
          email: payload.email,
          fullName: payload.user_metadata?.full_name || ''
        };
        return next();
      } catch (jwksErr) {
        // Fallback to Supabase Auth API if JWKS local check fails
      }
    }

    // 2. Fallback verification via Supabase Auth API
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.user_metadata?.full_name || ''
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed. Please log in again.' });
  }
}

// =====================================================================
// Validation Helpers
// =====================================================================
const VALID_PROJECT_STATUSES = ['Not Started', 'In Progress', 'Completed'];
const VALID_TASK_STATUSES = ['Pending', 'In Progress', 'Completed'];
const VALID_TASK_PRIORITIES = ['Low', 'Medium', 'High'];

// =====================================================================
// Health Check Endpoint
// =====================================================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'GitPub API' });
});

// =====================================================================
// AUTHENTICATION ENDPOINTS
// =====================================================================

// POST /api/auth/register
app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ error: 'Full name is required' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() }
      }
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Ensure profile row exists in database
    if (data?.user) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: fullName.trim(),
          email: email.trim()
        }, { onConflict: 'id' });
      } catch (upsertErr) {
        console.warn('Profile upsert note:', upsertErr?.message);
      }
    }

    const emailConfirmationMessage = 'A confirmation email has been sent to the specified email address. Please verify your email and try to log in.';

    return res.status(201).json({
      message: data.session ? 'Registration successful' : emailConfirmationMessage,
      emailConfirmationRequired: !data.session,
      token: data.session?.access_token || null,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        fullName: fullName.trim()
      }
    });
  } catch (err) {
    console.error('Registration server error:', err);
    return res.status(500).json({ error: 'Registration failed due to server error' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error || !data.session) {
      return res.status(401).json({ error: error?.message || 'Invalid email or password' });
    }

    return res.json({
      message: 'Login successful',
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name || ''
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed due to server error' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .eq('id', req.user.id)
      .single();

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        fullName: profile?.full_name || req.user.fullName || ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// DELETE /api/auth/account
app.delete('/api/auth/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Delete user's tasks
    const { error: tasksErr } = await supabase.from('tasks').delete().eq('user_id', userId);
    if (tasksErr) console.warn('Tasks delete notice:', tasksErr.message);

    // 2. Delete user's projects
    const { error: projErr } = await supabase.from('projects').delete().eq('user_id', userId);
    if (projErr) console.warn('Projects delete notice:', projErr.message);

    // 3. Delete user's profile
    const { error: profErr } = await supabase.from('profiles').delete().eq('id', userId);
    if (profErr) console.warn('Profile delete notice:', profErr.message);

    // 4. Delete the user from Supabase Auth via admin API
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
    if (authErr) {
      console.warn('Supabase admin deleteUser notice:', authErr.message);
    }

    return res.json({ message: 'Account and all associated data deleted successfully' });
  } catch (err) {
    console.error('Delete account server error:', err);
    return res.status(500).json({ error: 'Failed to delete account. Please try again later.' });
  }
});

// =====================================================================
// PROJECTS ENDPOINTS
// =====================================================================

// GET /api/projects (with search and status filter)
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { search, status } = req.query;

    let query = supabase
      .from('projects')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (status && status !== 'All') {
      query = query.eq('status', status);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/projects/:id
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST /api/projects
app.post('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { name, description, status, start_date, end_date } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const projectStatus = status || 'Not Started';
    if (!VALID_PROJECT_STATUSES.includes(projectStatus)) {
      return res.status(400).json({ error: `Invalid project status. Allowed: ${VALID_PROJECT_STATUSES.join(', ')}` });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{
        user_id: req.user.id,
        name: name.trim(),
        description: description ? description.trim() : '',
        status: projectStatus,
        start_date: start_date || null,
        end_date: end_date || null
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id
app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status, start_date, end_date } = req.body;

    const updateFields = {};

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Project name cannot be empty' });
      }
      updateFields.name = name.trim();
    }

    if (description !== undefined) {
      updateFields.description = description ? description.trim() : '';
    }

    if (status !== undefined) {
      if (!VALID_PROJECT_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid project status. Allowed: ${VALID_PROJECT_STATUSES.join(', ')}` });
      }
      updateFields.status = status;
    }

    if (start_date !== undefined) updateFields.start_date = start_date || null;
    if (end_date !== undefined) updateFields.end_date = end_date || null;

    const { data, error } = await supabase
      .from('projects')
      .update(updateFields)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Project not found or update failed' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// =====================================================================
// TASKS ENDPOINTS
// =====================================================================

// GET /api/tasks (with search, status, priority, and project_id filters)
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { search, status, priority, project_id } = req.query;

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (project_id) {
      query = query.eq('project_id', project_id);
    }

    if (status && status !== 'All') {
      query = query.eq('status', status);
    }

    if (priority && priority !== 'All') {
      query = query.eq('priority', priority);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      query = query.ilike('name', `%${search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/:id
app.get('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /api/tasks
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { project_id, name, description, priority, status, due_date } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Task name is required' });
    }

    const taskPriority = priority || 'Medium';
    if (!VALID_TASK_PRIORITIES.includes(taskPriority)) {
      return res.status(400).json({ error: `Invalid priority. Allowed: ${VALID_TASK_PRIORITIES.join(', ')}` });
    }

    const taskStatus = status || 'Pending';
    if (!VALID_TASK_STATUSES.includes(taskStatus)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${VALID_TASK_STATUSES.join(', ')}` });
    }

    // Verify the target project belongs to the authenticated user
    const { data: project, error: projectErr } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('user_id', req.user.id)
      .single();

    if (projectErr || !project) {
      return res.status(404).json({ error: 'Project not found or unauthorized' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert([{
        project_id,
        user_id: req.user.id,
        name: name.trim(),
        description: description ? description.trim() : '',
        priority: taskPriority,
        status: taskStatus,
        due_date: due_date || null
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, priority, status, due_date } = req.body;

    const updateFields = {};

    if (name !== undefined) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Task name cannot be empty' });
      }
      updateFields.name = name.trim();
    }

    if (description !== undefined) {
      updateFields.description = description ? description.trim() : '';
    }

    if (priority !== undefined) {
      if (!VALID_TASK_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority. Allowed: ${VALID_TASK_PRIORITIES.join(', ')}` });
      }
      updateFields.priority = priority;
    }

    if (status !== undefined) {
      if (!VALID_TASK_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Allowed: ${VALID_TASK_STATUSES.join(', ')}` });
      }
      updateFields.status = status;
    }

    if (due_date !== undefined) updateFields.due_date = due_date || null;

    const { data, error } = await supabase
      .from('tasks')
      .update(updateFields)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Task not found or update failed' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// =====================================================================
// DASHBOARD ENDPOINT
// =====================================================================

// GET /api/dashboard
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const [projectsRes, tasksRes] = await Promise.all([
      supabase.from('projects').select('id, status').eq('user_id', req.user.id),
      supabase.from('tasks').select('id, status').eq('user_id', req.user.id)
    ]);

    if (projectsRes.error) return res.status(500).json({ error: projectsRes.error.message });
    if (tasksRes.error) return res.status(500).json({ error: tasksRes.error.message });

    const projects = projectsRes.data || [];
    const tasks = tasksRes.data || [];

    const totalProjects = projects.length;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Completed').length;
    const pendingTasks = tasks.filter(t => t.status === 'Pending').length;
    const projectsInProgress = projects.filter(p => p.status === 'In Progress').length;

    res.json({
      totalProjects,
      totalTasks,
      completedTasks,
      pendingTasks,
      projectsInProgress
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate dashboard statistics' });
  }
});

// =====================================================================
// 404 & Error Handlers
// =====================================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Internal error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// =====================================================================
// Server Startup (Vercel & Local)
// =====================================================================
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GitPub API server is running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
