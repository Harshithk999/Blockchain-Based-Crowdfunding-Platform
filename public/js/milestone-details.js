//milestone details 


let ws;
let wsConnected = false;
let wsReconnectTimeout = null;
const MAX_RECONNECT_ATTEMPTS = 3;
let reconnectAttempts = 0;

// Place these helper functions at the top of the file, after your global variables
const helpers = {
  getTimeRemaining: function(endTime) {
      if (!endTime) return 'Time not set';
      
      const now = new Date();
      const end = new Date(endTime);
      const diff = end - now;

      if (diff <= 0) return 'Voting ended';

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${minutes}m`;
  },

  isVotingTimeExpired: function(endTime) {
      if (!endTime) return false;
      return new Date(endTime) <= new Date();
  },

  getMilestoneText: function(milestoneNumber) {
      const milestoneTexts = {
          1: 'First Milestone',
          2: 'Second Milestone',
          3: 'Third Milestone',
          4: 'Fourth Milestone'
      };
      return milestoneTexts[milestoneNumber] || 'Unknown Milestone';
  },

  getMilestonePercentage: function(milestoneNumber) {
      return `${milestoneNumber * 25}%`;
  }
};

const contractAddress = ''; //enter contractAddress
const contractABI =[];  //enter contractABI 

async function initWeb3() {
  if (typeof window.ethereum !== 'undefined') {
      try {
          web3 = new Web3(window.ethereum);
          userAccount = localStorage.getItem('ethereumAddress');
          contract = new web3.eth.Contract(contractABI, contractAddress);
          console.log('Contract initialized:', contractAddress);

          // Setup proper MetaMask listeners
          setupMetaMaskListeners();

          await updateWalletBalance();
          await loadMilestoneDetails();
          
          // Initialize WebSocket after other initializations
          setupWebSocket();

          return true;
      } catch (error) {
          console.error('Error initializing Web3:', error);
          showError('Failed to connect to MetaMask');
          return false;
      }
  } else {
      showError('Please install MetaMask');
      return false;
  }
}



function setupWebSocket() {
  cleanup(); // Clean up existing connections

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  try {
      ws = new WebSocket(wsUrl);
      
      ws.onopen = function() {
          console.log('WebSocket connected');
          wsConnected = true;
          reconnectAttempts = 0;
          const campaignId = getQueryParam('campaignId');
          
          if (campaignId && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                  type: 'subscribe',
                  campaignId: campaignId
              }));
          }
      };

      ws.onmessage = function(event) {
          try {
              const data = JSON.parse(event.data);
              handleWebSocketMessage(data);
          } catch (error) {
              console.error('Error parsing WebSocket message:', error);
          }
      };

      ws.onclose = function() {
          console.log('WebSocket disconnected');
          wsConnected = false;
          
          // Only attempt to reconnect if we haven't exceeded the maximum attempts
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttempts++;
              wsReconnectTimeout = setTimeout(() => {
                  setupWebSocket();
              }, 5000); // Wait 5 seconds before trying to reconnect
          }
      };

      ws.onerror = function(error) {
          console.error('WebSocket error:', error);
          wsConnected = false;
      };

  } catch (error) {
      console.error('Error setting up WebSocket:', error);
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          wsReconnectTimeout = setTimeout(() => {
              setupWebSocket();
          }, 5000);
      }
  }
}
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}
window.addEventListener('beforeunload', cleanup);
document.addEventListener('DOMContentLoaded', async () => {
  try {
      await initWeb3();
      setupEventListeners();
      setupLogoNavigation();
  } catch (error) {
      console.error('Error initializing page:', error);
      showError('Failed to initialize page');
  }
});
window.addEventListener('beforeunload', cleanupWebSocket);
// In milestone-details.js, update loadMilestoneDetails

async function loadMilestoneDetails() {
  showLoading();
  try {
      const campaignId = getQueryParam('campaignId');
      if (!campaignId) {
          throw new Error('Campaign ID not found');
      }

      // Load campaign details
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (!response.ok) {
          throw new Error('Failed to fetch campaign details');
      }
      
      const campaign = await response.json();

      // Update campaign name
      document.getElementById('campaign-name').textContent = campaign.name;

      // Determine user role and show appropriate view
      const userType = localStorage.getItem('userType');
      const isCreator = campaign.creator_id === parseInt(localStorage.getItem('userId'));
      
      // Hide/show appropriate sections based on user type
      const creatorView = document.getElementById('creator-view');
      const investorView = document.getElementById('investor-view');
      const milestoneInstructions = document.querySelector('.milestone-instructions');

      if (userType === 'creator' && isCreator) {
          // Show creator view only
          if (creatorView) creatorView.style.display = 'block';
          if (investorView) investorView.style.display = 'none';
          // Show creator milestone instructions
      } else {
          // Show investor view only
          if (creatorView) creatorView.style.display = 'none';
          if (investorView) investorView.style.display = 'block';
          // Show investor milestone instructions
      }

      // Load milestone status
      await loadMilestoneStatus(campaignId);

  } catch (error) {
      console.error('Error loading milestone details:', error);
      showError('Failed to load milestone details');
  } finally {
      hideLoading();
  }
}
async function handleVote(vote) {
  try {
      showLoading();
      const campaignId = getQueryParam('campaignId');

      const statusCheck = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
      const currentStatus = await statusCheck.json();
      const isLastMilestone = currentStatus.current_milestone === 3;
      
      const response = await fetch(`/api/milestones/${campaignId}/vote`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({ vote })
      });

      if (!response.ok) {
          throw new Error('Failed to submit vote');
      }

      const result = await response.json();
      
      // Check if this was the final milestone completion
      const milestoneStatus = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
      const statusData = await milestoneStatus.json();
      
      if (result.milestoneApproved && isLastMilestone) {
        showSuccess('Vote submitted successfully');
        // Add 2 second delay before redirecting
        setTimeout(() => {
            window.location.href = `/campaign-details?id=${campaignId}`;
        }, 2000);
        return;
    }

    showSuccess('Vote submitted successfully');
    setTimeout(() => {
        window.location.href = `/campaign-details?id=${campaignId}`;
    }, 2000);

  } catch (error) {
      console.error('Error submitting vote:', error);
      showError(error.message || 'Failed to submit vote');
  } finally {
      hideLoading();
  }
}
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

  // Add modal to body if it doesn't exist
  if (!document.getElementById('milestone-completion-modal')) {
      document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  const modal = document.getElementById('milestone-completion-modal');
  modal.style.display = 'flex';
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
async function checkCampaignCompletion(campaignId) {
  try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      const campaign = await response.json();
      
      if (campaign.current_milestone >= 4) {
          // Campaign is complete - redirect to campaign details
          window.location.href = `/campaign-details?id=${campaignId}`;
          return true;
      }
      return false;
  } catch (error) {
      console.error('Error checking campaign completion:', error);
      return false;
  }
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
function showMilestoneCompleteModal(milestoneNumber, amount) {
  const modal = document.getElementById('milestone-complete-modal');
  const amountSpan = document.getElementById('milestone-amount');
  
  if (modal && amountSpan) {
      amountSpan.textContent = amount;
      modal.style.display = 'flex';
  }
}
function showStartNextMilestoneModal(nextMilestoneNumber) {
  const modal = document.getElementById('start-next-milestone-modal');
  const numberSpan = document.getElementById('next-milestone-number');
  
  if (modal && numberSpan) {
      numberSpan.textContent = nextMilestoneNumber;
      modal.style.display = 'flex';
  }
}
async function handleNextMilestone(choice) {
  const campaignId = getQueryParam('campaignId');
  
  if (choice === 'now') {
      // Redirect to submit new milestone
      window.location.reload();
  } else {
      // Close the modal
      document.getElementById('milestone-complete-modal').style.display = 'none';
      document.getElementById('start-next-milestone-modal').style.display = 'none';
  }
}
// In milestone-details.js
async function loadMilestoneStatus(campaignId) {
  try {
      const response = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
      if (!response.ok) {
          throw new Error('Failed to fetch milestone status');
      }
      
      const status = await response.json();
      if (status.current_milestone >= 4) {
        setTimeout(() => {
            window.location.href = `/campaign-details?id=${campaignId}`;
        }, 2000);
        return;
    }

      const userType = localStorage.getItem('userType');
      const creatorView = document.getElementById('creator-view');
      const investorView = document.getElementById('investor-view');

      let shouldShowCompletionModal = false;
      await checkMilestoneCompletion(campaignId);

      // Update milestone text and percentage
      const milestoneNumber = status.current_milestone + 1;
      const milestoneText = document.getElementById('milestone-text');
      const milestonePercentageElement = document.getElementById('milestone-fund-text');

      if (milestoneText) {
          milestoneText.textContent = helpers.getMilestoneText(milestoneNumber);
      }

      if (milestonePercentageElement) {
          milestonePercentageElement.textContent = `${helpers.getMilestonePercentage(milestoneNumber)} of total funds`;
      }

      // Handle Creator View
      if (userType === 'creator') {
          investorView.style.display = 'none';
          creatorView.style.display = 'block';

          // Find the submission container
          let submissionArea = creatorView.querySelector('.submission-area');
          if (!submissionArea) {
              submissionArea = document.createElement('div');
              submissionArea.className = 'submission-area';
              creatorView.appendChild(submissionArea);
          }

          if (status.milestone_submitted) {
              submissionArea.innerHTML = `
                  <div class="milestone-status-message">
                      <div class="info-message">
                          <h3>Milestone ${status.current_milestone + 1} Under Review</h3>
                          <p>Your milestone submission is being reviewed by investors.</p>
                          
                          <div class="voting-progress">
                              <div class="vote-counts">
                                  <div class="vote-stat">
                                      <span class="label">Yes Votes:</span>
                                      <span class="value">${status.yes_votes || 0}</span>
                                  </div>
                                  <div class="vote-stat">
                                      <span class="label">No Votes:</span>
                                      <span class="value">${status.no_votes || 0}</span>
                                  </div>
                                  <div class="vote-stat">
                                      <span class="label">Pending Votes:</span>
                                      <span class="value">${status.total_investors - (status.yes_votes + status.no_votes)}</span>
                                  </div>
                              </div>
                              <div class="time-remaining">
                                  Time Remaining: ${helpers.getTimeRemaining(status.voting_end_time)}
                              </div>
                          </div>
                      </div>
                  </div>
              `;
          } else {
              submissionArea.innerHTML = `
                  <div class="submission-card">
                      <div class="card-header">
                          <h2>Submit Milestone Progress</h2>
                      </div>
                      <form id="milestone-form" class="milestone-form">
                          <div class="form-group">
                              <label>Milestone Description</label>
                              <textarea id="milestone-description" required></textarea>
                          </div>
                          <div class="form-group">
                              <label>Supporting Evidence</label>
                              <div class="file-upload-container">
                                  <input type="file" id="milestone-images" multiple accept="image/*">
                                  <div class="upload-instructions">
                                      <span>📁</span>
                                      <p>Drop up to 5 images or click to browse</p>
                                      <span class="file-limit">Maximum 5MB per image</span>
                                  </div>
                              </div>
                              <div id="image-preview" class="image-preview"></div>
                          </div>
                          <button type="submit" class="submit-btn">Submit Milestone</button>
                      </form>
                  </div>
              `;

              // Reattach event listeners
              const form = document.getElementById('milestone-form');
              if (form) {
                  form.addEventListener('submit', handleMilestoneSubmission);
              }
              const imageInput = document.getElementById('milestone-images');
              if (imageInput) {
                  imageInput.addEventListener('change', handleImagePreview);
              }
          }
      } else {
          // Investor View
          creatorView.style.display = 'none';
          investorView.style.display = 'block';

          if (status.milestone_submitted) {
              // Get milestone details
              const milestoneResponse = await fetch(`/api/campaigns/${campaignId}/milestone`);
              if (milestoneResponse.ok) {
                  const milestoneData = await milestoneResponse.json();
                  
                  // Update description view
                  const descriptionView = document.getElementById('milestone-description-view');
                  if (descriptionView) {
                      descriptionView.textContent = milestoneData.description || 'No description provided';
                  }

                  // Update images view
                  const imagesView = document.getElementById('milestone-images-view');
                  if (imagesView && milestoneData.images) {
                      let imageArray = Array.isArray(milestoneData.images) 
                          ? milestoneData.images 
                          : JSON.parse(milestoneData.images);

                      imagesView.innerHTML = imageArray.map(img => `
                          <img src="${img}" 
                               alt="Milestone evidence" 
                               onclick="showImageModal('${img}')"
                               class="evidence-image">
                      `).join('');
                  }
              }

              // Check if user has voted
              const hasVoted = await checkIfUserHasVoted(campaignId);
              
              // Update voting section
              const votingSection = document.querySelector('.voting-section');
              if (votingSection) {
                  if (hasVoted) {
                      votingSection.innerHTML = `
                          <div class="vote-complete-message">
                              <div class="info-message">
                                  <h4>Vote Submitted</h4>
                                  <p>Thank you for reviewing and voting on this milestone.</p>
                              </div>
                          </div>
                      `;
                  } else {
                      votingSection.innerHTML = `
                          <h3>Cast Your Vote</h3>
                          <p>Review the milestone progress and cast your vote</p>
                          <div class="voting-actions">
                              <button onclick="submitVote(true)" class="btn approve-btn">
                                  Approve
                              </button>
                              <button onclick="submitVote(false)" class="btn reject-btn">
                                  Reject
                              </button>
                          </div>
                      `;
                  }
              }
          } else {
              // Show waiting message for investors
              investorView.innerHTML = `
                  <div class="milestone-review-card">
                      <div class="info-message">
                          <h3>Waiting for Milestone Submission</h3>
                          <p>The creator has not yet submitted this milestone for review.</p>
                      </div>
                  </div>
              `;
          }
      }

      return status;
  } catch (error) {
      console.error('Error loading milestone status:', error);
      showError('Failed to load milestone status');
      throw error;
  }
}

function updateMilestoneUI(data) {
  // Update description view
  const descriptionView = document.getElementById('milestone-description-view');
  if (descriptionView) {
      descriptionView.textContent = data.description || 'No description available yet';
  }

  // Update images view
  const imagesView = document.getElementById('milestone-images-view');
  if (imagesView && data.images && Array.isArray(data.images)) {
      imagesView.innerHTML = data.images.map(img => `
          <img src="${img}" alt="Milestone evidence" onclick="showImageModal(this.src)">
      `).join('');
  }
  function getTimeRemaining(endTime) {
    if (!endTime) return 'Time not set';
    
    const now = new Date();
    const end = new Date(endTime);
    const diff = end - now;

    if (diff <= 0) return 'Voting ended';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
}
  // Update milestone text
  const milestoneText = document.getElementById('milestone-text');
  if (milestoneText) {
      milestoneText.textContent = `Milestone ${data.current_milestone + 1}`;
  }

  // Update fund text
  const milestonePercentage = (data.current_milestone + 1) * 25;
  const fundText = document.getElementById('milestone-fund-text');
  if (fundText) {
      fundText.textContent = `${milestonePercentage}% of total funds`;
  }
}

function updateVotingSection(data, hasVoted) {
  const votingSection = document.querySelector('.voting-section');
  if (!votingSection) return;

  if (hasVoted) {
      votingSection.innerHTML = `
          <div class="vote-complete-message">
              <div class="info-message">
                  <h4>Vote Submitted</h4>
                  <p>You have already cast your vote for this milestone.</p>
              </div>
              <div class="current-votes">
                  <div class="vote-stats">
                      <div class="vote-count">
                          <span>Yes Votes: ${data.yes_votes || 0}</span>
                      </div>
                      <div class="vote-count">
                          <span>No Votes: ${data.no_votes || 0}</span>
                      </div>
                  </div>
              </div>
          </div>
      `;
  } else if (data.milestone_submitted) {
      votingSection.innerHTML = `
          <h3>Cast Your Vote</h3>
          <p>Review the milestone progress and cast your vote</p>
          <div class="voting-actions">
              <button onclick="submitVote(true)" class="btn approve-btn">Approve</button>
              <button onclick="submitVote(false)" class="btn reject-btn">Reject</button>
          </div>
          <div class="current-votes">
              <div class="vote-stats">
                  <div class="vote-count">
                      <span>Yes Votes: ${data.yes_votes || 0}</span>
                  </div>
                  <div class="vote-count">
                      <span>No Votes: ${data.no_votes || 0}</span>
                  </div>
              </div>
          </div>
      `;
  } else {
      votingSection.innerHTML = `
          <div class="info-message">
              <p>Waiting for milestone submission from creator.</p>
          </div>
      `;
  }
}
async function checkIfUserHasVoted(campaignId, milestoneNumber) {
  try {
      if (!campaignId) return false;
      
      const response = await fetch(`/api/milestones/${campaignId}/vote-status`);
      if (!response.ok) {
          if (response.status === 404) {
              return false; // No votes yet
          }
          throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.hasVoted;
  } catch (error) {
      console.error('Error checking vote status:', error);
      return false; // Default to not voted in case of error
  }
}

function updateVoteDisplay(yesVotes, noVotes, totalInvestors) {
  const voteStatusElement = document.createElement('div');
  voteStatusElement.className = 'vote-status';
  
  voteStatusElement.innerHTML = `
      <div class="vote-counts">
          <div class="vote-count-item">
              <span class="vote-count-label">Yes Votes</span>
              <span class="vote-count-value">${yesVotes}</span>
          </div>
          <div class="vote-count-item">
              <span class="vote-count-label">No Votes</span>
              <span class="vote-count-value">${noVotes}</span>
          </div>
      </div>
      <div class="vote-total-investors">
          Total Investors: ${totalInvestors}
      </div>
  `;
  
  // Find the milestone note and insert after it
  const milestoneNote = document.querySelector('.milestone-note');
  if (milestoneNote && milestoneNote.parentNode) {
      milestoneNote.parentNode.insertBefore(voteStatusElement, milestoneNote.nextSibling);
  }
}
function updateSubmittedMilestoneUI(status) {
  const descriptionView = document.getElementById('milestone-description-view');
  const imagesView = document.getElementById('milestone-images-view');

  // Update description
  if (descriptionView) {
      descriptionView.textContent = status.description || 'No description provided';
  }

  // Handle images
  if (imagesView && status.images) {
      // Check if images is already an array
      let imageArray = status.images;

      // If it's a string, try to parse it
      if (typeof status.images === 'string') {
          try {
              imageArray = JSON.parse(status.images);
          } catch (error) {
              // If it's a single image path string, convert to array
              imageArray = [status.images];
          }
      }

      // Ensure imageArray is an array
      if (!Array.isArray(imageArray)) {
          imageArray = [];
      }

      // Create image elements with enhanced modal functionality
      imagesView.innerHTML = imageArray.map(img => `
          <div class="evidence-image-container">
              <img 
                  src="${img}" 
                  alt="Milestone evidence" 
                  onclick="showImageModal('${img}')"
                  class="evidence-image"
                  loading="lazy"
                  onerror="this.src='/images/default-image.jpg'"
              >
              <div class="image-overlay">
                  <span class="click-to-enlarge">Click to enlarge</span>
              </div>
          </div>
      `).join('');

      // Add click event listeners
      const images = imagesView.getElementsByClassName('evidence-image');
      Array.from(images).forEach(img => {
          img.addEventListener('click', (e) => {
              e.preventDefault();
              showImageModal(img.src);
          });
      });
  }
}
function getMilestoneText(milestoneNumber) {
  const milestoneTexts = {
      1: 'First Milestone',
      2: 'Second Milestone',
      3: 'Third Milestone',
      4: 'Fourth Milestone'
  };
  return milestoneTexts[milestoneNumber] || 'Unknown Milestone';
}
function getMilestonePercentage(milestoneNumber) {
  return `${milestoneNumber * 25}%`;
}

function setupCreatorView(campaign) {
    const form = document.getElementById('milestone-form');
    const imageInput = document.getElementById('milestone-images');

    // Setup image preview
    imageInput.addEventListener('change', handleImagePreview);

    // Setup form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleMilestoneSubmission(campaign.id);
    });
}

async function setupInvestorView(campaign) {
    try {
        const status = await loadMilestoneStatus(campaign.id);
        
        if (status.milestone_submitted) {
            // Display milestone description
            document.getElementById('milestone-description-view').textContent = 
                status.description || 'No description provided';

            // Display milestone images
            const imagesContainer = document.getElementById('milestone-images-view');
            if (status.images && status.images.length > 0) {
                imagesContainer.innerHTML = status.images.map(img => `
                    <img src="${img}" alt="Milestone evidence" onclick="showImageModal(this.src)">
                `).join('');
            }

            // Enable/disable voting based on whether user has already voted
            const hasVoted = await checkIfUserHasVoted(campaign.id);
            document.querySelectorAll('.vote-btn').forEach(btn => {
                btn.disabled = hasVoted;
                if (hasVoted) btn.classList.add('disabled');
            });
        } else {
            document.getElementById('milestone-description-view').textContent = 
                'Waiting for milestone submission...';
        }
    } catch (error) {
        console.error('Error setting up investor view:', error);
        showError('Failed to load milestone information');
    }
}

async function handleMilestoneSubmission(event) {
  event.preventDefault();
  showLoading();

  try {
      const description = document.getElementById('milestone-description').value;
      const imageFiles = document.getElementById('milestone-images').files;
      const campaignId = getQueryParam('campaignId');

      if (!description || !campaignId) {
          throw new Error('Please provide a milestone description');
      }

      // First check if milestone is already submitted
      const statusResponse = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
      const status = await statusResponse.json();

      if (status.milestone_submitted) {
          throw new Error('This milestone has already been submitted');
      }

      // Create form data
      const formData = new FormData();
      formData.append('campaignId', campaignId);
      formData.append('description', description);

      // Add images
      Array.from(imageFiles).forEach(file => {
          formData.append('images', file);
      });

      // Submit milestone
      const response = await fetch('/api/milestones', {
          method: 'POST',
          body: formData
      });

      const data = await response.json();

      if (!response.ok) {
          throw new Error(data.error || 'Failed to submit milestone');
      }

      showSuccess('Milestone submitted successfully!');
      
      // Wait a bit then reload to show the updated state
      setTimeout(() => {
          window.location.reload();
      }, 2000);

  } catch (error) {
      console.error('Error submitting milestone:', error);
      showError(error.message);
  } finally {
      hideLoading();
  }
}
async function checkMilestoneStatus(campaignId) {
  try {
      const response = await fetch(`/api/campaigns/${campaignId}/milestone-status`);
      const status = await response.json();

      // If milestone is already submitted, hide the submission form
      if (status.milestone_submitted) {
          const form = document.getElementById('milestone-form');
          if (form) {
              form.style.display = 'none';
          }
          showMessage('This milestone has already been submitted and is awaiting investor approval.');
      }

  } catch (error) {
      console.error('Error checking milestone status:', error);
  }
}
function showMessage(message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'info-message';
  messageDiv.textContent = message;

  const form = document.getElementById('milestone-form');
  if (form && form.parentNode) {
      form.parentNode.insertBefore(messageDiv, form);
  }
}
function setupEventListeners() {
  // Form submission
  const form = document.getElementById('milestone-form');
  if (form) {
      form.addEventListener('submit', handleMilestoneSubmission);
  }

  // Image preview
  const imageInput = document.getElementById('milestone-images');
  if (imageInput) {
      imageInput.addEventListener('change', handleImagePreview);
  }

  // Dashboard navigation
  const dashboardLink = document.getElementById('dashboard-link');
  if (dashboardLink) {
      dashboardLink.addEventListener('click', (e) => {
          e.preventDefault();
          const userType = localStorage.getItem('userType');
          window.location.href = `/${userType}-dashboard`;
      });
  }
  const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', async (e) => {
            e.preventDefault();
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
                showError('Failed to logout');
            }
        });
    }
}

async function submitVote(vote) {
  showLoading();
  try {
      const campaignId = getQueryParam('campaignId');
      
      const response = await fetch(`/api/milestones/${campaignId}/vote`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({ vote })
      });

      if (!response.ok) {
          throw new Error('Failed to submit vote');
      }

      const result = await response.json();
      showSuccess('Vote submitted successfully');
      
      // Reload milestone status to update UI
      await loadMilestoneStatus(campaignId);

  } catch (error) {
      console.error('Error submitting vote:', error);
      showError(error.message);
  } finally {
      hideLoading();
  }
}
function handleImagePreview(event) {
    const preview = document.getElementById('image-preview');
    preview.innerHTML = '';
    
    const files = Array.from(event.target.files);
    if (files.length > 5) {
        showError('Maximum 5 images allowed');
        event.target.value = '';
        return;
    }

    files.forEach(file => {
        if (!file.type.startsWith('image/')) {
            showError('Please upload only images');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            preview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
}
function updateMilestoneProgress(currentMilestone) {
  const dots = document.querySelectorAll('.milestone-dot');
  dots.forEach((dot, index) => {
      dot.classList.remove('completed', 'active');
      if (index < currentMilestone) {
          dot.classList.add('completed');
      } else if (index === currentMilestone) {
          dot.classList.add('active');
      }
  });
  
  document.getElementById('milestone-completion').textContent = 
      `${currentMilestone}/4 Milestones Completed`;
}
async function updateWalletBalance() {
    try {
        if (!web3 || !userAccount) return;
        const balance = await web3.eth.getBalance(userAccount);
        const ethBalance = web3.utils.fromWei(balance, 'ether');
        document.getElementById('wallet-balance').textContent = `${parseFloat(ethBalance).toFixed(4)} ETH`;

        // Also update the dashboard link based on user type
        const userType = localStorage.getItem('userType');
        const dashboardLink = document.getElementById('dashboard-link');
        if (dashboardLink) {
            dashboardLink.href = userType === 'creator' ? '/creator-dashboard' : '/investor-dashboard';
        }
    } catch (error) {
        console.error('Error updating wallet balance:', error);
    }
}

// Add this logout function as well
async function logout() {
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
        showError('Failed to logout');
    }
}
// WebSocket Setup
// Update the WebSocket initialization
async function initializeWebSocket() {
  if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout);
      wsReconnectTimeout = null;
  }

  return new Promise((resolve, reject) => {
      try {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${protocol}//${window.location.host}`;

          // Close existing connection if any
          if (ws) {
              ws.close();
              ws = null;
          }

          // Create new WebSocket connection
          ws = new WebSocket(wsUrl);

          ws.onopen = function() {
              console.log('WebSocket connected');
              wsConnected = true;
              retryCount = 0;

              // Subscribe to campaign updates
              const campaignId = getQueryParam('campaignId');
              if (campaignId) {
                  sendWebSocketMessage({
                      type: 'subscribe',
                      campaignId: campaignId
                  });
              }
              resolve();
          };

          // In milestone-details.js, in your WebSocket setup
ws.onmessage = function(event) {
  try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
  } catch (error) {
      console.error('Error parsing WebSocket message:', error);
  }
};

          ws.onclose = function() {
              console.log('WebSocket disconnected');
              wsConnected = false;
              
              if (retryCount < MAX_RETRIES) {
                  retryCount++;
                  wsReconnectTimeout = setTimeout(() => initializeWebSocket(), 5000);
              }
          };

          ws.onerror = function(error) {
              console.error('WebSocket error:', error);
              wsConnected = false;
              reject(error);
          };

      } catch (error) {
          console.error('Error setting up WebSocket:', error);
          reject(error);
      }
  });
}
function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
      console.log('Please connect to MetaMask.');
  } else if (accounts[0] !== userAccount) {
      userAccount = accounts[0];
      updateWalletBalance();
      loadMilestoneDetails();
  }
}
function sendWebSocketMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
      try {
          ws.send(JSON.stringify(message));
          return true;
      } catch (error) {
          console.error('Error sending WebSocket message:', error);
          return false;
      }
  }
  return false;
}

