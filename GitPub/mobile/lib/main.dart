import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

// Configurable API URL via --dart-define=API_URL=... (defaults to deployed Vercel backend)
const String _configuredApiUrl = String.fromEnvironment('API_URL');
const String kProductionApiUrl = 'https://backend-omega-jade-33.vercel.app';
final String kDefaultApiUrl = _configuredApiUrl.isNotEmpty
    ? _configuredApiUrl
    : (kIsWeb ? 'http://localhost:5000' : kProductionApiUrl);
const FlutterSecureStorage kStorage = FlutterSecureStorage();

void main() {
  runApp(const GitPubApp());
}

class GitPubApp extends StatelessWidget {
  const GitPubApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GitPub',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3B82F6),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1E293B),
          elevation: 0,
        ),
        cardTheme: const CardThemeData(
          color: Color(0xFF1E293B),
          elevation: 2,
        ),
      ),
      home: const AuthGate(),
    );
  }
}

// =====================================================================
// Auth Gate - Determines whether to show Dashboard or Login
// =====================================================================
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _isLoading = true;
  bool _isAuthenticated = false;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final token = await kStorage.read(key: 'token');
    if (mounted) {
      setState(() {
        _isAuthenticated = token != null && token.isNotEmpty;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    return _isAuthenticated ? const MainNavigationScreen() : const LoginScreen();
  }
}

// =====================================================================
// API Client Helper & Server Config
// =====================================================================
class ApiClient {
  static String? _cachedBaseUrl;

  static String _normalizeUrl(String url) {
    var trimmed = url.trim();
    while (trimmed.endsWith('/')) {
      trimmed = trimmed.substring(0, trimmed.length - 1);
    }
    return trimmed;
  }

  static Future<String> getBaseUrl() async {
    if (_cachedBaseUrl != null) return _cachedBaseUrl!;
    final saved = await kStorage.read(key: 'custom_api_url');
    if (saved != null && saved.trim().isNotEmpty) {
      final normalized = _normalizeUrl(saved);
      // If the device has the old 10.0.2.2 emulator IP saved from an earlier version, auto-migrate to production
      if (!normalized.contains('10.0.2.2')) {
        _cachedBaseUrl = normalized;
        return _cachedBaseUrl!;
      }
    }
    _cachedBaseUrl = _normalizeUrl(kDefaultApiUrl);
    return _cachedBaseUrl!;
  }

  static Future<void> setBaseUrl(String url) async {
    final normalized = _normalizeUrl(url);
    _cachedBaseUrl = normalized;
    await kStorage.write(key: 'custom_api_url', value: normalized);
  }

  static Future<dynamic> request(
    BuildContext context, {
    required String endpoint,
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final token = await kStorage.read(key: 'token');
    final baseUrl = await getBaseUrl();
    final cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/$endpoint';
    final uri = Uri.parse('$baseUrl$cleanEndpoint');

    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    try {
      http.Response response;
      if (method == 'POST') {
        response = await http.post(uri, headers: headers, body: jsonEncode(body ?? {}));
      } else if (method == 'PUT') {
        response = await http.put(uri, headers: headers, body: jsonEncode(body ?? {}));
      } else if (method == 'DELETE') {
        response = await http.delete(uri, headers: headers);
      } else {
        response = await http.get(uri, headers: headers);
      }

      if (response.statusCode == 401 && !endpoint.startsWith('/api/auth/')) {
        await kStorage.delete(key: 'token');
        if (context.mounted) {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(
              builder: (ctx) => const LoginScreen(
                expiredMessage: 'Session expired. Please log in again.',
              ),
            ),
            (route) => false,
          );
        }
        throw Exception('Session expired');
      }

      final data = jsonDecode(response.body);

      if (response.statusCode >= 400) {
        throw Exception(data['error'] ?? 'Request failed (${response.statusCode})');
      }

      return data;
    } on http.ClientException {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Connection failed. Please check your network and API server.'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
      throw Exception('Connection failed. Please check your network and API server.');
    } catch (e) {
      if (e.toString().contains('Session expired')) rethrow;
      rethrow;
    }
  }
}

// =====================================================================
// 1. LOGIN SCREEN
// =====================================================================
class LoginScreen extends StatefulWidget {
  final String? expiredMessage;
  final String? successMessage;
  const LoginScreen({super.key, this.expiredMessage, this.successMessage});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  String? _success;

  @override
  void initState() {
    super.initState();
    if (widget.expiredMessage != null) {
      _error = widget.expiredMessage;
    }
    if (widget.successMessage != null) {
      _success = widget.successMessage;
    }
  }

  Future<void> _login() async {
    if (_emailCtrl.text.trim().isEmpty || _passCtrl.text.isEmpty) {
      setState(() => _error = 'Please enter email and password');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final res = await ApiClient.request(
        context,
        endpoint: '/api/auth/login',
        method: 'POST',
        body: {
          'email': _emailCtrl.text.trim(),
          'password': _passCtrl.text,
        },
      );

      if (res['token'] != null) {
        await kStorage.write(key: 'token', value: res['token']);
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const MainNavigationScreen()),
          );
        }
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.hub_outlined, size: 64, color: Color(0xFF3B82F6)),
              const SizedBox(height: 16),
              const Text(
                'GitPub',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const Text(
                'Task & Project Management',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white60, fontSize: 14),
              ),
              const SizedBox(height: 32),
              if (_error != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.redAccent),
                  ),
                  child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ),
              if (_success != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.greenAccent),
                  ),
                  child: Text(_success!, style: const TextStyle(color: Colors.greenAccent)),
                ),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.email_outlined),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _loading ? null : _login,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  backgroundColor: const Color(0xFF3B82F6),
                  foregroundColor: Colors.white,
                ),
                child: _loading
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Login', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const RegisterScreen()),
                  );
                },
                child: const Text("Don't have an account? Register"),
              ),
              const SizedBox(height: 16),
              FutureBuilder<String>(
                future: ApiClient.getBaseUrl(),
                builder: (context, snapshot) {
                  return TextButton.icon(
                    onPressed: () => showServerConfigDialog(context, () => setState(() {})),
                    icon: const Icon(Icons.settings, size: 16, color: Colors.white54),
                    label: Text(
                      'Server: ${snapshot.data ?? kDefaultApiUrl}',
                      style: const TextStyle(fontSize: 12, color: Colors.white54),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> showServerConfigDialog(BuildContext context, VoidCallback onSaved) async {
  final current = await ApiClient.getBaseUrl();
  final ctrl = TextEditingController(text: current);
  if (!context.mounted) return;
  showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Server API URL'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Specify the backend API URL. Default: https://backend-omega-jade-33.vercel.app. Or enter your custom backend URL.',
            style: TextStyle(fontSize: 12, color: Colors.white70),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            decoration: const InputDecoration(
              labelText: 'API Base URL',
              border: OutlineInputBorder(),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () async {
            if (ctrl.text.trim().isNotEmpty) {
              await ApiClient.setBaseUrl(ctrl.text.trim());
              if (ctx.mounted) Navigator.pop(ctx);
              onSaved();
            }
          },
          child: const Text('Save'),
        ),
      ],
    ),
  );
}

// =====================================================================
// 2. REGISTER SCREEN
// =====================================================================
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _register() async {
    if (_nameCtrl.text.trim().isEmpty || _emailCtrl.text.trim().isEmpty || _passCtrl.text.isEmpty) {
      setState(() => _error = 'All fields are required');
      return;
    }
    if (_passCtrl.text.length < 6) {
      setState(() => _error = 'Password must be at least 6 characters');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final res = await ApiClient.request(
        context,
        endpoint: '/api/auth/register',
        method: 'POST',
        body: {
          'fullName': _nameCtrl.text.trim(),
          'email': _emailCtrl.text.trim(),
          'password': _passCtrl.text,
        },
      );

      if (res['token'] != null) {
        await kStorage.write(key: 'token', value: res['token']);
        if (mounted) {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const MainNavigationScreen()),
            (route) => false,
          );
        }
      } else {
        if (mounted) {
          final confirmMsg = res['message'] ?? 'A confirmation email has been sent to the specified email address. Please verify your email and try to log in.';
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(confirmMsg),
              backgroundColor: Colors.green,
              duration: const Duration(seconds: 6),
            ),
          );
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(
              builder: (_) => LoginScreen(successMessage: confirmMsg),
            ),
            (route) => false,
          );
        }
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_error != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.red.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.redAccent),
                  ),
                  child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                ),
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(
                  labelText: 'Full Name',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.person_outline),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email Address',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.email_outlined),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passCtrl,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Password (min 6 chars)',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _loading ? null : _register,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  backgroundColor: const Color(0xFF3B82F6),
                  foregroundColor: Colors.white,
                ),
                child: _loading
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Register', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 16),
              FutureBuilder<String>(
                future: ApiClient.getBaseUrl(),
                builder: (context, snapshot) {
                  return TextButton.icon(
                    onPressed: () => showServerConfigDialog(context, () => setState(() {})),
                    icon: const Icon(Icons.settings, size: 16, color: Colors.white54),
                    label: Text(
                      'Server: ${snapshot.data ?? kDefaultApiUrl}',
                      style: const TextStyle(fontSize: 12, color: Colors.white54),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// =====================================================================
// MAIN NAVIGATION (Hosts Dashboard, Projects, Tasks)
// =====================================================================
class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  final List<Widget> _pages = const [
    DashboardView(),
    ProjectsView(),
    TasksView(),
  ];

  Future<void> _logout() async {
    await kStorage.delete(key: 'token');
    if (mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (route) => false,
      );
    }
  }

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Account?', style: TextStyle(color: Colors.redAccent)),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Are you sure you want to permanently delete your account?'),
            SizedBox(height: 12),
            Text(
              '⚠️ Warning: This will delete your profile, all projects, and all tasks. This action cannot be undone.',
              style: TextStyle(fontSize: 12, color: Colors.white70),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete Permanently', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await ApiClient.request(context, endpoint: '/api/auth/account', method: 'DELETE');
        await kStorage.delete(key: 'token');
        if (mounted) {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(
              builder: (_) => const LoginScreen(
                successMessage: 'Your account and data have been permanently deleted.',
              ),
            ),
            (route) => false,
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Failed to delete account: ${e.toString().replaceFirst('Exception: ', '')}'),
              backgroundColor: Colors.redAccent,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('GitPub', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            tooltip: 'Account Options',
            onSelected: (val) {
              if (val == 'logout') _logout();
              if (val == 'delete_account') _deleteAccount();
            },
            itemBuilder: (ctx) => [
              const PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout, size: 20, color: Colors.white70),
                    SizedBox(width: 8),
                    Text('Logout'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'delete_account',
                child: Row(
                  children: [
                    Icon(Icons.delete_forever, size: 20, color: Colors.redAccent),
                    SizedBox(width: 8),
                    Text('Delete Account', style: TextStyle(color: Colors.redAccent)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: _pages[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        backgroundColor: const Color(0xFF1E293B),
        selectedItemColor: const Color(0xFF3B82F6),
        unselectedItemColor: Colors.white60,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard_outlined), label: 'Dashboard'),
          BottomNavigationBarItem(icon: Icon(Icons.folder_outlined), label: 'Projects'),
          BottomNavigationBarItem(icon: Icon(Icons.check_circle_outline), label: 'Tasks'),
        ],
      ),
    );
  }
}

// =====================================================================
// 3. DASHBOARD VIEW
// =====================================================================
class DashboardView extends StatefulWidget {
  const DashboardView({super.key});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> {
  bool _loading = true;
  Map<String, dynamic> _stats = {
    'totalProjects': 0,
    'totalTasks': 0,
    'completedTasks': 0,
    'pendingTasks': 0,
    'projectsInProgress': 0,
  };

  @override
  void initState() {
    super.initState();
    _fetchStats();
  }

  Future<void> _fetchStats() async {
    try {
      final res = await ApiClient.request(context, endpoint: '/api/dashboard');
      if (mounted) {
        setState(() {
          _stats = Map<String, dynamic>.from(res);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _buildStatCard(String label, int value, Color color, IconData icon) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: color.withOpacity(0.2),
              child: Icon(icon, color: color, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 4),
                  Text('$value', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _fetchStats,
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text('Dashboard Overview', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
                const SizedBox(height: 12),
                _buildStatCard('Total Projects', _stats['totalProjects'] ?? 0, const Color(0xFF3B82F6), Icons.folder),
                _buildStatCard('Total Tasks', _stats['totalTasks'] ?? 0, const Color(0xFFA855F7), Icons.assignment),
                _buildStatCard('Completed Tasks', _stats['completedTasks'] ?? 0, const Color(0xFF10B981), Icons.check_circle),
                _buildStatCard('Pending Tasks', _stats['pendingTasks'] ?? 0, const Color(0xFFF59E0B), Icons.hourglass_empty),
                _buildStatCard('Projects In Progress', _stats['projectsInProgress'] ?? 0, const Color(0xFF06B6D4), Icons.trending_up),
              ],
            ),
    );
  }
}

// =====================================================================
// 4. PROJECTS VIEW
// =====================================================================
class ProjectsView extends StatefulWidget {
  const ProjectsView({super.key});

  @override
  State<ProjectsView> createState() => _ProjectsViewState();
}

class _ProjectsViewState extends State<ProjectsView> {
  bool _loading = true;
  List<dynamic> _projects = [];
  String _statusFilter = 'All';
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _fetchProjects();
  }

  Future<void> _fetchProjects() async {
    try {
      String endpoint = '/api/projects?';
      if (_statusFilter != 'All') endpoint += 'status=${Uri.encodeComponent(_statusFilter)}&';
      if (_searchQuery.trim().isNotEmpty) endpoint += 'search=${Uri.encodeComponent(_searchQuery.trim())}&';

      final res = await ApiClient.request(context, endpoint: endpoint);
      if (mounted) {
        setState(() {
          _projects = List<dynamic>.from(res);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showCreateProjectDialog() {
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String status = 'Not Started';

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: const Text('Create Project'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Project Name *'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: descCtrl,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: status,
                decoration: const InputDecoration(labelText: 'Status'),
                items: ['Not Started', 'In Progress', 'Completed']
                    .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                    .toList(),
                onChanged: (val) => setDialogState(() => status = val!),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty) return;
                Navigator.pop(ctx);
                try {
                  await ApiClient.request(
                    context,
                    endpoint: '/api/projects',
                    method: 'POST',
                    body: {
                      'name': nameCtrl.text.trim(),
                      'description': descCtrl.text.trim(),
                      'status': status,
                    },
                  );
                  _fetchProjects();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreateProjectDialog,
        backgroundColor: const Color(0xFF3B82F6),
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchProjects,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      decoration: const InputDecoration(
                        hintText: 'Search projects...',
                        prefixIcon: Icon(Icons.search),
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (val) {
                        _searchQuery = val;
                        _fetchProjects();
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  DropdownButton<String>(
                    value: _statusFilter,
                    dropdownColor: const Color(0xFF1E293B),
                    items: ['All', 'Not Started', 'In Progress', 'Completed']
                        .map((s) => DropdownMenuItem(value: s, child: Text(s, style: const TextStyle(fontSize: 13))))
                        .toList(),
                    onChanged: (val) {
                      setState(() => _statusFilter = val!);
                      _fetchProjects();
                    },
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _projects.isEmpty
                      ? const Center(child: Text('No projects found', style: TextStyle(color: Colors.white60)))
                      : ListView.builder(
                          itemCount: _projects.length,
                          itemBuilder: (ctx, i) {
                            final p = _projects[i];
                            return Card(
                              margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              child: ListTile(
                                title: Text(p['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                                subtitle: Text(p['description'] ?? 'No description', maxLines: 2, overflow: TextOverflow.ellipsis),
                                trailing: Chip(
                                  label: Text(p['status'] ?? 'Not Started', style: const TextStyle(fontSize: 11)),
                                  backgroundColor: const Color(0xFF334155),
                                ),
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute(builder: (_) => ProjectDetailsScreen(project: p)),
                                  ).then((_) => _fetchProjects());
                                },
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

// =====================================================================
// 5. PROJECT DETAILS SCREEN
// =====================================================================
class ProjectDetailsScreen extends StatefulWidget {
  final Map<String, dynamic> project;
  const ProjectDetailsScreen({super.key, required this.project});

  @override
  State<ProjectDetailsScreen> createState() => _ProjectDetailsScreenState();
}

class _ProjectDetailsScreenState extends State<ProjectDetailsScreen> {
  bool _loading = true;
  List<dynamic> _tasks = [];

  @override
  void initState() {
    super.initState();
    _fetchProjectTasks();
  }

  Future<void> _fetchProjectTasks() async {
    try {
      final res = await ApiClient.request(context, endpoint: '/api/tasks?project_id=${widget.project['id']}');
      if (mounted) {
        setState(() {
          _tasks = List<dynamic>.from(res);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showTaskDialog({Map<String, dynamic>? taskToEdit}) {
    final nameCtrl = TextEditingController(text: taskToEdit?['name'] ?? '');
    final descCtrl = TextEditingController(text: taskToEdit?['description'] ?? '');
    String priority = taskToEdit?['priority'] ?? 'Medium';
    String status = taskToEdit?['status'] ?? 'Pending';

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: Text(taskToEdit == null ? 'Create Task' : 'Edit Task'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Task Name *')),
              const SizedBox(height: 10),
              TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description')),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: priority,
                decoration: const InputDecoration(labelText: 'Priority'),
                items: ['Low', 'Medium', 'High'].map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
                onChanged: (val) => setDialogState(() => priority = val!),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: status,
                decoration: const InputDecoration(labelText: 'Status'),
                items: ['Pending', 'In Progress', 'Completed'].map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                onChanged: (val) => setDialogState(() => status = val!),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty) return;
                Navigator.pop(ctx);
                try {
                  if (taskToEdit == null) {
                    await ApiClient.request(
                      context,
                      endpoint: '/api/tasks',
                      method: 'POST',
                      body: {
                        'project_id': widget.project['id'],
                        'name': nameCtrl.text.trim(),
                        'description': descCtrl.text.trim(),
                        'priority': priority,
                        'status': status,
                      },
                    );
                  } else {
                    await ApiClient.request(
                      context,
                      endpoint: '/api/tasks/${taskToEdit['id']}',
                      method: 'PUT',
                      body: {
                        'name': nameCtrl.text.trim(),
                        'description': descCtrl.text.trim(),
                        'priority': priority,
                        'status': status,
                      },
                    );
                  }
                  _fetchProjectTasks();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _updateStatus(String taskId, String newStatus) async {
    try {
      await ApiClient.request(
        context,
        endpoint: '/api/tasks/$taskId',
        method: 'PUT',
        body: {'status': newStatus},
      );
      _fetchProjectTasks();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _deleteTask(String taskId) async {
    try {
      await ApiClient.request(context, endpoint: '/api/tasks/$taskId', method: 'DELETE');
      _fetchProjectTasks();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.project['name'] ?? 'Project Details')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showTaskDialog(),
        backgroundColor: const Color(0xFF3B82F6),
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchProjectTasks,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            widget.project['name'] ?? '',
                            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                          ),
                        ),
                        Chip(label: Text(widget.project['status'] ?? 'Not Started')),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(widget.project['description'] ?? 'No description provided.', style: const TextStyle(color: Colors.white70)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text('Project Tasks', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 8),
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
            else if (_tasks.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(32), child: Text('No tasks in this project yet', style: TextStyle(color: Colors.white60))))
            else
              ..._tasks.map((t) {
                final isCompleted = t['status'] == 'Completed';
                return Card(
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  child: ListTile(
                    leading: IconButton(
                      icon: Icon(
                        isCompleted ? Icons.check_circle : Icons.radio_button_unchecked,
                        color: isCompleted ? Colors.green : Colors.white60,
                      ),
                      onPressed: () => _updateStatus(t['id'], isCompleted ? 'Pending' : 'Completed'),
                    ),
                    title: Text(
                      t['name'] ?? '',
                      style: TextStyle(
                        decoration: isCompleted ? TextDecoration.lineThrough : null,
                        color: isCompleted ? Colors.white38 : Colors.white,
                      ),
                    ),
                    subtitle: Text('${t['priority']} Priority • ${t['status']}'),
                    trailing: PopupMenuButton<String>(
                      onSelected: (val) {
                        if (val == 'edit') _showTaskDialog(taskToEdit: t);
                        if (val == 'delete') _deleteTask(t['id']);
                      },
                      itemBuilder: (ctx) => [
                        const PopupMenuItem(value: 'edit', child: Text('Edit')),
                        const PopupMenuItem(value: 'delete', child: Text('Delete')),
                      ],
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}

// =====================================================================
// 6. ALL TASKS VIEW
// =====================================================================
class TasksView extends StatefulWidget {
  const TasksView({super.key});

  @override
  State<TasksView> createState() => _TasksViewState();
}

class _TasksViewState extends State<TasksView> {
  bool _loading = true;
  List<dynamic> _tasks = [];
  List<dynamic> _projects = [];
  String _statusFilter = 'All';
  String _priorityFilter = 'All';
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _fetchData();
  }

  Future<void> _fetchData() async {
    try {
      String taskUrl = '/api/tasks?';
      if (_statusFilter != 'All') taskUrl += 'status=${Uri.encodeComponent(_statusFilter)}&';
      if (_priorityFilter != 'All') taskUrl += 'priority=${Uri.encodeComponent(_priorityFilter)}&';
      if (_searchQuery.trim().isNotEmpty) taskUrl += 'search=${Uri.encodeComponent(_searchQuery.trim())}&';

      final tasksRes = await ApiClient.request(context, endpoint: taskUrl);
      final projectsRes = await ApiClient.request(context, endpoint: '/api/projects');

      if (mounted) {
        setState(() {
          _tasks = List<dynamic>.from(tasksRes);
          _projects = List<dynamic>.from(projectsRes);
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showTaskDialog({Map<String, dynamic>? taskToEdit}) {
    if (_projects.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please create a project first before creating tasks')),
      );
      return;
    }

    final nameCtrl = TextEditingController(text: taskToEdit?['name'] ?? '');
    final descCtrl = TextEditingController(text: taskToEdit?['description'] ?? '');
    String selectedProjId = taskToEdit?['project_id'] ?? _projects.first['id'];
    String priority = taskToEdit?['priority'] ?? 'Medium';
    String status = taskToEdit?['status'] ?? 'Pending';

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: Text(taskToEdit == null ? 'Create Task' : 'Edit Task'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (taskToEdit == null) ...[
                  DropdownButtonFormField<String>(
                    value: selectedProjId,
                    decoration: const InputDecoration(labelText: 'Project *'),
                    items: _projects
                        .map((p) => DropdownMenuItem(value: p['id'].toString(), child: Text(p['name'] ?? '')))
                        .toList(),
                    onChanged: (val) => setDialogState(() => selectedProjId = val!),
                  ),
                  const SizedBox(height: 10),
                ],
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Task Name *')),
                const SizedBox(height: 10),
                TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description')),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: priority,
                  decoration: const InputDecoration(labelText: 'Priority'),
                  items: ['Low', 'Medium', 'High'].map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
                  onChanged: (val) => setDialogState(() => priority = val!),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: ['Pending', 'In Progress', 'Completed'].map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                  onChanged: (val) => setDialogState(() => status = val!),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            ElevatedButton(
              onPressed: () async {
                if (nameCtrl.text.trim().isEmpty) return;
                Navigator.pop(ctx);
                try {
                  if (taskToEdit == null) {
                    await ApiClient.request(
                      context,
                      endpoint: '/api/tasks',
                      method: 'POST',
                      body: {
                        'project_id': selectedProjId,
                        'name': nameCtrl.text.trim(),
                        'description': descCtrl.text.trim(),
                        'priority': priority,
                        'status': status,
                      },
                    );
                  } else {
                    await ApiClient.request(
                      context,
                      endpoint: '/api/tasks/${taskToEdit['id']}',
                      method: 'PUT',
                      body: {
                        'name': nameCtrl.text.trim(),
                        'description': descCtrl.text.trim(),
                        'priority': priority,
                        'status': status,
                      },
                    );
                  }
                  _fetchData();
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _updateStatus(String taskId, String newStatus) async {
    try {
      await ApiClient.request(
        context,
        endpoint: '/api/tasks/$taskId',
        method: 'PUT',
        body: {'status': newStatus},
      );
      _fetchData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _deleteTask(String taskId) async {
    try {
      await ApiClient.request(context, endpoint: '/api/tasks/$taskId', method: 'DELETE');
      _fetchData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showTaskDialog(),
        backgroundColor: const Color(0xFF3B82F6),
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: RefreshIndicator(
        onRefresh: _fetchData,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  TextField(
                    decoration: const InputDecoration(
                      hintText: 'Search tasks...',
                      prefixIcon: Icon(Icons.search),
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (val) {
                      _searchQuery = val;
                      _fetchData();
                    },
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          value: _statusFilter,
                          dropdownColor: const Color(0xFF1E293B),
                          items: ['All', 'Pending', 'In Progress', 'Completed']
                              .map((s) => DropdownMenuItem(value: s, child: Text(s, style: const TextStyle(fontSize: 13))))
                              .toList(),
                          onChanged: (val) {
                            setState(() => _statusFilter = val!);
                            _fetchData();
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          value: _priorityFilter,
                          dropdownColor: const Color(0xFF1E293B),
                          items: ['All', 'Low', 'Medium', 'High']
                              .map((p) => DropdownMenuItem(value: p, child: Text(p, style: const TextStyle(fontSize: 13))))
                              .toList(),
                          onChanged: (val) {
                            setState(() => _priorityFilter = val!);
                            _fetchData();
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _tasks.isEmpty
                      ? const Center(child: Text('No tasks found', style: TextStyle(color: Colors.white60)))
                      : ListView.builder(
                          itemCount: _tasks.length,
                          itemBuilder: (ctx, i) {
                            final t = _tasks[i];
                            final isCompleted = t['status'] == 'Completed';
                            return Card(
                              margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                              child: ListTile(
                                leading: IconButton(
                                  icon: Icon(
                                    isCompleted ? Icons.check_circle : Icons.radio_button_unchecked,
                                    color: isCompleted ? Colors.green : Colors.white60,
                                  ),
                                  onPressed: () => _updateStatus(t['id'], isCompleted ? 'Pending' : 'Completed'),
                                ),
                                title: Text(
                                  t['name'] ?? '',
                                  style: TextStyle(
                                    decoration: isCompleted ? TextDecoration.lineThrough : null,
                                    color: isCompleted ? Colors.white38 : Colors.white,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                subtitle: Text('${t['priority']} Priority • ${t['status']}'),
                                trailing: PopupMenuButton<String>(
                                  onSelected: (val) {
                                    if (val == 'edit') _showTaskDialog(taskToEdit: t);
                                    if (val == 'delete') _deleteTask(t['id']);
                                  },
                                  itemBuilder: (ctx) => [
                                    const PopupMenuItem(value: 'edit', child: Text('Edit')),
                                    const PopupMenuItem(value: 'delete', child: Text('Delete')),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
