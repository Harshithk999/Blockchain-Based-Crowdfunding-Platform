let web3;
let contract;
let userAccount;
let ws;

const contractAddress = ''; //enter contractAddress
const contractABI =[];  //enter contractABI 

async function initWeb3() {
  if (typeof window.ethereum !== 'undefined') {
      try {
          web3 = new Web3(window.ethereum);
          userAccount = localStorage.getItem('ethereumAddress');
          contract = new web3.eth.Contract(contractABI, contractAddress);

          await updateWalletBalance();
          await loadDashboard();
          initWebSocket();
          setupEventListeners();
      } catch (error) {
          console.error("Error initializing Web3:", error);
          showError("Please connect your MetaMask wallet");
      }
  } else {
      showError("Please install MetaMask");
  }
}

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
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
async function loadCampaigns() {
  showLoading();
  try {
      // Load all campaigns
      const response = await fetch('/api/campaigns');
      const allCampaigns = await response.json();

      // Load user's investments
      const investmentsResponse = await fetch('/api/my-investments');
      const investments = await investmentsResponse.json();

      // Filter available campaigns:
      // 1. Not created by current user
      // 2. Not fully funded
      // 3. Status is active
      const availableCampaigns = allCampaigns.filter(campaign => 
          campaign.creator_id !== parseInt(localStorage.getItem('userId')) &&
          parseFloat(campaign.current_amount) < parseFloat(campaign.goal_amount) &&
          campaign.status === 'active'
      );

      // Display campaigns in appropriate containers
      const availableContainer = document.getElementById('available-campaigns-container');
      const investedContainer = document.getElementById('invested-campaigns-container');

      if (availableContainer) {
          if (availableCampaigns.length === 0) {
              availableContainer.innerHTML = `
                  <div class="empty-state">
                      <h3>No Campaigns Available</h3>
                      <p>Check back later for new investment opportunities</p>
                  </div>
              `;
          } else {
              displayCampaigns(availableCampaigns, 'available-campaigns-container');
          }
      }
      
      if (investedContainer) {
          if (investments.length === 0) {
              investedContainer.innerHTML = `
                  <div class="empty-state">
                      <h3>No Investments Yet</h3>
                      <p>Start investing in campaigns to see them here</p>
                  </div>
              `;
          } else {
              displayInvestments(investments);
          }
      }

      // Update dashboard stats
      await updateDashboardStats(investments);

  } catch (error) {
      console.error('Error loading campaigns:', error);
      showError('Failed to load campaigns');
  } finally {
      hideLoading();
  }
}

async function updateDashboardStats(investments) {
  try {
      // Get stats from API
      const response = await fetch('/api/investor/stats');
      const stats = await response.json();
      
      // Get wallet balance
      const balance = await web3.eth.getBalance(userAccount);
      const ethBalance = web3.utils.fromWei(balance, 'ether');
      const formattedBalance = parseFloat(ethBalance).toFixed(4); // Format to 4 decimal places
      
      // Update UI elements
      document.getElementById('total-invested').textContent = `${stats.total_invested} ETH`;
      document.getElementById('active-investments').textContent = stats.active_investments;
      document.getElementById('available-balance').textContent = `${formattedBalance} ETH`;
      document.getElementById('wallet-balance').textContent = `${formattedBalance} ETH`;

  } catch (error) {
      console.error('Error updating stats:', error);
  }
}



async function loadDashboard() {
  showLoading();
  try {
      // Load investor stats
      const statsResponse = await fetch('/api/investor/stats');
      const stats = await statsResponse.json();
      
      // Update dashboard stats
      document.getElementById('total-invested').textContent = `${stats.total_invested} ETH`;
      document.getElementById('active-investments').textContent = stats.active_investments;
      
      // Update wallet balance
      if (web3 && userAccount) {
          const balance = await web3.eth.getBalance(userAccount);
          const ethBalance = web3.utils.fromWei(balance, 'ether');
          document.getElementById('available-balance').textContent = `${parseFloat(ethBalance).toFixed(4)} ETH`;
      }

      // Load my investments
      const investmentsResponse = await fetch('/api/my-investments');
      const investments = await investmentsResponse.json();
      displayInvestments(investments);

  } catch (error) {
      console.error('Error loading dashboard:', error);
      showError('Failed to load dashboard data');
  } finally {
      hideLoading();
  }
}


function setupEventListeners() {
  // Tab switching
  const tabButtons = document.querySelectorAll('.dashboard-tabs button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
      button.addEventListener('click', () => {
          // Remove active class from all buttons and contents
          tabButtons.forEach(btn => btn.classList.remove('active'));
          tabContents.forEach(content => content.classList.remove('active'));

          // Add active class to clicked button and corresponding content
          button.classList.add('active');
          const targetId = button.getAttribute('data-tab');
          document.getElementById(targetId).classList.add('active');
      });
  });

  // Logout handler
  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
      logoutLink.addEventListener('click', (e) => {
          e.preventDefault();
          handleLogout();
      });
  }
}

