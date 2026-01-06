/**
 * UPSC Study Desk - Utility Functions
 * Helper functions used across the application
 */

const Utils = {
    /**
     * Generate a unique ID
     * @returns {string} Unique identifier
     */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Safely get an element by ID
     * @param {string} id - Element ID
     * @returns {HTMLElement|null}
     */
    $(id) {
        return document.getElementById(id);
    },

    /**
     * Create an element with optional attributes and children
     * @param {string} tag - HTML tag name
     * @param {Object} attrs - Attributes object
     * @param {Array|string} children - Child elements or text
     * @returns {HTMLElement}
     */
    createElement(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);

        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([dataKey, dataValue]) => {
                    el.dataset[dataKey] = dataValue;
                });
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        });

        if (typeof children === 'string') {
            el.textContent = children;
        } else if (Array.isArray(children)) {
            children.forEach(child => {
                if (typeof child === 'string') {
                    el.appendChild(document.createTextNode(child));
                } else if (child instanceof HTMLElement) {
                    el.appendChild(child);
                }
            });
        }

        return el;
    },

    /**
     * Clear all children from an element
     * @param {HTMLElement} el - Element to clear
     */
    clearElement(el) {
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
    },

    /**
     * Debounce a function
     * @param {Function} fn - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function}
     */
    debounce(fn, delay = 300) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn(...args), delay);
        };
    },

    /**
     * Capitalize first letter of each word
     * @param {string} str - String to capitalize
     * @returns {string}
     */
    capitalize(str) {
        return str.replace(/\b\w/g, char => char.toUpperCase());
    }
};

// Make Utils globally available
window.Utils = Utils;
