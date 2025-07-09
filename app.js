class StockMasterApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.currentProduct = null;
        this.products = [];
        this.categories = [];
        this.movements = [];
        this.settings = {};
        this.isMobile = window.innerWidth <= 768;
        this.chartInstance = null;
        this.isLoading = false;
        
        this.init();
    }

    async init() {
        // Wait for Chart.js to load
        await this.waitForChart();
        await this.loadData();
        this.setupEventListeners();
        this.setupMobileMenu();
        this.renderCurrentPage();
        this.updateDashboard();
        this.handleResize();
    }

    waitForChart() {
        return new Promise((resolve) => {
            if (typeof Chart !== 'undefined') {
                resolve();
            } else {
                const checkChart = setInterval(() => {
                    if (typeof Chart !== 'undefined') {
                        clearInterval(checkChart);
                        resolve();
                    }
                }, 100);
            }
        });
    }

    async loadData() {
        this.setLoading(true);
        try {
            this.products = await db.getProducts();
            this.categories = await db.getCategories();
            this.movements = await db.getMovements();
            this.settings = await db.getSetting('general') || {};
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Erro ao carregar dados');
        } finally {
            this.setLoading(false);
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.menu-item:not(.external-link)').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = e.currentTarget.dataset.page;
                this.navigateToPage(page);
                if (this.isMobile) {
                    this.closeMobileMenu();
                }
            });
        });

        // External link handler
        document.querySelectorAll('.menu-item.external-link').forEach(item => {
            item.addEventListener('click', (e) => {
                if (this.isMobile) {
                    this.closeMobileMenu();
                }
            });
        });

        // Product form
        document.getElementById('product-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleProductSubmit();
        });

        // Movement form
        document.getElementById('movement-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleMovementSubmit();
        });

        // Settings form
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSettingsSubmit();
        });

        // Search
        const searchInput = document.getElementById('inventory-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                this.filterInventory();
            }, 300));
        }

        // Category filter
        const categoryFilter = document.getElementById('category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                this.filterInventory();
            });
        }

        // Modal close handlers
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Window resize handler
        window.addEventListener('resize', () => {
            this.handleResize();
        });

        // Prevent zoom on double tap for iOS
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }

    setupMobileMenu() {
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const sidebarClose = document.getElementById('sidebar-close');

        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                this.openMobileMenu();
            });
        }

        if (sidebarClose) {
            sidebarClose.addEventListener('click', () => {
                this.closeMobileMenu();
            });
        }

        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => {
                this.closeMobileMenu();
            });
        }

        // Close mobile menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                this.closeMobileMenu();
            }
        });
    }

    openMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const mobileOverlay = document.getElementById('mobile-overlay');
        
        sidebar.classList.add('active');
        mobileOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const mobileOverlay = document.getElementById('mobile-overlay');
        
        sidebar.classList.remove('active');
        mobileOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    handleResize() {
        const wasMobile = this.isMobile;
        this.isMobile = window.innerWidth <= 768;
        
        if (wasMobile !== this.isMobile) {
            // Reset mobile menu state when switching between mobile and desktop
            this.closeMobileMenu();
            
            // Re-render chart with new responsive settings
            if (this.currentPage === 'dashboard') {
                setTimeout(() => {
                    this.renderCategoryChart();
                }, 100);
            }
            
            // Re-render current page to adjust for new screen size
            this.renderCurrentPage();
        }
    }

    navigateToPage(page) {
        // Update active menu item
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`).classList.add('active');

        // Update active page
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        document.getElementById(page).classList.add('active');

        this.currentPage = page;
        this.renderCurrentPage();
    }

    async renderCurrentPage() {
        switch (this.currentPage) {
            case 'dashboard':
                await this.updateDashboard();
                this.renderCategoryChart();
                this.renderRecentMovements();
                this.renderRecommendedActions();
                break;
            case 'inventory':
                await this.populateCategoryFilter();
                this.renderInventoryTable();
                break;
            case 'products':
                await this.populateProductCategorySelect();
                this.renderProductsGrid();
                break;
            case 'reports':
                this.renderStockReport();
                this.renderMovementReport();
                break;
            case 'insights':
                this.renderInsights();
                break;
            case 'settings':
                this.renderSettings();
                break;
        }
    }

    async updateDashboard() {
        const totalProducts = this.products.length;
        const totalValue = Utils.calculateStockValue(this.products);
        const lowStockCount = this.products.filter(p => Utils.getStockStatus(p.quantity, p.minStock || 10) === 'low').length;
        const categoriesCount = new Set(this.products.map(p => p.category)).size;

        const totalProductsEl = document.getElementById('total-products');
        const totalValueEl = document.getElementById('total-value');
        const lowStockCountEl = document.getElementById('low-stock-count');
        const categoriesCountEl = document.getElementById('categories-count');

        if (totalProductsEl) totalProductsEl.textContent = formatNumber(totalProducts);
        if (totalValueEl) totalValueEl.textContent = formatCurrency(totalValue);
        if (lowStockCountEl) lowStockCountEl.textContent = formatNumber(lowStockCount);
        if (categoriesCountEl) categoriesCountEl.textContent = formatNumber(categoriesCount);
    }

    renderCategoryChart() {
        const ctx = document.getElementById('categoryChart');
        if (!ctx) return;

        // Clear existing chart properly
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }

        // Create chart container if it doesn't exist
        let chartContainer = ctx.parentElement.querySelector('.chart-container');
        if (!chartContainer) {
            chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';
            ctx.parentElement.appendChild(chartContainer);
            chartContainer.appendChild(ctx);
        }

        if (this.products.length === 0) {
            chartContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chart-pie"></i>
                    <h3>Nenhum produto cadastrado</h3>
                    <p>Adicione produtos para visualizar o gráfico</p>
                </div>
            `;
            return;
        }

        const categoryData = Utils.groupBy(this.products, 'category');
        const labels = Object.keys(categoryData);
        const data = labels.map(label => categoryData[label].length);
        const colors = Utils.generateRandomColors(labels.length);

        try {
            this.chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: this.isMobile ? 'bottom' : 'right',
                            labels: {
                                boxWidth: 12,
                                padding: 15,
                                usePointStyle: true,
                                font: {
                                    size: this.isMobile ? 11 : 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${label}: ${value} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    interaction: {
                        intersect: false
                    }
                }
            });
        } catch (error) {
            console.error('Error creating chart:', error);
            chartContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar gráfico</h3>
                    <p>Tente recarregar a página</p>
                </div>
            `;
        }
    }

    renderRecentMovements() {
        const container = document.getElementById('recent-movements');
        if (!container) return;

        const recentMovements = this.movements
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, this.isMobile ? 5 : 10);

        if (recentMovements.length === 0) {
            container.innerHTML = '<p class="text-secondary">Nenhuma movimentação recente</p>';
            return;
        }

        container.innerHTML = recentMovements.map(movement => {
            const product = this.products.find(p => p.id === movement.productId);
            const productName = product ? product.name : 'Produto não encontrado';
            
            return `
                <div class="movement-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
                    <div style="flex: 1; min-width: 0;">
                        <strong style="display: block; margin-bottom: 0.25rem; word-break: break-word;">${productName}</strong>
                        <small class="text-secondary">${movement.reason}</small>
                    </div>
                    <div style="text-align: right; flex-shrink: 0; margin-left: 1rem;">
                        <span class="status-badge ${movement.type === 'entrada' ? 'normal' : 'low'}">${movement.type}</span>
                        <br>
                        <small class="text-secondary">${formatDate(movement.date)}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    async renderRecommendedActions() {
        const container = document.getElementById('recommended-actions');
        if (!container) return;

        try {
            const insights = await insightEngine.generateInsights();
            const recommendations = insightEngine.generateRecommendations(insights);

            if (recommendations.length === 0) {
                container.innerHTML = '<p class="text-secondary">Nenhuma ação recomendada no momento</p>';
                return;
            }

            container.innerHTML = recommendations.map(rec => `
                <div class="action-item">
                    <div class="action-icon ${rec.priority === 'high' ? 'danger' : rec.priority === 'medium' ? 'warning' : 'primary'}">
                        <i class="fas fa-${rec.priority === 'high' ? 'exclamation' : rec.priority === 'medium' ? 'clock' : 'info'}"></i>
                    </div>
                    <div class="action-content">
                        <div class="action-title">${rec.title}</div>
                        <div class="action-description">${rec.description}</div>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error rendering recommended actions:', error);
            container.innerHTML = '<p class="text-secondary">Erro ao carregar ações recomendadas</p>';
        }
    }

    async renderInventory() {
        await this.populateCategoryFilter();
        this.renderInventoryTable();
    }

    async populateCategoryFilter() {
        const select = document.getElementById('category-filter');
        if (!select) return;

        try {
            const categories = await db.getCategories();
            select.innerHTML = '<option value="">Todas as Categorias</option>';
            
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.name;
                option.textContent = category.name;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error populating category filter:', error);
        }
    }

    renderInventoryTable() {
        const tbody = document.getElementById('inventory-tbody');
        if (!tbody) return;

        let filteredProducts = [...this.products];

        // Apply search filter
        const searchQuery = document.getElementById('inventory-search')?.value;
        if (searchQuery) {
            filteredProducts = Utils.searchProducts(filteredProducts, searchQuery);
        }

        // Apply category filter
        const categoryFilter = document.getElementById('category-filter')?.value;
        if (categoryFilter) {
            filteredProducts = Utils.filterProducts(filteredProducts, categoryFilter);
        }

        if (filteredProducts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-state" style="padding: 2rem;">
                        <i class="fas fa-search"></i>
                        <h3>Nenhum produto encontrado</h3>
                        <p>Tente ajustar os filtros ou adicionar novos produtos</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filteredProducts.map(product => {
            const status = Utils.getStockStatus(product.quantity, product.minStock || 10);
            const statusText = Utils.getStockStatusText(status);
            const totalValue = product.quantity * product.price;

            return `
                <tr>
                    <td><code>${product.code}</code></td>
                    <td title="${product.name}">${Utils.truncateText(product.name, 30)}</td>
                    <td>${product.category}</td>
                    <td>${formatNumber(product.quantity)}</td>
                    <td>${formatCurrency(product.price)}</td>
                    <td>${formatCurrency(totalValue)}</td>
                    <td><span class="status-badge ${status}">${statusText}</span></td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-small btn-secondary" onclick="app.editProduct(${product.id})" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-small btn-secondary" onclick="app.showMovementModal(${product.id})" title="Movimentar">
                                <i class="fas fa-exchange-alt"></i>
                            </button>
                            <button class="btn btn-small btn-danger" onclick="app.deleteProduct(${product.id})" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    filterInventory() {
        this.renderInventoryTable();
    }

    async renderProducts() {
        await this.populateProductCategorySelect();
        this.renderProductsGrid();
    }

    async populateProductCategorySelect() {
        const select = document.getElementById('product-category');
        if (!select) {
            console.error('Product category select not found');
            return;
        }

        try {
            const categories = await db.getCategories();
            select.innerHTML = '<option value="">Selecionar categoria</option>';
            
            if (categories && categories.length > 0) {
                categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.name;
                    option.textContent = category.name;
                    select.appendChild(option);
                });
            } else {
                // If no categories exist, create default ones
                const defaultCategories = [
                    { name: 'Burger e Otakus', description: 'Produtos relacionados a hambúrgueres e cultura otaku' },
                    { name: 'Dogão do Canela Fina', description: 'Hot dogs e produtos especiais do Canela Fina' }
                ];

                for (const category of defaultCategories) {
                    await db.addCategory(category);
                }

                // Reload categories after adding defaults
                const newCategories = await db.getCategories();
                if (newCategories && newCategories.length > 0) {
                    newCategories.forEach(category => {
                        const option = document.createElement('option');
                        option.value = category.name;
                        option.textContent = category.name;
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Error populating product category select:', error);
            // Add a fallback option
            select.innerHTML = '<option value="">Erro ao carregar categorias</option>';
        }
    }

    renderProductsGrid() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        if (this.products.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-box"></i>
                    <h3>Nenhum produto cadastrado</h3>
                    <p>Clique em "Novo Produto" para começar</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.products.map(product => {
            const status = Utils.getStockStatus(product.quantity, product.minStock || 10);
            const statusText = Utils.getStockStatusText(status);
            const totalValue = product.quantity * product.price;

            return `
                <div class="product-card">
                    <div class="product-card-header">
                        <div style="flex: 1; min-width: 0;">
                            <div class="product-card-title" title="${product.name}">${Utils.truncateText(product.name, 25)}</div>
                            <div class="product-card-code"><code>${product.code}</code></div>
                        </div>
                        <div class="product-card-actions">
                            <button class="btn btn-small btn-secondary" onclick="app.editProduct(${product.id})" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-small btn-danger" onclick="app.deleteProduct(${product.id})" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="product-card-info">
                        <p><strong>Categoria:</strong> ${product.category}</p>
                        <p><strong>Quantidade:</strong> ${formatNumber(product.quantity)}</p>
                        <p><strong>Preço:</strong> ${formatCurrency(product.price)}</p>
                        <p><strong>Valor Total:</strong> ${formatCurrency(totalValue)}</p>
                        ${product.description ? `<p><strong>Descrição:</strong> ${Utils.truncateText(product.description, 80)}</p>` : ''}
                    </div>
                    <div class="product-card-footer">
                        <span class="status-badge ${status}">${statusText}</span>
                        <button class="btn btn-small btn-primary" onclick="app.showMovementModal(${product.id})">
                            <i class="fas fa-exchange-alt"></i> <span class="btn-text">Movimentar</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async renderReports() {
        this.renderStockReport();
        this.renderMovementReport();
    }

    renderStockReport() {
        const container = document.getElementById('stock-report');
        if (!container) return;

        const totalProducts = this.products.length;
        const totalValue = Utils.calculateStockValue(this.products);
        const lowStockProducts = this.products.filter(p => Utils.getStockStatus(p.quantity, p.minStock || 10) === 'low');
        const outOfStockProducts = this.products.filter(p => p.quantity === 0);

        // Group products by category
        const categoryGroups = Utils.groupBy(this.products, 'category');
        const categoryStats = Object.keys(categoryGroups).map(category => {
            const categoryProducts = categoryGroups[category];
            const categoryValue = categoryProducts.reduce((sum, product) => sum + (product.quantity * product.price), 0);
            const categoryQuantity = categoryProducts.reduce((sum, product) => sum + product.quantity, 0);
            return {
                name: category,
                products: categoryProducts.length,
                quantity: categoryQuantity,
                value: categoryValue
            };
        });

        container.innerHTML = `
            <div class="report-stats">
                <div class="report-stat">
                    <h4>${formatNumber(totalProducts)}</h4>
                    <p>Total de Produtos</p>
                </div>
                <div class="report-stat">
                    <h4>${formatCurrency(totalValue)}</h4>
                    <p>Valor Total</p>
                </div>
                <div class="report-stat">
                    <h4>${formatNumber(lowStockProducts.length)}</h4>
                    <p>Estoque Baixo</p>
                </div>
                <div class="report-stat">
                    <h4>${formatNumber(outOfStockProducts.length)}</h4>
                    <p>Esgotados</p>
                </div>
            </div>
            
            ${categoryStats.length > 0 ? `
                <div class="report-details">
                    <h4>Estoque por Categoria:</h4>
                    <div class="category-stats">
                        ${categoryStats.map(cat => `
                            <div class="category-stat-item" style="padding: 1rem; background: var(--background-color); border-radius: var(--border-radius); margin-bottom: 1rem; border-left: 4px solid var(--primary-color);">
                                <h5 style="margin-bottom: 0.5rem; color: var(--primary-color);">${cat.name}</h5>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-top: 0.5rem;">
                                    <div style="text-align: center;">
                                        <strong style="font-size: 1.2rem; display: block;">${cat.products}</strong>
                                        <small style="color: var(--text-secondary);">Produtos</small>
                                    </div>
                                    <div style="text-align: center;">
                                        <strong style="font-size: 1.2rem; display: block;">${formatNumber(cat.quantity)}</strong>
                                        <small style="color: var(--text-secondary);">Unidades</small>
                                    </div>
                                    <div style="text-align: center;">
                                        <strong style="font-size: 1.2rem; display: block;">${formatCurrency(cat.value)}</strong>
                                        <small style="color: var(--text-secondary);">Valor Total</small>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${lowStockProducts.length > 0 ? `
                <div class="report-details">
                    <h4>Produtos com Estoque Baixo:</h4>
                    <ul>
                        ${lowStockProducts.slice(0, 10).map(p => `<li>${p.name} (${p.category}) - ${p.quantity} unidades</li>`).join('')}
                        ${lowStockProducts.length > 10 ? `<li>... e mais ${lowStockProducts.length - 10} produtos</li>` : ''}
                    </ul>
                </div>
            ` : ''}
        `;
    }

    renderMovementReport() {
        const container = document.getElementById('movement-report');
        if (!container) return;

        const recentMovements = this.movements.filter(m => {
            const date = new Date(m.date);
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return date >= monthAgo;
        });

        const entriesCount = recentMovements.filter(m => m.type === 'entrada').length;
        const exitsCount = recentMovements.filter(m => m.type === 'saida').length;

        // Calculate quantities and values for entries and exits
        const entriesData = recentMovements.filter(m => m.type === 'entrada').reduce((acc, movement) => {
            const product = this.products.find(p => p.id === movement.productId);
            if (product) {
                acc.quantity += movement.quantity;
                acc.value += movement.quantity * product.price;
            }
            return acc;
        }, { quantity: 0, value: 0 });

        const exitsData = recentMovements.filter(m => m.type === 'saida').reduce((acc, movement) => {
            const product = this.products.find(p => p.id === movement.productId);
            if (product) {
                acc.quantity += movement.quantity;
                acc.value += movement.quantity * product.price;
            }
            return acc;
        }, { quantity: 0, value: 0 });

        container.innerHTML = `
            <div class="report-stats">
                <div class="report-stat">
                    <h4>${formatNumber(recentMovements.length)}</h4>
                    <p>Movimentações (30 dias)</p>
                </div>
                <div class="report-stat">
                    <h4>${formatNumber(entriesCount)}</h4>
                    <p>Entradas</p>
                </div>
                <div class="report-stat">
                    <h4>${formatNumber(exitsCount)}</h4>
                    <p>Saídas</p>
                </div>
            </div>
            
            <div class="report-details">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
                    <div class="movement-summary-card" style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--success-color); padding: 1.5rem; border-radius: var(--border-radius);">
                        <h4 style="color: var(--success-color); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-arrow-up"></i>
                            Entradas (30 dias)
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div style="text-align: center;">
                                <strong style="font-size: 1.5rem; display: block; color: var(--success-color);">${formatNumber(entriesData.quantity)}</strong>
                                <small style="color: var(--text-secondary);">Unidades</small>
                            </div>
                            <div style="text-align: center;">
                                <strong style="font-size: 1.5rem; display: block; color: var(--success-color);">${formatCurrency(entriesData.value)}</strong>
                                <small style="color: var(--text-secondary);">Valor Total</small>
                            </div>
                        </div>
                    </div>
                    
                    <div class="movement-summary-card" style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid var(--warning-color); padding: 1.5rem; border-radius: var(--border-radius);">
                        <h4 style="color: var(--warning-color); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-arrow-down"></i>
                            Saídas (30 dias)
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div style="text-align: center;">
                                <strong style="font-size: 1.5rem; display: block; color: var(--warning-color);">${formatNumber(exitsData.quantity)}</strong>
                                <small style="color: var(--text-secondary);">Unidades</small>
                            </div>
                            <div style="text-align: center;">
                                <strong style="font-size: 1.5rem; display: block; color: var(--warning-color);">${formatCurrency(exitsData.value)}</strong>
                                <small style="color: var(--text-secondary);">Valor Total</small>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${entriesData.quantity > 0 || exitsData.quantity > 0 ? `
                    <div class="balance-summary" style="background: var(--background-color); padding: 1.5rem; border-radius: var(--border-radius); margin-bottom: 1.5rem;">
                        <h4 style="margin-bottom: 1rem; color: var(--text-primary);">Balanço do Período</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                            <div style="text-align: center;">
                                <strong style="font-size: 1.3rem; display: block; color: ${entriesData.quantity - exitsData.quantity >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
                                    ${formatNumber(entriesData.quantity - exitsData.quantity)}
                                </strong>
                                <small style="color: var(--text-secondary);">Saldo Unidades</small>
                            </div>
                            <div style="text-align: center;">
                                <strong style="font-size: 1.3rem; display: block; color: ${entriesData.value - exitsData.value >= 0 ? 'var(--success-color)' : 'var(--danger-color)'};">
                                    ${formatCurrency(entriesData.value - exitsData.value)}
                                </strong>
                                <small style="color: var(--text-secondary);">Saldo Valor</small>
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                ${recentMovements.length > 0 ? `
                    <div>
                        <h4>Movimentações Recentes:</h4>
                        <ul>
                            ${recentMovements.slice(0, 10).map(m => {
                                const product = this.products.find(p => p.id === m.productId);
                                const movementValue = product ? (m.quantity * product.price) : 0;
                                return `<li>
                                    ${product ? product.name : 'N/A'} - 
                                    <span style="color: ${m.type === 'entrada' ? 'var(--success-color)' : 'var(--warning-color)'};">
                                        ${m.type === 'entrada' ? '+' : '-'}${formatNumber(m.quantity)} unidades 
                                        (${formatCurrency(movementValue)})
                                    </span> - 
                                    ${formatDate(m.date)}
                                </li>`;
                            }).join('')}
                            ${recentMovements.length > 10 ? `<li>... e mais ${recentMovements.length - 10} movimentações</li>` : ''}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }

    async renderInsights() {
        const container = document.getElementById('insights-container');
        if (!container) return;

        // Show loading state
        container.innerHTML = '<div class="loading-overlay"><div class="loading-spinner dark"></div></div>';

        try {
            // Check if insightEngine is available
            if (typeof insightEngine === 'undefined') {
                throw new Error('Insight engine not available');
            }

            const insights = await insightEngine.generateInsights();
            
            if (insights.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-lightbulb"></i>
                        <h3>Nenhum insight disponível</h3>
                        <p>Adicione produtos e movimentações para gerar insights inteligentes</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = insights.map(insight => `
                <div class="insight-card ${insight.type}">
                    <div class="insight-header">
                        <div class="insight-icon ${insight.type}">
                            <i class="fas fa-${insight.icon}"></i>
                        </div>
                        <div class="insight-title">${insight.title}</div>
                    </div>
                    <div class="insight-content">${insight.content}</div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error rendering insights:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar insights</h3>
                    <p>Tente recarregar a página ou adicionar mais dados ao sistema</p>
                </div>
            `;
        }
    }

    async renderSettings() {
        const settings = await db.getSetting('general') || {};
        
        const companyNameInput = document.getElementById('company-name');
        const lowStockThresholdInput = document.getElementById('low-stock-threshold');
        const currencySelect = document.getElementById('currency');

        if (companyNameInput) companyNameInput.value = settings.companyName || '';
        if (lowStockThresholdInput) lowStockThresholdInput.value = settings.lowStockThreshold || 10;
        if (currencySelect) currencySelect.value = settings.currency || 'BRL';
    }

    // Product Management
    async showProductModal(productId = null) {
        const modal = document.getElementById('product-modal');
        const form = document.getElementById('product-form');
        const title = document.getElementById('modal-title');
        const submitText = document.getElementById('submit-text');

        if (!modal) {
            console.error('Product modal not found');
            this.showError('Erro interno: modal do produto não encontrado');
            return;
        }

        if (!form) {
            console.error('Product form not found');
            this.showError('Erro interno: formulário do produto não encontrado');
            return;
        }

        if (!title) {
            console.error('Modal title not found');
            this.showError('Erro interno: título do modal não encontrado');
            return;
        }

        if (!submitText) {
            console.error('Submit text not found');
            this.showError('Erro interno: texto do botão não encontrado');
            return;
        }

        try {
            // Always populate categories when showing modal
            await this.populateProductCategorySelect();
            
            // Wait a bit for categories to populate
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify category select was populated
            const categorySelect = document.getElementById('product-category');
            if (!categorySelect) {
                console.error('Category select not found after population');
                this.showError('Erro interno: seletor de categoria não encontrado');
                return;
            }

            if (productId) {
                const product = this.products.find(p => p.id === productId);
                if (!product) {
                    this.showError('Produto não encontrado');
                    return;
                }

                title.textContent = 'Editar Produto';
                submitText.textContent = 'Atualizar Produto';
                this.currentProduct = product;

                // Fill form with product data with null checks
                const formElements = {
                    code: document.getElementById('product-code'),
                    name: document.getElementById('product-name'),
                    category: document.getElementById('product-category'),
                    quantity: document.getElementById('product-quantity'),
                    price: document.getElementById('product-price'),
                    description: document.getElementById('product-description'),
                    supplier: document.getElementById('product-supplier'),
                    minStock: document.getElementById('product-min-stock')
                };

                if (formElements.code) formElements.code.value = product.code;
                if (formElements.name) formElements.name.value = product.name;
                if (formElements.category) formElements.category.value = product.category;
                if (formElements.quantity) formElements.quantity.value = product.quantity;
                if (formElements.price) formElements.price.value = product.price;
                if (formElements.description) formElements.description.value = product.description || '';
                if (formElements.supplier) formElements.supplier.value = product.supplier || '';
                if (formElements.minStock) formElements.minStock.value = product.minStock || 10;
            } else {
                title.textContent = 'Adicionar Produto';
                submitText.textContent = 'Adicionar Produto';
                this.currentProduct = null;
                form.reset();
                
                const codeInput = document.getElementById('product-code');
                if (codeInput) {
                    codeInput.value = Utils.generateCode();
                }
            }

            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Focus on first input after modal opens
            setTimeout(() => {
                const firstInput = form.querySelector('input:not([readonly])');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 100);
        } catch (error) {
            console.error('Error showing product modal:', error);
            this.showError('Erro ao abrir formulário de produto: ' + (error.message || 'Erro desconhecido'));
        }
    }

    async handleProductSubmit() {
        const form = document.getElementById('product-form');
        if (!form) {
            console.error('Product form not found');
            this.showError('Erro interno: formulário não encontrado');
            return;
        }

        // Find submit button and text element more reliably
        const submitButton = form.querySelector('button[type="submit"]') || document.querySelector('#product-modal button[type="submit"]');
        const submitText = document.getElementById('submit-text');
        
        if (!submitButton) {
            console.error('Submit button not found');
            this.showError('Erro interno: botão de envio não encontrado');
            return;
        }

        if (!submitText) {
            console.error('Submit text element not found');
            this.showError('Erro interno: elemento de texto do botão não encontrado');
            return;
        }

        const originalText = submitText.textContent;
        
        // Show loading state immediately
        submitButton.disabled = true;
        submitText.innerHTML = '<span class="loading-spinner"></span>Salvando...';

        try {
            const errors = Utils.validateForm(form);
            
            if (errors.length > 0) {
                this.showError(errors.join('<br>'));
                return;
            }

            // Get form elements with comprehensive null checks
            const formElements = {
                code: document.getElementById('product-code'),
                name: document.getElementById('product-name'),
                category: document.getElementById('product-category'),
                quantity: document.getElementById('product-quantity'),
                price: document.getElementById('product-price'),
                description: document.getElementById('product-description'),
                supplier: document.getElementById('product-supplier'),
                minStock: document.getElementById('product-min-stock')
            };

            // Check if all required elements exist
            const requiredFields = ['code', 'name', 'category', 'quantity', 'price'];
            const missingFields = requiredFields.filter(field => !formElements[field]);
            
            if (missingFields.length > 0) {
                console.error('Missing form elements:', missingFields);
                this.showError(`Erro interno: campos obrigatórios não encontrados: ${missingFields.join(', ')}`);
                return;
            }

            // Validate category selection
            if (!formElements.category.value) {
                this.showError('Por favor, selecione uma categoria');
                return;
            }

            const productData = {
                code: formElements.code.value.trim(),
                name: formElements.name.value.trim(),
                category: formElements.category.value,
                quantity: parseInt(formElements.quantity.value) || 0,
                price: parseFloat(formElements.price.value) || 0,
                description: formElements.description ? formElements.description.value.trim() : '',
                supplier: formElements.supplier ? formElements.supplier.value.trim() : '',
                minStock: formElements.minStock ? parseInt(formElements.minStock.value) || 10 : 10
            };

            // Additional validation
            if (!productData.code || !productData.name) {
                this.showError('Código e nome são obrigatórios');
                return;
            }

            if (productData.quantity < 0) {
                this.showError('Quantidade não pode ser negativa');
                return;
            }

            if (productData.price < 0) {
                this.showError('Preço não pode ser negativo');
                return;
            }

            if (this.currentProduct) {
                // Check if another product with same code exists
                const existingProduct = this.products.find(p => p.code === productData.code && p.id !== this.currentProduct.id);
                if (existingProduct) {
                    this.showError('Código do produto já existe. Por favor, use outro código.');
                    return;
                }
                
                await db.updateProduct(this.currentProduct.id, productData);
                this.showSuccess('Produto atualizado com sucesso!');
            } else {
                // Check if product code already exists
                const existingProduct = this.products.find(p => p.code === productData.code);
                if (existingProduct) {
                    this.showError('Código do produto já existe. Por favor, use outro código.');
                    return;
                }
                
                await db.addProduct(productData);
                this.showSuccess('Produto adicionado com sucesso!');
            }

            // Reload data and update UI
            await this.loadData();
            this.renderCurrentPage();
            this.closeModal('product-modal');
        } catch (error) {
            console.error('Error saving product:', error);
            this.showError('Erro ao salvar produto: ' + (error.message || 'Erro desconhecido'));
        } finally {
            // Always restore button state
            submitButton.disabled = false;
            submitText.textContent = originalText;
        }
    }

    async deleteProduct(productId) {
        if (!confirm('Tem certeza que deseja excluir este produto?')) return;

        try {
            await db.deleteProduct(productId);
            showNotification('Produto excluído com sucesso!');
            await this.loadData();
            this.renderCurrentPage();
        } catch (error) {
            console.error('Error deleting product:', error);
            showNotification('Erro ao excluir produto: ' + error.message, 'error');
        }
    }

    editProduct(productId) {
        this.showProductModal(productId);
    }

    // Movement Management
    showMovementModal(productId) {
        const product = this.products.find(p => p.id === productId);
        if (!product) return;

        this.currentProduct = product;
        const modal = document.getElementById('movement-modal');
        const form = document.getElementById('movement-form');
        
        if (modal && form) {
            modal.classList.add('active');
            form.reset();
            document.body.style.overflow = 'hidden';
        }
    }

    async handleMovementSubmit() {
        const form = document.getElementById('movement-form');
        if (!form) {
            console.error('Movement form not found');
            this.showError('Erro interno: formulário de movimentação não encontrado');
            return;
        }

        // Find submit button more reliably - try multiple selectors
        let submitButton = form.querySelector('button[type="submit"]');
        if (!submitButton) {
            submitButton = document.querySelector('#movement-modal button[type="submit"]');
        }
        if (!submitButton) {
            submitButton = document.querySelector('#movement-modal .btn-primary');
        }
        if (!submitButton) {
            submitButton = document.querySelector('#movement-modal .modal-actions .btn:last-child');
        }
        
        if (!submitButton) {
            console.error('Submit button not found in movement modal');
            this.showError('Erro interno: botão de envio não encontrado no modal de movimentação');
            return;
        }

        const originalText = submitButton.textContent;
        
        // Get form elements with null checks
        const movementTypeEl = document.getElementById('movement-type');
        const movementQuantityEl = document.getElementById('movement-quantity');
        const movementReasonEl = document.getElementById('movement-reason');

        // Check if all required elements exist
        if (!movementTypeEl || !movementQuantityEl || !movementReasonEl) {
            console.error('Movement form elements not found');
            this.showError('Erro interno: elementos do formulário de movimentação não encontrados');
            return;
        }

        if (!this.currentProduct) {
            console.error('No current product selected');
            this.showError('Erro interno: produto não selecionado');
            return;
        }

        const errors = Utils.validateForm(form);
        
        if (errors.length > 0) {
            this.showError(errors.join('<br>'));
            return;
        }

        const movementData = {
            productId: this.currentProduct.id,
            type: movementTypeEl.value,
            quantity: parseInt(movementQuantityEl.value) || 0,
            reason: movementReasonEl.value.trim()
        };

        // Validate quantity
        if (movementData.quantity <= 0) {
            this.showError('Quantidade deve ser maior que zero');
            return;
        }

        // Validate reason
        if (!movementData.reason) {
            this.showError('Motivo é obrigatório');
            return;
        }

        // Update product quantity
        const newQuantity = movementData.type === 'entrada' 
            ? this.currentProduct.quantity + movementData.quantity
            : this.currentProduct.quantity - movementData.quantity;

        if (newQuantity < 0) {
            this.showError('Quantidade insuficiente em estoque');
            return;
        }

        // Show loading state
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="loading-spinner"></span>Salvando...';

        try {
            await db.addMovement(movementData);
            await db.updateProduct(this.currentProduct.id, { quantity: newQuantity });
            
            this.showSuccess('Movimentação registrada com sucesso!');
            await this.loadData();
            this.renderCurrentPage();
            this.closeModal('movement-modal');
        } catch (error) {
            console.error('Error saving movement:', error);
            this.showError('Erro ao registrar movimentação: ' + error.message);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    }

    // Settings Management
    async handleSettingsSubmit() {
        const settingsData = {
            companyName: document.getElementById('company-name').value.trim(),
            lowStockThreshold: parseInt(document.getElementById('low-stock-threshold').value) || 10,
            currency: document.getElementById('currency').value
        };

        try {
            await db.saveSetting('general', settingsData);
            showNotification('Configurações salvas com sucesso!');
            this.settings = settingsData;
        } catch (error) {
            console.error('Error saving settings:', error);
            showNotification('Erro ao salvar configurações: ' + error.message, 'error');
        }
    }

    // Quick Actions
    showQuickAddModal() {
        this.showProductModal();
    }

    // Import/Export
    async exportProducts() {
        try {
            const data = {
                products: this.products,
                categories: this.categories,
                exportDate: new Date().toISOString()
            };

            Utils.downloadFile(
                JSON.stringify(data, null, 2),
                `produtos_${new Date().toISOString().split('T')[0]}.json`
            );
        } catch (error) {
            console.error('Error exporting products:', error);
            showNotification('Erro ao exportar produtos: ' + error.message, 'error');
        }
    }

    async importProducts() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const content = await Utils.readFile(file);
                const data = JSON.parse(content);
                
                if (data.products && Array.isArray(data.products)) {
                    let importedCount = 0;
                    for (const product of data.products) {
                        try {
                            await db.addProduct(product);
                            importedCount++;
                        } catch (error) {
                            console.warn('Error importing product:', error);
                        }
                    }
                    showNotification(`${importedCount} produtos importados com sucesso!`);
                    await this.loadData();
                    this.renderCurrentPage();
                } else {
                    showNotification('Formato de arquivo inválido', 'error');
                }
            } catch (error) {
                console.error('Error importing products:', error);
                showNotification('Erro ao importar produtos: ' + error.message, 'error');
            }
        };

        input.click();
    }

    async exportData() {
        try {
            const data = await db.exportData();
            Utils.downloadFile(
                JSON.stringify(data, null, 2),
                `backup_stockmaster_${new Date().toISOString().split('T')[0]}.json`
            );
        } catch (error) {
            console.error('Error exporting data:', error);
            showNotification('Erro ao exportar dados: ' + error.message, 'error');
        }
    }

    async importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const content = await Utils.readFile(file);
                const data = JSON.parse(content);
                
                const success = await db.importData(data);
                if (success) {
                    showNotification('Dados importados com sucesso!');
                    await this.loadData();
                    this.renderCurrentPage();
                } else {
                    showNotification('Erro ao importar dados', 'error');
                }
            } catch (error) {
                console.error('Error importing data:', error);
                showNotification('Erro ao importar dados: ' + error.message, 'error');
            }
        };

        input.click();
    }

    async clearAllData() {
        if (!confirm('ATENÇÃO: Isso apagará todos os dados. Tem certeza?')) return;
        
        try {
            await db.clearAllData();
            showNotification('Todos os dados foram apagados!');
            await this.loadData();
            this.renderCurrentPage();
        } catch (error) {
            console.error('Error clearing data:', error);
            showNotification('Erro ao apagar dados: ' + error.message, 'error');
        }
    }

    async generateReport() {
        try {
            const reportData = {
                products: this.products,
                movements: this.movements,
                summary: {
                    totalProducts: this.products.length,
                    totalValue: Utils.calculateStockValue(this.products),
                    lowStockCount: this.products.filter(p => Utils.getStockStatus(p.quantity, p.minStock || 10) === 'low').length,
                    outOfStockCount: this.products.filter(p => p.quantity === 0).length
                },
                generatedAt: new Date().toISOString()
            };

            Utils.downloadFile(
                JSON.stringify(reportData, null, 2),
                `relatorio_${new Date().toISOString().split('T')[0]}.json`
            );
        } catch (error) {
            console.error('Error generating report:', error);
            showNotification('Erro ao gerar relatório: ' + error.message, 'error');
        }
    }

    // Modal Management
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        this.currentProduct = null;
    }

    // Helper methods
    setLoading(isLoading) {
        this.isLoading = isLoading;
        // Add loading indicators where needed
        const dashboardCards = document.querySelectorAll('.stat-card');
        dashboardCards.forEach(card => {
            if (isLoading) {
                card.style.opacity = '0.7';
            } else {
                card.style.opacity = '1';
            }
        });
    }

    showSuccess(message) {
        showNotification(message, 'success');
    }

    showError(message) {
        showNotification(message, 'error');
    }

    showInfo(message) {
        showNotification(message, 'info');
    }
}

// Global functions for HTML event handlers
window.showProductModal = () => app.showProductModal();
window.showQuickAddModal = () => app.showQuickAddModal();
window.closeModal = (modalId) => app.closeModal(modalId);
window.exportProducts = () => app.exportProducts();
window.importProducts = () => app.importProducts();
window.exportData = () => app.exportData();
window.importData = () => app.importData();
window.clearAllData = () => app.clearAllData();
window.generateReport = () => app.generateReport();

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new StockMasterApp();
});