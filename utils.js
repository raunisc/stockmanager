// Utility functions
class Utils {
    static formatCurrency(amount, currency = 'BRL') {
        const formatter = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2
        });
        return formatter.format(amount);
    }

    static formatDate(date) {
        return new Date(date).toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static formatNumber(number) {
        return new Intl.NumberFormat('pt-BR').format(number);
    }

    static generateCode() {
        return Date.now().toString().slice(-8);
    }

    static showNotification(message, type = 'success') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--danger-color)' : 'var(--primary-color)'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: var(--border-radius);
            box-shadow: var(--shadow-lg);
            z-index: 1200;
            max-width: 400px;
            animation: slideIn 0.3s ease;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i>
                <div>${message}</div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);

        // Click to dismiss
        notification.addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        });
    }

    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static downloadFile(content, filename, contentType = 'application/json') {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    static readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    static validateForm(form) {
        const errors = [];
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            const value = field.value.trim();
            if (!value) {
                const label = field.labels[0]?.textContent || field.name || field.id;
                errors.push(`${label} é obrigatório`);
                field.classList.add('error');
            } else {
                field.classList.remove('error');
                
                // Additional validation
                if (field.type === 'email' && !this.isValidEmail(value)) {
                    errors.push('E-mail inválido');
                    field.classList.add('error');
                }
                
                if (field.type === 'number') {
                    const numValue = parseFloat(value);
                    if (isNaN(numValue) || numValue < 0) {
                        errors.push(`${field.labels[0]?.textContent || field.name} deve ser um número válido`);
                        field.classList.add('error');
                    }
                }
            }
        });
        
        return errors;
    }

    static searchProducts(products, query) {
        if (!query) return products;
        
        const searchTerms = query.toLowerCase().split(' ');
        return products.filter(product => {
            const searchText = `${product.name} ${product.code} ${product.category} ${product.description || ''}`.toLowerCase();
            return searchTerms.every(term => searchText.includes(term));
        });
    }

    static filterProducts(products, category) {
        if (!category) return products;
        return products.filter(product => product.category === category);
    }

    static sortProducts(products, field, direction = 'asc') {
        return [...products].sort((a, b) => {
            let aValue = a[field];
            let bValue = b[field];
            
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }
            
            if (direction === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });
    }

    static calculateStockValue(products) {
        return products.reduce((total, product) => {
            return total + (product.quantity * product.price);
        }, 0);
    }

    static getStockStatus(quantity, minStock = 10) {
        if (quantity === 0) return 'out';
        if (quantity <= minStock) return 'low';
        return 'normal';
    }

    static getStockStatusText(status) {
        const statusMap = {
            'normal': 'Normal',
            'low': 'Baixo',
            'out': 'Esgotado'
        };
        return statusMap[status] || 'Desconhecido';
    }

    static groupBy(array, key) {
        return array.reduce((groups, item) => {
            const value = item[key];
            if (!groups[value]) {
                groups[value] = [];
            }
            groups[value].push(item);
            return groups;
        }, {});
    }

    static calculatePercentage(value, total) {
        return total === 0 ? 0 : (value / total) * 100;
    }

    static generateRandomColors(count) {
        const colors = [
            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
            '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
        ];
        
        if (count <= colors.length) {
            return colors.slice(0, count);
        }
        
        const result = [...colors];
        for (let i = colors.length; i < count; i++) {
            const hue = (i * 137.508) % 360; // Golden angle approximation
            result.push(`hsl(${hue}, 70%, 50%)`);
        }
        
        return result;
    }

    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    static isValidPhone(phone) {
        const phoneRegex = /^[\d\s\-\(\)\+]+$/;
        return phoneRegex.test(phone);
    }

    static formatPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 11) {
            return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        }
        return phone;
    }

    static sanitizeInput(input) {
        return input.replace(/[<>]/g, '');
    }

    static truncateText(text, maxLength = 100) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    static getRandomId() {
        return Math.random().toString(36).substring(2, 15);
    }

    static copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copiado para a área de transferência!', 'success');
        }).catch(() => {
            this.showNotification('Erro ao copiar texto', 'error');
        });
    }

    static getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
        
        if (diffInSeconds < 60) return 'agora mesmo';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutos atrás`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} horas atrás`;
        return `${Math.floor(diffInSeconds / 86400)} dias atrás`;
    }
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Export formatters for global use
window.formatCurrency = Utils.formatCurrency;
window.formatDate = Utils.formatDate;
window.formatNumber = Utils.formatNumber;
window.showNotification = Utils.showNotification;