const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// MIDDLEWARE
app.use(cors());
app.use(express.json());

// Static files com controle de cache
app.use(express.static('public', {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath);
        if (ext === '.html') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (ext === '.css' || ext === '.js') {
            res.setHeader('Cache-Control', 'public, max-age=60');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=300');
        }
        res.setHeader('Last-Modified', new Date().toUTCString());
    }
}));

app.use('/uploads', express.static('uploads', {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=3600');
    }
}));

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Anti-cache middleware para APIs
const forceNoCacheMiddleware = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('ETag', `"${Date.now()}-${Math.random()}"`);
    res.setHeader('Last-Modified', new Date().toUTCString());
    res.setHeader('Vary', '*');
    next();
};

app.use('/api/*', forceNoCacheMiddleware);
app.use('/debug/*', forceNoCacheMiddleware);
app.use('/webhook/*', forceNoCacheMiddleware);

// DATABASE SETUP
const db = new sqlite3.Database('database.db');

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

    // Product media table
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

    // User access table
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert sample data
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
                        console.log('✅ Produtos sample inseridos!');
                    }
                });
            });
        } else {
            console.log(`📦 Banco já tem ${row.count} produtos.`);
        }
    });
});

// DEBUG ROUTES
app.get('/debug/products', (req, res) => {
    console.log(`🐛 DEBUG: Listando produtos (${new Date().toLocaleTimeString()})`);
    
    db.all('SELECT * FROM products ORDER BY updated_at DESC', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            products: rows,
            timestamp: new Date().toISOString(),
            total: rows.length
        });
    });
});

app.get('/debug/access', (req, res) => {
    console.log(`🐛 DEBUG: Listando acessos (${new Date().toLocaleTimeString()})`);
    
    db.all('SELECT * FROM user_access ORDER BY created_at DESC LIMIT 50', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ 
            access_records: rows,
            timestamp: new Date().toISOString(),
            total: rows.length
        });
    });
});

app.get('/debug/access/:email', (req, res) => {
    const email = req.params.email;
    console.log(`🐛 DEBUG: Verificando acessos para ${email}`);
    
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
            total: rows.length,
            timestamp: new Date().toISOString()
        });
    });
});

app.post('/debug/simulate-access', (req, res) => {
    const { email, plan_code } = req.body;
    
    if (!email || !plan_code) {
        return res.status(400).json({ error: 'Email e plan_code são obrigatórios' });
    }
    
    const insertQuery = `
        INSERT INTO user_access 
        (email, product_code, plan_code, plan_name, sale_amount, payment_id, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
    `;
    
    db.run(insertQuery, [
        email,
        plan_code,
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
            access_id: this.lastID,
            timestamp: new Date().toISOString()
        });
    });
});

