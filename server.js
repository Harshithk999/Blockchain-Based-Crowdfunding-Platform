const express = require('express');
const mysql = require('mysql2/promise');
const Web3 = require('web3');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Track connected clients and their campaigns
const clients = new Map();
const port = process.env.PORT || 3000;

// Contract Configuration
const contractAddress = ''; //enter contractAddress
const contractABI =[];  //enter contractABI 

// Storage Configuration
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});
// Replace your existing milestoneStorage and milestoneUpload with this:
const milestoneStorage = multer.diskStorage({
  destination: function (req, file, cb) {
      const dir = path.join(__dirname, 'public/uploads/milestones');
      if (!fs.existsSync(dir)){
          fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
  },
  filename: function (req, file, cb) {
      const uniqueSuffix = `milestone_${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const milestoneUpload = multer({
  storage: milestoneStorage,
  limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
      files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
          cb(null, true);
      } else {
          cb(new Error('Only images are allowed'));
      }
  }
});


// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');

  // Send immediate confirmation
  ws.send(JSON.stringify({ type: 'connection_established' }));

  ws.on('message', (message) => {
      try {
          const data = JSON.parse(message);
          if (data.type === 'subscribe' && data.campaignId) {
              clients.set(ws, data.campaignId);
              console.log(`Client subscribed to campaign ${data.campaignId}`);
              // Send confirmation
              ws.send(JSON.stringify({
                  type: 'subscription_confirmed',
                  campaignId: data.campaignId
              }));
          }
      } catch (error) {
          console.error('WebSocket message error:', error);
      }
  });

  ws.on('close', () => {
      clients.delete(ws);
      console.log('Client disconnected');
  });
});



function broadcastCampaignUpdate(campaignId, updateData) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && clients.get(client) === campaignId) {
            try {
                client.send(JSON.stringify(updateData));
            } catch (error) {
                console.error('Error broadcasting update:', error);
                clients.delete(client);
            }
        }
    });
}
function broadcastUpdate(campaignId, data) {
  wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && clients.get(client) === campaignId) {
          client.send(JSON.stringify(data));
      }
  });
}
// Middleware setup
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Database Configuration
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ethertrust',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Web3 Configuration
let web3;
const initWeb3 = () => {
    try {
        const provider = process.env.WEB3_PROVIDER || 'ws://localhost:7545';
        web3 = new Web3(new Web3.providers.WebsocketProvider(provider));
        return web3;
    } catch (error) {
        console.error('Failed to initialize Web3:', error);
        throw error;
    }
};

// Auth Middleware
const authMiddleware = (req, res, next) => {
  if (req.session && req.session.userId) {
      next();
  } else {
      res.status(401).json({ error: 'Unauthorized' });
  }
};

const creatorMiddleware = (req, res, next) => {
    if (req.session && req.session.userType === 'creator') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied' });
    }
};

const investorMiddleware = (req, res, next) => {
    if (req.session && req.session.userType === 'investor') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied' });
    }
};

// Error Handler
const errorHandler = (error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ 
        error: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message 
    });
};

// Database Helper Functions
async function executeTransaction(callback) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Validation Helper Functions
function validateCampaign(campaign) {
    if (!campaign.name || campaign.name.length < 5) {
        throw new Error('Campaign name must be at least 5 characters');
    }
    if (!campaign.description || campaign.description.length < 50) {
        throw new Error('Description must be at least 50 characters');
    }
    if (!campaign.goalAmount || parseFloat(campaign.goalAmount) <= 0) {
        throw new Error('Goal amount must be greater than 0');
    }
    if (!campaign.endDate || new Date(campaign.endDate) <= new Date()) {
        throw new Error('End date must be in the future');
    }
}

function validateInvestment(amount) {
    if (!amount || isNaN(amount) || amount <= 0) {
        throw new Error('Invalid investment amount');
    }
}

// Basic Page Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  if (req.session.userId) {
      res.redirect(req.session.userType === 'creator' ? '/creator-dashboard' : '/investor-dashboard');
  } else {
      res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.get('/register', (req, res) => {
  if (req.session.userId) {
      res.redirect(req.session.userType === 'creator' ? '/creator-dashboard' : '/investor-dashboard');
  } else {
      res.sendFile(path.join(__dirname, 'public', 'register.html'));
  }
});

app.get('/creator-dashboard', (req, res) => {
  if (req.session.userType === 'creator') {
      res.sendFile(path.join(__dirname, 'public', 'creator-dashboard.html'));
  } else {
      res.redirect('/login');
  }
});

app.get('/investor-dashboard', (req, res) => {
  if (req.session.userType === 'investor') {
      res.sendFile(path.join(__dirname, 'public', 'investor-dashboard.html'));
  } else {
      res.redirect('/login');
  }
});

app.get('/create-campaign', (req, res) => {
  if (req.session.userType === 'creator') {
      res.sendFile(path.join(__dirname, 'public', 'create-campaign.html'));
  } else {
      res.redirect('/login');
  }
});

app.get('/campaign-details', (req, res) => {
  if (req.session.userId) {
      res.sendFile(path.join(__dirname, 'public', 'campaign-details.html'));
  } else {
      res.redirect('/login');
  }
});

// Authentication Routes
app.post('/register', async (req, res) => {
  try {
      const { username, password, userType, ethereumAddress } = req.body;
      
      if (!username || !password || !userType || !ethereumAddress) {
          return res.status(400).json({ error: 'All fields are required' });
      }

      // Validate ethereum address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(ethereumAddress)) {
          return res.status(400).json({ error: 'Invalid Ethereum address' });
      }

      const [existingUsers] = await pool.execute(
          'SELECT * FROM users WHERE username = ? OR ethereum_address = ?',
          [username, ethereumAddress]
      );

      if (existingUsers.length > 0) {
          return res.status(400).json({ error: 'Username or Ethereum address already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const [result] = await pool.execute(
          'INSERT INTO users (username, password, user_type, ethereum_address, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [username, hashedPassword, userType, ethereumAddress]
      );

      res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).json({ error: 'Registration failed, please try again' });
  }
});

app.post('/login', async (req, res) => {
  try {
      const { username, password } = req.body;
      const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
      
      if (rows.length > 0) {
          const user = rows[0];
          const match = await bcrypt.compare(password, user.password);
          
          if (match) {
              req.session.userId = user.id;
              req.session.userType = user.user_type;
              req.session.ethereumAddress = user.ethereum_address;
              
              res.json({
                  message: 'Login successful',
                  userType: user.user_type,
                  userId: user.id,
                  ethereumAddress: user.ethereum_address
              });
          } else {
              res.status(401).json({ error: 'Invalid credentials' });
          }
      } else {
          res.status(401).json({ error: 'Invalid credentials' });
      }
  } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
      if (err) {
          return res.status(500).json({ error: 'Could not log out' });
      }
      res.json({ message: 'Logout successful' });
  });
});

// Stats endpoint for creator dashboard
// In server.js
// In server.js 
app.get('/api/campaigns', async (req, res) => {
  try {
      const [rows] = await pool.query(`
          SELECT 
              c.*,
              u.username as creator_name,
              (
                  SELECT COALESCE(SUM(amount), 0) 
                  FROM investments 
                  WHERE campaign_id = c.id AND status = 'active'
              ) as current_amount,
              (
                  SELECT COUNT(DISTINCT investor_id) 
                  FROM investments 
                  WHERE campaign_id = c.id AND status = 'active'
              ) as backers_count,
              (
                  SELECT 
                      COUNT(DISTINCT investor_id) 
                  FROM investments 
                  WHERE campaign_id = c.id AND status = 'active'
              ) as backers_count
          FROM campaigns c 
          JOIN users u ON c.creator_id = u.id 
          ORDER BY c.created_at DESC
      `);

      const campaigns = rows.map(campaign => ({
          ...campaign,
          goal_amount: parseFloat(campaign.goal_amount),
          current_amount: parseFloat(campaign.current_amount || 0),
          backers_count: parseInt(campaign.backers_count || 0)
      }));

      console.log('Fetched campaigns:', campaigns); // Add this for debugging

      res.json(campaigns);
  } catch (error) {
      console.error('Error fetching campaigns:', error);
      res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});
app.get('/api/campaigns/:id/status', async (req, res) => {
  try {
      const [rows] = await pool.query(`
          SELECT 
              c.*,
              COALESCE(SUM(i.amount), 0) as current_amount,
              COUNT(DISTINCT i.investor_id) as backers_count
          FROM campaigns c
          LEFT JOIN investments i ON c.id = i.campaign_id AND i.status = 'active'
          WHERE c.id = ?
          GROUP BY c.id
      `, [req.params.id]);

      if (rows.length === 0) {
          return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = {
          ...rows[0],
          goal_amount: parseFloat(rows[0].goal_amount),
          current_amount: parseFloat(rows[0].current_amount || 0),
          backers_count: parseInt(rows[0].backers_count || 0)
      };

      res.json(campaign);
  } catch (error) {
      console.error('Error fetching campaign status:', error);
      res.status(500).json({ error: 'Failed to fetch campaign status' });
  }
});

app.get('/api/campaigns/:id', async (req, res) => {
  try {
      const [rows] = await pool.query(`
          SELECT 
              c.*,
              u.username as creator_name,
              u.ethereum_address as creator_address,
              (
                  SELECT COUNT(DISTINCT investor_id) 
                  FROM investments 
                  WHERE campaign_id = c.id AND status = 'active'
              ) as backers_count,
              (
                  SELECT SUM(amount)
                  FROM investments
                  WHERE campaign_id = c.id AND status = 'active'
              ) as verified_amount,
              (
                  SELECT COUNT(*) 
                  FROM milestones 
                  WHERE campaign_id = c.id AND status != 'rejected'
              ) as milestone_count,
              EXISTS(
                  SELECT 1 
                  FROM milestones 
                  WHERE campaign_id = c.id 
                  AND milestone_number = c.current_milestone
                  AND status != 'rejected'
              ) as has_active_milestone
          FROM campaigns c 
          JOIN users u ON c.creator_id = u.id 
          WHERE c.id = ?
      `, [req.params.id]);

      if (rows.length === 0) {
          return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaignData = {
          ...rows[0],
          goal_amount: parseFloat(rows[0].goal_amount),
          current_amount: parseFloat(rows[0].verified_amount || 0),
          backers_count: parseInt(rows[0].backers_count || 0),
          has_started_milestones: rows[0].current_milestone > 0 || rows[0].milestone_submitted
      };

      res.json(campaignData);
  } catch (error) {
      console.error('Error fetching campaign:', error);
      res.status(500).json({ error: 'Failed to fetch campaign details' });
  }
});

app.get('/milestone-details', (req, res) => {
  if (req.session.userId) {
      res.sendFile(path.join(__dirname, 'public', 'milestone-details.html'));
  } else {
      res.redirect('/login');
  }
});

app.post('/api/campaigns', authMiddleware, creatorMiddleware, upload.single('image'), async (req, res) => {
  let connection;
  try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const { name, description, goalAmount, endDate, blockchainId } = req.body;

      // Validate campaign
      validateCampaign({ name, description, goalAmount, endDate });

      const [result] = await connection.execute(
          `INSERT INTO campaigns (
              name, description, goal_amount, current_amount,
              creator_id, end_date, image_url, status,
              current_milestone, milestone_submitted, blockchain_id
          ) VALUES (?, ?, ?, 0, ?, ?, ?, 'active', 0, false, ?)`,
          [
              name,
              description,
              goalAmount,
              req.session.userId,
              endDate,
              req.file ? `/uploads/${req.file.filename}` : null,
              blockchainId
          ]
      );

      await connection.commit();
      
      // Broadcast new campaign creation
     // Broadcast new campaign creation
     broadcastCampaignUpdate(result.insertId, {
      type: 'campaign_created',
      campaignId: result.insertId
  });

  res.status(201).json({
      id: result.insertId,
      message: 'Campaign created successfully'
  });
} catch (error) {
  if (connection) {
      await connection.rollback();
  }
  console.error('Error creating campaign:', error);
  res.status(500).json({ error: error.message || 'Failed to create campaign' });
} finally {
  if (connection) {
      connection.release();
  }
}
});
app.post('/api/campaigns/:id/sync', authMiddleware, async (req, res) => {
let connection;
try {
  connection = await pool.getConnection();
  await connection.beginTransaction();

  const { amount } = req.body;
  const campaignId = req.params.id;

  // Update campaign amount
  await connection.execute(
      'UPDATE campaigns SET current_amount = ? WHERE id = ?',
      [amount, campaignId]
  );

  await connection.commit();
  res.json({ message: 'Campaign synchronized successfully' });

} catch (error) {
  if (connection) await connection.rollback();
  console.error('Error syncing campaign:', error);
  res.status(500).json({ error: 'Failed to sync campaign' });
} finally {
  if (connection) connection.release();
}
});

app.post('/api/investments', authMiddleware, investorMiddleware, async (req, res) => {
  let connection;
  try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const { campaignId, amount, blockchain_total, transaction_hash } = req.body;

      // Get current campaign state
      const [campaigns] = await connection.query(
          'SELECT goal_amount, current_amount FROM campaigns WHERE id = ?',
          [campaignId]
      );

      if (campaigns.length === 0) {
          throw new Error('Campaign not found');
      }

      const campaign = campaigns[0];
      const goalAmount = parseFloat(campaign.goal_amount);
      const newTotal = parseFloat(blockchain_total);

      // Insert new investment
      await connection.execute(
          `INSERT INTO investments 
          (campaign_id, investor_id, amount, transaction_hash, status, created_at, updated_at) 
          VALUES (?, ?, ?, ?, 'active', NOW(), NOW())`,
          [campaignId, req.session.userId, amount, transaction_hash]
      );

      // Update campaign with blockchain-verified amount
      await connection.execute(
          'UPDATE campaigns SET current_amount = ?, status = ? WHERE id = ?',
          [newTotal, newTotal >= goalAmount ? 'funded' : 'active', campaignId]
      );

      await connection.commit();

      // Broadcast update
      broadcastCampaignUpdate(campaignId, {
          type: 'investment',
          amount: amount,
          total: newTotal,
          goalMet: newTotal >= goalAmount
      });

      res.status(201).json({ 
          message: 'Investment recorded successfully',
          total: newTotal,
          goalMet: newTotal >= goalAmount
      });

  } catch (error) {
      if (connection) {
          await connection.rollback();
      }
      console.error('Investment error:', error);
      res.status(500).json({ error: error.message });
  } finally {
      if (connection) {
          connection.release();
      }
  }
});

// Add a route to verify campaign amounts
app.get('/api/campaigns/:id/verify', async (req, res) => {
try {
  const [campaign] = await pool.query(
      'SELECT c.*, b.blockchain_id FROM campaigns c WHERE c.id = ?',
      [req.params.id]
  );

  if (campaign.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
  }

  // Get blockchain amount
  const web3 = new Web3(new Web3.providers.HttpProvider(process.env.WEB3_PROVIDER));
  const contract = new web3.eth.Contract(contractABI, contractAddress);
  
  const blockchainCampaign = await contract.methods.getCampaign(campaign[0].blockchain_id).call();
  const blockchainAmount = web3.utils.fromWei(blockchainCampaign.pledged, 'ether');

  res.json({
      database_amount: campaign[0].current_amount,
      blockchain_amount: blockchainAmount
  });

} catch (error) {
  console.error('Verification error:', error);
  res.status(500).json({ error: 'Failed to verify amounts' });
}
});

// Milestone Routes
// Update the milestone submission route
// Update your milestone submission endpoint in server.js
app.post('/api/milestones', authMiddleware, milestoneUpload.array('images', 5), async (req, res) => {
  let connection;
  try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const { campaignId, description } = req.body;
      console.log('Received milestone submission:', { campaignId, description }); // Debug log

      // Verify campaign exists and user is creator
      const [campaigns] = await connection.query(
          'SELECT * FROM campaigns WHERE id = ? AND creator_id = ?',
          [campaignId, req.session.userId]
      );

      if (campaigns.length === 0) {
          throw new Error('Campaign not found or unauthorized');
      }

      const campaign = campaigns[0];
      
      // Check if milestone is already submitted
      const [existingMilestone] = await connection.query(
          'SELECT * FROM milestones WHERE campaign_id = ? AND milestone_number = ?',
          [campaignId, campaign.current_milestone]
      );

      if (existingMilestone.length > 0) {
          throw new Error('Milestone already submitted');
      }

      // Process uploaded images
      const imageFiles = req.files || [];
      const imagePaths = imageFiles.map(file => `/uploads/milestones/${file.filename}`);

      // Insert milestone
      await connection.execute(
          `INSERT INTO milestones (
              campaign_id, 
              milestone_number, 
              description, 
              images, 
              status, 
              created_at, 
              updated_at
          ) VALUES (?, ?, ?, ?, 'pending', NOW(), NOW())`,
          [
              campaignId,
              campaign.current_milestone,
              description,
              JSON.stringify(imagePaths)
          ]
      );

      // Update campaign
      await connection.execute(
          'UPDATE campaigns SET milestone_submitted = true WHERE id = ?',
          [campaignId]
      );

      await connection.commit();

      // Broadcast update via WebSocket
      broadcastUpdate(campaignId, {
          type: 'milestone_submitted',
          milestoneNumber: campaign.current_milestone,
          description: description,
          images: imagePaths
      });

      res.status(201).json({
          message: 'Milestone submitted successfully',
          milestoneNumber: campaign.current_milestone
      });

  } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error submitting milestone:', error);
      res.status(500).json({ error: error.message });
  } finally {
      if (connection) connection.release();
  }
});

// Add this route to your server.js
app.get('/api/milestones/:campaignId/vote-status', authMiddleware, async (req, res) => {
  try {
      const { campaignId } = req.params;
      const userId = req.session.userId;

      // Get current milestone number for the campaign
      const [campaign] = await pool.query(
          'SELECT current_milestone FROM campaigns WHERE id = ?',
          [campaignId]
      );

      if (!campaign.length) {
          return res.status(404).json({ error: 'Campaign not found' });
      }

      const milestoneNumber = campaign[0].current_milestone;

      // Check if user has voted
      const [votes] = await pool.query(
          'SELECT * FROM milestone_votes WHERE campaign_id = ? AND milestone_number = ? AND voter_id = ?',
          [campaignId, milestoneNumber, userId]
      );

      res.json({
          hasVoted: votes.length > 0,
          vote: votes.length > 0 ? votes[0].vote : null
      });

  } catch (error) {
      console.error('Error checking vote status:', error);
      res.status(500).json({ error: 'Failed to check vote status' });
  }
});
// Update the milestone voting route
app.post('/api/milestones/:campaignId/vote', authMiddleware, async (req, res) => {
  let connection;
  try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const { vote } = req.body;
      const campaignId = req.params.campaignId;

      // Get campaign details first
      const [campaigns] = await connection.query(
          'SELECT * FROM campaigns WHERE id = ?',
          [campaignId]
      );

      if (campaigns.length === 0) {
          throw new Error('Campaign not found');
      }

      const campaign = campaigns[0];

      // Verify investor
      const [investments] = await connection.query(
          'SELECT * FROM investments WHERE campaign_id = ? AND investor_id = ?',
          [campaignId, req.session.userId]
      );

      if (investments.length === 0) {
          throw new Error('Only investors can vote');
      }

      // Check if already voted
      const [existingVotes] = await connection.query(
          'SELECT * FROM milestone_votes WHERE campaign_id = ? AND milestone_number = ? AND voter_id = ?',
          [campaignId, campaign.current_milestone, req.session.userId]
      );

      if (existingVotes.length > 0) {
          throw new Error('Already voted on this milestone');
      }

      // Record vote
      await connection.execute(
          `INSERT INTO milestone_votes (campaign_id, milestone_number, voter_id, vote, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [campaignId, campaign.current_milestone, req.session.userId, vote]
      );

      // Get total votes
      const [voteCount] = await connection.query(
          `SELECT 
              COUNT(CASE WHEN vote = true THEN 1 END) as yes_votes,
              COUNT(*) as total_votes
           FROM milestone_votes 
           WHERE campaign_id = ? AND milestone_number = ?`,
          [campaignId, campaign.current_milestone]
      );

      // Get total number of unique investors
      const [investorCount] = await connection.query(
          'SELECT COUNT(DISTINCT investor_id) as count FROM investments WHERE campaign_id = ?',
          [campaignId]
      );

      const totalInvestors = investorCount[0].count;
      const yesVotes = voteCount[0].yes_votes;

      // If more than 50% of investors approve, advance the milestone
      if (yesVotes > totalInvestors / 2) {
          // Update milestone status
          await connection.execute(
              `UPDATE milestones 
               SET status = 'approved', updated_at = NOW() 
               WHERE campaign_id = ? AND milestone_number = ?`,
              [campaignId, campaign.current_milestone]
          );

          // Increment campaign milestone and reset submission flag
          await connection.execute(
              `UPDATE campaigns 
               SET current_milestone = current_milestone + 1,
                   milestone_submitted = false 
               WHERE id = ?`,
              [campaignId]
          );

          // Broadcast update
          broadcastCampaignUpdate(campaignId, {
              type: 'milestone_approved',
              milestoneNumber: campaign.current_milestone,
              nextMilestone: campaign.current_milestone + 1
          });
      }

      await connection.commit();
      res.json({ 
          message: 'Vote recorded successfully',
          milestoneApproved: yesVotes > totalInvestors / 2
          
      });

  } catch (error) {
      if (connection) await connection.rollback();
      res.status(500).json({ error: error.message });
  } finally {
      if (connection) connection.release();
  }
});
function broadcastMilestoneUpdate(campaignId, milestoneData) {
  wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && clients.get(client) === campaignId) {
          client.send(JSON.stringify({
              type: 'milestone_submitted',
              campaignId: campaignId,
              milestone: milestoneData
          }));
      }
  });
}
// In server.js
// Make sure this route is added before the error handler and after other middleware
// Add this with your other API routes in server.js

