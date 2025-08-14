const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// MIDDLEWARE
// =============================================================================
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// =============================================================================
// DATABASE SETUP
// =============================================================================
const db = new sqlite3.Database('database.db');

// Initialize database tables
db.serialize(() => {
    // Products table
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            banner_url TEXT,
            main_video TEXT,
            access_url TEXT,
            buy_url TEXT,
            price REAL DEFAULT 0,
            category TEXT DEFAULT 'meus_produtos',
            plano_1 TEXT,
            plano_2 TEXT,
            plano_3 TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Product media table (for gallery)
    db.run(`
        CREATE TABLE IF NOT EXISTS product_media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            type TEXT CHECK(type IN ('image', 'video')),
            url TEXT NOT NULL,
            order_index INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    `);

    // User access table (for PerfectPay integration)
    db.run(`
        CREATE TABLE IF NOT EXISTS user_access (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            product_code TEXT,
            plan_code TEXT,
            plan_name TEXT,
            sale_amount REAL,
            payment_id TEXT,
            status TEXT DEFAULT 'active',
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert some sample data if table is empty
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (!err && row.count === 0) {
            const sampleProducts = [
                {
                    name: "Whatsapp Da Fabi",
                    description: "Clique no botão abaixo e fale com a Fabaine no seu Whatsapp particular",
                    banner_url: "https://files.catbox.moe/i6sfiz.png",
                    main_video: "https://e-volutionn.com/wp-content/uploads/2025/07/download-1.mp4",
                    access_url: "https://wa.me/5511975768554?text=Oi%20Fabi%2C%20vim%20pelo%20APP",
                    category: "meus_produtos",
                    plano_1: "PPLQQLST6"
                },
                {
                    name: "Pack Premium Exclusivo",
                    description: "Conteúdo premium exclusivo para membros VIP. Acesso a lives privadas e materiais únicos.",
                    banner_url: "https://images.unsplash.com/photo-1494790108755-2616c78d9f14?w=400&h=600&fit=crop",
                    main_video: "https://www.w3schools.com/html/mov_bbb.mp4",
                    buy_url: "https://hotmoney.space/",
                    price: 147.00,
                    category: "mais_vendidos",
                    plano_1: "PPLQQLST7"
                }
            ];

            sampleProducts.forEach((product, index) => {
                db.run(`
                    INSERT INTO products (name, description, banner_url, main_video, access_url, buy_url, price, category, plano_1)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [product.name, product.description, product.banner_url, product.main_video, 
                   product.access_url, product.buy_url, product.price, product.category, product.plano_1], function(err) {
                    if (!err && index === 0) {
                        // Add sample gallery for first product
                        const galleryItems = [
                            { type: 'image', url: 'https://e-volutionn.com/wp-content/uploads/2025/07/IMG_7978.jpg', order_index: 0 },
                            { type: 'image', url: 'https://e-volutionn.com/wp-content/uploads/2025/07/IMG_7975.jpg', order_index: 1 },
                            { type: 'video', url: 'https://e-volutionn.com/wp-content/uploads/2025/05/AMOSTRA-01.mp4', order_index: 2 }
                        ];
                        
                        galleryItems.forEach(item => {
                            db.run(`
                                INSERT INTO product_media (product_id, type, url, order_index)
                                VALUES (?, ?, ?, ?)
                            `, [this.lastID, item.type, item.url, item.order_index]);
                        });
                    }
                });
            });
        }
    });
});

// =============================================================================
// API ROUTES - PRODUCTS
// =============================================================================