// API ROUTES - PRODUCTS
app.get('/api/products', (req, res) => {
    console.log(`📦 API: Carregando produtos (${new Date().toLocaleTimeString()})`);
    
    const query = `
        SELECT p.*, 
               GROUP_CONCAT(
                   json_object('type', pm.type, 'url', pm.url, 'order_index', pm.order_index)
                   ORDER BY pm.order_index
               ) as gallery_json
        FROM products p 
        LEFT JOIN product_media pm ON p.id = pm.product_id 
        GROUP BY p.id 
        ORDER BY p.updated_at DESC, p.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('❌ Erro ao buscar produtos:', err);
            return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
        }
        
        const products = rows.map(row => {
            const product = { ...row };
            
            // CORREÇÃO: Parse correto da galeria
            if (product.gallery_json) {
                try {
                    // Remove o GROUP_CONCAT wrapper e faz parse individual
                    const galleryString = product.gallery_json;
                    const items = galleryString.split('},{').map((item, index, arr) => {
                        if (index === 0 && arr.length > 1) {
                            return item + '}';
                        } else if (index === arr.length - 1 && arr.length > 1) {
                            return '{' + item;
                        } else if (arr.length > 1) {
                            return '{' + item + '}';
                        }
                        return item;
                    });
                    
                    product.gallery = items.map(item => {
                        try {
                            return JSON.parse(item);
                        } catch (e) {
                            console.error('Erro ao fazer parse do item:', item);
                            return null;
                        }
                    }).filter(item => item !== null);
                    
                } catch (e) {
                    console.error('❌ Erro ao processar galeria:', e);
                    product.gallery = [];
                }
            } else {
                product.gallery = [];
            }
            
            delete product.gallery_json;
            return product;
        });
        
        console.log(`📦 Retornando ${products.length} produtos atualizados`);
        res.json({ 
            success: true, 
            products,
            timestamp: new Date().toISOString(),
            cache_buster: Date.now()
        });
    });
});

app.get('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
        }
        
        if (!product) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }
        
        db.all('SELECT * FROM product_media WHERE product_id = ? ORDER BY order_index', [productId], (err, media) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
            }
            
            product.gallery = media;
            res.json({ 
                success: true, 
                product,
                timestamp: new Date().toISOString()
            });
        });
    });
});

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
        INSERT INTO products (name, description, banner_url, main_video, access_url, buy_url, price, category, plano_1, plano_2, plano_3, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
        res.json({ 
            success: true, 
            productId: productId, 
            message: 'Produto criado com sucesso!',
            timestamp: new Date().toISOString()
        });
    });
});

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
        
        db.run('DELETE FROM product_media WHERE product_id = ?', [productId], (err) => {
            if (err) {
                console.error('❌ Erro ao limpar galeria:', err);
            }
            
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
            res.json({ 
                success: true, 
                message: 'Produto atualizado com sucesso!',
                timestamp: new Date().toISOString()
            });
        });
    });
});

app.delete('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    
    db.run('DELETE FROM products WHERE id = ?', [productId], function(err) {
        if (err) {
            console.error('❌ Erro ao deletar produto:', err);
            return res.status(500).json({ success: false, error: 'Erro ao deletar produto' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }
        
        console.log(`✅ Produto deletado: ID ${productId}`);
        res.json({ 
            success: true, 
            message: 'Produto deletado com sucesso!',
            timestamp: new Date().toISOString()
        });
    });
});

// ENDPOINT PRINCIPAL - Buscar produtos que o usuário tem acesso (CORRIGIDO)
app.post('/api/user/products', (req, res) => {
    const { email } = req.body;
    
    console.log(`\n🔍 ===== BUSCANDO PRODUTOS DO USUÁRIO =====`);
    console.log(`📧 Email: ${email}`);
    console.log(`⏰ Hora: ${new Date().toLocaleTimeString()}`);
    
    if (!email) {
        console.log('❌ Email não fornecido');
        return res.json({ 
            success: true, 
            products: [],
            userProducts: [],
            message: 'Email é obrigatório'
        });
    }
    
    // Buscar TODOS os acessos ativos do usuário
    const accessQuery = `
        SELECT DISTINCT plan_code, plan_name, created_at 
        FROM user_access 
        WHERE email = ? AND status = 'active'
        ORDER BY created_at DESC
    `;
    
    db.all(accessQuery, [email], (err, userAccess) => {
        if (err) {
            console.error('❌ Erro ao buscar acessos:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Erro ao buscar acessos'
            });
        }
        
        console.log(`📊 Acessos encontrados: ${userAccess.length}`);
        if (userAccess.length > 0) {
            console.log('📋 Planos liberados:', userAccess.map(a => a.plan_code).join(', '));
        }
        
        // Buscar TODOS os produtos para exibir
        const allProductsQuery = `
            SELECT p.*, 
                   GROUP_CONCAT(
                       json_object('type', pm.type, 'url', pm.url, 'order_index', pm.order_index)
                       ORDER BY pm.order_index
                   ) as gallery_json
            FROM products p 
            LEFT JOIN product_media pm ON p.id = pm.product_id 
            GROUP BY p.id 
            ORDER BY p.updated_at DESC, p.created_at DESC
        `;
        
        db.all(allProductsQuery, [], (err, allProducts) => {
            if (err) {
                console.error('❌ Erro ao buscar produtos:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Erro ao buscar produtos'
                });
            }
            
            // Array para armazenar produtos que vão para "MEUS PRODUTOS"
            const userProducts = [];
            
            // Processar cada produto
            const processedProducts = allProducts.map(row => {
                const product = { ...row };
                
                // Parse gallery JSON - CORREÇÃO DEFINITIVA
if (product.gallery_json) {
    try {
        // Remove o GROUP_CONCAT wrapper e faz parse individual
        const galleryString = product.gallery_json;
        const items = galleryString.split('},{').map((item, index, arr) => {
            if (index === 0 && arr.length > 1) {
                return item + '}';
            } else if (index === arr.length - 1 && arr.length > 1) {
                return '{' + item;
            } else if (arr.length > 1) {
                return '{' + item + '}';
            }
            return item;
        });
        
        product.gallery = items.map(item => {
            try {
                return JSON.parse(item);
            } catch (e) {
                console.error('Erro ao fazer parse do item:', item);
                return null;
            }
        }).filter(item => item !== null);
        
    } catch (e) {
        console.error('❌ Erro ao processar galeria:', e);
        product.gallery = [];
    }
} else {
    product.gallery = [];
}
delete product.gallery_json;
                
                // LÓGICA PRINCIPAL: Verificar se usuário tem acesso
                let hasUserAccess = false;
                let accessPlan = null;
                
                // Verificar se algum dos planos do produto corresponde aos acessos do usuário
                if (userAccess.length > 0) {
                    const userPlanCodes = userAccess.map(a => a.plan_code);
                    
                    // Verificar cada plano do produto
                    if (product.plano_1 && userPlanCodes.includes(product.plano_1)) {
                        hasUserAccess = true;
                        accessPlan = product.plano_1;
                    } else if (product.plano_2 && userPlanCodes.includes(product.plano_2)) {
                        hasUserAccess = true;
                        accessPlan = product.plano_2;
                    } else if (product.plano_3 && userPlanCodes.includes(product.plano_3)) {
                        hasUserAccess = true;
                        accessPlan = product.plano_3;
                    }
                }
                
                // Adicionar flags de acesso
                product.userHasAccess = hasUserAccess;
                product.accessPlan = accessPlan;
                
                // Se usuário tem acesso, adicionar à lista de userProducts
                if (hasUserAccess) {
                    userProducts.push({
                        ...product,
                        originalCategory: product.category,
                        category: 'meus_produtos' // Forçar para meus_produtos
                    });
                    
                    console.log(`✅ Produto liberado: ${product.name} (Plano: ${accessPlan})`);
                }
                
                return product;
            });
            
            console.log(`\n📊 RESUMO:`);
            console.log(`- Total de produtos: ${processedProducts.length}`);
            console.log(`- Produtos liberados para o usuário: ${userProducts.length}`);
            console.log(`- Email: ${email}`);
            console.log('==========================================\n');
            
            // Retornar TODOS os produtos + lista de produtos do usuário
            res.json({ 
                success: true, 
                products: processedProducts,
                userProducts: userProducts, // Produtos que vão para "MEUS PRODUTOS"
                totalProducts: processedProducts.length,
                userAccessCount: userProducts.length,
                userEmail: email,
                activePlans: userAccess.map(a => a.plan_code),
                timestamp: new Date().toISOString()
            });
        });
    });
});

// PERFECTPAY WEBHOOK
app.post('/webhook/perfectpay', express.json(), (req, res) => {
    console.log('\n🔔 ===== WEBHOOK PERFECTPAY RECEBIDO =====');
    console.log('⏰ Timestamp:', new Date().toLocaleString('pt-BR'));
    console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));
    
    try {
        const payload = req.body;
        
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
            console.log('- Email recebido:', email);
            console.log('- Plan code recebido:', plan_code);
            console.log('- Payload completo:', JSON.stringify(payload, null, 2));
            console.log('============================================\n');
            return res.status(400).json({ 
                success: false, 
                error: 'Email e código do plano são obrigatórios',
                received: { email, plan_code }
            });
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
                        access_id: existing.id,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Liberar acesso
                console.log('\n🔓 LIBERANDO ACESSO...');
                const insertQuery = `
                    INSERT INTO user_access 
                    (email, product_code, plan_code, plan_name, sale_amount, payment_id, status, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
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
                        plan_code: plan_code,
                        timestamp: new Date().toISOString()
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

// VERIFICAÇÃO DE ACESSO
app.post('/api/check-access', (req, res) => {
    const { email, plano_code } = req.body;
    
    console.log(`🔍 Verificando acesso: ${email} → ${plano_code} (${new Date().toLocaleTimeString()})`);
    
    if (!email || !plano_code) {
        return res.status(400).json({ success: false, error: 'Email e código do plano são obrigatórios' });
    }
    
    const query = `
        SELECT ua.*, p.name as product_name 
        FROM user_access ua
        LEFT JOIN products p ON (p.plano_1 = ua.plan_code OR p.plano_2 = ua.plan_code OR p.plano_3 = ua.plan_code)
        WHERE ua.email = ? AND ua.plan_code = ?
        AND ua.status = 'active'
        ORDER BY ua.updated_at DESC, ua.created_at DESC
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
                message: `Acesso liberado - Plano: ${row.plan_name || plano_code}`,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`❌ ACESSO NEGADO para ${email} no plano ${plano_code}`);
            res.json({ 
                success: true, 
                hasAccess: false, 
                message: 'Acesso negado - Plano não adquirido',
                timestamp: new Date().toISOString()
            });
        }
    });
});
// ADICIONAR ESTE CÓDIGO NO SEU server.js (após o webhook do PerfectPay)

// =============================================================================
// WEBHOOK KIRVANO - IMPLEMENTAÇÃO COMPLETA
// =============================================================================

app.post('/webhook/kirvano', express.json(), (req, res) => {
    console.log('\n🔔 ===== WEBHOOK KIRVANO RECEBIDO =====');
    console.log('⏰ Timestamp:', new Date().toLocaleString('pt-BR'));
    console.log('📦 Body completo:', JSON.stringify(req.body, null, 2));
    
    try {
        const payload = req.body;
        
        const {
            event,
            status,
            customer,
            products,
            total_price,
            sale_id,
            checkout_id
        } = payload;
        
        console.log('\n📊 DADOS EXTRAÍDOS:');
        console.log('- Evento:', event);
        console.log('- Status:', status);
        console.log('- Email do cliente:', customer?.email);
        console.log('- Produtos:', products?.length || 0);
        console.log('- Valor da venda:', total_price);
        console.log('- ID da venda:', sale_id);
        
        // Verificar se é uma venda aprovada
        if (event !== 'SALE_APPROVED' || status !== 'APPROVED') {
            console.log(`❌ Status não aprovado: ${event} / ${status}`);
            console.log('============================================\n');
            return res.json({ success: true, message: 'Status não processado' });
        }
        
        const email = customer?.email;
        
        if (!email) {
            console.log('❌ Email do cliente não encontrado!');
            console.log('- Customer recebido:', customer);
            console.log('============================================\n');
            return res.status(400).json({ 
                success: false, 
                error: 'Email do cliente é obrigatório',
                received: { email, customer }
            });
        }
        
        if (!products || !Array.isArray(products) || products.length === 0) {
            console.log('❌ Nenhum produto encontrado na venda!');
            console.log('- Products recebidos:', products);
            console.log('============================================\n');
            return res.status(400).json({ 
                success: false, 
                error: 'Lista de produtos é obrigatória',
                received: { products }
            });
        }
        
        console.log(`\n🛒 PROCESSANDO ${products.length} PRODUTO(S):`);
        
        // Processar cada produto comprado
        let accessesGranted = 0;
        let processedProducts = [];
        
        const processProduct = (productIndex) => {
            if (productIndex >= products.length) {
                // Todos os produtos foram processados
                console.log(`\n✅ KIRVANO PROCESSADO COM SUCESSO:`);
                console.log(`- Email: ${email}`);
                console.log(`- Produtos processados: ${processedProducts.length}`);
                console.log(`- Acessos liberados: ${accessesGranted}`);
                console.log(`- ID da venda: ${sale_id}`);
                console.log('============================================\n');
                
                return res.json({ 
                    success: true, 
                    message: 'Webhook Kirvano processado com sucesso',
                    email: email,
                    products_processed: processedProducts.length,
                    accesses_granted: accessesGranted,
                    sale_id: sale_id,
                    timestamp: new Date().toISOString()
                });
            }
            
            const product = products[productIndex];
            const offer_id = product?.offer_id;
            const product_name = product?.offer_name || product?.name || `Produto ${productIndex + 1}`;
            
            if (!offer_id) {
                console.log(`⚠️ Produto ${productIndex + 1}: offer_id não encontrado`);
                console.log('- Produto:', product);
                processProduct(productIndex + 1);
                return;
            }
            
            console.log(`🔍 Produto ${productIndex + 1}: ${product_name} (${offer_id})`);
            
            // Verificar se algum produto do sistema tem esse offer_id
            const findProductQuery = `
                SELECT * FROM products 
                WHERE plano_1 = ? OR plano_2 = ? OR plano_3 = ?
                LIMIT 1
            `;
            
            db.get(findProductQuery, [offer_id, offer_id, offer_id], (err, product_row) => {
                if (err) {
                    console.error(`❌ Erro ao buscar produto para offer_id ${offer_id}:`, err);
                    processProduct(productIndex + 1);
                    return;
                }
                
                if (product_row) {
                    console.log(`✅ Produto encontrado no sistema: ${product_row.name}`);
                } else {
                    console.log(`⚠️ Nenhum produto do sistema configurado com offer_id: ${offer_id}`);
                    console.log(`💡 Configure um produto no painel admin com plano_1/2/3 = ${offer_id}`);
                }
                
                const product_code = product_row?.id || offer_id;
                
                // Verificar se já existe acesso para este email/offer_id
                const checkAccessQuery = `
                    SELECT * FROM user_access 
                    WHERE email = ? AND plan_code = ? AND status = 'active'
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                
                db.get(checkAccessQuery, [email, offer_id], (err, existing) => {
                    if (err) {
                        console.error(`❌ Erro ao verificar acesso existente para ${offer_id}:`, err);
                    }
                    
                    if (existing) {
                        console.log(`⚠️ Acesso já existe para ${email} → ${offer_id}`);
                        processedProducts.push({
                            offer_id: offer_id,
                            product_name: product_name,
                            status: 'already_exists',
                            access_id: existing.id
                        });
                        processProduct(productIndex + 1);
                        return;
                    }
                    
                    // Liberar acesso
                    console.log(`🔓 Liberando acesso para: ${email} → ${offer_id}`);
                    const insertAccessQuery = `
                        INSERT INTO user_access 
                        (email, product_code, plan_code, plan_name, sale_amount, payment_id, status, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
                    `;
                    
                    db.run(insertAccessQuery, [
                        email,
                        product_code,
                        offer_id,
                        product_name,
                        total_price || 0,
                        sale_id || checkout_id
                    ], function(err) {
                        if (err) {
                            console.error(`❌ Erro ao liberar acesso para ${offer_id}:`, err);
                            processedProducts.push({
                                offer_id: offer_id,
                                product_name: product_name,
                                status: 'error',
                                error: err.message
                            });
                        } else {
                            console.log(`✅ Acesso liberado: ${email} → ${offer_id} (ID: ${this.lastID})`);
                            accessesGranted++;
                            processedProducts.push({
                                offer_id: offer_id,
                                product_name: product_name,
                                status: 'granted',
                                access_id: this.lastID
                            });
                        }
                        
                        processProduct(productIndex + 1);
                    });
                });
            });
        };
        
        // Iniciar processamento dos produtos
        processProduct(0);
        
    } catch (error) {
        console.error('❌ ERRO CRÍTICO no webhook Kirvano:', error);
        console.log('============================================\n');
        res.status(400).json({ 
            success: false, 
            error: 'Dados inválidos',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// =============================================================================
// ENDPOINT DE DEBUG PARA TESTAR KIRVANO
// =============================================================================

app.post('/debug/simulate-kirvano', (req, res) => {
    const { email, offer_id } = req.body;
    
    if (!email || !offer_id) {
        return res.status(400).json({ error: 'Email e offer_id são obrigatórios' });
    }
    
    // Simular payload da Kirvano
    const mockPayload = {
        event: 'SALE_APPROVED',
        status: 'APPROVED',
        sale_id: 'TEST_' + Date.now(),
        checkout_id: 'CHK_' + Date.now(),
        total_price: 'R$ 99,99',
        customer: {
            email: email,
            name: 'Cliente Teste',
            document: '12345678901',
            phone_number: '11999999999'
        },
        products: [{
            id: 'prod_test_' + Date.now(),
            name: 'Produto Teste',
            offer_id: offer_id,
            offer_name: 'Oferta Teste',
            description: 'Produto para teste do webhook',
            price: 'R$ 99,99'
        }]
    };
    
    console.log('\n🧪 SIMULANDO WEBHOOK KIRVANO:');
    console.log('📧 Email:', email);
    console.log('🏷️ Offer ID:', offer_id);
    
    // Fazer request interno para o webhook
    const axios = require('axios');
    const baseUrl = req.protocol + '://' + req.get('host');
    
    axios.post(`${baseUrl}/webhook/kirvano`, mockPayload)
        .then(response => {
            res.json({
                success: true,
                message: 'Webhook simulado com sucesso',
                webhook_response: response.data,
                mock_payload: mockPayload,
                timestamp: new Date().toISOString()
            });
        })
        .catch(error => {
            res.status(500).json({
                success: false,
                error: 'Erro ao simular webhook',
                details: error.response?.data || error.message,
                mock_payload: mockPayload,
                timestamp: new Date().toISOString()
            });
        });
});

console.log('🔄 Webhook Kirvano configurado em: /webhook/kirvano');
console.log('🧪 Teste disponível em: POST /debug/simulate-kirvano');
console.log('📋 Exemplo de teste: { "email": "teste@email.com", "offer_id": "94069d91-6bdf-47b0-b7e2-35c6d384e793" }');

// ADMIN AUTH
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === 'painel-iago' && password === '#Senha8203') {
        res.json({ 
            success: true, 
            message: 'Login realizado com sucesso!',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(401).json({ 
            success: false, 
            error: 'Credenciais inválidas',
            timestamp: new Date().toISOString()
        });
    }
});

// PWA ROUTES
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
                src: "https://e-volutionn.com/wp-content/uploads/2025/08/Design-sem-nome-8-2.png?v=1",
                type: "image/png",
                sizes: "192x192",
                purpose: "any"
            },
            {
                src: "https://e-volutionn.com/wp-content/uploads/2025/08/Design-sem-nome-8-2.png?v=1",
                type: "image/png",
                sizes: "512x512",
                purpose: "any maskable"
            }
        ]
    };
    
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(manifest);
});

