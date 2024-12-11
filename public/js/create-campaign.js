let web3;
let contract;
let userAccount;

// Contract Configuration
const contractAddress = ''; //enter contractAddress
const contractABI =[];  //enter contractABI 

async function initWeb3() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            // Initialize Web3
            web3 = new Web3(window.ethereum);
            
            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });
            
            userAccount = accounts[0];
            console.log("Connected account:", userAccount);

            // Initialize contract
            contract = new web3.eth.Contract(contractABI, contractAddress);
            console.log("Contract initialized at:", contractAddress);

            // Update wallet balance
            await updateWalletBalance();
            return true;
        } catch (error) {
            console.error("Error initializing Web3:", error);
            showError("Failed to connect to MetaMask. Please try again.");
            return false;
        }
    } else {
        showError("Please install MetaMask to create a campaign");
        return false;
    }
}

async function createCampaign(event) {
    event.preventDefault();
    showLoading();

    try {
        // Get form values
        const name = document.getElementById('campaign-name').value;
        const description = document.getElementById('campaign-description').value;
        const goalAmount = document.getElementById('campaign-goal').value;
        const endDate = document.getElementById('campaign-end-date').value;
        const imageFile = document.getElementById('campaign-image').files[0];

        console.log('Form Values:', { name, description, goalAmount, endDate });

        // Validate inputs
        if (!validateInputs(name, description, goalAmount, endDate)) {
            hideLoading();
            return;
        }

        // Create campaign on blockchain first
        const weiAmount = web3.utils.toWei(goalAmount.toString(), 'ether');
        const durationInDays = calculateDurationInDays(endDate);

        console.log('Creating campaign on blockchain:', {
            weiAmount,
            durationInDays,
            userAccount
        });

        // Create campaign transaction
        const transaction = await contract.methods.createCampaign(weiAmount, durationInDays)
            .send({
                from: userAccount,
                gas: 3000000 // Fixed gas limit
            });

        console.log('Blockchain transaction completed:', transaction);

        // Get campaign ID from event
        const event = transaction.events.CampaignCreated;
        if (!event) {
            throw new Error('Campaign creation event not found');
        }

        const blockchainId = event.returnValues.id;
        console.log('New blockchain campaign ID:', blockchainId);

        // Create FormData for database
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', description);
        formData.append('goalAmount', goalAmount);
        formData.append('endDate', endDate);
        formData.append('blockchainId', blockchainId);
        if (imageFile) {
            formData.append('image', imageFile);
        }

        // Save to database
        const response = await fetch('/api/campaigns', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to save campaign details');
        }

        const result = await response.json();
        console.log("Database campaign created:", result);

        hideLoading();
        showSuccess('Campaign created successfully!');
        setTimeout(() => {
            window.location.href = '/creator-dashboard';
        }, 2000);

    } catch (error) {
        console.error('Error creating campaign:', error);
        hideLoading();
        showError(error.message || 'Failed to create campaign');
    }
}
// Helper Functions
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      setTimeout(() => {
          errorDiv.style.display = 'none';
      }, 5000);
  }
}

function showSuccess(message) {
  const modal = document.getElementById('success-modal');
  if (modal) {
      modal.style.display = 'flex';
      setTimeout(() => {
          window.location.href = '/creator-dashboard';
      }, 2000);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
      modal.style.display = 'none';
  }
}

// Window click event for closing modals
window.onclick = function(event) {
  if (event.target.className === 'modal') {
      event.target.style.display = 'none';
  }
};
function validateInputs(name, description, goalAmount, endDate) {
    if (!name || name.length < 5) {
        showError('Campaign name must be at least 5 characters');
        return false;
    }

    if (!description || description.length < 50) {
        showError('Description must be at least 50 characters');
        return false;
    }

    if (!goalAmount || isNaN(goalAmount) || parseFloat(goalAmount) <= 0) {
        showError('Goal amount must be greater than 0');
        return false;
    }

    const endDateTime = new Date(endDate);
    const now = new Date();
    const minEndDate = new Date(now.getTime() + (24 * 60 * 60 * 1000));

    if (endDateTime <= minEndDate) {
        showError('End date must be at least 24 hours from now');
        return false;
    }

    return true;
}
if (window.ethereum) {
  window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length > 0) {
          userAccount = accounts[0];
          await updateWalletBalance();
      } else {
          window.location.reload();
      }
  });

  window.ethereum.on('chainChanged', () => {
      window.location.reload();
  });
}
function calculateDurationInDays(endDate) {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = Math.abs(end - now);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Helper Functions
function showLoading() {
  const submitButton = document.querySelector('button[type="submit"]');
  if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = '<span class="spinner"></span> Creating Campaign...';
  }
  
  const loadingIndicator = document.getElementById('loading-indicator');
  if (loadingIndicator) {
      loadingIndicator.style.display = 'flex';
  }
}

function hideLoading() {
  const submitButton = document.querySelector('button[type="submit"]');
  if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Create Campaign';
  }
  
  const loadingIndicator = document.getElementById('loading-indicator');
  if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
  }
}

async function updateWalletBalance() {
    try {
        if (!web3 || !userAccount) return;
        const balance = await web3.eth.getBalance(userAccount);
        const ethBalance = web3.utils.fromWei(balance, 'ether');
        document.getElementById('wallet-balance').textContent = `${parseFloat(ethBalance).toFixed(4)} ETH`;
    } catch (error) {
        console.error('Error updating wallet balance:', error);
    }
}
function handleImagePreview(event) {
  const preview = document.getElementById('image-preview');
  const file = event.target.files[0];
  
  if (!preview) return;
  preview.innerHTML = '';

  if (file) {
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
          showError('Image file size must be less than 5MB');
          event.target.value = '';
          return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
          showError('Please select an image file');
          event.target.value = '';
          return;
      }

      const img = document.createElement('img');
      const reader = new FileReader();
      
      reader.onload = (e) => {
          img.src = e.target.result;
          preview.appendChild(img);
      };

      reader.readAsDataURL(file);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
      await initWeb3();
      
      // Set minimum date for end date input
      const dateInput = document.getElementById('campaign-end-date');
      if (dateInput) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          dateInput.min = tomorrow.toISOString().split('T')[0];
      }

      // Image preview handler
      const imageInput = document.getElementById('campaign-image');
      if (imageInput) {
          imageInput.addEventListener('change', handleImagePreview);
      }

      // Form submission handler
      const form = document.querySelector('form');
      if (form) {
          form.addEventListener('submit', createCampaign);
      }

      // Update initial wallet balance
      await updateWalletBalance();
      setupLogoNavigation();

  } catch (error) {
      console.error('Initialization error:', error);
      showError('Failed to initialize application');
  }
});
function setupLogoNavigation() {
  const logo = document.querySelector('.logo');
  if (logo) {
      logo.addEventListener('click', (e) => {
          e.preventDefault();
          const userType = localStorage.getItem('userType');
          if (userType === 'creator') {
              window.location.href = '/creator-dashboard';
          } else if (userType === 'investor') {
              window.location.href = '/investor-dashboard';
          }
      });
  }
}

// MetaMask event handlers
if (window.ethereum) {
    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            userAccount = accounts[0];
            await updateWalletBalance();
        } else {
            window.location.reload();
        }
    });

    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });
}