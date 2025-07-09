class StockDatabase {
    constructor() {
        this.dbName = 'StockMasterDB';
        this.version = 1;
        this.db = null;
        this.backupInterval = null;
        this.saveQueue = [];
        this.isProcessingSave = false;
        this.maxBackups = 10;
        this.backupKey = 'stockmaster_backups';
        this.lastSaveTime = 0;
        this.saveDebounceTime = 1000; // 1 second
        this.useLocalStorage = true; // Force use of localStorage for reliability
        this.init();
    }

    async init() {
        try {
            // Always use localStorage for GitHub Pages compatibility
            console.log('Using localStorage for data persistence');
            await this.createTables();
            this.setupAutomaticBackup();
            this.setupBeforeUnloadHandler();
            this.setupVisibilityChangeHandler();
            this.setupStorageEventHandler();
            await this.validateAndRecoverData();
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Database initialization failed:', error);
            this.useLocalStorage = true;
            await this.createTables();
            this.setupAutomaticBackup();
            this.setupBeforeUnloadHandler();
            this.setupVisibilityChangeHandler();
            await this.validateAndRecoverData();
        }
    }

    async createTables() {
        try {
            // Initialize default categories if they don't exist
            const categories = await this.getCategories();
            if (categories.length === 0) {
                const defaultCategories = [
                    { name: 'Burger e Otakus', description: 'Produtos relacionados a hambúrgueres e cultura otaku' },
                    { name: 'Dogão do Canela Fina', description: 'Hot dogs e produtos especiais do Canela Fina' }
                ];

                for (const category of defaultCategories) {
                    await this.addCategory(category);
                }
            }
        } catch (error) {
            console.error('Error creating tables:', error);
        }
    }

    setupAutomaticBackup() {
        // Create backup every 5 minutes
        this.backupInterval = setInterval(() => {
            this.createBackup();
        }, 5 * 60 * 1000);

        // Also create backup on first load
        setTimeout(() => {
            this.createBackup();
        }, 2000);
    }

    setupBeforeUnloadHandler() {
        window.addEventListener('beforeunload', () => {
            this.forceSave();
        });
    }

    setupVisibilityChangeHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.forceSave();
            }
        });
    }

    setupStorageEventHandler() {
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.startsWith('stockmaster_')) {
                this.handleStorageChange(e);
            }
        });
    }

    handleStorageChange(event) {
        // Handle data changes from other tabs
        if (event.key === 'products' || event.key === 'movements' || event.key === 'categories') {
            console.log('Data changed in another tab, refreshing...');
            // Notify the app to refresh data
            if (window.app) {
                window.app.loadData();
            }
        }
    }

    async validateAndRecoverData() {
        try {
            // Check data integrity
            const products = await this.getProducts();
            const movements = await this.getMovements();
            const categories = await this.getCategories();

            // Validate data structure
            if (!Array.isArray(products) || !Array.isArray(movements) || !Array.isArray(categories)) {
                console.warn('Invalid data structure detected, attempting recovery...');
                await this.recoverFromBackup();
                return;
            }

            // Validate individual items
            const invalidProducts = products.filter(p => !p.id || !p.name || !p.code);
            const invalidMovements = movements.filter(m => !m.id || !m.productId || !m.type);

            if (invalidProducts.length > 0 || invalidMovements.length > 0) {
                console.warn('Corrupted data detected, attempting recovery...');
                await this.recoverFromBackup();
                return;
            }

            // Check for orphaned movements
            const orphanedMovements = movements.filter(m => !products.find(p => p.id === m.productId));
            if (orphanedMovements.length > 0) {
                console.warn('Orphaned movements detected, cleaning up...');
                for (const movement of orphanedMovements) {
                    await this.deleteMovement(movement.id);
                }
            }

            console.log('Data validation completed successfully');
        } catch (error) {
            console.error('Data validation failed:', error);
            await this.recoverFromBackup();
        }
    }

    async createBackup() {
        try {
            const data = await this.exportData();
            const backup = {
                timestamp: Date.now(),
                data: data,
                checksum: this.calculateChecksum(data)
            };

            const backups = this.getBackups();
            backups.push(backup);

            // Keep only the last maxBackups
            if (backups.length > this.maxBackups) {
                backups.splice(0, backups.length - this.maxBackups);
            }

            localStorage.setItem(this.backupKey, JSON.stringify(backups));
            console.log('Backup created successfully');
        } catch (error) {
            console.error('Failed to create backup:', error);
        }
    }

    getBackups() {
        try {
            const backups = localStorage.getItem(this.backupKey);
            return backups ? JSON.parse(backups) : [];
        } catch (error) {
            console.error('Failed to get backups:', error);
            return [];
        }
    }

    async recoverFromBackup() {
        try {
            const backups = this.getBackups();
            if (backups.length === 0) {
                console.warn('No backups available for recovery');
                return false;
            }

            // Find the most recent valid backup
            for (let i = backups.length - 1; i >= 0; i--) {
                const backup = backups[i];
                try {
                    const checksum = this.calculateChecksum(backup.data);
                    if (checksum === backup.checksum) {
                        console.log('Restoring from backup:', new Date(backup.timestamp));
                        await this.importData(backup.data);
                        return true;
                    }
                } catch (error) {
                    console.warn('Invalid backup at index', i, error);
                }
            }

            console.error('No valid backups found');
            return false;
        } catch (error) {
            console.error('Failed to recover from backup:', error);
            return false;
        }
    }

    calculateChecksum(data) {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    forceSave() {
        // Force save all pending operations
        if (this.saveQueue.length > 0) {
            this.processSaveQueue();
        }
        this.createBackup();
    }

    queueSave(operation) {
        this.saveQueue.push({
            operation,
            timestamp: Date.now()
        });
        this.debounceSave();
    }

    debounceSave() {
        const now = Date.now();
        if (now - this.lastSaveTime < this.saveDebounceTime) {
            setTimeout(() => this.debounceSave(), this.saveDebounceTime);
            return;
        }
        this.processSaveQueue();
    }

    async processSaveQueue() {
        if (this.isProcessingSave || this.saveQueue.length === 0) {
            return;
        }

        this.isProcessingSave = true;
        this.lastSaveTime = Date.now();

        try {
            // Process all operations in the queue
            while (this.saveQueue.length > 0) {
                const { operation } = this.saveQueue.shift();
                await operation();
            }
        } catch (error) {
            console.error('Error processing save queue:', error);
        } finally {
            this.isProcessingSave = false;
        }
    }

    // Products operations
    async addProduct(product) {
        try {
            // Validate product data
            if (!product || !product.name || !product.code || !product.category) {
                throw new Error('Invalid product data - missing required fields');
            }

            // Check for duplicate code
            const existingProducts = await this.getProducts();
            if (existingProducts.find(p => p.code === product.code)) {
                throw new Error('Product code already exists');
            }

            product.id = product.id || Date.now() + Math.random();
            product.createdAt = new Date().toISOString();
            product.updatedAt = new Date().toISOString();
            product.quantity = parseInt(product.quantity) || 0;
            product.price = parseFloat(product.price) || 0;
            product.minStock = parseInt(product.minStock) || 10;

            return await this.addProductLS(product);
        } catch (error) {
            console.error('Error adding product:', error);
            throw error;
        }
    }

    async getProducts() {
        try {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            return Array.isArray(products) ? products : [];
        } catch (error) {
            console.error('Error getting products:', error);
            return [];
        }
    }

    async getProduct(id) {
        try {
            const products = await this.getProducts();
            return products.find(p => p.id === id) || null;
        } catch (error) {
            console.error('Error getting product:', error);
            return null;
        }
    }

    async updateProduct(id, updates) {
        try {
            if (!id || !updates) {
                throw new Error('Invalid parameters for update');
            }

            updates.updatedAt = new Date().toISOString();
            
            const products = await this.getProducts();
            const index = products.findIndex(p => p.id === id);
            if (index === -1) {
                throw new Error('Product not found');
            }

            products[index] = { ...products[index], ...updates };
            localStorage.setItem('products', JSON.stringify(products));
            await this.createBackup();
            return true;
        } catch (error) {
            console.error('Error updating product:', error);
            throw error;
        }
    }

    async deleteProduct(id) {
        try {
            const products = await this.getProducts();
            const filtered = products.filter(p => p.id !== id);
            localStorage.setItem('products', JSON.stringify(filtered));
            await this.createBackup();
            return true;
        } catch (error) {
            console.error('Error deleting product:', error);
            throw error;
        }
    }

    // Movements operations
    async addMovement(movement) {
        try {
            // Validate movement data
            if (!movement || !movement.productId || !movement.type || !movement.quantity) {
                throw new Error('Invalid movement data - missing required fields');
            }

            movement.id = movement.id || Date.now() + Math.random();
            movement.date = new Date().toISOString();
            movement.quantity = parseInt(movement.quantity) || 0;
            
            const movements = await this.getMovements();
            movements.push(movement);
            localStorage.setItem('movements', JSON.stringify(movements));
            await this.createBackup();
            return movement.id;
        } catch (error) {
            console.error('Error adding movement:', error);
            throw error;
        }
    }

    async getMovements(productId = null) {
        try {
            const movements = JSON.parse(localStorage.getItem('movements') || '[]');
            const validMovements = Array.isArray(movements) ? movements : [];
            return productId ? validMovements.filter(m => m.productId === productId) : validMovements;
        } catch (error) {
            console.error('Error getting movements:', error);
            return [];
        }
    }

    async deleteMovement(id) {
        try {
            const movements = await this.getMovements();
            const filtered = movements.filter(m => m.id !== id);
            localStorage.setItem('movements', JSON.stringify(filtered));
            await this.createBackup();
            return true;
        } catch (error) {
            console.error('Error deleting movement:', error);
            throw error;
        }
    }

    // Categories operations
    async addCategory(category) {
        try {
            if (!category || !category.name) {
                throw new Error('Invalid category data');
            }

            const categories = await this.getCategories();
            if (categories.find(c => c.name === category.name)) {
                return null; // Category already exists
            }
            
            category.id = category.id || Date.now() + Math.random();
            categories.push(category);
            localStorage.setItem('categories', JSON.stringify(categories));
            await this.createBackup();
            return category.id;
        } catch (error) {
            console.error('Error adding category:', error);
            throw error;
        }
    }

    async getCategories() {
        try {
            const categories = JSON.parse(localStorage.getItem('categories') || '[]');
            return Array.isArray(categories) ? categories : [];
        } catch (error) {
            console.error('Error getting categories:', error);
            return [];
        }
    }

    // Settings operations
    async saveSetting(key, value) {
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            settings[key] = value;
            localStorage.setItem('settings', JSON.stringify(settings));
            await this.createBackup();
            return true;
        } catch (error) {
            console.error('Error saving setting:', error);
            throw error;
        }
    }

    async getSetting(key) {
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            return settings[key] || null;
        } catch (error) {
            console.error('Error getting setting:', error);
            return null;
        }
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
        // Create a backup before clearing
        await this.createBackup();
        
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

    // Remove all the LocalStorage fallback methods since we're using localStorage directly
    addProductLS(product) {
        try {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            products.push(product);
            localStorage.setItem('products', JSON.stringify(products));
            this.createBackup();
            return product.id;
        } catch (error) {
            console.error('Error adding product to localStorage:', error);
            throw error;
        }
    }

    getProductsLS() {
        try {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            return Promise.resolve(products);
        } catch (error) {
            console.error('Error getting products from localStorage:', error);
            return Promise.resolve([]);
        }
    }

    getProductLS(id) {
        try {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const product = products.find(p => p.id === id);
            return Promise.resolve(product);
        } catch (error) {
            console.error('Error getting product from localStorage:', error);
            return Promise.resolve(null);
        }
    }

    updateProductLS(id, updates) {
        try {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const index = products.findIndex(p => p.id === id);
            if (index !== -1) {
                products[index] = { ...products[index], ...updates };
                localStorage.setItem('products', JSON.stringify(products));
                this.createBackup();
                return Promise.resolve(true);
            }
            return Promise.resolve(false);
        } catch (error) {
            console.error('Error updating product in localStorage:', error);
            return Promise.reject(error);
        }
    }

    deleteProductLS(id) {
        try {
            const products = JSON.parse(localStorage.getItem('products') || '[]');
            const filtered = products.filter(p => p.id !== id);
            localStorage.setItem('products', JSON.stringify(filtered));
            this.createBackup();
            return Promise.resolve(true);
        } catch (error) {
            console.error('Error deleting product from localStorage:', error);
            return Promise.reject(error);
        }
    }

    addMovementLS(movement) {
        try {
            const movements = JSON.parse(localStorage.getItem('movements') || '[]');
            movements.push(movement);
            localStorage.setItem('movements', JSON.stringify(movements));
            this.createBackup();
            return Promise.resolve(movement.id);
        } catch (error) {
            console.error('Error adding movement to localStorage:', error);
            return Promise.reject(error);
        }
    }

    getMovementsLS(productId = null) {
        try {
            const movements = JSON.parse(localStorage.getItem('movements') || '[]');
            const filtered = productId ? movements.filter(m => m.productId === productId) : movements;
            return Promise.resolve(filtered);
        } catch (error) {
            console.error('Error getting movements from localStorage:', error);
            return Promise.resolve([]);
        }
    }

    addCategoryLS(category) {
        try {
            const categories = JSON.parse(localStorage.getItem('categories') || '[]');
            if (categories.find(c => c.name === category.name)) {
                return Promise.resolve(null);
            }
            category.id = category.id || Date.now() + Math.random();
            categories.push(category);
            localStorage.setItem('categories', JSON.stringify(categories));
            this.createBackup();
            return Promise.resolve(category.id);
        } catch (error) {
            console.error('Error adding category to localStorage:', error);
            return Promise.reject(error);
        }
    }

    getCategoriesLS() {
        try {
            const categories = JSON.parse(localStorage.getItem('categories') || '[]');
            return Promise.resolve(categories);
        } catch (error) {
            console.error('Error getting categories from localStorage:', error);
            return Promise.resolve([]);
        }
    }

    saveSettingLS(key, value) {
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            settings[key] = value;
            localStorage.setItem('settings', JSON.stringify(settings));
            this.createBackup();
            return Promise.resolve(true);
        } catch (error) {
            console.error('Error saving setting to localStorage:', error);
            return Promise.reject(error);
        }
    }

    getSettingLS(key) {
        try {
            const settings = JSON.parse(localStorage.getItem('settings') || '{}');
            return Promise.resolve(settings[key] || null);
        } catch (error) {
            console.error('Error getting setting from localStorage:', error);
            return Promise.resolve(null);
        }
    }

    async openDatabase() {
        // Skip IndexedDB for GitHub Pages compatibility
        return null;
    }

    // Cleanup method
    destroy() {
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }
        this.forceSave();
    }
}

// Initialize database
const db = new StockDatabase();

// Ensure cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (db) {
        db.destroy();
    }
});