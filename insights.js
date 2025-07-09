class InsightEngine {
    constructor(database) {
        this.db = database;
    }

    async generateInsights() {
        try {
            const products = await this.db.getProducts();
            const movements = await this.db.getMovements();
            
            if (!products || products.length === 0) {
                return [{
                    type: 'primary',
                    icon: 'info-circle',
                    title: 'Bem-vindo ao StockMaster',
                    content: 'Comece adicionando produtos para receber insights inteligentes sobre seu estoque.',
                    priority: 'low'
                }];
            }

            const insights = [];

            // Stock level insights
            insights.push(...this.analyzeStockLevels(products));
            
            // Movement insights
            insights.push(...this.analyzeMovements(movements, products));
            
            // Value insights
            insights.push(...this.analyzeStockValue(products));
            
            // Category insights
            insights.push(...this.analyzeCategoryDistribution(products));
            
            // Trend insights
            insights.push(...this.analyzeTrends(movements, products));

            return insights;
        } catch (error) {
            console.error('Error generating insights:', error);
            return [{
                type: 'warning',
                icon: 'exclamation-triangle',
                title: 'Erro ao gerar insights',
                content: 'Não foi possível analisar os dados do estoque. Verifique se há produtos cadastrados.',
                priority: 'high'
            }];
        }
    }

    analyzeStockLevels(products) {
        const insights = [];
        const lowStockProducts = products.filter(p => p.quantity <= (p.minStock || 10));
        const outOfStockProducts = products.filter(p => p.quantity === 0);

        if (outOfStockProducts.length > 0) {
            insights.push({
                type: 'warning',
                icon: 'exclamation-triangle',
                title: 'Produtos Esgotados',
                content: `Você tem ${outOfStockProducts.length} produto(s) esgotado(s). Considere reabastecer: ${outOfStockProducts.slice(0, 3).map(p => p.name).join(', ')}${outOfStockProducts.length > 3 ? '...' : ''}.`,
                priority: 'high'
            });
        }

        if (lowStockProducts.length > 0) {
            insights.push({
                type: 'warning',
                icon: 'exclamation-circle',
                title: 'Estoque Baixo',
                content: `${lowStockProducts.length} produto(s) estão com estoque baixo. Recomendamos reabastecer em breve para evitar ruptura de estoque.`,
                priority: 'medium'
            });
        }

        const avgStock = products.reduce((sum, p) => sum + p.quantity, 0) / products.length;
        if (avgStock < 20) {
            insights.push({
                type: 'warning',
                icon: 'chart-line',
                title: 'Estoque Médio Baixo',
                content: `Seu estoque médio é de ${avgStock.toFixed(1)} unidades por produto. Considere aumentar os níveis de estoque para melhor disponibilidade.`,
                priority: 'low'
            });
        }

        return insights;
    }

    analyzeMovements(movements, products) {
        const insights = [];
        const recentMovements = movements.filter(m => {
            const movementDate = new Date(m.date);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return movementDate >= weekAgo;
        });

        if (recentMovements.length === 0) {
            insights.push({
                type: 'warning',
                icon: 'clock',
                title: 'Sem Movimentações Recentes',
                content: 'Não há movimentações de estoque na última semana. Verifique se há produtos sendo vendidos ou recebidos.',
                priority: 'medium'
            });
        }

        const exitMovements = recentMovements.filter(m => m.type === 'saida');
        const entryMovements = recentMovements.filter(m => m.type === 'entrada');

        if (exitMovements.length > entryMovements.length * 2) {
            insights.push({
                type: 'warning',
                icon: 'arrow-down',
                title: 'Saídas Superiores às Entradas',
                content: 'As saídas de estoque estão significativamente maiores que as entradas. Considere reabastecer os produtos mais vendidos.',
                priority: 'high'
            });
        }

        return insights;
    }

    analyzeStockValue(products) {
        const insights = [];
        const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);
        const avgProductValue = totalValue / products.length;

        if (totalValue > 100000) {
            insights.push({
                type: 'success',
                icon: 'dollar-sign',
                title: 'Alto Valor de Estoque',
                content: `Seu estoque tem valor total de ${Utils.formatCurrency(totalValue)}. Considere estratégias de rotação para otimizar o capital investido.`,
                priority: 'medium'
            });
        }

        const highValueProducts = products.filter(p => (p.quantity * p.price) > avgProductValue * 2);
        if (highValueProducts.length > 0) {
            insights.push({
                type: 'primary',
                icon: 'gem',
                title: 'Produtos de Alto Valor',
                content: `${highValueProducts.length} produto(s) representam alto valor no estoque. Monitore-os de perto para evitar perdas.`,
                priority: 'medium'
            });
        }

        return insights;
    }

    analyzeCategoryDistribution(products) {
        const insights = [];
        const categoryGroups = Utils.groupBy(products, 'category');
        const categories = Object.keys(categoryGroups);

        if (categories.length === 1) {
            insights.push({
                type: 'primary',
                icon: 'layer-group',
                title: 'Diversificação de Categorias',
                content: 'Você tem produtos em apenas uma categoria. Considere diversificar para reduzir riscos e ampliar oportunidades.',
                priority: 'low'
            });
        }

        const mostPopularCategory = categories.reduce((prev, current) => 
            categoryGroups[current].length > categoryGroups[prev].length ? current : prev
        );

        const mostPopularCount = categoryGroups[mostPopularCategory].length;
        const totalProducts = products.length;

        if (mostPopularCount / totalProducts > 0.7) {
            insights.push({
                type: 'warning',
                icon: 'balance-scale',
                title: 'Concentração de Categoria',
                content: `${Math.round((mostPopularCount / totalProducts) * 100)}% dos seus produtos estão na categoria "${mostPopularCategory}". Considere diversificar para reduzir riscos.`,
                priority: 'medium'
            });
        }

        return insights;
    }

    analyzeTrends(movements, products) {
        const insights = [];
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());

        const lastMonthMovements = movements.filter(m => {
            const date = new Date(m.date);
            return date >= lastMonth && date <= now;
        });

        const previousMonthMovements = movements.filter(m => {
            const date = new Date(m.date);
            return date >= twoMonthsAgo && date < lastMonth;
        });

        if (lastMonthMovements.length > previousMonthMovements.length * 1.5) {
            insights.push({
                type: 'success',
                icon: 'trending-up',
                title: 'Aumento na Atividade',
                content: 'A movimentação do estoque aumentou significativamente no último mês. Isso pode indicar crescimento nas vendas.',
                priority: 'high'
            });
        } else if (lastMonthMovements.length < previousMonthMovements.length * 0.7) {
            insights.push({
                type: 'warning',
                icon: 'trending-down',
                title: 'Redução na Atividade',
                content: 'A movimentação do estoque diminuiu no último mês. Investigue possíveis causas e considere ações para aumentar as vendas.',
                priority: 'high'
            });
        }

        // Analyze product performance
        const productMovements = Utils.groupBy(movements, 'productId');
        const fastMovingProducts = [];
        const slowMovingProducts = [];

        products.forEach(product => {
            const productMoves = productMovements[product.id] || [];
            const recentMoves = productMoves.filter(m => {
                const date = new Date(m.date);
                return date >= lastMonth;
            });

            if (recentMoves.length > 10) {
                fastMovingProducts.push(product);
            } else if (recentMoves.length === 0) {
                slowMovingProducts.push(product);
            }
        });

        if (fastMovingProducts.length > 0) {
            insights.push({
                type: 'success',
                icon: 'fire',
                title: 'Produtos em Alta',
                content: `${fastMovingProducts.length} produto(s) têm alta rotatividade. Considere manter estoque adequado destes itens.`,
                priority: 'medium'
            });
        }

        if (slowMovingProducts.length > 0) {
            insights.push({
                type: 'warning',
                icon: 'turtle',
                title: 'Produtos Parados',
                content: `${slowMovingProducts.length} produto(s) não tiveram movimentação recente. Considere estratégias de promoção ou remoção.`,
                priority: 'medium'
            });
        }

        return insights;
    }

    generateRecommendations(insights) {
        const recommendations = [];
        
        insights.forEach(insight => {
            switch (insight.title) {
                case 'Produtos Esgotados':
                    recommendations.push({
                        action: 'restock',
                        priority: 'high',
                        title: 'Reabastecer Produtos Esgotados',
                        description: 'Priorize a reposição de produtos esgotados para não perder vendas.'
                    });
                    break;
                    
                case 'Estoque Baixo':
                    recommendations.push({
                        action: 'monitor',
                        priority: 'medium',
                        title: 'Monitorar Estoque Baixo',
                        description: 'Acompanhe diariamente os produtos com estoque baixo e programe reposições.'
                    });
                    break;
                    
                case 'Produtos Parados':
                    recommendations.push({
                        action: 'promote',
                        priority: 'low',
                        title: 'Promover Produtos Parados',
                        description: 'Crie promoções ou campanhas para movimentar produtos sem saída.'
                    });
                    break;
            }
        });

        return recommendations;
    }
}

// Create global instance
const insightEngine = new InsightEngine(db);