let web3;
let contract;
let userAccount;
let campaignId;
let milestoneHandler;

// Contract Configuration
const contractAddress = ''; //enter contractAddress
const contractABI =[];  //enter contractABI 

// Initialize Web3 and load campaign details
async function initWeb3() {
  if (typeof window.ethereum !== 'undefined') {
      try {
          web3 = new Web3(window.ethereum);
          const accounts = await window.ethereum.request({
              method: 'eth_requestAccounts'
          });
          userAccount = accounts[0];
          
          contract = new web3.eth.Contract(contractABI, contractAddress);

          // Initialize in sequence
          await updateWalletBalance();
          await loadCampaignDetails();
          setupEventListeners();
          setupMetaMaskListeners();
          
          const ws = setupTransactionWebSocket();
          
          window.addEventListener('beforeunload', () => {
              if (ws) ws.close();
          });

      } catch (error) {
          console.error("Web3 initialization error:", error);
          showError("Please check your wallet connection");
          await loadCampaignDetails();
      }
  } else {
      showError("Please install MetaMask");
      await loadCampaignDetails();
  }
}

function setupTransactionWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);
  
  ws.onopen = () => {
      ws.send(JSON.stringify({
          type: 'subscribe',
          campaignId: campaignId
      }));
  };

  ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleTransactionWebSocket(data);
  };

  return ws;
}
function updateCampaignStatus(status) {
  const statusElement = document.querySelector('.campaign-status');
  if (statusElement) {
      statusElement.textContent = status;
      statusElement.className = `campaign-status ${status}`;
  }
}
function isAllMilestonesCompleted(milestoneNumber) {
  return milestoneNumber >= 4;
}

function createMilestoneCompletionMessage(isCreator) {
  return `
      <div class="milestone-message-container">
          <div class="success-icon">🎉</div>
          <h3>All Milestones Completed!</h3>
          <p>${isCreator ? 
              'Congratulations! You have successfully completed all milestones and received the full campaign amount.' :
              'The campaign creator has successfully completed all milestones and received the full campaign amount.'
          }</p>
      </div>
  `;
}
function handleLogout(e) {
  e.preventDefault();
  try {
      fetch('/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
      }).then(response => {
          if (response.ok) {
              localStorage.clear();
              window.location.href = '/login';
          } else {
              throw new Error('Logout failed');
          }
      });
  } catch (error) {
      console.error('Error logging out:', error);
      showError('Failed to logout. Please try again.');
  }
}
async function loadCampaignDetails() {
  showLoading();
  try {
    
      const campaignId = new URLSearchParams(window.location.search).get('id');
      if (!campaignId) {
          throw new Error('Campaign ID not found');
      }
      
      const userEthAddress = localStorage.getItem('ethereumAddress');
      const response = await fetch(`/api/campaigns/${campaignId}`);
      const campaign = await response.json();
      await updateFundTracker(campaign);
      // Store campaign data globally
      window.currentCampaign = campaign;
      const isCreator = campaign.creator_id === parseInt(localStorage.getItem('userId'));
      const isFunded = parseFloat(campaign.current_amount) >= parseFloat(campaign.goal_amount);
      const statusClass = isFunded ? 'funded' : 'active';
      const statusText = isFunded ? 'funded' : 'active';
      const hasStartedMilestones = campaign.current_milestone > 0 || campaign.milestone_submitted;
      let userBalance = '0.0000';
      if (userEthAddress) {
          try {
              const balance = await web3.eth.getBalance(userEthAddress);
              userBalance = parseFloat(web3.utils.fromWei(balance, 'ether')).toFixed(4);
          } catch (error) {
              console.error('Error fetching user balance:', error);
          }
      }
      if (isCreator && isFunded && !hasStartedMilestones) {
          showStartMilestonePrompt();
      }
      window.currentCampaign = campaign;
      // Update page title
      document.getElementById('campaign-title').textContent = campaign.name;
      
      // Update creator info
      document.getElementById('creator-name').textContent = campaign.creator_name;
      
      // Update campaign status
      const statusElement = document.querySelector('.campaign-status');
      if (statusElement) {
        statusElement.textContent = statusText;
        statusElement.className = `campaign-status ${statusClass.toLowerCase()}`;
    }

      // Update campaign image
      const campaignImage = document.getElementById('campaign-image');
      if (campaign.image_url) {
          campaignImage.src = campaign.image_url;
          campaignImage.alt = campaign.name;
      }
      document.getElementById('wallet-balance').textContent = `${userBalance} ETH`;
      const modalWalletBalance = document.getElementById('modal-wallet-balance');
      if (modalWalletBalance) {
          modalWalletBalance.textContent = `${userBalance} ETH`;
      }
      // In your loadCampaignDetails function
document.getElementById('campaign-description').innerHTML = 
campaign.description.replace(/\n/g, '<br>');  // Replace newlines with <br> tags
      // Update campaign description
      
      // Update funding progress
      const currentAmount = parseFloat(campaign.current_amount);
      const goalAmount = parseFloat(campaign.goal_amount);
      const progress = (currentAmount / goalAmount) * 100;

      document.getElementById('current-amount').textContent = currentAmount.toFixed(4);
      document.getElementById('goal-amount').textContent = goalAmount.toFixed(4);
      document.getElementById('progress-fill').style.width = `${Math.min(progress, 100)}%`;
      document.getElementById('backers-count').textContent = campaign.backers_count;

      // Update dates
      const startDate = new Date(campaign.created_at).toLocaleDateString();
      const endDate = new Date(campaign.end_date).toLocaleDateString();
      document.getElementById('start-date').textContent = startDate;
      document.getElementById('end-date').textContent = endDate;

      // Calculate days left
      const now = new Date();
      const end = new Date(campaign.end_date);
      const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      document.getElementById('days-left').textContent = daysLeft > 0 ? `${daysLeft} days left` : 'Campaign ended';

      // Handle investment button visibility
      const investButton = document.getElementById('invest-button');
      if (investButton) {
          const isCreator = campaign.creator_id === parseInt(localStorage.getItem('userId'));
          const isFunded = currentAmount >= goalAmount;
          const hasEnded = daysLeft <= 0;

          // Show button only if:
          // 1. User is not the creator
          // 2. Campaign is not fully funded
          // 3. Campaign hasn't ended
          if (!isCreator && !isFunded && !hasEnded) {
              investButton.style.display = 'block';
          }
      }

      // Handle milestone button state
      const viewMilestonesBtn = document.getElementById('view-milestones-btn');
      if (viewMilestonesBtn) {
          if (isFunded) {
              viewMilestonesBtn.classList.remove('disabled');
              viewMilestonesBtn.disabled = false;
              viewMilestonesBtn.onclick = async () => {
                  if (isCreator) {
                      try {
                          const response = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
                          if (!response.ok) throw new Error('Failed to fetch milestone status');
                          
                          const status = await response.json();
                          
                          // Check if all milestones are completed (100%)
                          if (status.current_milestone >= 4) {
                              showMilestoneCompletionModal(isCreator);
                              return;
                          }
                          
                          const isCompleted = status.yes_votes > (status.total_investors / 2);
                          
                          if (isCompleted && campaign.current_milestone < 4) {
                              const completionKey = `milestone_${campaignId}_${status.current_milestone}_completion_shown`;
                              const wasShown = localStorage.getItem(completionKey);
                              
                              if (!wasShown) {
                                  const amount = (parseFloat(campaign.goal_amount) * 0.25).toFixed(4);
                                  showMilestoneCompleteModal(status.current_milestone, amount);
                                  localStorage.setItem(completionKey, 'true');
                                  return;
                              }
                          }
                          
                          window.location.href = `/milestone-details?campaignId=${campaignId}`;
                          
                      } catch (error) {
                          console.error('Error checking milestone status:', error);
                          window.location.href = `/milestone-details?campaignId=${campaignId}`;
                      }
                  } else {
                      // For investors
                      try {
                          const response = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
                          if (!response.ok) throw new Error('Failed to fetch milestone status');
                          
                          const status = await response.json();
                          
                          // Check for campaign completion
                          if (status.current_milestone >= 4) {
                              showMilestoneCompletionModal(isCreator);
                              return;
                          }
                          
                          window.location.href = `/milestone-details?campaignId=${campaignId}`;
                      } catch (error) {
                          console.error('Error checking milestone status:', error);
                          showError('Failed to check milestone status');
                      }
                  }
              };
          }
      }


      // Update investment modal
      const modalCampaignName = document.getElementById('campaign-name-modal');
      if (modalCampaignName) {
          modalCampaignName.textContent = campaign.name;
      }

      // Load recent transactions
      
      await loadTransactions(campaignId);
      addRewardSection(campaign);
      

  } catch (error) {
      console.error('Error loading campaign details:', error);
      showError('Failed to load campaign details');
  } finally {
      hideLoading();
  }
}
// Add this function in each relevant JavaScript file (campaign-details.js, milestone-details.js, creator-dashboard.js, investor-dashboard.js)
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
// Add new function for showing milestone completion modal
function showMilestoneCompletionModal(isCreator) {
  const modalHTML = `
      <div id="milestone-completion-modal" class="modal">
          <div class="modal-content">
              <div class="success-icon">🎉</div>
              <h2>Campaign Successfully Completed!</h2>
              <p>${isCreator ? 
                  'Congratulations! All milestones have been completed and you have received the full campaign amount.' :
                  'All milestones have been completed and the campaign creator has received the full amount.'
              }</p>
              <button onclick="closeModal('milestone-completion-modal')" class="modal-btn">Close</button>
          </div>
      </div>
  `;

  // Remove existing modal if it exists
  const existingModal = document.getElementById('milestone-completion-modal');
  if (existingModal) {
      existingModal.remove();
  }

  // Add new modal
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Show modal
  const modal = document.getElementById('milestone-completion-modal');
  modal.style.display = 'flex';
}