// Profile routes
app.get('/api/users/profile', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT username, user_type, ethereum_address FROM users WHERE id = ?',
            [req.session.userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile data' });
    }
});
// Add this route in your server.js
app.get('/profile', (req, res) => {
  if (req.session.userId) {
      res.sendFile(path.join(__dirname, 'public', 'profile.html'));
  } else {
      res.redirect('/login');
  }
});
// Add this to your server.js
app.post('/api/users/update-username', authMiddleware, async (req, res) => {
  try {
      const { newUsername } = req.body;
      
      // Basic validation
      if (!newUsername || newUsername.trim().length < 3) {
          return res.status(400).json({ error: 'Username must be at least 3 characters long' });
      }

      // Check if username is already taken
      const [existingUsers] = await pool.execute(
          'SELECT id FROM users WHERE username = ? AND id != ?',
          [newUsername.trim(), req.session.userId]
      );

      if (existingUsers.length > 0) {
          return res.status(400).json({ error: 'Username already taken' });
      }

      // Update username
      await pool.execute(
          'UPDATE users SET username = ?, updated_at = NOW() WHERE id = ?',
          [newUsername.trim(), req.session.userId]
      );

      console.log('Username updated successfully'); // Debug log

      res.json({ 
          message: 'Username updated successfully',
          username: newUsername.trim()
      });

  } catch (error) {
      console.error('Error updating username:', error);
      res.status(500).json({ error: 'Failed to update username' });
  }
});
// Add this route to get milestone status
// In server.js
app.get('/api/campaigns/:campaignId/milestone-status', authMiddleware, async (req, res) => {
  try {
      const [rows] = await pool.query(
          `SELECT 
              c.current_milestone,
              c.milestone_submitted,
              m.status as milestone_status,
              m.description,
              m.images,
              COUNT(CASE WHEN mv.vote = true THEN 1 END) as yes_votes,
              COUNT(CASE WHEN mv.vote = false THEN 1 END) as no_votes,
              (SELECT COUNT(DISTINCT investor_id) FROM investments WHERE campaign_id = c.id) as total_investors,
              m.created_at + INTERVAL 1 DAY as voting_end_time,
              (c.goal_amount * 0.25) as milestone_amount
           FROM campaigns c
           LEFT JOIN milestones m ON c.id = m.campaign_id AND c.current_milestone = m.milestone_number
           LEFT JOIN milestone_votes mv ON m.campaign_id = mv.campaign_id AND m.milestone_number = mv.milestone_number
           WHERE c.id = ?
           GROUP BY c.id, m.id`,
          [req.params.campaignId]
      );

      if (rows.length === 0) {
          return res.status(404).json({ error: 'Campaign not found' });
      }

      const status = rows[0];
      if (status.images) {
          status.images = JSON.parse(status.images);
      }

      res.json(status);
  } catch (error) {
      console.error('Error fetching milestone status:', error);
      res.status(500).json({ error: 'Failed to fetch milestone status' });
  }
});

