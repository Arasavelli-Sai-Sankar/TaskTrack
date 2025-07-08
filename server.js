const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// ✅ Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ Mongo Error:', err));

// ✅ User Model
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: String,
  lastName: String
}));

// ✅ Assignment Model
const Assignment = mongoose.model('Assignment', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: String,
  dueDate: Date,
  completed: { type: Boolean, default: false }
}));

// ✅ Middleware
app.use(cors({
  origin: 'http://localhost:5000',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Sessions
app.use(session({
  secret: JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// ✅ Serve static files
app.use(express.static(path.join(__dirname)));

// ✅ Auth Middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/login?msg=Please login');
}

// ✅ Utility
function isOverdue(task) {
  return !task.completed && new Date(task.dueDate) < new Date();
}

// ✅ HTML Routes
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'signup.html')));
app.get('/index.html', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ✅ Register
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;
  if (!username || !email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashed, firstName, lastName });

    req.session.userId = user._id;
    res.status(200).json({ message: 'Registered successfully', user });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: 'User is not registered. Please sign up.' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ error: 'Invalid password' });

  req.session.userId = user._id;
  res.status(200).json({ message: 'Login successful', user });
});

// ✅ Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

// ✅ Authenticated user
app.get('/api/auth/user', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = await User.findById(req.session.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ user });
  } catch (err) {
    console.error('User check error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ✅ Create Assignment
app.post('/api/assignments', isAuthenticated, async (req, res) => {
  const { title, description, dueDate } = req.body;

  if (!title || !dueDate || !description) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const newAssignment = await Assignment.create({
      userId: req.session.userId,
      title,
      description,
      dueDate,
      completed: false
    });

    res.status(201).json({
      assignment: {
        ...(newAssignment.toObject ? newAssignment.toObject() : newAssignment),
        id: newAssignment._id,
        isOverdue: isOverdue(newAssignment)
      }
    });
  } catch (err) {
    console.error('Assignment create error:', err);
    res.status(500).json({ error: 'Failed to save task' });
  }
});

// ✅ Get Assignments
app.get('/api/assignments', isAuthenticated, async (req, res) => {
  try {
    const tasks = await Assignment.find({ userId: req.session.userId }).sort({ dueDate: 1 });
    const formatted = tasks.map(task => ({
      ...(task.toObject ? task.toObject() : task),
      id: task._id,
      isOverdue: isOverdue(task)
    }));
    res.status(200).json({ assignments: formatted });
  } catch (err) {
    console.error('Load assignments error:', err);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// ✅ Update Assignment
app.put('/api/assignments/:id', isAuthenticated, async (req, res) => {
  const { title, description, dueDate } = req.body;

  try {
    const updated = await Assignment.findOneAndUpdate(
      { _id: req.params.id, userId: req.session.userId },
      { title, description, dueDate },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Task not found' });

    res.status(200).json({
      assignment: {
        ...(updated.toObject ? updated.toObject() : updated),
        id: updated._id,
        isOverdue: isOverdue(updated)
      }
    });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ✅ Delete Assignment
app.delete('/api/assignments/:id', isAuthenticated, async (req, res) => {
  try {
    const deleted = await Assignment.findOneAndDelete({
      _id: req.params.id,
      userId: req.session.userId
    });

    if (!deleted) return res.status(404).json({ error: 'Task not found' });

    res.status(200).json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// ✅ Toggle Assignment Status
app.patch('/api/assignments/:id/toggle', isAuthenticated, async (req, res) => {
  try {
    const task = await Assignment.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    task.completed = !task.completed;
    await task.save();

    res.status(200).json({
      assignment: {
        ...(task.toObject ? task.toObject() : task),
        id: task._id,
        isOverdue: isOverdue(task)
      }
    });
  } catch (err) {
    console.error('Toggle task error:', err);
    res.status(500).json({ error: 'Failed to toggle status' });
  }
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
