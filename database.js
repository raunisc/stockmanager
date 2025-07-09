class StockDatabase {
    constructor() {
        this.dbName = 'StockMasterDB';
        this.version = 1;
        this.db = null;
        this.init();
    }

    async init() {
        try {
            this.db = await this.openDatabase();
            await this.createTables();
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Database initialization failed:', error);
            // Fallback to localStorage
            this.useLocalStorage = true;
        }
    }

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Products table
                if (!db.objectStoreNames.contains('products')) {
                    const productStore = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
                    productStore.createIndex('code', 'code', { unique: true });
                    productStore.createIndex('name', 'name');
                    productStore.createIndex('category', 'category');
                }
                
                // Movements table
                if (!db.objectStoreNames.contains('movements')) {
                    const movementStore = db.createObjectStore('movements', { keyPath: 'id', autoIncrement: true });
                    movementStore.createIndex('productId', 'productId');
                    movementStore.createIndex('date', 'date');
                    movementStore.createIndex('type', 'type');
                }
                
                // Categories table
                if (!db.objectStoreNames.contains('categories')) {
                    const categoryStore = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
                    categoryStore.createIndex('name', 'name', { unique: true });
                }
                
                // Settings table
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async createTables() {
        // Initialize default categories
        const defaultCategories = [
            { name: 'Eletrônicos', description: 'Produtos eletrônicos e tecnologia' },
            { name: 'Roupas', description: 'Vestuário e acessórios' },
            { name: 'Casa e Jardim', description: 'Produtos para casa e jardinagem' },
            { name: 'Esportes', description: 'Equipamentos esportivos' },
            { name: 'Livros', description: 'Livros e materiais educativos' },
            { name: 'Alimentos', description: 'Produtos alimentícios' }
        ];

        for (const category of defaultCategories) {
            await this.addCategory(category);
        }

        // Initialize default settings
        const defaultSettings = {
            companyName: 'Minha Empresa',
            lowStockThreshold: 10,
            currency: 'BRL'
        };

        await this.saveSetting('general', defaultSettings);
    }

    // Products operations
    async addProduct(product) {
        if (this.useLocalStorage) {
            return this.addProductLS(product);
        }

        const transaction = this.db.transaction(['products'], 'readwrite');
        const store = transaction.objectStore('products');
        
        product.createdAt = new Date().toISOString();
        product.updatedAt = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
            const request = store.add(product);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getProducts() {
        if (this.useLocalStorage) {
            return this.getProductsLS();
        }

        const transaction = this.db.transaction(['products'], 'readonly');
        const store = transaction.objectStore('products');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getProduct(id) {
        if (this.useLocalStorage) {
            return this.getProductLS(id);
        }

        const transaction = this.db.transaction(['products'], 'readonly');
        const store = transaction.objectStore('products');
        
        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateProduct(id, updates) {
        if (this.useLocalStorage) {
            return this.updateProductLS(id, updates);
        }

        const product = await this.getProduct(id);
        if (!product) throw new Error('Product not found');
        
        const updatedProduct = { ...product, ...updates, updatedAt: new Date().toISOString() };
        
        const transaction = this.db.transaction(['products'], 'readwrite');
        const store = transaction.objectStore('products');
        
        return new Promise((resolve, reject) => {
            const request = store.put(updatedProduct);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteProduct(id) {
        if (this.useLocalStorage) {
            return this.deleteProductLS(id);
        }

        const transaction = this.db.transaction(['products'], 'readwrite');
        const store = transaction.objectStore('products');
        
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Movements operations
    async addMovement(movement) {
        if (this.useLocalStorage) {
            return this.addMovementLS(movement);
        }

        const transaction = this.db.transaction(['movements'], 'readwrite');
        const store = transaction.objectStore('movements');
        
        movement.date = new Date().toISOString();
        
        return new Promise((resolve, reject) => {
            const request = store.add(movement);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getMovements(productId = null) {
        if (this.useLocalStorage) {
            return this.getMovementsLS(productId);
        }

        const transaction = this.db.transaction(['movements'], 'readonly');
        const store = transaction.objectStore('movements');
        
        return new Promise((resolve, reject) => {
            let request;
            if (productId) {
                const index = store.index('productId');
                request = index.getAll(productId);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Categories operations
    async addCategory(category) {
        if (this.useLocalStorage) {
            return this.addCategoryLS(category);
        }

        try {
            const transaction = this.db.transaction(['categories'], 'readwrite');
            const store = transaction.objectStore('categories');
            
            const request = store.add(category);
            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => {
                    if (request.error.name === 'ConstraintError') {
                        resolve(null); // Category already exists
                    } else {
                        reject(request.error);
                    }
                };
            });
        } catch (error) {
            return null;
        }
    }

    async getCategories() {
        if (this.useLocalStorage) {
            return this.getCategoriesLS();
        }

        const transaction = this.db.transaction(['categories'], 'readonly');
        const store = transaction.objectStore('categories');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Settings operations
    async saveSetting(key, value) {
        if (this.useLocalStorage) {
            return this.saveSettingLS(key, value);
        }

        const transaction = this.db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        
        return new Promise((resolve, reject) => {
            const request = store.put({ key, value });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSetting(key) {
        if (this.useLocalStorage) {
            return this.getSettingLS(key);
        }

        const transaction = this.db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }

    // LocalStorage fallback methods
    addProductLS(product) {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        product.id = Date.now();
        product.createdAt = new Date().toISOString();
        product.updatedAt = new Date().toISOString();
        products.push(product);
        localStorage.setItem('products', JSON.stringify(products));
        return Promise.resolve(product.id);
    }

    getProductsLS() {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        return Promise.resolve(products);
    }

    getProductLS(id) {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const product = products.find(p => p.id === id);
        return Promise.resolve(product);
    }

    updateProductLS(id, updates) {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const index = products.findIndex(p => p.id === id);
        if (index !== -1) {
            products[index] = { ...products[index], ...updates, updatedAt: new Date().toISOString() };
            localStorage.setItem('products', JSON.stringify(products));
        }
        return Promise.resolve(index !== -1);
    }

    deleteProductLS(id) {
        const products = JSON.parse(localStorage.getItem('products') || '[]');
        const filtered = products.filter(p => p.id !== id);
        localStorage.setItem('products', JSON.stringify(filtered));
        return Promise.resolve(true);
    }

    addMovementLS(movement) {
        const movements = JSON.parse(localStorage.getItem('movements') || '[]');
        movement.id = Date.now();
        movement.date = new Date().toISOString();
        movements.push(movement);
        localStorage.setItem('movements', JSON.stringify(movements));
        return Promise.resolve(movement.id);
    }

    getMovementsLS(productId = null) {
        const movements = JSON.parse(localStorage.getItem('movements') || '[]');
        const filtered = productId ? movements.filter(m => m.productId === productId) : movements;
        return Promise.resolve(filtered);
    }

    addCategoryLS(category) {
        const categories = JSON.parse(localStorage.getItem('categories') || '[]');
        if (categories.find(c => c.name === category.name)) {
            return Promise.resolve(null);
        }
        category.id = Date.now();
        categories.push(category);
        localStorage.setItem('categories', JSON.stringify(categories));
        return Promise.resolve(category.id);
    }

    getCategoriesLS() {
        const categories = JSON.parse(localStorage.getItem('categories') || '[]');
        return Promise.resolve(categories);
    }

    saveSettingLS(key, value) {
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        settings[key] = value;
        localStorage.setItem('settings', JSON.stringify(settings));
        return Promise.resolve(true);
    }

    getSettingLS(key) {
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        return Promise.resolve(settings[key] || null);
    }

    // Backup and restore
    async exportData() {
        const data = {
            products: await this.getProducts(),
            movements: await this.getMovements(),
            categories: await this.getCategories(),
            settings: await this.getSetting('general'),
            exportDate: new Date().toISOString()
        };
        return data;
    }

    async importData(data) {
        try {
            // Clear existing data
            await this.clearAllData();
            
            // Import data
            if (data.categories) {
                for (const category of data.categories) {
                    await this.addCategory(category);
                }
            }
            
            if (data.products) {
                for (const product of data.products) {
                    await this.addProduct(product);
                }
            }
            
            if (data.movements) {
                for (const movement of data.movements) {
                    await this.addMovement(movement);
                }
            }
            
            if (data.settings) {
                await this.saveSetting('general', data.settings);
            }
            
            return true;
        } catch (error) {
            console.error('Import failed:', error);
            return false;
        }
    }

    async clearAllData() {
        if (this.useLocalStorage) {
            localStorage.removeItem('products');
            localStorage.removeItem('movements');
            localStorage.removeItem('categories');
            localStorage.removeItem('settings');
        } else {
            const transaction = this.db.transaction(['products', 'movements', 'categories', 'settings'], 'readwrite');
            
            const promises = [
                transaction.objectStore('products').clear(),
                transaction.objectStore('movements').clear(),
                transaction.objectStore('categories').clear(),
                transaction.objectStore('settings').clear()
            ];
            
            await Promise.all(promises);
        }
        
        // Reinitialize default data
        await this.createTables();
    }
}

// Initialize database
const db = new StockDatabase();