// Add this near your other initialization code
let isSubmitting = false;

function showMilestoneModal() {
    const modal = document.getElementById('milestone-modal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
}

function closeMilestoneModal() {
    const modal = document.getElementById('milestone-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
        // Clear form
        document.getElementById('milestone-description').value = '';
        document.getElementById('milestone-files').value = '';
        document.getElementById('file-preview').innerHTML = '';
    }
}

// Update your existing milestone button click handler
function handleMilestoneSubmit(milestoneNumber) {
    if (window.currentCampaign) {
        showMilestoneModal();
    }
}

// File preview handler
document.getElementById('milestone-files')?.addEventListener('change', function(e) {
    const preview = document.getElementById('file-preview');
    preview.innerHTML = '';
    
    const files = Array.from(e.target.files);
    
    if (files.length > 5) {
        showError('Maximum 5 files allowed');
        this.value = '';
        return;
    }

    files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) {
            showError('File size should not exceed 5MB');
            this.value = '';
            return;
        }

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.innerHTML += `
                    <div class="file-preview-item">
                        <img src="${e.target.result}" alt="File preview">
                    </div>
                `;
            }
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML += `
                <div class="document-preview">
                    <span>${file.name}</span>
                    <small>${(file.size / 1024).toFixed(1)} KB</small>
                </div>
            `;
        }
    });
});

async function submitMilestone() {
    if (isSubmitting) return;

    try {
        isSubmitting = true;
        const description = document.getElementById('milestone-description').value;
        const files = document.getElementById('milestone-files').files;

        // Validation
        if (!description.trim()) {
            throw new Error('Please provide a milestone description');
        }

        if (files.length === 0) {
            throw new Error('Please upload at least one document');
        }

        if (files.length > 5) {
            throw new Error('Maximum 5 files allowed');
        }

        for (let file of files) {
            if (file.size > 5 * 1024 * 1024) {
                throw new Error('Each file should not exceed 5MB');
            }
        }

        showLoading();

        const formData = new FormData();
        formData.append('description', description);
        formData.append('campaignId', window.currentCampaign.id);
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        const response = await fetch('/api/milestones', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to submit milestone');
        }

        showSuccess('Milestone submitted successfully');
        closeMilestoneModal();
        await loadCampaignDetails(); // Reload campaign details

    } catch (error) {
        console.error('Error submitting milestone:', error);
        showError(error.message);
    } finally {
        isSubmitting = false;
        hideLoading();
    }
}
function updateMilestoneProgress(currentMilestone) {
  // Update progress text
  document.getElementById('milestone-completion').textContent = 
      `${currentMilestone}/4 Milestones Completed`;
  
  // Update progress bar
  const progressBar = document.getElementById('milestone-progress-bar');
  const progressPercentage = (currentMilestone / 4) * 100;
  progressBar.style.width = `${progressPercentage}%`;
}

async function updateFundTracker(campaign) {
  const creatorView = document.getElementById('creator-fund-tracker');
  if (!creatorView) return; // Exit early if fund tracker section doesn't exist

  // Only show for campaign creator
  if (campaign.creator_id !== parseInt(localStorage.getItem('userId'))) {
      creatorView.style.display = 'none';
      return;
  }

  try {
      creatorView.style.display = 'block';

      // Check if web3 and contract are initialized
      if (!web3 || !contract) {
          console.log('Initializing Web3...');
          await initWeb3();
          if (!web3 || !contract) {
              throw new Error('Failed to initialize Web3 or contract');
          }
      }
      
      // Get milestone progress element first and handle it separately
      const milestoneCompletion = document.getElementById('milestone-completion');
      if (milestoneCompletion) {
          milestoneCompletion.textContent = `${campaign.current_milestone}/4 Milestones Completed`;
      }

      // Safe check for blockchain ID
      if (!campaign.blockchain_id) {
          console.warn('No blockchain ID found for campaign');
          return;
      }

      try {
          // Get blockchain campaign data
          const blockchainCampaign = await contract.methods.getCampaign(campaign.blockchain_id).call();
          
          // Calculate amounts
          const totalAmount = web3.utils.fromWei(blockchainCampaign.goal, 'ether');
          const releasedAmount = calculateReleasedAmount(totalAmount, campaign.current_milestone);
          const remainingAmount = (parseFloat(totalAmount) - parseFloat(releasedAmount)).toFixed(4);
          const nextMilestoneAmount = campaign.current_milestone >= 4 ? 
              "0.0000" : 
              (parseFloat(totalAmount) * 0.25).toFixed(4);

          // Update UI elements with null checks
          const elements = {
              totalAmount: document.getElementById('total-contract-amount'),
              releasedAmount: document.getElementById('released-amount'),
              remainingAmount: document.getElementById('remaining-amount'),
              nextMilestoneAmount: document.getElementById('next-milestone-amount'),
              milestoneNumber: document.getElementById('current-milestone-number'),
              progressBar: document.getElementById('milestone-progress-bar')
          };

          // Safely update elements
          if (elements.totalAmount) elements.totalAmount.textContent = `${totalAmount} ETH`;
          if (elements.releasedAmount) elements.releasedAmount.textContent = `${releasedAmount} ETH`;
          if (elements.remainingAmount) elements.remainingAmount.textContent = `${remainingAmount} ETH`;
          if (elements.nextMilestoneAmount) elements.nextMilestoneAmount.textContent = `${nextMilestoneAmount} ETH`;
          if (elements.milestoneNumber) elements.milestoneNumber.textContent = campaign.current_milestone;
          
          // Update progress bar if it exists
          if (elements.progressBar) {
              const progressPercentage = (campaign.current_milestone / 4) * 100;
              elements.progressBar.style.width = `${progressPercentage}%`;
          }
      } catch (blockchainError) {
          console.error('Blockchain data fetch error:', blockchainError);
          // Handle blockchain data fetch error gracefully
          const elements = {
              totalAmount: document.getElementById('total-contract-amount'),
              releasedAmount: document.getElementById('released-amount'),
              remainingAmount: document.getElementById('remaining-amount'),
              nextMilestoneAmount: document.getElementById('next-milestone-amount')
          };

          // Show placeholder values
          Object.values(elements).forEach(element => {
              if (element) element.textContent = 'Loading...';
          });
      }
      
  } catch (error) {
      console.error('Error updating fund tracker:', error);
      // Don't throw the error - just log it and continue
  }
}

