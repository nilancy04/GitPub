# GitPub - Project & Task Management System

GitPub is a lightweight, full-stack Project and Task Management platform designed with minimal architectural overhead and maximum developer productivity. It features a responsive React web interface, a robust Node.js/Express REST API, and a Flutter Android mobile application, backed by a unified Supabase PostgreSQL database and Supabase Auth.

---

## 1. Tech Stack

- **Web Frontend**: React 18, Vite, JavaScript, CSS3
- **Backend API**: Node.js, Express, JavaScript, CORS, Rate Limiting, JOSE (Supabase JWKS verification)
- **Mobile App**: Flutter, Dart, Android SDK, `flutter_secure_storage`, `http`
- **Database & Auth**: Supabase PostgreSQL (Row Level Security enabled), Supabase Auth (JWT ES256)
- **Deployment**: Vercel (Web & Backend API), Android APK (Mobile)

---

## 2. Project Structure

```
GitPub/
│
├── web/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── style.css
│   ├── index.html
│   ├── package.json
│   └── .env.example
│
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
├── mobile/
│   ├── lib/
│   │   └── main.dart
│   └── pubspec.yaml
│
├── database/
│   └── schema.sql
│
├── README.md
└── .gitignore
```

---

## 3. Supabase Setup & Schema Initialization

### Step 1: Open Your Supabase Project
1. Navigate to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open your project (e.g., `https://dvgzoowmliilmmcjucbg.supabase.co`).

### Step 2: Run `database/schema.sql`
1. On the left navigation bar, click on **SQL Editor**.
2. Click **New query**.
3. Copy the entire contents of [`database/schema.sql`](./database/schema.sql) and paste it into the query editor.
4. Click **Run** (or press `Ctrl + Enter`).
5. The script creates the `profiles`, `projects`, and `tasks` tables, configures Foreign Keys with cascading deletes, creates performance indexes, configures Row Level Security (RLS) policies, and creates an automatic trigger `handle_new_user()` linked to Supabase Auth.

### Step 3: Retrieve API Keys
Go to **Project Settings** -> **API**:
- Copy the **Project URL**: `https://dvgzoowmliilmmcjucbg.supabase.co`
- Copy the **anon public key** (`SUPABASE_PUBLISHABLE_KEY`)
- Copy the **service_role secret key** (`SUPABASE_SECRET_KEY`)

---

## 4. Environment Variables Configuration

### Backend (`backend/.env`)
Create a file named `.env` inside the `backend/` directory:
```env
PORT=5000
SUPABASE_URL=https://dvgzoowmliilmmcjucbg.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_publishable_key
SUPABASE_SECRET_KEY=your_supabase_service_role_secret_key
SUPABASE_JWKS_URL=https://dvgzoowmliilmmcjucbg.supabase.co/auth/v1/.well-known/jwks.json
```

### Web Frontend (`web/.env`)
Create a file named `.env` inside the `web/` directory:
```env
VITE_API_URL=http://localhost:5000
```
*(For production, replace with your deployed backend URL on Vercel, e.g., `https://gitpub-api.vercel.app`)*

---

## 5. Local Development Setup & Execution

### Backend API Setup
```bash
cd backend
npm install
npm run dev
```
The API server will run at: `http://localhost:5000`

### React Web Frontend Setup
```bash
cd web
npm install
npm run dev
```
The React development server will start at: `http://localhost:5173`

### Flutter Mobile App Setup
```bash
cd mobile
flutter pub get
# Run on Android Emulator (points to localhost via 10.0.2.2 by default)
flutter run

# Or point explicitly to your local or deployed API:
flutter run --dart-define=API_URL=http://10.0.2.2:5000
```

---

## 6. API Documentation

All private endpoints require the `Authorization` header:
`Authorization: Bearer <access_token>`

### 6.1 Authentication

#### `POST /api/auth/register`
Creates an account via Supabase Auth and generates a user profile.
- **Request Body**:
  ```json
  {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "password": "securepassword123"
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "message": "Registration successful",
    "token": "eyJhbGciOi...",
    "user": {
      "id": "e674092b-8a21-4f1b-a912-16789abcdef0",
      "email": "jane@example.com",
      "fullName": "Jane Doe"
    }
  }
  ```