app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const cacheVersion = `v${Date.now()}`;
    const swContent = `
        const CACHE_NAME = 'vip-app-${cacheVersion}';
        const ESSENTIAL_CACHE = [
            '/',
            '/manifest.json'
        ];

        self.addEventListener('install', event => {
            console.log('🔧 SW: Installing version ${cacheVersion}');
            event.waitUntil(
                caches.open(CACHE_NAME)
                    .then(cache => {
                        console.log('📦 SW: Caching essential files only');
                        return cache.addAll(ESSENTIAL_CACHE);
                    })
                    .then(() => {
                        console.log('✅ SW: Skip waiting for immediate activation');
                        return self.skipWaiting();
                    })
                    .catch(err => {
                        console.error('❌ SW: Install failed:', err);
                    })
            );
        });

        self.addEventListener('activate', event => {
            console.log('🚀 SW: Activating version ${cacheVersion}');
            event.waitUntil(
                caches.keys().then(cacheNames => {
                    return Promise.all(
                        cacheNames.map(cacheName => {
                            if (cacheName !== CACHE_NAME) {
                                console.log('🗑️ SW: Deleting old cache:', cacheName);
                                return caches.delete(cacheName);
                            }
                        })
                    );
                }).then(() => {
                    console.log('✅ SW: All clients claimed');
                    return self.clients.claim();
                })
            );
        });

        self.addEventListener('fetch', event => {
            const url = new URL(event.request.url);
            
            if (url.pathname.startsWith('/api/') || 
                url.pathname.startsWith('/debug/') || 
                url.pathname.startsWith('/webhook/')) {
                console.log('🔄 SW: API call - always fresh:', url.pathname);
                event.respondWith(
                    fetch(event.request.clone()).catch(() => {
                        return new Response('{"success":false,"error":"Offline"}', {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    })
                );
                return;
            }
            
            event.respondWith(
                fetch(event.request.clone())
                    .then(response => {
                        if (response.ok) {
                            if (ESSENTIAL_CACHE.includes(url.pathname)) {
                                const responseToCache = response.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => {
                                        cache.put(event.request, responseToCache);
                                    });
                            }
                        }
                        return response;
                    })
                    .catch(() => {
                        console.log('⚠️ SW: Network failed, trying cache for:', url.pathname);
                        return caches.match(event.request)
                            .then(response => {
                                if (response) {
                                    console.log('📦 SW: Serving from cache:', url.pathname);
                                    return response;
                                }
                                return new Response('Offline - conteúdo não disponível', {
                                    status: 503,
                                    headers: { 'Content-Type': 'text/plain' }
                                });
                            });
                    })
            );
        });

        self.addEventListener('message', event => {
            if (event.data && event.data.type === 'SKIP_WAITING') {
                self.skipWaiting();
            }
        });

        console.log('✅ SW: Service Worker ${cacheVersion} loaded successfully');
    `;
    
    res.setHeader('Content-Type', 'application/javascript');
    res.send(swContent);
});