// Helper function for calculating released amount
function calculateReleasedAmount(totalAmount, currentMilestone) {
  if (currentMilestone >= 4) {
      return totalAmount; // Return full amount if all milestones completed
  }
  const milestonePercentage = 0.25; // 25% per milestone
  const releasedAmount = parseFloat(totalAmount) * (milestonePercentage * currentMilestone);
  return releasedAmount.toFixed(4);
}

function showMilestoneCompleteModal(milestoneNumber, amount) {
  const modal = document.getElementById('milestone-complete-modal');
  if (!modal) return;

  const amountSpan = document.getElementById('milestone-amount');
  if (amountSpan) {
      amountSpan.textContent = `${amount} ETH`;
  }
  
  modal.style.display = 'flex';
}

function showStartNextMilestoneModal(nextMilestoneNumber) {
  const modal = document.getElementById('start-next-milestone-modal');
  if (!modal) return;

  const numberSpan = document.getElementById('next-milestone-number');
  if (numberSpan) {
      numberSpan.textContent = nextMilestoneNumber;
  }
  
  modal.style.display = 'flex';
}
async function checkMilestoneCompletion(campaignId) {
  try {
      const response = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
      if (!response.ok) return false;
      
      const status = await response.json();
      
      const isCompleted = status.yes_votes > (status.total_investors / 2) || 
                         (status.voting_end_time && new Date(status.voting_end_time) < new Date());
      
      const milestoneNumber = status.current_milestone;
      const isApproved = status.yes_votes > (status.total_investors / 2);
      
      if (isCompleted && isApproved) {
          // Check if this is the first visit after completion
          const completionKey = `milestone_${campaignId}_${milestoneNumber}_completion_shown`;
          const wasShown = localStorage.getItem(completionKey);
          
          if (!wasShown) {
              // First visit after completion
              localStorage.setItem(completionKey, 'true');
              
              const amount = (parseFloat(status.goal_amount) * 0.25).toFixed(4);
              showMilestoneCompleteModal(milestoneNumber, amount);
          } else {
              // Subsequent visits
              showStartNextMilestoneModal(milestoneNumber + 1);
          }
      }

      return isCompleted;
  } catch (error) {
      console.error('Error checking milestone completion:', error);
      return false;
  }
}
async function handleNextMilestone(choice) {
  const campaignId = getQueryParam('id');
  
  if (choice === 'now') {
      // If they choose to start now, clear the completion shown flag and redirect
      const status = await checkMilestoneStatus(campaignId);
      const completionKey = `milestone_${campaignId}_${status.currentMilestone}_completion_shown`;
      localStorage.setItem(completionKey, 'true');
      window.location.href = `/milestone-details?campaignId=${campaignId}`;
  } else {
      // Just close the modals if they choose later
      document.getElementById('milestone-complete-modal').style.display = 'none';
      document.getElementById('start-next-milestone-modal').style.display = 'none';
  }
}
async function checkMilestoneStatus(campaignId) {
  try {
      const response = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
      if (!response.ok) return { isCompleted: false };

      const status = await response.json();
      const currentMilestone = status.current_milestone;
      
      // Check if milestone is completed
      const isCompleted = status.yes_votes > (status.total_investors / 2);
      
      // Check if completion was previously shown
      const completionKey = `milestone_${campaignId}_${currentMilestone}_completion_shown`;
      const wasShown = localStorage.getItem(completionKey);

      return {
          isCompleted,
          wasShown: !!wasShown,
          currentMilestone,
          totalInvestors: status.total_investors
      };
  } catch (error) {
      console.error('Error checking milestone status:', error);
      return { isCompleted: false };
  }
}
// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('milestone-modal');
    if (e.target === modal) {
        closeMilestoneModal();
    }
});

// Close modal with escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeMilestoneModal();
    }
});
// Add after your existing milestone functions
function showMilestoneReviewModal(milestoneNumber) {
  const modal = document.getElementById('milestone-review-modal');
  const milestone = window.currentCampaign?.milestones?.[milestoneNumber - 1];
  
  if (!modal || !milestone) return;

  document.getElementById('review-milestone-number').textContent = milestoneNumber;
  document.getElementById('submission-date').textContent = new Date(milestone.submitted_at).toLocaleString();

  // Setup document viewer based on file type
  const documentView = document.getElementById('document-view');
  if (milestone.file_url) {
      if (milestone.file_url.endsWith('.pdf')) {
          documentView.innerHTML = `
              <iframe src="${milestone.file_url}" type="application/pdf"></iframe>
          `;
      } else {
          // For doc/docx, you might need to convert to PDF or use a document viewer service
          documentView.innerHTML = `
              <div class="document-preview-message">
                  <a href="${milestone.file_url}" target="_blank" class="download-link">
                      Download Document
                  </a>
              </div>
          `;
      }
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMilestoneReviewModal() {
  const modal = document.getElementById('milestone-review-modal');
  if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      document.getElementById('document-view').innerHTML = '';
  }
}
function showStartMilestonePrompt() {
  const modal = document.getElementById('start-milestone-modal');
  if (modal) {
      modal.style.display = 'flex';
  }
}
function handleStartMilestone(choice) {
  const campaignId = getQueryParam('id');
  const modal = document.getElementById('start-milestone-modal');
  
  if (choice === 'now') {
      // Redirect to milestone details page
      window.location.href = `/milestone-details?campaignId=${campaignId}`;
  } else {
      // Close modal and stay on campaign details
      if (modal) {
          modal.style.display = 'none';
      }
  }
}
async function approveMilestone() {
  try {
      showLoading();
      const milestoneNumber = document.getElementById('review-milestone-number').textContent;
      
      const response = await fetch(`/api/milestones/${window.currentCampaign.id}/vote`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              vote: true,
              milestoneNumber: milestoneNumber
          })
      });

      if (!response.ok) {
          throw new Error('Failed to approve milestone');
      }

      showSuccess('Milestone approved successfully');
      closeMilestoneReviewModal();
      await loadCampaignDetails();

  } catch (error) {
      console.error('Error approving milestone:', error);
      showError(error.message);
  } finally {
      hideLoading();
  }
}

