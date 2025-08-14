const express = require('express');
const sqlite3 = require('sqlite3').verbose();
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

    // Insert some sample data if table is empty (VERSÃO CORRIGIDA)
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (!err && row.count === 0) {
            console.log('📦 Inserindo produtos sample...');
            
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
                    
                    if (index === sampleProducts.length - 1) {
                        console.log('✅ Produtos sample inseridos com sucesso!');
                    }
                });
            });
        } else {
            console.log(`📦 Banco já tem ${row.count} produtos. Pulando inserção de samples.`);
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

// Create new product (VERSÃO ATUALIZADA COM GALERIA)
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
        plano_3,
        gallery
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
        
        const productId = this.lastID;
        
        // Insert gallery items if provided
        if (gallery && gallery.length > 0) {
            const insertMediaQuery = `
                INSERT INTO product_media (product_id, type, url, order_index)
                VALUES (?, ?, ?, ?)
            `;
            
            gallery.forEach((item, index) => {
                if (item.url && item.type) {
                    db.run(insertMediaQuery, [productId, item.type, item.url, index], (err) => {
                        if (err) {
                            console.error('❌ Erro ao inserir mídia da galeria:', err);
                        }
                    });
                }
            });
        }
        
        console.log(`✅ Produto criado: ${name} (ID: ${productId})`);
        res.json({ success: true, productId: productId, message: 'Produto criado com sucesso!' });
    });
});