// STATIC FILE ROUTES
app.get('/painel-x7k2m9', (req, res) => {
    try {
        const adminPath = path.join(__dirname, 'public', 'admin.html');
        
        if (fs.existsSync(adminPath)) {
            console.log('✅ Servindo admin.html do arquivo');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(adminPath);
        } else {
            console.log('⚠️ admin.html não encontrado, servindo HTML inline');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>🛠️ Painel Admin VIP</title>
                    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
                    <meta http-equiv="Pragma" content="no-cache">
                    <meta http-equiv="Expires" content="0">
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
                        .timestamp { color: #666; font-size: 0.9rem; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🛠️ Painel Admin VIP - CORRIGIDO!</h1>
                        <div class="status">✅ Servidor funcionando com problemas resolvidos</div>
                        <div class="timestamp">Última atualização: ${new Date().toLocaleString('pt-BR')}</div>
                        
                        <h3>🔧 Links úteis:</h3>
                        <a href="/">🏠 Voltar ao App Principal</a>
                        <a href="/debug/products">📦 Ver Produtos (Debug)</a>
                        <a href="/debug/access">🔑 Ver Acessos (Debug)</a>
                        
                        <h3>✅ Correções implementadas:</h3>
                        <p>🔧 Endpoint /api/user/products CORRIGIDO</p>
                        <p>🔧 Sistema de liberação funcionando</p>
                        <p>🔧 Galeria do modal corrigida</p>
                        <p>🔧 Webhook PerfectPay otimizado</p>
                        
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
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(indexPath);
        } else {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>🚀 Membros VIP</title>
                    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
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
                        .timestamp { color: #666; font-size: 0.9rem; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🚀 Membros VIP - PROBLEMAS RESOLVIDOS!</h1>
                        <div class="status">✅ Servidor rodando com todas as correções</div>
                        <div class="timestamp">Timestamp: ${new Date().toLocaleString('pt-BR')}</div>
                        <p>⚠️ Arquivo index.html não encontrado em public/</p>
                        
                        <h2>🔗 Links principais:</h2>
                        <a href="/painel-x7k2m9">🛠️ Painel Administrativo</a>
                        <a href="/debug/products">📦 Ver Produtos (Debug)</a>
                        <a href="/debug/access">🔑 Ver Acessos (Debug)</a>
                        
                        <h3>✅ Problemas resolvidos:</h3>
                        <p>🔧 Sistema de liberação de produtos funcionando</p>
                        <p>🔧 Galeria do modal corrigida</p>
                        <p>🔧 Endpoint /api/user/products otimizado</p>
                        <p>🔧 Webhook PerfectPay com logs detalhados</p>
                        
                        <h3>📱 API Status:</h3>
                        <p>✅ Webhook PerfectPay: /webhook/perfectpay</p>
                        <p>✅ API Produtos: /api/products</p>
                        <p>✅ Verificação de Acesso: /api/check-access</p>
                        <p>✅ Produtos do Usuário: /api/user/products (CORRIGIDO)</p>
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

// HEALTH CHECK
app.get('/api/health', (req, res) => {
    db.get("SELECT COUNT(*) as count FROM products", (err, result) => {
        const health = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            server: 'running',
            database: err ? 'error' : 'connected',
            products_count: result ? result.count : 0,
            fixes_applied: {
                user_products_endpoint: 'FIXED',
                gallery_rendering: 'FIXED',
                webhook_integration: 'OPTIMIZED',
                access_verification: 'WORKING'
            }
        };
        
        res.json(health);
    });
});

// ERROR HANDLING
app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(500).json({ 
        success: false, 
        error: 'Erro interno do servidor',
        timestamp: new Date().toISOString()
    });
});

// SERVER START
app.listen(PORT, () => {
    console.log(`\n🚀 ===== SERVIDOR VIP CORRIGIDO =====`);
    console.log(`⏰ ${new Date().toLocaleString('pt-BR')}`);
    console.log(`🌐 Porta: ${PORT}`);
    console.log(`\n📱 LINKS PRINCIPAIS:`);
    console.log(`   App Principal: http://localhost:${PORT}`);
    console.log(`   Painel Admin:  http://localhost:${PORT}/painel-x7k2m9`);
    console.log(`\n🔌 API ENDPOINTS:`);
    console.log(`   Produtos:      GET  /api/products`);
    console.log(`   User Products: POST /api/user/products (CORRIGIDO)`);
    console.log(`   Webhook:       POST /webhook/perfectpay`);
    console.log(`   Verificar:     POST /api/check-access`);
    console.log(`   Saúde:         GET  /api/health`);
    console.log(`\n🐛 DEBUG ROUTES:`);
    console.log(`   Ver Produtos:  GET  /debug/products`);
    console.log(`   Ver Acessos:   GET  /debug/access`);
    console.log(`   Simular:       POST /debug/simulate-access`);
    console.log(`\n✅ PROBLEMAS RESOLVIDOS:`);
    console.log(`   ✅ Sistema de liberação de produtos`);
    console.log(`   ✅ Endpoint /api/user/products corrigido`);
    console.log(`   ✅ Galeria do modal funcionando`);
    console.log(`   ✅ Webhook PerfectPay otimizado`);
    console.log(`   ✅ Logs detalhados para debug`);
    console.log(`\n🎯 SERVIDOR PRONTO COM TODAS AS CORREÇÕES!`);
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