async function rejectMilestone() {
  try {
      showLoading();
      const milestoneNumber = document.getElementById('review-milestone-number').textContent;
      
      const response = await fetch(`/api/milestones/${window.currentCampaign.id}/vote`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              vote: false,
              milestoneNumber: milestoneNumber
          })
      });

      if (!response.ok) {
          throw new Error('Failed to reject milestone');
      }

      showSuccess('Milestone rejected');
      closeMilestoneReviewModal();
      await loadCampaignDetails();

  } catch (error) {
      console.error('Error rejecting milestone:', error);
      showError(error.message);
  } finally {
      hideLoading();
  }
}
function getMilestoneButtonClass(milestone) {
    if (milestone.status === 'approved') return 'approved';
    if (milestone.status === 'rejected') return 'rejected';
    if (milestone.status === 'pending') return 'review';
    return '';
}

function getMilestoneButtonText(milestone) {
    const isCreator = window.currentCampaign.creator_id === parseInt(localStorage.getItem('userId'));
    
    if (isCreator) {
        if (!milestone.submitted) return 'Submit Milestone';
        if (milestone.status === 'approved') return 'Approved';
        if (milestone.status === 'rejected') return 'Rejected';
        return 'Pending Review';
    } else {
        if (!milestone.submitted) return 'Not Submitted';
        if (milestone.status === 'approved') return 'View Approved';
        if (milestone.status === 'rejected') return 'View Rejected';
        return 'Review Milestone';
    }
}

function getMilestoneButtonAction(milestone) {
    const isCreator = window.currentCampaign.creator_id === parseInt(localStorage.getItem('userId'));
    
    if (isCreator) {
        if (!milestone.submitted) return `handleMilestoneSubmit(${milestone.number})`;
        return `showMilestoneReviewModal(${milestone.number})`;
    } else {
        if (milestone.submitted) return `showMilestoneReviewModal(${milestone.number})`;
        return '';
    }
}

function getMilestoneButtonState(milestone) {
    if (!milestone.submitted) return 'disabled';
    return '';
}
// In campaign-details.js

// Add a flag to prevent double submissions
let isInvesting = false;

function toFixed4(num) {
  return parseFloat(parseFloat(num).toFixed(4));
}

async function invest(event) {
  event.preventDefault();
  if (isInvesting) return;

  try {
      isInvesting = true;
      showLoading();

      const campaign = window.currentCampaign;
      const amountInput = document.getElementById('investment-amount');
      const investmentAmount = parseFloat(amountInput.value.trim());

      const validation = validateInvestment(investmentAmount);
      if (!validation.valid) {
          showModalError(validation.message);
          return;
      }

      // Get current blockchain state
      const blockchainCampaign = await contract.methods.getCampaign(campaign.blockchain_id).call();
      
      // Convert for blockchain transaction
      const weiAmount = web3.utils.toWei(investmentAmount.toString(), 'ether');
      
      // Verify goal won't be exceeded on blockchain
      const currentWei = web3.utils.toBN(blockchainCampaign.pledged);
      const goalWei = web3.utils.toBN(blockchainCampaign.goal);
      const investWei = web3.utils.toBN(weiAmount);

      if (currentWei.add(investWei).gt(goalWei)) {
          const remainingWei = goalWei.sub(currentWei);
          const remainingEth = parseFloat(web3.utils.fromWei(remainingWei, 'ether'));
          throw new Error(`Maximum investment amount is ${remainingEth.toFixed(4)} ETH`);
      }

      // Send transaction to contract
      const transaction = await contract.methods.pledge(campaign.blockchain_id)
          .send({
              from: userAccount,
              value: weiAmount,
              gas: 200000
          });

      // Update database with precise amounts
      const response = await fetch('/api/investments', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              campaignId: campaign.id,
              amount: toFixed4(investmentAmount),
              blockchain_total: toFixed4(web3.utils.fromWei(blockchainCampaign.pledged, 'ether')),
              transaction_hash: transaction.transactionHash
          })
      });

      if (!response.ok) {
          throw new Error('Failed to record investment');
      }

      const data = await response.json();
      
      // Check if this investment completed the goal
      if (data.goalMet) {
          showSuccess('Investment successful! Campaign goal reached! 🎉');
      } else {
          showSuccess('Investment successful!');
      }

      setTimeout(() => window.location.reload(), 2000);

  } catch (error) {
      console.error('Investment Error:', error);
      showError(error.message || 'Investment failed');
  } finally {
      isInvesting = false;
      hideLoading();
      closeModal('investment-modal');
  }
}

// Update the verification function to use proper precision
function verifyInvestmentAmount(amount, goal, current) {
  amount = toFixed4(amount);
  goal = toFixed4(goal);
  current = toFixed4(current);
  const remaining = toFixed4(goal - current);
  
  // Allow exact remaining amount (within precision)
  if (Math.abs(amount - remaining) < 0.0001) {
      return true;
  }
  
  return amount <= remaining;
}

// Function to handle when goal is met
function handleGoalMet(campaign) {
  // Hide invest button
  const investButton = document.getElementById('invest-button');
  if (investButton) {
      investButton.style.display = 'none';
  }

  // Show goal completion message
  const statusDiv = document.querySelector('.campaign-status');
  if (statusDiv && !document.querySelector('.goal-complete-message')) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'goal-complete-message';
      messageDiv.innerHTML = `
          <div class="alert-success">
              <h4>🎉 Campaign Goal Reached!</h4>
              <p>The campaign has successfully reached its funding goal.</p>
              <p>Waiting for the campaign creator to initiate the first milestone.</p>
          </div>
      `;
      statusDiv.parentNode.insertBefore(messageDiv, statusDiv.nextSibling);
  }

  // Update campaign status
  updateCampaignStatus('funded');

  // If user is creator, show milestone controls
  const userId = parseInt(localStorage.getItem('userId'));
  if (campaign.creator_id === userId) {
      showMilestoneControls();
  }
}
// Function to show milestone controls
function showMilestoneControls() {
  const milestoneForm = document.getElementById('milestone-form');
  if (milestoneForm) {
      milestoneForm.style.display = 'block';
  }
}