// Update product (NOVA ROTA)
app.put('/api/products/:id', (req, res) => {
    const productId = req.params.id;
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
        plano_3,
        gallery
    } = req.body;
    
    if (!name) {
        return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }
    
    // Update product
    const updateQuery = `
        UPDATE products 
        SET name = ?, description = ?, banner_url = ?, main_video = ?, 
            access_url = ?, buy_url = ?, price = ?, category = ?, 
            plano_1 = ?, plano_2 = ?, plano_3 = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `;
    
    db.run(updateQuery, [
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
        plano_3 || null,
        productId
    ], function(err) {
        if (err) {
            console.error('❌ Erro ao atualizar produto:', err);
            return res.status(500).json({ success: false, error: 'Erro ao atualizar produto' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }
        
        // Delete existing gallery items
        db.run('DELETE FROM product_media WHERE product_id = ?', [productId], (err) => {
            if (err) {
                console.error('❌ Erro ao limpar galeria:', err);
            }
            
            // Insert new gallery items
            if (gallery && gallery.length > 0) {
                const insertMediaQuery = `
                    INSERT INTO product_media (product_id, type, url, order_index)
                    VALUES (?, ?, ?, ?)
                `;
                
                gallery.forEach((item, index) => {
                    if (item.url && item.type) {
                        db.run(insertMediaQuery, [productId, item.type, item.url, index], (err) => {
                            if (err) {
                                console.error('❌ Erro ao inserir mídia da galeria:', err);
                            }
                        });
                    }
                });
            }
            
            console.log(`✅ Produto atualizado: ${name} (ID: ${productId})`);
            res.json({ success: true, message: 'Produto atualizado com sucesso!' });
        });
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
// PERFECTPAY WEBHOOK & ACCESS CONTROL - OTIMIZADO
// =============================================================================

// Webhook PerfectPay - VERSÃO OTIMIZADA
app.post('/webhook/perfectpay', express.json(), (req, res) => {
    console.log('\n🔔 ===== WEBHOOK PERFECTPAY RECEBIDO =====');
    console.log('⏰ Timestamp:', new Date().toLocaleString('pt-BR'));
    console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));
    
    try {
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
        
        console.log('\n📊 DADOS EXTRAÍDOS:');
        console.log('- Status:', sale_status_enum_key);
        console.log('- Email do cliente:', customer?.email);
        console.log('- Código do plano:', plan?.code);
        console.log('- Nome do plano:', plan?.name);
        console.log('- Valor da venda:', sale_amount);
        
        // Verificar se o pagamento foi aprovado
        if (sale_status_enum_key !== 'approved') {
            console.log(`❌ Status não aprovado: ${sale_status_enum_key}`);
            console.log('============================================\n');
            return res.json({ success: true, message: 'Status não processado' });
        }
        
        const email = customer?.email;
        const plan_code = plan?.code;
        const plan_name = plan?.name;
        
        if (!email || !plan_code) {
            console.log('❌ Dados obrigatórios faltando!');
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
            
            console.log('📦 Produto encontrado:', product_row ? 'SIM' : 'NÃO');
            const product_code = product_row?.id || plan_code;
            
            // Verificar se já existe acesso para este email/plano
            const checkQuery = `
                SELECT * FROM user_access 
                WHERE email = ? AND plan_code = ? AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            `;
            
            db.get(checkQuery, [email, plan_code], (err, existing) => {
                if (err) {
                    console.error('❌ Erro ao verificar acesso existente:', err);
                }
                
                if (existing) {
                    console.log('⚠️ Acesso já existe para este email/plano');
                    console.log('============================================\n');
                    return res.json({ 
                        success: true, 
                        message: 'Acesso já existente',
                        access_id: existing.id
                    });
                }
                
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

// Verificar acesso do usuário - VERSÃO OTIMIZADA
app.post('/api/check-access', (req, res) => {
    const { email, plano_code } = req.body;
    
    console.log(`🔍 Verificando acesso: ${email} → ${plano_code}`);
    
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
            console.error('❌ Erro ao verificar acesso:', err);
            return res.status(500).json({ success: false, error: 'Erro interno' });
        }
        
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

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'painel-iago' && password === '#Senha8203') {
        res.json({ success: true, message: 'Login realizado com sucesso!' });
    } else {
        res.status(401).json({ success: false, error: 'Credenciais inválidas' });
    }
});

// =============================================================================
// PWA ROUTES
// =============================================================================

app.get('/manifest.json', (req, res) => {
    const manifest = {
        "name": "Membros VIP",
        "short_name": "VIP App",
        "description": "Área de Membros VIP - Acesso Exclusivo",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#000000",
        "theme_color": "#E50914",
        "orientation": "portrait",
        "scope": "/",
        "icons": [
            {
                "src": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjE5MiIgaGVpZ2h0PSIxOTIiIGZpbGw9IiNFNTA5MTQiLz4KICA8dGV4dCB4PSI5NiIgeT0iMTA2IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIzNiIgZm9udC13ZWlnaHQ9ImJvbGQiPldJUDwvdGV4dD4KPC9zdmc+",
                "type": "image/svg+xml",
                "sizes": "192x192"
            },
            {
                "src": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIGZpbGw9IiNFNTA5MTQiLz4KICA8dGV4dCB4PSIyNTYiIHk9IjI4NiIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iOTYiIGZvbnQtd2VpZ2h0PSJib2xkIj5WSVA8L3RleHQ+Cjwvc3ZnPg==",
                "type": "image/svg+xml",
                "sizes": "512x512"
            }
        ]
    };
    
    res.json(manifest);
});

app.get('/sw.js', (req, res) => {
    const swContent = `
        const CACHE_NAME = 'vip-app-v2';
        const urlsToCache = [
            '/',
            '/manifest.json',
            '/api/products'
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

// =============================================================================
// SERVE STATIC FILES
// =============================================================================

// Rota do painel administrativo (ATUALIZADA)
app.get('/painel-x7k2m9', (req, res) => {
    try {
        const adminPath = path.join(__dirname, 'public', 'admin.html');
        
        if (fs.existsSync(adminPath)) {
            console.log('✅ Servindo admin.html do arquivo');
            res.sendFile(adminPath);
        } else {
            console.log('⚠️ admin.html não encontrado, servindo HTML inline');
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>🛠️ Painel Admin VIP</title>
                    <style>
                        body { 
                            background: #111; 
                            color: white; 
                            font-family: Arial; 
                            text-align: center; 
                            padding: 50px; 
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            background: #222;
                            padding: 2rem;
                            border-radius: 10px;
                            border: 1px solid #E50914;
                        }
                        h1 { color: #E50914; }
                        a { 
                            color: #E50914; 
                            text-decoration: none; 
                            margin: 10px; 
                            display: block; 
                            padding: 10px;
                            background: #333;
                            border-radius: 5px;
                        }
                        a:hover { background: #444; }
                        .status { color: #28a745; margin: 1rem 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🛠️ Painel Administrativo VIP</h1>
                        <div class="status">✅ Servidor funcionando corretamente!</div>
                        
                        <h3>📋 Para ativar o painel completo:</h3>
                        <p>1. Copie o HTML do painel administrativo</p>
                        <p>2. Salve como <strong>public/admin.html</strong></p>
                        <p>3. Reinicie o servidor</p>
                        
                        <h3>🔧 Links úteis:</h3>
                        <a href="/">🏠 Voltar ao App Principal</a>
                        <a href="/debug/products">📦 Ver Produtos (Debug)</a>
                        <a href="/debug/access">🔑 Ver Acessos (Debug)</a>
                        
                        <p style="margin-top: 2rem; font-size: 0.9rem; color: #666;">
                            Login: painel-iago | Senha: #Senha8203
                        </p>
                    </div>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('Erro ao servir admin:', error);
        res.status(500).send('Erro interno');
    }
});

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
                    <title>🚀 Membros VIP</title>
                    <style>
                        body { 
                            background: #111; 
                            color: white; 
                            font-family: Arial; 
                            text-align: center; 
                            padding: 50px; 
                        }
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            background: #222;
                            padding: 2rem;
                            border-radius: 10px;
                            border: 1px solid #E50914;
                        }
                        h1 { color: #E50914; }
                        a { 
                            color: #E50914; 
                            text-decoration: none; 
                            margin: 10px; 
                            display: block; 
                            padding: 10px;
                            background: #333;
                            border-radius: 5px;
                        }
                        a:hover { background: #444; }
                        .status { color: #28a745; margin: 1rem 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🚀 Membros VIP - Sistema Funcionando!</h1>
                        <div class="status">✅ Servidor rodando corretamente</div>
                        <p>⚠️ Arquivo index.html não encontrado em public/</p>
                        
                        <h2>🔗 Links principais:</h2>
                        <a href="/painel-x7k2m9">🛠️ Painel Administrativo</a>
                        <a href="/debug/products">📦 Ver Produtos (Debug)</a>
                        <a href="/debug/access">🔑 Ver Acessos (Debug)</a>
                        
                        <h3>📱 API Status:</h3>
                        <p>✅ Webhook PerfectPay: /webhook/perfectpay</p>
                        <p>✅ API Produtos: /api/products</p>
                        <p>✅ Verificação de Acesso: /api/check-access</p>
                    </div>
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
// ERROR HANDLING & SERVER START
// =============================================================================

app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
    console.log(`\n🚀 ===== SERVIDOR VIP INICIADO =====`);
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);
    console.log(`🌐 Porta: ${PORT}`);
    console.log(`\n📱 LINKS PRINCIPAIS:`);
    console.log(`   App Principal: http://localhost:${PORT}`);
    console.log(`   Painel Admin:  http://localhost:${PORT}/painel-x7k2m9`);
    console.log(`\n🔌 API ENDPOINTS:`);
    console.log(`   Produtos:      GET  /api/products`);
    console.log(`   Criar:         POST /api/products`);
    console.log(`   Editar:        PUT  /api/products/:id`);
    console.log(`   Excluir:       DELETE /api/products/:id`);
    console.log(`   Webhook:       POST /webhook/perfectpay`);
    console.log(`   Verificar:     POST /api/check-access`);
    console.log(`\n🐛 DEBUG ROUTES:`);
    console.log(`   Ver Produtos:  GET  /debug/products`);
    console.log(`   Ver Acessos:   GET  /debug/access`);
    console.log(`   Simular:       POST /debug/simulate-access`);
    console.log(`\n✅ Sistema pronto para receber webhooks do PerfectPay!`);
    console.log(`🛠️ Painel admin disponível com login persistente!`);
    console.log(`=====================================\n`);
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