function handleMilestoneCompletion(campaignId, status) {
  if (status.yes_votes > status.total_investors / 2) {
      broadcastUpdate(campaignId, {
          type: 'milestone_approved',
          amount: status.milestone_amount,
          milestoneNumber: status.current_milestone
      });
  }
}
// Add this to your server.js with other API endpoints
// In server.js
app.get('/api/investments/:campaignId', async (req, res) => {
  try {
      const [investments] = await pool.query(`
          SELECT 
              i.*,
              u.username,
              u.ethereum_address
          FROM investments i
          JOIN users u ON i.investor_id = u.id
          WHERE i.campaign_id = ? AND i.status = 'active'
          ORDER BY i.created_at DESC
          LIMIT 50
      `, [req.params.campaignId]);

      console.log('Fetched investments:', investments); // Debug log
      res.json(investments);
  } catch (error) {
      console.error('Error fetching investments:', error);
      res.status(500).json({ error: 'Failed to fetch investments' });
  }
});
app.post('/api/milestones/:campaignId/approve', authMiddleware, async (req, res) => {
  let connection;
  try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const { milestoneNumber, transactionHash } = req.body;
      const campaignId = req.params.campaignId;

      // Update milestone status
      await connection.execute(
          `UPDATE milestones 
           SET status = 'approved', 
               updated_at = NOW() 
           WHERE campaign_id = ? AND milestone_number = ?`,
          [campaignId, milestoneNumber]
      );

      // Record fund release
      await connection.execute(
          `INSERT INTO milestone_funds 
           (campaign_id, milestone_number, transaction_hash, released_at) 
           VALUES (?, ?, ?, NOW())`,
          [campaignId, milestoneNumber, transactionHash]
      );

      await connection.commit();
      res.json({ message: 'Milestone approved and funds released' });

  } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error approving milestone:', error);
      res.status(500).json({ error: 'Failed to approve milestone' });
  } finally {
      if (connection) connection.release();
  }
});
// Get campaign investments
app.get('/api/my-investments', authMiddleware, investorMiddleware, async (req, res) => {
  try {
      const [investments] = await pool.query(`
          SELECT 
              i.*,
              c.name as campaign_name,
              c.description as campaign_description,
              c.image_url,
              c.status as campaign_status,
              c.goal_amount,
              (
                  SELECT COALESCE(SUM(amount), 0)
                  FROM investments
                  WHERE campaign_id = c.id AND status = 'active'
              ) as total_raised,
              c.end_date,
              c.current_milestone,
              c.milestone_submitted
          FROM investments i
          JOIN campaigns c ON i.campaign_id = c.id
          WHERE i.investor_id = ? AND i.status = 'active'
          ORDER BY i.created_at DESC
      `, [req.session.userId]);

      // Format the data
      const formattedInvestments = investments.map(inv => ({
          ...inv,
          amount: parseFloat(inv.amount).toFixed(4),
          goal_amount: parseFloat(inv.goal_amount).toFixed(4),
          total_raised: parseFloat(inv.total_raised).toFixed(4),
          progress: ((parseFloat(inv.total_raised) / parseFloat(inv.goal_amount)) * 100).toFixed(1)
      }));

      res.json(formattedInvestments);
  } catch (error) {
      console.error('Error fetching investments:', error);
      res.status(500).json({ error: 'Failed to fetch investments' });
  }
});