// Update the UI update function to be more resilient
function updateCampaignUI(campaign) {
  try {
      // Basic campaign details
      if (!campaign) {
          console.error('No campaign data provided');
          return;
      }

      // Cache all DOM elements
      const elements = {
          title: document.getElementById('campaign-title'),
          creatorName: document.getElementById('creator-name'),
          description: document.getElementById('campaign-description'),
          goalAmount: document.getElementById('goal-amount'),
          currentAmount: document.getElementById('current-amount'),
          backersCount: document.getElementById('backers-count'),
          image: document.getElementById('campaign-image'),
          progressFill: document.getElementById('progress-fill'),
          investButton: document.getElementById('invest-button'),
          daysLeft: document.getElementById('days-left'),
          startDate: document.getElementById('start-date'),
          endDate: document.getElementById('end-date'),
          viewMilestonesBtn: document.getElementById('view-milestones-btn')
      };

      // Update campaign header
      if (elements.title) elements.title.textContent = campaign.name;
      if (elements.creatorName) elements.creatorName.textContent = campaign.creator_name;
      if (elements.description) elements.description.textContent = campaign.description;

      // Update amounts with precision
      const currentAmount = parseFloat(campaign.current_amount || 0);
      const goalAmount = parseFloat(campaign.goal_amount);
      const progress = (currentAmount / goalAmount) * 100;

      // Update numerical displays
      if (elements.goalAmount) elements.goalAmount.textContent = goalAmount.toFixed(4);
      if (elements.currentAmount) elements.currentAmount.textContent = currentAmount.toFixed(4);
      if (elements.backersCount) elements.backersCount.textContent = campaign.backers_count || 0;

      // Update campaign image
      if (elements.image) {
          elements.image.src = campaign.image_url || '/images/default-campaign.jpg';
          elements.image.alt = campaign.name;
          elements.image.onerror = () => elements.image.src = '/images/default-campaign.jpg';
      }

      // Update progress bar
      if (elements.progressFill) {
          elements.progressFill.style.width = `${Math.min(progress, 100)}%`;
      }

      // Calculate dates and time remaining
      const now = new Date();
      const endDate = new Date(campaign.end_date);
      const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

      // Update date displays
      if (elements.daysLeft) {
          elements.daysLeft.textContent = daysLeft > 0 ? `${daysLeft} days left` : 'Campaign ended';
      }

      if (elements.startDate) {
          elements.startDate.textContent = new Date(campaign.created_at).toLocaleDateString();
      }

      if (elements.endDate) {
          elements.endDate.textContent = new Date(campaign.end_date).toLocaleDateString();
      }

      // Update campaign status
      const statusElement = document.querySelector('.campaign-status');
      if (statusElement) {
          statusElement.textContent = campaign.status;
          statusElement.className = `campaign-status ${campaign.status.toLowerCase()}`;
      }

      // Calculate important states
      const isGoalMet = currentAmount >= goalAmount;
      const isCreator = campaign.creator_id === parseInt(localStorage.getItem('userId'));
      const hasEnded = daysLeft <= 0;
      const hasSubmittedFirstMilestone = campaign.current_milestone > 0;

      // Investment Button Logic
      if (elements.investButton) {
          if (isCreator) {
              elements.investButton.style.display = 'none';
          } else if (isGoalMet) {
              elements.investButton.textContent = 'Goal Met';
              elements.investButton.classList.add('goal-met');
              elements.investButton.onclick = showGoalMetModal;
              elements.investButton.style.display = 'block';
          } else if (hasEnded) {
              elements.investButton.style.display = 'none';
          } else {
              elements.investButton.textContent = 'Invest Now';
              elements.investButton.classList.remove('goal-met');
              elements.investButton.onclick = showInvestmentModal;
              elements.investButton.style.display = 'block';
          }
      }

      // Milestone Button Logic
      if (elements.viewMilestonesBtn) {
          // Default state - disabled
          elements.viewMilestonesBtn.classList.add('disabled');
          elements.viewMilestonesBtn.disabled = true;

          if (!isGoalMet) {
              // Campaign not yet funded
              elements.viewMilestonesBtn.textContent = "View Milestones";
              elements.viewMilestonesBtn.title = "Campaign must be fully funded to access milestones";
          } else if (isCreator && !hasSubmittedFirstMilestone) {
              // Campaign funded, creator, no milestone submitted
              elements.viewMilestonesBtn.textContent = "Submit First Milestone";
              elements.viewMilestonesBtn.title = "Goal met! Please submit your first milestone";
              elements.viewMilestonesBtn.classList.remove('disabled');
              elements.viewMilestonesBtn.disabled = false;
              elements.viewMilestonesBtn.onclick = () => {
                  window.location.href = `/milestone-details?campaignId=${campaign.id}`;
              };
          } else if (!isCreator && !hasSubmittedFirstMilestone) {
              // Campaign funded, investor, waiting for first milestone
              elements.viewMilestonesBtn.textContent = "Awaiting First Milestone";
              elements.viewMilestonesBtn.title = "Waiting for creator to submit first milestone";
          } else if (hasSubmittedFirstMilestone) {
              // First milestone submitted - enable for everyone
              elements.viewMilestonesBtn.textContent = "View Milestones";
              elements.viewMilestonesBtn.title = "View campaign milestones";
              elements.viewMilestonesBtn.classList.remove('disabled');
              elements.viewMilestonesBtn.disabled = false;
              elements.viewMilestonesBtn.onclick = () => {
                  window.location.href = `/milestone-details?campaignId=${campaign.id}`;
              };
          }
      }

      // Show goal completion message if applicable
      if (isGoalMet && !document.querySelector('.goal-complete-message')) {
          const statusDiv = document.querySelector('.campaign-status');
          if (statusDiv) {
              const messageDiv = document.createElement('div');
              messageDiv.className = 'goal-complete-message';
              messageDiv.innerHTML = `
                  <div class="alert-success">
                      <h4>🎉 Campaign Goal Reached!</h4>
                      <p>The campaign has successfully reached its funding goal.</p>
                      <p>${isCreator ? 'You can now submit your first milestone!' : 
                         'Waiting for the campaign creator to initiate the first milestone.'}</p>
                  </div>
              `;
              statusDiv.parentNode.insertBefore(messageDiv, statusDiv.nextSibling);
          }
      }

      // Load transactions if available
      if (campaign.id) {
          loadTransactions(campaign.id);
      }

  } catch (error) {
      console.error('Error updating UI:', error);
      showError('Error displaying campaign details');
  }
}
function showGoalMetModal() {
  const modal = document.getElementById('goal-met-modal');
  if (!modal) return;

  // Update goal amount in modal
  const goalAmountReached = document.getElementById('goal-amount-reached');
  if (goalAmountReached && window.currentCampaign) {
      goalAmountReached.textContent = parseFloat(window.currentCampaign.goal_amount).toFixed(4);
  }

  modal.style.display = 'flex';
}
function setupUserSpecificUI(campaign) {
  const userType = localStorage.getItem('userType');
  const userId = parseInt(localStorage.getItem('userId'));
  const isCreator = campaign.creator_id === userId;

  // Setup dashboard link
  const dashboardLink = document.getElementById('dashboard-link');
  if (dashboardLink) {
      dashboardLink.href = `/${userType}-dashboard`;
  }

  // Setup invest button
  const investButton = document.getElementById('invest-button');
  if (investButton) {
      const currentAmount = parseFloat(campaign.current_amount || 0);
      const goalAmount = parseFloat(campaign.goal_amount);
      const isGoalMet = currentAmount >= goalAmount;

      if (isCreator) {
          investButton.style.display = 'none';
      } else if (isGoalMet) {
          investButton.style.display = 'block';
          investButton.textContent = 'Goal Met';
          investButton.classList.add('goal-met');
          investButton.onclick = showGoalMetModal;
      } else if (userType === 'investor' && campaign.status === 'active') {
          investButton.style.display = 'block';
          investButton.textContent = 'Invest Now';
          investButton.classList.remove('goal-met');
          investButton.onclick = showInvestmentModal;
      } else {
          investButton.style.display = 'none';
      }
  }

  // Show creator controls if applicable
  if (isCreator) {
      setupCreatorControls(campaign);
  }
}

