/**
 * UPSC Study Desk - Modal Component
 * Generic modal for adding providers/courses
 */

const Modal = {
    // Current modal state
    isOpen: false,
    title: '',
    placeholder: '',
    onConfirm: null,

    /**
     * Initialize modal event listeners
     */
    init() {
        const overlay = Utils.$('modal-overlay');
        const closeBtn = Utils.$('modal-close');
        const cancelBtn = Utils.$('modal-cancel');
        const confirmBtn = Utils.$('modal-confirm');
        const input = Utils.$('modal-input');

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.close();
            }
        });

        // Close button
        closeBtn.addEventListener('click', () => this.close());
        cancelBtn.addEventListener('click', () => this.close());

        // Confirm button
        confirmBtn.addEventListener('click', () => this.confirm());

        // Enter key to confirm
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.confirm();
            } else if (e.key === 'Escape') {
                this.close();
            }
        });
    },

    /**
     * Open the modal
     * @param {Object} options - Modal options
     */
    open(options = {}) {
        const { title = 'Add Item', placeholder = 'Enter name...', value = '', onConfirm = null } = options;

        this.title = title;
        this.placeholder = placeholder;
        this.onConfirm = onConfirm;
        this.isOpen = true;

        // Update DOM
        Utils.$('modal-title').textContent = title;
        Utils.$('modal-input').placeholder = placeholder;
        Utils.$('modal-input').value = value;
        Utils.$('modal-overlay').classList.add('active');

        // Focus input and select text
        setTimeout(() => {
            const input = Utils.$('modal-input');
            input.focus();
            input.select();
        }, 100);
    },

    /**
     * Close the modal
     */
    close() {
        this.isOpen = false;
        Utils.$('modal-overlay').classList.remove('active');
        Utils.$('modal-input').value = '';
    },

    /**
     * Confirm the modal action
     */
    confirm() {
        const value = Utils.$('modal-input').value.trim();

        if (!value) {
            Utils.$('modal-input').focus();
            return;
        }

        if (this.onConfirm) {
            this.onConfirm(value);
        }

        this.close();
    }
};

// Make Modal globally available
window.Modal = Modal;
