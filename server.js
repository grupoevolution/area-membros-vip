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
// DEBUG ROUTES - PARA TESTAR O BANCO
// =============================================================================

// Rota para verificar produtos no banco
app.get('/debug/products', (req, res) => {
    db.all('SELECT * FROM products', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ products: rows });
    });
});

// Rota para verificar acessos no banco
app.get('/debug/access', (req, res) => {
    db.all('SELECT * FROM user_access ORDER BY created_at DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ access_records: rows });
    });
});

// Rota para verificar acesso específico
app.get('/debug/access/:email', (req, res) => {
    const email = req.params.email;
    
    const query = `
        SELECT ua.*, p.name as product_name, p.plano_1, p.plano_2, p.plano_3
        FROM user_access ua
        LEFT JOIN products p ON (p.plano_1 = ua.plan_code OR p.plano_2 = ua.plan_code OR p.plano_3 = ua.plan_code)
        WHERE ua.email = ?
        ORDER BY ua.created_at DESC
    `;
    
    db.all(query, [email], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            email,
            access_records: rows,
            total: rows.length
        });
    });
});

// Rota para simular webhook (para testes)
app.post('/debug/simulate-access', (req, res) => {
    const { email, plan_code } = req.body;
    
    if (!email || !plan_code) {
        return res.status(400).json({ error: 'Email e plan_code são obrigatórios' });
    }
    
    // Inserir acesso manualmente para teste
    const insertQuery = `
        INSERT INTO user_access 
        (email, product_code, plan_code, plan_name, sale_amount, payment_id, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
    `;
    
    db.run(insertQuery, [
        email,
        plan_code, // usando plan_code como product_code também
        plan_code,
        'Plano Teste',
        99.99,
        'TEST_' + Date.now()
    ], function(err) {
        if (err) {
            console.error('❌ Erro ao inserir acesso:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`✅ Acesso liberado manualmente: ${email} → ${plan_code}`);
        res.json({ 
            success: true, 
            message: 'Acesso liberado para teste',
            access_id: this.lastID
        });
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
            console.error('❌ Erro ao buscar produtos:', err);
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
        
        console.log(`📦 Produtos carregados: ${products.length}`);
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
            console.error('❌ Erro ao criar produto:', err);
            return res.status(500).json({ success: false, error: 'Erro ao criar produto' });
        }
        
        console.log(`✅ Produto criado: ${name} (ID: ${this.lastID})`);
        res.json({ success: true, productId: this.lastID, message: 'Produto criado com sucesso!' });
    });
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    
    // Delete product (cascade will handle media)
    db.run('DELETE FROM products WHERE id = ?', [productId], function(err) {
        if (err) {
            console.error('❌ Erro ao deletar produto:', err);
            return res.status(500).json({ success: false, error: 'Erro ao deletar produto' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }
        
        console.log(`✅ Produto deletado: ID ${productId}`);
        res.json({ success: true, message: 'Produto deletado com sucesso!' });
    });
});

// =============================================================================
// PERFECTPAY WEBHOOK & ACCESS CONTROL - COM LOGS DETALHADOS
// =============================================================================

// Webhook PerfectPay - COM LOGS DETALHADOS
app.post('/webhook/perfectpay', express.json(), (req, res) => {
    console.log('\n🔔 ===== WEBHOOK PERFECTPAY RECEBIDO =====');
    console.log('⏰ Timestamp:', new Date().toLocaleString('pt-BR'));
    console.log('📄 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));
    console.log('📦 Tipo do body:', typeof req.body);
    console.log('📦 Keys do body:', Object.keys(req.body || {}));
    
    try {
        const payload = req.body;
        
        // Log de cada propriedade importante
        console.log('\n🔍 ANÁLISE DOS DADOS:');
        console.log('- sale_status_enum_key:', payload.sale_status_enum_key);
        console.log('- customer:', payload.customer);
        console.log('- product:', payload.product);
        console.log('- plan:', payload.plan);
        console.log('- code:', payload.code);
        console.log('- sale_amount:', payload.sale_amount);
        
        // Extrair dados do formato PerfectPay
        const {
            sale_status_enum_key,
            customer,
            product,
            plan,
            code: sale_code,
            sale_amount
        } = payload;
        
        console.log('\n📊 DADOS EXTRAÍDOS:');
        console.log('- Status:', sale_status_enum_key);
        console.log('- Email do cliente:', customer?.email);
        console.log('- Código do plano:', plan?.code);
        console.log('- Nome do plano:', plan?.name);
        console.log('- Valor da venda:', sale_amount);
        console.log('- Código da venda:', sale_code);
        
        // Verificar se o pagamento foi aprovado
        if (sale_status_enum_key !== 'approved') {
            console.log(`❌ Status não aprovado: ${sale_status_enum_key}`);
            console.log('============================================\n');
            return res.json({ success: true, message: 'Status não processado' });
        }
        
        const email = customer?.email;
        const plan_code = plan?.code;
        const plan_name = plan?.name;
        
        console.log('\n✅ PAGAMENTO APROVADO!');
        console.log('- Email:', email);
        console.log('- Plano code:', plan_code);
        console.log('- Plano name:', plan_name);
        
        if (!email || !plan_code) {
            console.log('❌ Dados obrigatórios faltando!');
            console.log('- Email presente:', !!email);
            console.log('- Plan code presente:', !!plan_code);
            console.log('============================================\n');
            return res.status(400).json({ success: false, error: 'Email e código do plano são obrigatórios' });
        }
        
        // Verificar se algum produto tem esse plano configurado
        console.log('\n🔍 BUSCANDO PRODUTO COM PLANO:', plan_code);
        const query = `
            SELECT * FROM products 
            WHERE plano_1 = ? OR plano_2 = ? OR plano_3 = ?
            LIMIT 1
        `;
        
        db.get(query, [plan_code, plan_code, plan_code], (err, product_row) => {
            if (err) {
                console.error('❌ Erro ao buscar produto:', err);
                console.log('============================================\n');
                return res.status(500).json({ success: false, error: 'Erro interno' });
            }
            
            console.log('📦 Produto encontrado:', product_row);
            const product_code = product_row?.id || plan_code;
            
            // Verificar se já existe acesso para este email/plano
            const checkQuery = `
                SELECT * FROM user_access 
                WHERE email = ? AND plan_code = ?
                ORDER BY created_at DESC
                LIMIT 1
            `;
            
            db.get(checkQuery, [email, plan_code], (err, existing) => {
                if (err) {
                    console.error('❌ Erro ao verificar acesso existente:', err);
                }
                
                console.log('🔄 Acesso existente:', existing);
                
                // Liberar acesso
                console.log('\n🔓 LIBERANDO ACESSO...');
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
                        console.error('❌ Erro ao liberar acesso:', err);
                        console.log('============================================\n');
                        return res.status(500).json({ success: false, error: 'Erro interno' });
                    }
                    
                    console.log(`✅ SUCESSO! Acesso liberado:`);
                    console.log(`- ID do acesso: ${this.lastID}`);
                    console.log(`- Email: ${email}`);
                    console.log(`- Plano: ${plan_code} (${plan_name})`);
                    console.log(`- Produto: ${product_code}`);
                    console.log('============================================\n');
                    
                    res.json({ 
                        success: true, 
                        message: 'Acesso liberado com sucesso',
                        access_id: this.lastID,
                        plan: plan_name,
                        email: email,
                        plan_code: plan_code
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('❌ ERRO CRÍTICO no webhook:', error);
        console.log('============================================\n');
        res.status(400).json({ success: false, error: 'Dados inválidos' });
    }
});

// Verificar acesso do usuário a um produto específico - POR PLANO - COM LOGS
app.post('/api/check-access', (req, res) => {
    const { email, plano_code } = req.body;
    
    console.log('\n🔍 VERIFICANDO ACESSO:');
    console.log('- Email:', email);
    console.log('- Plano code:', plano_code);
    
    if (!email || !plano_code) {
        console.log('❌ Dados obrigatórios faltando');
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
            console.error('❌ Erro ao verificar acesso:', err);
            return res.status(500).json({ success: false, error: 'Erro interno' });
        }
        
        console.log('📊 Resultado da consulta:', row);
        
        if (row) {
            console.log(`✅ ACESSO LIBERADO para ${email} no plano ${plano_code}`);
            res.json({ 
                success: true, 
                hasAccess: true, 
                access: row,
                message: `Acesso liberado - Plano: ${row.plan_name || plano_code}`
            });
        } else {
            console.log(`❌ ACESSO NEGADO para ${email} no plano ${plano_code}`);
            
            // Verificar se existe ALGUM acesso para este email
            db.all('SELECT * FROM user_access WHERE email = ?', [email], (err, allAccess) => {
                if (!err && allAccess.length > 0) {
                    console.log(`📋 Acessos encontrados para ${email}:`, allAccess.map(a => ({
                        plan_code: a.plan_code,
                        plan_name: a.plan_name,
                        created_at: a.created_at
                    })));
                } else {
                    console.log(`📭 Nenhum acesso encontrado para ${email}`);
                }
            });
            
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
                    
                    <h2>Debug Routes:</h2>
                    <p><a href="/debug/products" style="color: #E50914;">Ver Produtos</a></p>
                    <p><a href="/debug/access" style="color: #E50914;">Ver Acessos</a></p>
                    <p><a href="/debug/access/cauapetry2006@gmail.com" style="color: #E50914;">Ver Acesso do Cauan</a></p>
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
                    <p>Coloque o arquivo index.html na pasta public/</p>
                    
                    <h2>Links Úteis:</h2>
                    <p><a href="/painel-x7k2m9" style="color: #E50914;">Acessar Painel Admin</a></p>
                    <p><a href="/debug/products" style="color: #E50914;">Ver Produtos (Debug)</a></p>
                    <p><a href="/debug/access" style="color: #E50914;">Ver Acessos (Debug)</a></p>
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
    console.log(`🐛 Debug produtos: http://localhost:${PORT}/debug/products`);
    console.log(`🐛 Debug acessos: http://localhost:${PORT}/debug/access`);
    console.log(`🐛 Testar acesso Cauan: http://localhost:${PORT}/debug/access/cauapetry2006@gmail.com`);
    console.log(`\n📝 Para testar manualmente:`);
    console.log(`   POST /debug/simulate-access`);
    console.log(`   { "email": "cauapetry2006@gmail.com", "plan_code": "PPLQQLST6" }`);
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