function handleWebSocketMessage(data) {
  switch (data.type) {
      case 'connection_established':
          console.log('WebSocket connection confirmed');
          break;
          
      case 'subscription_confirmed':
          console.log('Successfully subscribed to campaign updates');
          break;
          
      case 'milestone_update':
          loadMilestoneDetails();
          break;
          
      case 'vote_update':
          loadMilestoneStatus(getQueryParam('campaignId'));
          break;

      case 'milestone_submitted':
          loadMilestoneDetails();
          break;
      
      case 'vote_cast':
          loadMilestoneStatus(data.campaignId);
          break;
      
      case 'milestone_approved':
          if (localStorage.getItem('userType') === 'creator') {
                showFundsReleasedModal(data.amount);
            }
          break;
  }
}
function updateVoteCounts(yesVotes, noVotes) {
    const yesElement = document.getElementById('yes-votes');
    const noElement = document.getElementById('no-votes');
    
    if (yesElement) yesElement.textContent = yesVotes;
    if (noElement) noElement.textContent = noVotes;
}

function cleanupWebSocket() {
    if (ws) {
        ws.close();
        ws = null;
    }
}
function cleanup() {
  if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout);
      wsReconnectTimeout = null;
  }
  if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
          ws.close();
      }
      ws = null;
  }
  wsConnected = false;
}
window.addEventListener('beforeunload', cleanup);

