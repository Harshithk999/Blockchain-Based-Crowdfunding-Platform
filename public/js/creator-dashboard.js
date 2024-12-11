let web3;
let contract;
let userAccount;
let ws;

const contractAddress = ''; //enter contractAddress
const contractABI =[];  //enter contractABI 

// Update the initialization part
async function initWeb3() {
  if (typeof window.ethereum !== 'undefined') {
      try {
          web3 = new Web3(window.ethereum);
          userAccount = localStorage.getItem('ethereumAddress');
          contract = new web3.eth.Contract(contractABI, contractAddress);

          await updateWalletBalance();
          await loadCampaigns();
          initWebSocket();
          setupEventListeners(); // Now this function is defined
      } catch (error) {
          console.error("Error initializing Web3:", error);
          showError("Please connect your MetaMask wallet");
      }
  } else {
      showError("Please install MetaMask to view your campaigns");
  }
}

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        loadCreatorCampaignIds().then(campaignIds => {
            campaignIds.forEach(id => {
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    campaignId: id
                }));
            });
        });
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(initWebSocket, 5000);
    };
}

async function loadCreatorCampaignIds() {
    try {
        const response = await fetch('/api/campaigns');
        const campaigns = await response.json();
        return campaigns
            .filter(c => c.creator_id === parseInt(localStorage.getItem('userId')))
            .map(c => c.id);
    } catch (error) {
        console.error('Error loading creator campaign IDs:', error);
        return [];
    }
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'investment':
            updateCampaignStats(data.campaign);
            showNotification('New investment received!');
            break;
        case 'milestone_voted':
            updateMilestoneVotes(data.campaignId, data.votes);
            break;
        case 'milestone_approved':
            handleMilestoneApproval(data.campaignId, data.amount);
            showNotification('Milestone approved!');
            break;
    }
}

async function loadCampaigns() {
  showLoading();
  try {
      const response = await fetch('/api/campaigns');
      const allCampaigns = await response.json();

      const myCampaigns = allCampaigns.filter(campaign =>
          campaign.creator_id === parseInt(localStorage.getItem('userId'))
      );

      // Calculate stats
      const activeCampaigns = myCampaigns.filter(c => 
          c.status === 'active' && 
          parseFloat(c.current_amount) < parseFloat(c.goal_amount)
      ).length;

      const totalRaised = myCampaigns.reduce((sum, c) => 
          sum + parseFloat(c.current_amount || 0), 0
      );

      const totalBackers = myCampaigns.reduce((sum, c) => 
          sum + (parseInt(c.backers_count) || 0), 0
      );

      // Update UI elements
      document.getElementById('active-campaigns').textContent = activeCampaigns;
      document.getElementById('total-raised').textContent = `${totalRaised.toFixed(4)} ETH`;
      document.getElementById('total-backers').textContent = totalBackers;

      // Get references to containers
      const campaignsContainer = document.getElementById('campaigns-container');
      const emptyState = document.getElementById('empty-state');

      // Toggle visibility based on campaigns
      if (myCampaigns.length === 0) {
          if (campaignsContainer) campaignsContainer.style.display = 'none';
          if (emptyState) emptyState.style.display = 'block';
      } else {
          if (campaignsContainer) {
              campaignsContainer.style.display = 'grid';
              displayCampaigns(myCampaigns);
          }
          if (emptyState) emptyState.style.display = 'none';
      }

  } catch (error) {
      console.error('Error loading campaigns:', error);
      showError('Failed to load campaigns');
  } finally {
      hideLoading();
  }
}

function updateDashboardStats(campaigns) {
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const totalRaised = campaigns.reduce((sum, c) => sum + parseFloat(c.current_amount || 0), 0);
    const totalBackers = campaigns.reduce((sum, c) => sum + (c.backers_count || 0), 0);

    document.getElementById('active-campaigns').textContent = activeCampaigns;
    document.getElementById('total-raised').textContent = `${totalRaised.toFixed(4)} ETH`;
    document.getElementById('total-backers').textContent = totalBackers;
}

function displayCampaigns(campaigns) {
  const container = document.getElementById('campaigns-container');
  if (!container) return;

  // Only handle campaign display, no empty state here
  container.innerHTML = campaigns.map(campaign => {
      const currentAmount = parseFloat(campaign.current_amount || 0);
      const goalAmount = parseFloat(campaign.goal_amount);
      const progress = (currentAmount / goalAmount) * 100;
      
      const isFunded = currentAmount >= goalAmount;
      const statusClass = isFunded ? 'funded' : 'active';
      const statusText = isFunded ? 'funded' : 'active';

      return `
          <div class="campaign-box">
              <div class="campaign-image">
                  <img src="${campaign.image_url || '/images/default-campaign.jpg'}" 
                       alt="${campaign.name}"
                       onerror="this.src='/images/default-campaign.jpg'">
                  <div class="campaign-status ${statusClass}">${statusText}</div>
              </div>
              <div class="campaign-content">
                  <h3>${campaign.name}</h3>
                  <div class="campaign-stats">
                      <div class="stat">
                          <span class="label">Goal:</span>
                          <span class="value">${goalAmount.toFixed(4)} ETH</span>
                      </div>
                      <div class="stat">
                          <span class="label">Raised:</span>
                          <span class="value">${currentAmount.toFixed(4)} ETH</span>
                      </div>
                  </div>
                  <div class="campaign-progress">
                      <div class="progress-bar">
                          <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
                      </div>
                      <div class="progress-stats">
                          <span>${progress.toFixed(1)}% Funded</span>
                      </div>
                  </div>
                  <div class="campaign-actions">
                      <span class="time-left">${calculateTimeLeft(campaign.end_date)}</span>
                      <button onclick="window.location.href='/campaign-details?id=${campaign.id}'" 
                              class="view-btn">
                          View Details
                      </button>
                  </div>
              </div>
          </div>
      `;
  }).join('');
}