#### `POST /api/auth/login`
Authenticates user with Supabase Auth and returns an access token.
- **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "securepassword123"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "message": "Login successful",
    "token": "eyJhbGciOi...",
    "user": {
      "id": "e674092b-8a21-4f1b-a912-16789abcdef0",
      "email": "jane@example.com",
      "fullName": "Jane Doe"
    }
  }
  ```

#### `POST /api/auth/logout`
- **Response (`200 OK`)**:
  ```json
  { "message": "Logged out successfully" }
  ```

#### `GET /api/auth/me` *(Protected)*
- **Response (`200 OK`)**:
  ```json
  {
    "user": {
      "id": "e674092b-8a21-4f1b-a912-16789abcdef0",
      "email": "jane@example.com",
      "fullName": "Jane Doe"
    }
  }
  ```

---

### 6.2 Projects

#### `GET /api/projects` *(Protected)*
Fetch all projects belonging to the authenticated user.
- **Query Parameters**:
  - `search` (optional): Filter by name substring (e.g. `?search=mobile`)
  - `status` (optional): `Not Started`, `In Progress`, `Completed`
- **Response (`200 OK`)**:
  ```json
  [
    {
      "id": "93a65c82-3591-447a-8f83-e8471b0ea100",
      "user_id": "e674092b-8a21-4f1b-a912-16789abcdef0",
      "name": "Mobile Redesign",
      "description": "Revamp mobile UX and theme",
      "status": "In Progress",
      "start_date": "2026-10-01",
      "end_date": "2026-11-01",
      "created_at": "2026-10-06T12:00:00Z"
    }
  ]
  ```

#### `POST /api/projects` *(Protected)*
- **Request Body**:
  ```json
  {
    "name": "Mobile Redesign",
    "description": "Revamp mobile UX and theme",
    "status": "In Progress",
    "start_date": "2026-10-01",
    "end_date": "2026-11-01"
  }
  ```
- **Response (`201 Created`)**: Project object.

#### `GET /api/projects/:id` *(Protected)*
- **Response (`200 OK`)**: Project object.

#### `PUT /api/projects/:id` *(Protected)*
- **Request Body**: Any editable fields (`name`, `description`, `status`, `start_date`, `end_date`).
- **Response (`200 OK`)**: Updated Project object.

#### `DELETE /api/projects/:id` *(Protected)*
- **Response (`200 OK`)**: `{ "message": "Project deleted successfully" }`

---

### 6.3 Tasks

#### `GET /api/tasks` *(Protected)*
Fetch tasks for the authenticated user.
- **Query Parameters**:
  - `project_id` (optional): Filter tasks by project ID
  - `status` (optional): `Pending`, `In Progress`, `Completed`
  - `priority` (optional): `Low`, `Medium`, `High`
  - `search` (optional): Filter by task name
- **Response (`200 OK`)**:
  ```json
  [
    {
      "id": "27c32bf2-68c1-4b11-9a40-27ebca937a1e",
      "project_id": "93a65c82-3591-447a-8f83-e8471b0ea100",
      "user_id": "e674092b-8a21-4f1b-a912-16789abcdef0",
      "name": "Implement Secure Storage",
      "description": "Use flutter_secure_storage for auth tokens",
      "priority": "High",
      "status": "Completed",
      "due_date": "2026-10-10",
      "created_at": "2026-10-06T12:30:00Z"
    }
  ]
  ```

#### `POST /api/tasks` *(Protected)*
- **Request Body**:
  ```json
  {
    "project_id": "93a65c82-3591-447a-8f83-e8471b0ea100",
    "name": "Implement Secure Storage",
    "description": "Use flutter_secure_storage for auth tokens",
    "priority": "High",
    "status": "Pending",
    "due_date": "2026-10-10"
  }
  ```
- **Response (`201 Created`)**: Task object.

#### `PUT /api/tasks/:id` *(Protected)*
- **Request Body**: Fields to update (`name`, `description`, `priority`, `status`, `due_date`).
- **Response (`200 OK`)**: Updated Task object.

#### `DELETE /api/tasks/:id` *(Protected)*
- **Response (`200 OK`)**: `{ "message": "Task deleted successfully" }`

---

### 6.4 Dashboard Statistics

#### `GET /api/dashboard` *(Protected)*
Calculates aggregated metrics exclusively for the authenticated user.
- **Response (`200 OK`)**:
  ```json
  {
    "totalProjects": 5,
    "totalTasks": 20,
    "completedTasks": 12,
    "pendingTasks": 8,
    "projectsInProgress": 3
  }
  ```

---

## 7. Vercel Deployment

Deploy both the backend and frontend from the same GitHub repository:

### Deployment 1: GitPub-API (Backend)
1. In Vercel, click **Add New** -> **Project**.
2. Select your `GitPub` repository.
3. In **Root Directory**, click **Edit** and set to: `backend`.
4. In **Environment Variables**, add:
   - `SUPABASE_URL` = `https://dvgzoowmliilmmcjucbg.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` = `<your-supabase-publishable-key>`
   - `SUPABASE_SECRET_KEY` = `<your-supabase-secret-key>`
   - `SUPABASE_JWKS_URL` = `https://dvgzoowmliilmmcjucbg.supabase.co/auth/v1/.well-known/jwks.json`