// Get all products with their media
app.get('/api/products', (req, res) => {
    const query = `
        SELECT p.*, 
               GROUP_CONCAT(
                   json_object('type', pm.type, 'url', pm.url, 'order_index', pm.order_index)
                   ORDER BY pm.order_index
               ) as gallery_json
        FROM products p 
        LEFT JOIN product_media pm ON p.id = pm.product_id 
        GROUP BY p.id 
        ORDER BY p.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
        }
        
        const products = rows.map(row => {
            const product = { ...row };
            
            // Parse gallery JSON
            if (product.gallery_json) {
                try {
                    const galleryItems = product.gallery_json.split(',').map(item => JSON.parse(item));
                    product.gallery = galleryItems.sort((a, b) => a.order_index - b.order_index);
                } catch (e) {
                    product.gallery = [];
                }
            } else {
                product.gallery = [];
            }
            
            delete product.gallery_json;
            return product;
        });
        
        res.json({ success: true, products });
    });
});

// Get single product
app.get('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
        }
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }
        
        // Get product media
        db.all('SELECT * FROM product_media WHERE product_id = ? ORDER BY order_index', [productId], (err, media) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
            }
            
            product.gallery = media;
            res.json({ success: true, product });
        });
    });
});

// Create new product
app.post('/api/products', (req, res) => {
    const { 
        name, 
        description, 
        banner_url,
        main_video,
        access_url, 
        buy_url, 
        price, 
        category,
        plano_1,
        plano_2,
        plano_3
    } = req.body;
    
    if (!name) {
        return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }
    
    const query = `
        INSERT INTO products (name, description, banner_url, main_video, access_url, buy_url, price, category, plano_1, plano_2, plano_3)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [
        name, 
        description, 
        banner_url || null,
        main_video || null,
        access_url || null,
        buy_url || null,
        parseFloat(price) || 0,
        category || 'meus_produtos',
        plano_1 || null,
        plano_2 || null,
        plano_3 || null
    ], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error: 'Erro ao criar produto' });
        }
        
        res.json({ success: true, productId: this.lastID, message: 'Produto criado com sucesso!' });
    });
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    
    // Delete product (cascade will handle media)
    db.run('DELETE FROM products WHERE id = ?', [productId], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error: 'Erro ao deletar produto' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }
        
        res.json({ success: true, message: 'Produto deletado com sucesso!' });
    });
});

// =============================================================================
// PERFECTPAY WEBHOOK & ACCESS CONTROL
// =============================================================================

// Webhook PerfectPay - FORMATO REAL
app.post('/webhook/perfectpay', express.json(), (req, res) => {
    try {
        console.log('PerfectPay Webhook received:', JSON.stringify(req.body, null, 2));
        
        const payload = req.body;
        
        // Extrair dados do formato PerfectPay
        const {
            sale_status_enum_key,
            customer,
            product,
            plan,
            code: sale_code,
            sale_amount
        } = payload;
        
        // Verificar se o pagamento foi aprovado
        if (sale_status_enum_key !== 'approved') {
            console.log(`Status não aprovado: ${sale_status_enum_key}`);
            return res.json({ success: true, message: 'Status não processado' });
        }
        
        const email = customer?.email;
        const plan_code = plan?.code;
        const plan_name = plan?.name;
        
        if (!email || !plan_code) {
            console.log('Dados obrigatórios faltando:', { email, plan_code });
            return res.status(400).json({ success: false, error: 'Email e código do plano são obrigatórios' });
        }
        
        // Verificar se algum produto tem esse plano configurado
        const query = `
            SELECT * FROM products 
            WHERE plano_1 = ? OR plano_2 = ? OR plano_3 = ?
            LIMIT 1
        `;
        
        db.get(query, [plan_code, plan_code, plan_code], (err, product_row) => {
            if (err) {
                console.error('Erro ao buscar produto:', err);
                return res.status(500).json({ success: false, error: 'Erro interno' });
            }
            
            const product_code = product_row?.id || plan_code;
            
            // Liberar acesso
            const insertQuery = `
                INSERT INTO user_access 
                (email, product_code, plan_code, plan_name, sale_amount, payment_id, status)
                VALUES (?, ?, ?, ?, ?, ?, 'active')
            `;
            
            db.run(insertQuery, [
                email,
                product_code,
                plan_code,
                plan_name,
                sale_amount,
                sale_code
            ], function(err) {
                if (err) {
                    console.error('Erro ao liberar acesso:', err);
                    return res.status(500).json({ success: false, error: 'Erro interno' });
                }
                
                console.log(`✅ Acesso liberado: ${email} → Plano: ${plan_code} (${plan_name})`);
                res.json({ 
                    success: true, 
                    message: 'Acesso liberado com sucesso',
                    access_id: this.lastID,
                    plan: plan_name
                });
            });
        });
        
    } catch (error) {
        console.error('Erro no webhook PerfectPay:', error);
        res.status(400).json({ success: false, error: 'Dados inválidos' });
    }
});