function createCampaignCard(campaign) {
  const currentAmount = parseFloat(campaign.current_amount || 0);
  const goalAmount = parseFloat(campaign.goal_amount);
  const progress = (currentAmount / goalAmount) * 100;
  
  // Check if campaign is fully funded
  const isFunded = currentAmount >= goalAmount;
  const statusClass = isFunded ? 'funded' : 'active';
  const statusText = isFunded ? 'funded' : 'active';

  return `
      <div class="campaign-box">
          <div class="campaign-image">
              <img src="${campaign.image_url || '/images/default-campaign.jpg'}" 
                   alt="${campaign.name}"
                   onerror="this.src='/images/default-campaign.jpg'">
              <div class="campaign-status ${statusClass}">${statusText}</div>
          </div>
          <div class="campaign-content">
              <h3>${campaign.name}</h3>
              <div class="campaign-stats">
                  <div class="stat">
                      <span class="label">Goal:</span>
                      <span class="value">${goalAmount.toFixed(4)} ETH</span>
                  </div>
                  <div class="stat">
                      <span class="label">Raised:</span>
                      <span class="value">${currentAmount.toFixed(4)} ETH</span>
                  </div>
              </div>
              <div class="campaign-progress">
                  <div class="progress-bar">
                      <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
                  </div>
                  <div class="progress-percentage">${progress.toFixed(1)}% Funded</div>
              </div>
              <div class="campaign-actions">
                  <span class="time-left">${calculateTimeLeft(campaign.end_date)}</span>
                  <button onclick="window.location.href='/campaign-details?id=${campaign.id}'" 
                          class="view-btn">
                      View Details
                  </button>
              </div>
          </div>
      </div>
  `;
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
function createMilestoneSection(campaign) {
    if (campaign.status !== 'active') return '';

    const milestoneNumber = parseInt(campaign.current_milestone || 0);
    const isGoalReached = parseFloat(campaign.current_amount || 0) >= parseFloat(campaign.goal_amount);

    let milestoneHTML = `
        <div class="milestone-section">
            <h4>Milestone Progress</h4>
            <div class="milestone-tracker">
                ${Array.from({length: 4}, (_, i) => `
                    <div class="milestone-dot ${i < milestoneNumber ? 'completed' : i === milestoneNumber ? 'current' : ''}">
                        <span class="milestone-label">${(i + 1) * 25}%</span>
                    </div>
                `).join('')}
            </div>
    `;

    if (campaign.milestone_submitted) {
        milestoneHTML += `
            <div class="milestone-status pending">
                Milestone ${milestoneNumber + 1} under review
            </div>
        `;
    } else if (isGoalReached) {
        milestoneHTML += `
            <div class="milestone-status ready">
                Ready to submit Milestone ${milestoneNumber + 1}
            </div>
        `;
    }

    milestoneHTML += '</div>';
    return milestoneHTML;
}

function createMilestoneButton(campaign) {
    const isGoalReached = parseFloat(campaign.current_amount || 0) >= parseFloat(campaign.goal_amount);
    const canSubmitMilestone = isGoalReached && !campaign.milestone_submitted && campaign.status === 'active';

    if (!canSubmitMilestone) return '';

    return `
        <button onclick="showMilestoneModal(${campaign.id})" class="milestone-btn">
            Submit Milestone
        </button>
    `;
}

function calculateTimeLeft(endDate) {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Ended';
    if (diffDays === 0) return 'Ends today';
    return `${diffDays} days left`;
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
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

document.addEventListener('DOMContentLoaded', async () => {
  try {
      await initWeb3();
      setupLogoNavigation(); // Add this line
  } catch (error) {
      console.error('Error initializing page:', error);
      showError('Failed to initialize page');
  }
});

// Handle MetaMask events
if (window.ethereum) {
    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            userAccount = accounts[0];
            await updateWalletBalance();
            await loadCampaigns();
        } else {
            window.location.reload();
        }
    });

    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });
}

// Cleanup WebSocket connection when leaving page
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});

function setupEventListeners() {
  // Logout handler
  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
      logoutLink.addEventListener('click', function(e) {
          e.preventDefault();
          logout();
      });
  }

  // Add event listeners for other elements
  const createButton = document.querySelector('.create-campaign-btn');
  if (createButton) {
      createButton.addEventListener('click', () => {
          window.location.href = '/create-campaign';
      });
  }
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