5. Click **Deploy**. Note down your deployed API URL (e.g. `https://gitpub-api.vercel.app`).

### Deployment 2: GitPub-Web (Frontend)
1. In Vercel, click **Add New** -> **Project**.
2. Select the same `GitPub` repository.
3. In **Root Directory**, set to: `web`.
4. Framework Preset will automatically detect **Vite**.
5. In **Environment Variables**, add:
   - `VITE_API_URL` = `https://gitpub-api.vercel.app` (your backend Vercel URL)
6. Click **Deploy**. Your React website will be live.

---

## 8. Building Flutter Android APK

To generate the release Android APK:
```bash
cd mobile
flutter build apk --release --dart-define=API_URL=https://gitpub-api.vercel.app
```
The resulting APK will be generated at:
`mobile/build/app/outputs/flutter-apk/app-release.apk`

---

## 9. GitHub Repository Upload Commands

To commit and push the repository to GitHub:
```bash
git init
git add .
git commit -m "feat: complete GitPub full-stack project implementation"
git branch -M main
git remote add origin https://github.com/<your-username>/GitPub.git
git push -u origin main
```

---

## 10. 5-Minute Assessment Demo Flow

1. **User Registration & Login**:
   - Register a new user (`test@gitpub.com`) on the React website.
   - Show successful login redirecting immediately to the Dashboard view.
2. **Dashboard Verification**:
   - Verify initial counters display `0` across all metric cards.
3. **Project Management**:
   - Click **+ Create Project**, enter "Enterprise Cloud Migration", status "In Progress", and submit.
   - Search for the project using the search bar and filter by status "In Progress".
4. **Task Management**:
   - Open the project details, add 2 tasks: "Audit IAM Roles" (High Priority, Pending) and "Setup VPC Peering" (Medium Priority, Pending).
   - Click **Complete** on "Audit IAM Roles".
   - Return to Dashboard to demonstrate real-time count updates (`Total Projects: 1`, `Total Tasks: 2`, `Completed Tasks: 1`, `Pending Tasks: 1`, `Projects In Progress: 1`).
5. **Cross-Platform Sync with Flutter Mobile App**:
   - Launch the Flutter app on the Android emulator.
   - Log in using the same credentials (`test@gitpub.com`).
   - The Dashboard immediately reflects the identical statistics.
   - Navigate to **Tasks**, tap the pull-to-refresh (`RefreshIndicator`), edit "Setup VPC Peering" to status "Completed".
   - Refresh the React website in the browser: "Setup VPC Peering" is updated to "Completed".
6. **Security & Session Expiry Test**:
   - Clear the token or test invalid credentials to demonstrate gracefull redirect to login with the notification: *"Session expired. Please log in again."*