app.get('/api/investor/stats', authMiddleware, investorMiddleware, async (req, res) => {
  try {
      const [stats] = await pool.query(`
          SELECT 
              COALESCE(SUM(i.amount), 0) as total_invested,
              COUNT(DISTINCT i.campaign_id) as active_investments
          FROM investments i
          JOIN campaigns c ON i.campaign_id = c.id
          WHERE i.investor_id = ? AND i.status = 'active'
          AND c.status = 'active'
      `, [req.session.userId]);

      res.json({
          total_invested: parseFloat(stats[0].total_invested).toFixed(4),
          active_investments: stats[0].active_investments,
      });
  } catch (error) {
      console.error('Error fetching investor stats:', error);
      res.status(500).json({ error: 'Failed to fetch investor stats' });
  }
});
// Get milestone details
app.get('/api/campaigns/:campaignId/milestones/:milestoneNumber', authMiddleware, async (req, res) => {
  try {
      const [milestones] = await pool.query(
          `SELECT 
              m.*,
              COUNT(CASE WHEN mv.vote = true THEN 1 END) as yes_votes,
              COUNT(CASE WHEN mv.vote = false THEN 1 END) as no_votes
          FROM milestones m
          LEFT JOIN milestone_votes mv ON 
              m.campaign_id = mv.campaign_id AND 
              m.milestone_number = mv.milestone_number
          WHERE m.campaign_id = ? AND m.milestone_number = ?
          GROUP BY m.id`,
          [req.params.campaignId, req.params.milestoneNumber]
      );

      if (milestones.length === 0) {
          return res.status(404).json({ error: 'Milestone not found' });
      }

      const milestone = milestones[0];
      // Parse JSON string to array
      milestone.images = JSON.parse(milestone.images || '[]');

      res.json(milestone);
  } catch (error) {
      console.error('Error fetching milestone:', error);
      res.status(500).json({ error: 'Failed to fetch milestone details' });
  }
});
// In server.js - Update the milestone endpoint with better error handling
app.get('/api/campaigns/:campaignId/milestone', authMiddleware, async (req, res) => {
  try {
      const [milestones] = await pool.query(
          `SELECT m.*, 
                c.current_milestone,
                c.milestone_submitted
           FROM campaigns c
           LEFT JOIN milestones m ON 
              c.id = m.campaign_id AND 
              c.current_milestone = m.milestone_number
           WHERE c.id = ?`,
          [req.params.campaignId]
      );

      // If no campaign found
      if (milestones.length === 0) {
          return res.status(404).json({ 
              error: 'Campaign not found',
              details: 'No campaign exists with this ID'
          });
      }

      // Get vote counts
      const [voteResults] = await pool.query(
          `SELECT 
              COUNT(CASE WHEN vote = true THEN 1 END) as yes_votes,
              COUNT(CASE WHEN vote = false THEN 1 END) as no_votes
           FROM milestone_votes 
           WHERE campaign_id = ? AND milestone_number = ?`,
          [req.params.campaignId, milestones[0].current_milestone]
      );

      let response = {
          current_milestone: milestones[0].current_milestone,
          milestone_submitted: milestones[0].milestone_submitted,
          yes_votes: voteResults[0]?.yes_votes || 0,
          no_votes: voteResults[0]?.no_votes || 0
      };

      // If milestone exists, add its details
      if (milestones[0].description) {
          response = {
              ...response,
              description: milestones[0].description,
              images: milestones[0].images ? JSON.parse(milestones[0].images) : [],
              status: milestones[0].status,
              created_at: milestones[0].created_at
          };
      }

      console.log('Sending milestone response:', response); // Debug log
      res.json(response);

  } catch (error) {
      console.error('Error fetching milestone:', error); // Debug log
      res.status(500).json({ 
          error: 'Failed to fetch milestone',
          details: error.message 
      });
  }
});



