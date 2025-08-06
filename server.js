const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Session configuration
app.use(session({
  secret: 'vip-members-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/';
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens e vídeos são permitidos!'));
    }
  }
});

// Data management functions
const DATA_FILE = 'data/products.json';
const USERS_FILE = 'data/users.json';

// Ensure data directory exists
fs.ensureDirSync('data');

// Initialize data files if they don't exist
if (!fs.existsSync(DATA_FILE)) {
  const defaultProducts = [
    {
      id: 1,
      name: "Curso Completo de Sedução",
      description: "Aprenda as melhores técnicas de sedução e conquista com este curso exclusivo.",
      banner_url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=600&fit=crop",
      category: "meus_produtos",
      price: 97.00,
      type: "owned",
      content: [
        {
          id: 1,
          title: "Introdução ao Curso",
          type: "text",
          content: "Bem-vindo ao curso mais completo de sedução! Neste curso você aprenderá técnicas comprovadas para conquistar e seduzir."
        }
      ]
    },
    {
      id: 2,
      name: "Mastery em Relacionamentos",
      description: "Domine a arte dos relacionamentos duradouros. Técnicas comprovadas para criar conexões profundas.",
      banner_url: "https://images.unsplash.com/photo-1516726817505-f5ed825624d8?w=400&h=600&fit=crop",
      category: "mais_vendidos",
      price: 197.00,
      type: "external",
      buy_url: "https://hotmoney.space/"
    }
  ];
  fs.writeJsonSync(DATA_FILE, defaultProducts);
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeJsonSync(USERS_FILE, {});
}

function getProducts() {
  return fs.readJsonSync(DATA_FILE);
}

function saveProducts(products) {
  fs.writeJsonSync(DATA_FILE, products);
}

function getUsers() {
  return fs.readJsonSync(USERS_FILE);
}

function saveUsers(users) {
  fs.writeJsonSync(USERS_FILE, users);
}

// Routes

// Home page - Área de membros
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin panel
app.get('/painel-adm', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API Routes

// Admin authentication
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === '#Senha8203') {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Senha incorreta' });
  }
});

// Check admin status
app.get('/api/admin/check', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ success: true });
});

// User login
app.post('/api/login', (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.json({ success: false, message: 'Email inválido' });
  }
  
  const users = getUsers();
  users[email] = {
    email,
    lastLogin: new Date().toISOString()
  };
  saveUsers(users);
  
  req.session.userEmail = email;
  res.json({ success: true, email });
});

// Get products
app.get('/api/products', (req, res) => {
  const products = getProducts();
  res.json(products);
});

// Add product (Admin only)
app.post('/api/admin/products', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  const products = getProducts();
  const newProduct = {
    id: Date.now(),
    ...req.body,
    content: req.body.type === 'owned' ? [] : undefined
  };
  
  products.push(newProduct);
  saveProducts(products);
  
  res.json(newProduct);
});

// Update product (Admin only)
app.put('/api/admin/products/:id', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  const products = getProducts();
  const productId = parseInt(req.params.id);
  const index = products.findIndex(p => p.id === productId);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  
  products[index] = { ...products[index], ...req.body };
  saveProducts(products);
  
  res.json(products[index]);
});

// Delete product (Admin only)
app.delete('/api/admin/products/:id', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  const products = getProducts();
  const productId = parseInt(req.params.id);
  const index = products.findIndex(p => p.id === productId);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }
  
  products.splice(index, 1);
  saveProducts(products);
  
  res.json({ success: true });
});

// Add content to product (Admin only)
app.post('/api/admin/products/:id/content', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  const products = getProducts();
  const productId = parseInt(req.params.id);
  const product = products.find(p => p.id === productId);
  
  if (!product || product.type !== 'owned') {
    return res.status(404).json({ error: 'Produto não encontrado ou não é próprio' });
  }
  
  if (!product.content) product.content = [];
  
  const newContent = {
    id: Date.now(),
    ...req.body
  };
  
  product.content.push(newContent);
  saveProducts(products);
  
  res.json(newContent);
});

// Delete content from product (Admin only)
app.delete('/api/admin/products/:id/content/:contentId', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  const products = getProducts();
  const productId = parseInt(req.params.id);
  const contentId = parseInt(req.params.contentId);
  const product = products.find(p => p.id === productId);
  
  if (!product || !product.content) {
    return res.status(404).json({ error: 'Produto ou conteúdo não encontrado' });
  }
  
  const contentIndex = product.content.findIndex(c => c.id === contentId);
  if (contentIndex === -1) {
    return res.status(404).json({ error: 'Conteúdo não encontrado' });
  }
  
  product.content.splice(contentIndex, 1);
  saveProducts(products);
  
  res.json({ success: true });
});

// File upload (Admin only)
app.post('/api/admin/upload', upload.single('file'), (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ 
    success: true, 
    url: fileUrl,
    filename: req.file.filename,
    originalName: req.file.originalname
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Área de membros: http://localhost:${PORT}`);
  console.log(`🛠️ Painel admin: http://localhost:${PORT}/painel-adm`);
});