// Update the showInvestmentModal function
function showInvestmentModal() {
    const userEthAddress = localStorage.getItem('ethereumAddress');
    if (!web3 || !userEthAddress) {
        showError('Please connect your wallet');
        return;
    }

    const modal = document.getElementById('investment-modal');
    if (!modal) return;

    // Clear any previous error messages
    const errorDiv = document.getElementById('modal-error-message');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }

    const campaign = window.currentCampaign;
    if (!campaign) return;

    const goalAmount = toFixed4(campaign.goal_amount);
    const currentAmount = toFixed4(campaign.current_amount || 0);
    const remainingAmount = toFixed4(goalAmount - currentAmount);

    document.getElementById('campaign-name-modal').textContent = campaign.name;
    document.getElementById('investment-amount').value = '';
    document.getElementById('remaining-amount').textContent = 
        `Remaining: ${remainingAmount.toFixed(4)} ETH`;

    updateWalletBalance();
    modal.style.display = 'flex';
}
function setupInvestmentValidation() {
  const investmentAmount = document.getElementById('investment-amount');
  const investmentForm = document.getElementById('invest-form');
  
  if (investmentAmount && investmentForm) {
      investmentAmount.addEventListener('input', (e) => {
          const amount = parseFloat(e.target.value);
          const submitBtn = investmentForm.querySelector('button[type="submit"]');
          
          if (submitBtn) {
              if (!isNaN(amount) && amount > 0) {
                  submitBtn.disabled = !validateInvestment(amount);
              } else {
                  submitBtn.disabled = true;
              }
          }
      });
  }
}
function validateInvestment(amount) {
    if (isNaN(amount) || amount <= 0) {
        return { valid: false, message: 'Please enter a valid investment amount' };
    }

    if (amount < 0.001) {
        return { valid: false, message: 'Minimum investment amount is 0.001 ETH' };
    }

    const campaign = window.currentCampaign;
    if (!campaign) {
        return { valid: false, message: 'Campaign details not found' };
    }

    const currentAmount = toFixed4(parseFloat(campaign.current_amount || 0));
    const goalAmount = toFixed4(parseFloat(campaign.goal_amount));
    const remainingAmount = toFixed4(goalAmount - currentAmount);

    if (amount > remainingAmount) {
        return { valid: false, message: `Maximum investment amount allowed is ${remainingAmount.toFixed(4)} ETH` };
    }

    return { valid: true };
}
async function updateModalWalletBalance() {
  try {
      if (!web3 || !userAccount) return;
      const balance = await web3.eth.getBalance(userAccount);
      const ethBalance = web3.utils.fromWei(balance, 'ether');
      const modalBalance = document.getElementById('modal-wallet-balance');
      if (modalBalance) {
          modalBalance.textContent = `${parseFloat(ethBalance).toFixed(4)} ETH`;
      }
  } catch (error) {
      console.error('Error updating modal balance:', error);
  }
}
function updateMilestoneDisplay(campaign) {
  const milestonesContainer = document.getElementById('milestone-blocks');
  if (!milestonesContainer) return;

  const currentMilestone = parseInt(campaign.current_milestone) || 0;
  const milestones = [
      { number: 1, label: 'First Milestone', percentage: '25%' },
      { number: 2, label: 'Second Milestone', percentage: '50%' },
      { number: 3, label: 'Third Milestone', percentage: '75%' },
      { number: 4, label: 'Final Milestone', percentage: '100%' }
  ];

  const milestoneHTML = milestones.map(milestone => {
      const isActive = milestone.number === currentMilestone + 1;
      const isCompleted = milestone.number <= currentMilestone;
      const status = isActive ? 'active' : (isCompleted ? 'completed' : 'disabled');

      return `
          <div class="milestone-block ${status}">
              <div class="milestone-header">
                  <div class="milestone-number">Milestone ${milestone.number}</div>
                  <div class="milestone-percentage">${milestone.percentage}</div>
              </div>
              ${isCompleted ? `
                  <div class="milestone-timing">
                      <div class="timing-row">
                          <span class="timing-label">Started:</span>
                          <span class="timing-value">Nov 1, 2024 10:00 AM</span>
                      </div>
                      ${milestone.number < currentMilestone ? `
                          <div class="timing-row">
                              <span class="timing-label">Completed:</span>
                              <span class="timing-value">Nov 5, 2024 3:30 PM</span>
                          </div>
                      ` : ''}
                  </div>
              ` : ''}
              <button 
                  class="milestone-button"
                  ${!isActive ? 'disabled' : ''}
                  onclick="handleMilestoneSubmit(${milestone.number})"
              >
                  Submit Milestone
              </button>
          </div>
      `;
  }).join('');

  milestonesContainer.innerHTML = milestoneHTML;
}
// Milestone Management
async function handleMilestoneSubmission(event) {
    event.preventDefault();
    showLoading();

    try {
        const description = document.getElementById('milestone-description')?.value;
        const imageFiles = document.getElementById('milestone-images')?.files;
        
        if (!description || !imageFiles?.length) {
            throw new Error('Please provide both description and images');
        }

        const formData = new FormData();
        formData.append('campaignId', campaignId);
        formData.append('description', description);
        Array.from(imageFiles).forEach(file => {
            formData.append('images', file);
        });

        const response = await fetch('/api/milestones', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to submit milestone');
        }

        showSuccess('Milestone submitted successfully!');
        setTimeout(() => window.location.reload(), 2000);

    } catch (error) {
        console.error('Error submitting milestone:', error);
        showError(error.message);
    } finally {
        hideLoading();
    }
}

function setupEventListeners() {
  // Investment button click handler
  const investButton = document.getElementById('invest-button');
  if (investButton) {
      investButton.onclick = showInvestmentModal;
  }
// Dashboard link handler
const dashboardLink = document.getElementById('dashboard-link');
if (dashboardLink) {
    dashboardLink.addEventListener('click', (e) => {
        e.preventDefault();
        const userType = localStorage.getItem('userType');
        if (userType === 'creator') {
            window.location.href = '/creator-dashboard';
        } else if (userType === 'investor') {
            window.location.href = '/investor-dashboard';
        }
    });
  }
  // Investment form submission
  setupInvestmentValidation();
  const investmentForm = document.getElementById('investment-form');
  if (investmentForm) {
      investmentForm.addEventListener('submit', invest);
  }
  const investmentAmount = document.getElementById('investment-amount');
  if (investmentAmount) {
      investmentAmount.addEventListener('input', (e) => {
          const amount = parseFloat(e.target.value);
          if (!isNaN(amount)) {
              const submitBtn = investmentForm.querySelector('button[type="submit"]');
              if (submitBtn) {
                  submitBtn.disabled = !validateInvestment(amount);
              }
          }
      });
  }
  // Modal close buttons
  const closeButtons = document.querySelectorAll('.close-modal');
  closeButtons.forEach(button => {
      button.onclick = () => {
          const modal = button.closest('.modal');
          if (modal) {
              closeModal(modal.id);
          }
      };
  });

  // Close modal on outside click
  window.onclick = function(event) {
      if (event.target.classList.contains('modal')) {
          closeModal(event.target.id);
      }
  };

  // Logout handler
  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
      logoutLink.addEventListener('click', handleLogout);
  }
}


// Update MetaMask event listeners
// Update MetaMask event listeners
function setupMetaMaskListeners() {
  if (!window.ethereum) return;

  window.ethereum.on('accountsChanged', async (accounts) => {
      // Don't update the displayed balance on MetaMask account change
      // Only reload if the connected account matches the user's stored address
      const userEthAddress = localStorage.getItem('ethereumAddress');
      if (accounts[0]?.toLowerCase() === userEthAddress?.toLowerCase()) {
          await updateWalletBalance();
          await loadCampaignDetails();
      }
  });

  window.ethereum.on('chainChanged', () => {
      window.location.reload();
  });
}
// Utility Functions
async function updateWalletBalance() {
  try {
      const userEthAddress = localStorage.getItem('ethereumAddress');
      if (!web3 || !userEthAddress) return;

      const balance = await web3.eth.getBalance(userEthAddress);
      const ethBalance = web3.utils.fromWei(balance, 'ether');
      const formattedBalance = parseFloat(ethBalance).toFixed(4);
      
      document.getElementById('wallet-balance').textContent = `${formattedBalance} ETH`;
      
      // Update modal balance if it exists
      const modalWalletBalance = document.getElementById('modal-wallet-balance');
      if (modalWalletBalance) {
          modalWalletBalance.textContent = `${formattedBalance} ETH`;
      }
  } catch (error) {
      console.error('Error updating wallet balance:', error);
  }
}