// Generate reward when campaign completes
async function generateReward(campaignId, investorId) {
  try {
      const couponCode = await generateCouponCode();
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 3); // 3 months validity

      const [result] = await pool.execute(
          `INSERT INTO rewards (campaign_id, investor_id, coupon_code, reward_type, discount_amount, expiry_date)
           VALUES (?, ?, ?, 'discount', 20.00, ?)`,
          [campaignId, investorId, couponCode, expiryDate]
      );

      return couponCode;
  } catch (error) {
      console.error('Error generating reward:', error);
      throw error;
  }
}

// Get reward API endpoint
app.get('/api/rewards/:campaignId', authMiddleware, async (req, res) => {
  let connection;
  try {
      console.log('Rewards API called for campaign:', req.params.campaignId);
      console.log('User ID:', req.session.userId);

      connection = await pool.getConnection();
      await connection.beginTransaction();

      // First check if user is an investor for this campaign
      const [investments] = await connection.execute(
          'SELECT id FROM investments WHERE campaign_id = ? AND investor_id = ? AND status = "active"',
          [req.params.campaignId, req.session.userId]
      );

      if (investments.length === 0) {
          throw new Error('User is not an investor in this campaign');
      }

      // Check campaign completion
      const [campaigns] = await connection.execute(
          'SELECT current_milestone FROM campaigns WHERE id = ?',
          [req.params.campaignId]
      );

      console.log('Campaign data:', campaigns[0]);

      if (campaigns.length === 0) {
          throw new Error('Campaign not found');
      }

      if (campaigns[0].current_milestone < 4) {
          throw new Error('Campaign not completed');
      }

      // Check existing reward
      const [rewards] = await connection.execute(
          'SELECT * FROM rewards WHERE campaign_id = ? AND investor_id = ?',
          [req.params.campaignId, req.session.userId]
      );

      console.log('Existing rewards:', rewards);

      let rewardData;
      if (rewards.length === 0) {
          // Generate new reward
          const couponCode = await generateReward(req.params.campaignId, req.session.userId);
          rewardData = {
              coupon_code: couponCode,
              reward_type: 'discount',
              discount_amount: 20.00
          };
      } else {
          rewardData = rewards[0];
      }

      await connection.commit();
      res.json(rewardData);

  } catch (error) {
      if (connection) await connection.rollback();
      console.error('Detailed error in rewards endpoint:', {
          message: error.message,
          stack: error.stack,
          campaignId: req.params.campaignId,
          userId: req.session.userId
      });
      res.status(500).json({ error: error.message || 'Failed to process reward' });
  } finally {
      if (connection) connection.release();
  }
});
async function codeExists(code) {
  const [rows] = await pool.execute(
      'SELECT id FROM rewards WHERE coupon_code = ?',
      [code]
  );
  return rows.length > 0;
}
// Helper function to generate unique coupon code
async function generateCouponCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 8;
  let code;
  do {
      code = '';
      for (let i = 0; i < length; i++) {
          code += characters.charAt(Math.floor(Math.random() * characters.length));
      }
  } while (await codeExists(code));
  return code;
}











// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async () => {
try {
  web3 = initWeb3();
  server.listen(port, () => {
      console.log(`Server running on port ${port}`);
  });
} catch (error) {
  console.error('Failed to start server:', error);
  process.exit(1);
}
};

// Initialize server
startServer();

// Cleanup on server shutdown
process.on('SIGTERM', () => {
console.log('SIGTERM received. Closing server...');
server.close(() => {
  console.log('Server closed');
  process.exit(0);
});
});

process.on('uncaughtException', (error) => {
console.error('Uncaught Exception:', error);
server.close(() => {
  process.exit(1);
});
});

process.on('unhandledRejection', (reason, promise) => {
console.error('Unhandled Rejection at:', promise, 'reason:', reason);
server.close(() => {
  process.exit(1);
});
});