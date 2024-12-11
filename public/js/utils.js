// public/js/utils.js

const utils = {
    formatEther: (wei) => {
        if (!wei) return '0';
        return parseFloat(Web3.utils.fromWei(wei, 'ether')).toFixed(1) + ' ETH';
    },

    formatDate: (timestamp) => {
        return new Date(timestamp * 1000).toLocaleString();
    },

    formatTimeRemaining: (seconds) => {
        if (seconds <= 0) return 'Ended';
        
        const days = Math.floor(seconds / (24 * 60 * 60));
        const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((seconds % (60 * 60)) / 60);

        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    },

    showError: (message) => {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    },

    showLoading: () => {
        document.getElementById('loading-indicator').style.display = 'flex';
    },

    hideLoading: () => {
        document.getElementById('loading-indicator').style.display = 'none';
    },

    showModal: (modalId) => {
        document.getElementById(modalId).style.display = 'block';
    },

    hideModal: (modalId) => {
        document.getElementById(modalId).style.display = 'none';
    },

    validateAmount: (amount, min, max) => {
        const num = parseFloat(amount);
        return !isNaN(num) && num >= min && num <= max;
    },

    copyToClipboard: async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    },

    shortAddress: (address) => {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    },

    isMetaMaskInstalled: () => {
        return typeof window.ethereum !== 'undefined';
    },

    checkNetworkId: async () => {
        if (!window.ethereum) return false;
        try {
            const networkId = await window.ethereum.request({ method: 'net_version' });
            return networkId === '5777'; // Change this based on your network
        } catch (err) {
            console.error('Error checking network:', err);
            return false;
        }
    }
};

// Add to window object for global access
window.utils = utils;