function showLoading() {
  const loader = document.getElementById('loading-indicator');
  if (loader) loader.style.display = 'flex';
}

function hideLoading() {
  const loader = document.getElementById('loading-indicator');
  if (loader) loader.style.display = 'none';
}

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
      const messageElement = modal.querySelector('#success-message');
      if (messageElement) {
          messageElement.textContent = message;
      }
      modal.style.display = 'flex';  // Changed from 'block' to 'flex'
  }
}

function closeModal(modalId) {
    // Don't close if there's a current error message for investment modal
    if (modalId === 'investment-modal') {
        const errorDiv = document.getElementById('modal-error-message');
        if (errorDiv && errorDiv.style.display === 'block') {
            return;
        }
    }
    
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        
        // Reset form if it exists
        const form = modal.querySelector('form');
        if (form) form.reset();
        
        // Clear error message
        const errorDiv = document.getElementById('modal-error-message');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }
}

// Continuing from the DOMContentLoaded event listener...

// Update page initialization
document.addEventListener('DOMContentLoaded', async () => {
  try {
      await initWeb3();
      await loadCampaignDetails();
      setupEventListeners();
      setupLogoNavigation();
  } catch (error) {
      console.error('Error initializing page:', error);
      showError('Failed to initialize page');
  }
});

// UI Helper Functions
function showGoalCompletionMessage() {
  const statusDiv = document.querySelector('.campaign-status');
  if (!statusDiv || document.querySelector('.goal-complete-message')) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = 'goal-complete-message';
  messageDiv.innerHTML = `
      <div class="alert-success">
          <h4>🎉 Campaign Goal Reached!</h4>
          <p>The campaign has successfully reached its funding goal.</p>
          <p>Waiting for the campaign creator to initiate the first milestone.</p>
      </div>
  `;
  statusDiv.parentNode.insertBefore(messageDiv, statusDiv.nextSibling);
}
document.addEventListener('DOMContentLoaded', loadCampaignDetails);
function updateTimelineInfo(campaign) {
  const endDate = new Date(campaign.end_date);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
  
  const elements = {
      daysLeft: document.getElementById('days-left'),
      startDate: document.getElementById('start-date'),
      endDate: document.getElementById('end-date'),
      contractAddress: document.getElementById('contract-address')
  };

  if (elements.daysLeft) {
      elements.daysLeft.textContent = `${daysLeft} days left`;
  }

  if (elements.startDate) {
      elements.startDate.textContent = new Date(campaign.created_at).toLocaleDateString();
  }

  if (elements.endDate) {
      elements.endDate.textContent = new Date(campaign.end_date).toLocaleDateString();
  }
}

// Creator specific functions
function setupCreatorControls(campaign) {
  const creatorSection = document.createElement('div');
  creatorSection.className = 'creator-controls';

  if (campaign.status === 'active' && !campaign.milestone_submitted) {
      const milestoneForm = document.getElementById('milestone-form');
      if (milestoneForm) {
          milestoneForm.style.display = 'block';
      }
  }
}

// WebSocket Setup
function initializeWebSocket(campaignId) {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  const ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
      console.log('WebSocket connected');
      ws.send(JSON.stringify({
          type: 'subscribe',
          campaignId: campaignId
      }));
  };
  

  ws.onmessage = (event) => {
      try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
      } catch (error) {
          console.error('Error handling WebSocket message:', error);
      }
  };

  ws.onerror = (error) => {
      console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Attempt to reconnect after 5 seconds
      setTimeout(() => initializeWebSocket(campaignId), 5000);
  };
}

function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'milestone_approved':
        loadCampaignDetails(); // This will refresh the fund tracker too
        break;
  }
  console.log('WebSocket message received:', data);
  if (data.type === 'milestone_submitted') {
    const userType = localStorage.getItem('userType');
    const isInvestor = userType === 'investor';
    
    if (isInvestor) {
        showMilestoneNotification();
    }
}
  if (data.type === 'investment') {
      // Update current amount and progress
      const currentAmountElement = document.getElementById('current-amount');
      const goalAmountElement = document.getElementById('goal-amount');
      const progressFillElement = document.getElementById('progress-fill');
      const backersCountElement = document.getElementById('backers-count');

      if (currentAmountElement && goalAmountElement && progressFillElement) {
          const currentAmount = parseFloat(data.total);
          const goalAmount = parseFloat(goalAmountElement.textContent);
          const progress = (currentAmount / goalAmount) * 100;

          currentAmountElement.textContent = currentAmount.toFixed(4);
          progressFillElement.style.width = `${Math.min(progress, 100)}%`;

          // Update backers count if provided
          if (data.backersCount && backersCountElement) {
              backersCountElement.textContent = data.backersCount;
          }

          // Handle milestone button state
          const viewMilestonesBtn = document.getElementById('view-milestones-btn');
          if (viewMilestonesBtn) {
              if (currentAmount >= goalAmount) {
                  viewMilestonesBtn.classList.remove('disabled');
                  viewMilestonesBtn.disabled = false;
                  const campaignId = getQueryParam('id');
                  viewMilestonesBtn.onclick = () => {
                      window.location.href = `/milestone-details?campaignId=${campaignId}`;
                  };
              }
          }

          // Show success message if goal is met
          if (currentAmount >= goalAmount && !data.goalMetPreviously) {
              showSuccess('Campaign goal reached! 🎉');
          }
      }

      // Reload transactions with the current campaign ID
      const campaignId = getQueryParam('id');
      if (campaignId) {
          loadTransactions(campaignId);
      }
  }
}
function showMilestoneNotification() {
  const modal = document.getElementById('milestone-notification-modal');
  if (modal) {
      modal.style.display = 'flex';
  }
}
function handleMilestoneNotification(choice) {
  const modal = document.getElementById('milestone-notification-modal');
  const campaignId = window.currentCampaign?.id;
  
  if (choice === 'now' && campaignId) {
      window.location.href = `/milestone-details?campaignId=${campaignId}`;
  } else {
      if (modal) {
          modal.style.display = 'none';
      }
  }
}
// Update functions for real-time changes
function updateCampaignAmounts(newInvestment, newTotal) {
  const elements = {
      currentAmount: document.getElementById('current-amount'),
      progressFill: document.getElementById('progress-fill')
  };

  if (!elements.currentAmount || !elements.progressFill || !window.currentCampaign) return;

  const campaign = window.currentCampaign;
  const progress = (newTotal / campaign.goal_amount) * 100;

  elements.currentAmount.textContent = parseFloat(newTotal).toFixed(4);
  elements.progressFill.style.width = `${Math.min(progress, 100)}%`;

  // Update campaign data
  campaign.current_amount = newTotal;

  // Check if goal reached
  if (newTotal >= campaign.goal_amount) {
      handleGoalReached();
  }
}