// Verificar acesso do usuário a um produto específico - POR PLANO
app.post('/api/check-access', (req, res) => {
    const { email, plano_code } = req.body;
    
    if (!email || !plano_code) {
        return res.status(400).json({ success: false, error: 'Email e código do plano são obrigatórios' });
    }
    
    const query = `
        SELECT ua.*, p.name as product_name 
        FROM user_access ua
        LEFT JOIN products p ON (p.plano_1 = ua.plan_code OR p.plano_2 = ua.plan_code OR p.plano_3 = ua.plan_code)
        WHERE ua.email = ? AND ua.plan_code = ?
        AND ua.status = 'active'
        ORDER BY ua.created_at DESC
        LIMIT 1
    `;
    
    db.get(query, [email, plano_code], (err, row) => {
        if (err) {
            console.error('Erro ao verificar acesso:', err);
            return res.status(500).json({ success: false, error: 'Erro interno' });
        }
        
        if (row) {
            res.json({ 
                success: true, 
                hasAccess: true, 
                access: row,
                message: `Acesso liberado - Plano: ${row.plan_name}`
            });
        } else {
            res.json({ 
                success: true, 
                hasAccess: false, 
                message: 'Acesso negado - Plano não adquirido'
            });
        }
    });
});

// =============================================================================
// API ROUTES - ADMIN AUTH
// =============================================================================

// Simple admin login with new credentials
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    // New secure credentials
    if (username === 'painel-iago' && password === '#Senha8203') {
        res.json({ success: true, message: 'Login realizado com sucesso!' });
    } else {
        res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
});

// =============================================================================
// STATIC FILES & PWA
// =============================================================================

// Serve manifest.json
app.get('/manifest.json', (req, res) => {
    const manifest = {
        "name": "Membros VIP",
        "short_name": "VIP App",
        "description": "Área de Membros VIP - Acesso Exclusivo",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#000000",
        "theme_color": "#E50914",
        "icons": [
            {
                "src": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDEyOCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjEyOCIgaGVpZ2h0PSIxMjgiIGZpbGw9IiNFNTA5MTQiLz4KICA8dGV4dCB4PSI2NCIgeT0iNjgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjIwIiBmb250LXdlaWdodD0iYm9sZCI+VklQPC90ZXh0Pgo8L3N2Zz4=",
                "type": "image/svg+xml",
                "sizes": "128x128"
            }
        ]
    };
    
    res.json(manifest);
});

// Service Worker
app.get('/sw.js', (req, res) => {
    const swContent = `
        const CACHE_NAME = 'vip-app-v1';
        const urlsToCache = [
            '/',
            '/manifest.json'
        ];

        self.addEventListener('install', event => {
            event.waitUntil(
                caches.open(CACHE_NAME)
                    .then(cache => cache.addAll(urlsToCache))
            );
        });

        self.addEventListener('fetch', event => {
            event.respondWith(
                caches.match(event.request)
                    .then(response => {
                        if (response) {
                            return response;
                        }
                        return fetch(event.request);
                    })
            );
        });
    `;
    
    res.setHeader('Content-Type', 'application/javascript');
    res.send(swContent);
});

// Serve admin panel with secure URL
app.get('/painel-x7k2m9', (req, res) => {
    try {
        const adminPath = path.join(__dirname, 'public', 'admin.html');
        
        // Check if file exists
        if (fs.existsSync(adminPath)) {
            res.sendFile(adminPath);
        } else {
            // If admin.html doesn't exist, send a basic response
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Admin - Em Manutenção</title>
                    <style>
                        body { 
                            background: #111; 
                            color: white; 
                            font-family: Arial; 
                            text-align: center; 
                            padding: 50px; 
                        }
                    </style>
                </head>
                <body>
                    <h1>Painel em Manutenção</h1>
                    <p>O arquivo admin.html não foi encontrado.</p>
                    <p>Certifique-se de que o arquivo está em: public/admin.html</p>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('Erro ao servir admin:', error);
        res.status(500).send('Erro interno');
    }
});

// Serve main app
app.get('/', (req, res) => {
    try {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>VIP App</title>
                    <style>
                        body { 
                            background: #111; 
                            color: white; 
                            font-family: Arial; 
                            text-align: center; 
                            padding: 50px; 
                        }
                    </style>
                </head>
                <body>
                    <h1>Membros VIP - Em Desenvolvimento</h1>
                    <p>O arquivo index.html não foi encontrado.</p>
                    <a href="/painel-x7k2m9" style="color: #E50914;">Acessar Painel Admin</a>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('Erro ao servir index:', error);
        res.status(500).send('Erro interno');
    }
});

// =============================================================================
// ERROR HANDLING
// =============================================================================
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

// =============================================================================
// START SERVER
// =============================================================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📱 App principal: http://localhost:${PORT}`);
    console.log(`⚙️  Painel admin: http://localhost:${PORT}/painel-x7k2m9`);
    console.log(`📊 API: http://localhost:${PORT}/api/products`);
    console.log(`🔌 Webhook: http://localhost:${PORT}/webhook/perfectpay`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Fechando servidor...');
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('✅ Banco de dados fechado.');
        process.exit(0);
    });
});