async function handleLogout() {
  try {
      const response = await fetch('/logout', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          }
      });

      if (response.ok) {
          localStorage.clear();
          window.location.href = '/login';
      } else {
          throw new Error('Logout failed');
      }
  } catch (error) {
      console.error('Error logging out:', error);
      showError('Failed to logout. Please try again.');
  }
}


// Add this to your initialization
document.addEventListener('DOMContentLoaded', async () => {
  try {
      await initWeb3();
      await loadCampaigns();
      setupWebSocket();
      setupEventListeners();
      setupLogoNavigation();
  } catch (error) {
      console.error('Error initializing page:', error);
      showError('Failed to initialize page');
  }
});

async function loadAvailableCampaigns() {
    try {
        const response = await fetch('/api/campaigns');
        const campaigns = await response.json();
        
        // Show active campaigns except user's own
        const activeCampaigns = campaigns.filter(campaign => 
            campaign.status === 'active' && 
            campaign.creator_id !== parseInt(localStorage.getItem('userId'))
        );

        displayCampaigns(activeCampaigns, 'available-campaigns-container');

        // Update empty state visibility
        const emptyState = document.getElementById('empty-state');
        if (emptyState) {
            emptyState.style.display = activeCampaigns.length === 0 ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Error loading campaigns:', error);
        showError('Failed to load available campaigns');
    }
}

async function loadMyInvestments() {
    try {
        const response = await fetch('/api/my-investments');
        const investments = await response.json();
        
        displayInvestments(investments, 'invested-campaigns-container');
        updateInvestmentStats(investments);
    } catch (error) {
        console.error('Error loading investments:', error);
        showError('Failed to load your investments');
    }
}

function displayCampaigns(campaigns, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (campaigns.length === 0) {
      container.innerHTML = `
          <div class="empty-state">
              <h3>No Campaigns Available</h3>
              <p>Check back later for new investment opportunities</p>
          </div>
      `;
      return;
  }

  container.innerHTML = campaigns.map(campaign => {
      const currentAmount = parseFloat(campaign.current_amount || 0);
      const goalAmount = parseFloat(campaign.goal_amount);
      const progress = (currentAmount / goalAmount) * 100;

      return `
          <div class="campaign-box">
              <div class="campaign-image">
                  <img src="${campaign.image_url || '/images/default-campaign.jpg'}" 
                       alt="${campaign.name}"
                       onerror="this.src='/images/default-campaign.jpg'">
                  <div class="campaign-status ${campaign.status}">${campaign.status}</div>
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
                      <button onclick="window.location.href='/campaign-details?id=${campaign.id}'" class="view-btn">
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

  return `
      <div class="campaign-box">
          <div class="campaign-image">
              <img src="${campaign.image_url || '/images/default-campaign.jpg'}" 
                   alt="${campaign.name}"
                   onerror="this.src='/images/default-campaign.jpg'">
              <div class="campaign-status ${campaign.status}">${campaign.status}</div>
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
// changes made here 8:11
// In investor-dashboard.js, update the displayInvestments function
function displayInvestments(investments) {
  const container = document.getElementById('invested-campaigns-container');
  if (!container) return;

  if (investments.length === 0) {
      container.innerHTML = `
          <div class="empty-state">
              <h3>No Investments Yet</h3>
              <p>Start investing in campaigns to see them here</p>
          </div>
      `;
      return;
  }

  // Group investments by campaign
  const groupedInvestments = investments.reduce((acc, investment) => {
      const campaignId = investment.campaign_id;
      
      if (!acc[campaignId]) {
          // Initialize first entry for this campaign
          acc[campaignId] = {
              ...investment,
              amount: parseFloat(investment.amount)
          };
      } else {
          // Add to existing campaign's amount
          acc[campaignId].amount += parseFloat(investment.amount);
      }
      
      return acc;
  }, {});

  // Convert grouped investments back to array
  const uniqueInvestments = Object.values(groupedInvestments);

  container.innerHTML = uniqueInvestments.map(investment => {
      // Check if campaign is fully funded
      const isFunded = parseFloat(investment.total_raised) >= parseFloat(investment.goal_amount);
      const statusClass = isFunded ? 'funded' : 'active';
      const statusText = isFunded ? 'funded' : 'active';

      return `
          <div class="campaign-box">
              <div class="campaign-image">
                  <img src="${investment.image_url || '/images/default-campaign.jpg'}" 
                       alt="${investment.campaign_name}"
                       onerror="this.src='/images/default-campaign.jpg'">
                  <div class="campaign-status ${statusClass}">${statusText}</div>
              </div>
              <div class="campaign-content">
                  <h3>${investment.campaign_name}</h3>
                  <div class="investment-details">
                      <div class="detail-row">
                          <span>Your Total Investment:</span>
                          <span class="value">${investment.amount.toFixed(4)} ETH</span>
                      </div>
                      <div class="detail-row">
                          <span>Total Raised:</span>
                          <span class="value">${investment.total_raised} ETH</span>
                      </div>
                      <div class="detail-row">
                          <span>Goal:</span>
                          <span class="value">${investment.goal_amount} ETH</span>
                      </div>
                  </div>
                  <div class="campaign-progress">
                      <div class="progress-bar">
                          <div class="progress-fill" style="width: ${Math.min(investment.progress, 100)}%"></div>
                      </div>
                      <div class="progress-stats">
                          <span>${investment.progress}% Funded</span>
                      </div>
                  </div>
                  <div class="campaign-actions">
                      <span class="time-left">${calculateTimeLeft(investment.end_date)}</span>
                      <button onclick="window.location.href='/campaign-details?id=${investment.campaign_id}'" 
                              class="view-btn">View Details</button>
                  </div>
              </div>
          </div>
      `;
  }).join('');
}
//made changes here 8:12
function createInvestmentCard(investment) {
  const progress = (investment.current_amount / investment.goal_amount) * 100;
  const isGoalMet = progress >= 100;

  const div = document.createElement('div');
  div.className = 'campaign-box investment';
  div.innerHTML = `
      <div class="campaign-image">
          <img src="${investment.image_url || '/images/default-campaign.jpg'}" alt="${investment.campaign_name}">
          <div class="campaign-status ${investment.campaign_status}">${investment.campaign_status}</div>
      </div>
      <div class="campaign-content">
          <h3>${investment.campaign_name}</h3>
          <div class="investment-details">
              <div class="detail-row">
                  <span class="label">Your Investment:</span>
                  <span class="value">${parseFloat(investment.amount).toFixed(4)} ETH</span>
              </div>
              <div class="detail-row">
                  <span class="label">Campaign Progress:</span>
                  <span class="value">${progress.toFixed(1)}%</span>
              </div>
              <div class="detail-row">
                  <span class="label">Total Raised:</span>
                  <span class="value">${parseFloat(investment.current_amount).toFixed(4)} ETH</span>
              </div>
              <div class="detail-row">
                  <span class="label">Goal:</span>
                  <span class="value">${parseFloat(investment.goal_amount).toFixed(4)} ETH</span>
              </div>
          </div>
          <div class="campaign-progress">
              <div class="progress-bar">
                  <div class="progress-fill" style="width: ${Math.min(progress, 100)}%"></div>
              </div>
              <div class="progress-stats">
                  <span>${progress.toFixed(1)}% Funded</span>
                  ${isGoalMet ? 
                      '<span class="goal-met-badge">Goal Met</span>' : 
                      `<span class="time-left">${calculateTimeLeft(investment.end_date)}</span>`
                  }
              </div>
          </div>
          <button onclick="window.location.href='/campaign-details?id=${investment.campaign_id}'" class="view-btn">
              View Details
          </button>
      </div>
  `;

  return div;
}

function updateInvestmentStats(investments) {
    const totalInvested = investments.reduce((sum, inv) => sum + parseFloat(inv.amount), 0);
    const activeInvestments = investments.filter(inv => inv.campaign_status === 'active').length;

    document.getElementById('total-invested').textContent = `${totalInvested.toFixed(4)} ETH`;
    document.getElementById('active-investments').textContent = activeInvestments;
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

async function updateWalletBalance() {
  try {
      if (!web3 || !userAccount) return;
      const balance = await web3.eth.getBalance(userAccount);
      const ethBalance = web3.utils.fromWei(balance, 'ether');
      const formattedBalance = parseFloat(ethBalance).toFixed(4);
      document.getElementById('wallet-balance').textContent = `${formattedBalance} ETH`;
      document.getElementById('available-balance').textContent = `${formattedBalance} ETH`;
  } catch (error) {
      console.error('Error updating wallet balance:', error);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  initWeb3().then(() => {
      loadDashboard();
      setupWebSocket();
  });
});
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
      console.log('WebSocket connected');
      subscribeToUpdates();
  };

  ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
  };

  ws.onclose = () => {
      console.log('WebSocket disconnected');
      setTimeout(setupWebSocket, 5000);
  };
}
async function subscribeToUpdates() {
  if (ws.readyState === WebSocket.OPEN) {
      try {
          const response = await fetch('/api/my-investments');
          const investments = await response.json();
          
          investments.forEach(investment => {
              ws.send(JSON.stringify({
                  type: 'subscribe',
                  campaignId: investment.campaign_id
              }));
          });
      } catch (error) {
          console.error('Error subscribing to updates:', error);
      }
  }
}

function handleWebSocketMessage(data) {
  if (data.type === 'investment' || data.type === 'campaign_updated') {
      loadCampaigns(); // Reload campaigns when updates are received
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

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initWeb3);

// Handle MetaMask events
if (window.ethereum) {
  window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length > 0) {
          userAccount = accounts[0];
          await updateWalletBalance();
          await loadDashboard();
      } else {
          window.location.reload();
      }
  });
}
// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (ws) {
      ws.close();
  }
});