// Utility Functions
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
function setupMetaMaskListeners() {
  if (!window.ethereum) return;

  window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length > 0) {
          userAccount = accounts[0];
          await updateWalletBalance();
          await loadMilestoneDetails();
      } else {
          window.location.reload();
      }
  });

  window.ethereum.on('chainChanged', () => {
      window.location.reload();
  });

  window.ethereum.on('disconnect', () => {
      console.log('Wallet disconnected');
      showError('Wallet disconnected. Please reconnect to continue.');
      setTimeout(() => window.location.reload(), 2000);
  });
}


function showSuccess(message) {
    const modal = document.getElementById('success-modal');
    const messageElement = modal.querySelector('h2');
    if (messageElement) messageElement.textContent = message;
    modal.style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initWeb3);

// Handle MetaMask events
if (window.ethereum) {
    window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length > 0) {
            userAccount = accounts[0];
            await updateWalletBalance();
            await loadMilestoneDetails();
        } else {
            window.location.reload();
        }
    });

    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });
}

function showImageModal(src) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-image');
  
  if (!modal || !modalImg) {
      // Create modal if it doesn't exist
      createImageModal();
      modal = document.getElementById('image-modal');
      modalImg = document.getElementById('modal-image');
  }
  
  // Set image source and show modal
  modalImg.src = src;
  modal.style.display = 'flex';
  
  // Add event listeners
  document.addEventListener('keydown', handleModalKeyPress);
  modal.addEventListener('click', handleModalClick);
}

function closeImageModal() {
  const modal = document.getElementById('image-modal');
  if (modal) {
      modal.style.display = 'none';
      document.removeEventListener('keydown', handleModalKeyPress);
      modal.removeEventListener('click', handleModalClick);
  }
}
// Handle keyboard events
function handleModalKeyPress(e) {
  if (e.key === 'Escape') {
      closeImageModal();
  }
}

// Handle click events
function handleModalClick(e) {
  if (e.target.id === 'image-modal') {
      closeImageModal();
  }
}