function updateMilestoneStatus(milestone) {
  const milestoneSteps = document.querySelectorAll('.milestone-step');
  milestoneSteps.forEach((step, index) => {
      step.classList.remove('completed', 'current');
      if (index < milestone.current) {
          step.classList.add('completed');
      } else if (index === milestone.current) {
          step.classList.add('current');
      }
  });

  const statusElement = document.getElementById('milestone-status');
  if (statusElement) {
      statusElement.textContent = `Current Milestone: ${milestone.current + 1}/4`;
  }
}

function handleMilestoneApproval(data) {
  updateMilestoneStatus({ current: data.milestoneNumber + 1 });
  showNotification(`Milestone ${data.milestoneNumber + 1} approved! Funds released: ${data.amount} ETH`);
}

// Helper functions for image previews
function handleImagePreview(event) {
  const preview = document.getElementById('image-preview');
  if (!preview || !event.target.files) return;

  preview.innerHTML = '';
  Array.from(event.target.files).forEach(file => {
      if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
              const img = document.createElement('img');
              img.src = e.target.result;
              img.classList.add('preview-image');
              preview.appendChild(img);
          };
          reader.readAsDataURL(file);
      }
  });
}

// Notification handling
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => notification.classList.add('show'), 100);

  // Remove notification
  setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => document.body.removeChild(notification), 300);
  }, 3000);
}
  
async function logout() {
  try {
      localStorage.clear();
      const response = await fetch('/logout', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          }
      });

      if (response.ok) {
          window.location.href = '/login';
      } else {
          throw new Error('Logout failed');
      }
  } catch (error) {
      console.error('Error logging out:', error);
      showError('Failed to logout. Please try again.');
  }
}
function showModalError(message) {
    const errorDiv = document.getElementById('modal-error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}
async function loadTransactions(campaignId) {
  try {
      // Add validation for campaignId
      if (!campaignId) {
          console.error('Campaign ID is undefined');
          return;
      }

      console.log('Loading transactions for campaign:', campaignId);

      const response = await fetch(`/api/investments/${campaignId}`);
      const transactions = await response.json();

      console.log('Fetched transactions:', transactions);

      const transactionsList = document.getElementById('transactions-list');
      
      if (!transactionsList) {
          console.error('Transaction list element not found');
          return;
      }

      // Clear existing content
      transactionsList.innerHTML = '';

      // Check for transactions
      if (!transactions || transactions.length === 0) {
          transactionsList.innerHTML = `
              <div class="p-4 text-center text-gray-500">
                  No transactions yet
              </div>
          `;
          return;
      }

      // Build transaction list
      let transactionsHtml = '';
      transactions.forEach(tx => {
          const date = new Date(tx.created_at).toLocaleString();
          const amount = parseFloat(tx.amount).toFixed(4);

          transactionsHtml += `
              <div class="transaction-item">
                  <div class="transaction-header">
                      <div class="investor-info">
                          <span class="investor-name">${tx.username || 'Anonymous'}</span>
                          <span class="transaction-amount">${amount} ETH</span>
                      </div>
                      <div class="transaction-time">
                          ${date}
                      </div>
                  </div>
               
              </div>
          `;
      });

      transactionsList.innerHTML = transactionsHtml;

  } catch (error) {
      console.error('Error loading transactions:', error);
      const transactionsList = document.getElementById('transactions-list');
      if (transactionsList) {
          transactionsList.innerHTML = `
              <div class="p-4 text-center text-red-500">
                  Failed to load transactions
              </div>
          `;
      }
  }
}
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
function createTransactionHTML(transaction) {
  const date = new Date(transaction.created_at);
  const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  const shortenedAddress = transaction.ethereum_address ? 
      `${transaction.ethereum_address.slice(0, 6)}...${transaction.ethereum_address.slice(-4)}` : '';
  
  return `
      <div class="transaction-item">
          <div class="transaction-header">
              <div class="investor-info">
                  <span class="investor-name">
                      ${transaction.username || shortenedAddress}
                  </span>
                  invested
                  <span class="transaction-amount">
                      ${parseFloat(transaction.amount).toFixed(4)} ETH
                  </span>
              </div>
          </div>
          <div class="transaction-time">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${formattedDate}
          </div>
      </div>
  `;
}

// Add WebSocket handler for real-time updates
function handleTransactionWebSocket(data) {
  if (data.type === 'investment') {
      const transactionsList = document.getElementById('transactions-list');
      const noTransactionsDiv = transactionsList.querySelector('.no-transactions');
      
      if (noTransactionsDiv) {
          transactionsList.innerHTML = '';
      }
      
      const newTransactionHTML = createTransactionHTML(data.transaction);
      transactionsList.insertAdjacentHTML('afterbegin', newTransactionHTML);
  }
}
async function checkUserInvestment(campaignId, userId) {
    try {
        const response = await fetch(`/api/investments/check/${campaignId}/${userId}`);
        const data = await response.json();
        return data.hasInvested;
    } catch (error) {
        console.error('Error checking investment:', error);
        return false;
    }
}


function addRewardSection(campaign) {
    const isInvestor = localStorage.getItem('userType') === 'investor';
    const isCompleted = campaign && campaign.current_milestone >= 4;
    
    // Only show for investors and completed campaigns
    if (!isInvestor || !isCompleted) {
        return;
    }

    // Remove ALL existing reward sections before adding a new one
    const existingRewards = document.querySelectorAll('.reward-card');
    existingRewards.forEach(reward => reward.remove());

    // Create new reward section
    const rewardSection = document.createElement('div');
    rewardSection.className = 'reward-card';
    rewardSection.innerHTML = `
        <div class="reward-header">
            <h3>🎉 Campaign Completed - Claim Your Reward!</h3>
        </div>
        <div class="reward-content">
            <div id="coupon-container" class="coupon-container">
                <div class="coupon-code" id="coupon-code"></div>
                <button class="copy-btn" onclick="copyCouponCode()">
                    <i class="fas fa-copy"></i> Copy Code
                </button>
            </div>
            <p class="reward-info">Use this code for early access and special discounts</p>
        </div>
    `;

    // Find first transactions section and insert before it
    const transactionsSection = document.querySelector('.transactions-section');
    if (transactionsSection && transactionsSection.parentNode) {
        // Insert only if a transactions section exists and it doesn't already have a reward card before it
        const existingRewardBeforeTransactions = transactionsSection.previousElementSibling?.classList.contains('reward-card');
        if (!existingRewardBeforeTransactions) {
            transactionsSection.parentNode.insertBefore(rewardSection, transactionsSection);
        }
    }

    // Fetch reward code only if we actually added a new section
    fetchRewardCode(campaign.id);
}

async function fetchRewardCode(campaignId) {
    try {
        console.log('Fetching reward for campaign:', campaignId);
        
        const response = await fetch(`/api/rewards/${campaignId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch reward');
        }

        const couponElement = document.getElementById('coupon-code');
        if (couponElement && data.coupon_code) {
            couponElement.textContent = data.coupon_code;
        }
    } catch (error) {
        console.error('Error fetching reward:', error);
        // Only show error if campaign is completed
        const currentCampaign = window.currentCampaign;
        if (currentCampaign && currentCampaign.current_milestone >= 4) {
            showError('Failed to load reward code');
        }
    }
}

function copyCouponCode() {
    const couponCode = document.getElementById('coupon-code').textContent;
    navigator.clipboard.writeText(couponCode)
        .then(() => {
            showSuccess('Coupon code copied!');
        })
        .catch(err => {
            showError('Failed to copy code');
        });
}