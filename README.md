# EtherTrust: Blockchain-Based Crowdfunding Platform

A secure and transparent crowdfunding platform built on Ethereum blockchain with milestone-based funding and democratic voting system.

## Features
- Decentralized fund management through smart contracts
- Milestone-based fund release (4 stages x 25% each)
- Democratic voting system for milestone approval
- Real-time updates via WebSocket
- Reward-based investment tracking
- MetaMask wallet integration

## Tech Stack
- Frontend: HTML, CSS, JavaScript 
- Backend: Node.js/Express
- Database: MySQL
- Blockchain: Ethereum (Ganache for development)
- Smart Contracts: Solidity
- Real-time: WebSocket
- Storage: Multer
- Authentication: Session-based

## Prerequisites
- Node.js v14+
- MySQL
- Ganache 
- MetaMask browser extension
- Git

## Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/ethertrust.git
```

2. Install dependencies
```bash
npm install
```

3. Create MySQL database
```bash
CREATE DATABASE ethertrust;
USE ethertrust;

-- Users Table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type ENUM('creator', 'investor') NOT NULL,
    ethereum_address VARCHAR(42) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Campaigns Table
CREATE TABLE campaigns (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    goal_amount DECIMAL(18,4) NOT NULL,
    current_amount DECIMAL(18,4) DEFAULT 0,
    creator_id INT NOT NULL,
    end_date DATETIME NOT NULL,
    image_url VARCHAR(255),
    status ENUM('active', 'funded', 'ended') DEFAULT 'active',
    current_milestone INT DEFAULT 0,
    milestone_submitted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    blockchain_id INT,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- Investments Table
CREATE TABLE investments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    campaign_id INT NOT NULL,
    investor_id INT NOT NULL,
    amount DECIMAL(18,4) NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    status ENUM('active', 'refunded') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (investor_id) REFERENCES users(id)
);

-- Milestones Table
CREATE TABLE milestones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    campaign_id INT NOT NULL,
    milestone_number INT NOT NULL,
    description TEXT NOT NULL,
    images TEXT,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

-- Milestone Votes Table
CREATE TABLE milestone_votes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    campaign_id INT NOT NULL,
    milestone_number INT NOT NULL,
    voter_id INT NOT NULL,
    vote BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY (voter_id) REFERENCES users(id)
);
```

4. Create .env file in root directory
```bash
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=ethertrust
SESSION_SECRET=your_session_secret
WEB3_PROVIDER=ws://localhost:7545
```

## Start Ganache
- Open Ganache
- Create new workspace
- Set port to 7545
- Import provided smart contract

5. Deploy Smart Contract
```bash
truffle migrate --reset
```

6. Start Server
```bash
npm start
```

The application should now be running at http://localhost:3000



## Common Issues
MetaMask Connection
- Ensure MetaMask is installed
- Connect to correct network (Ganache)
- Reset account if needed

Database Connection
- Check MySQL service is running
- Verify database credentials
- Ensure all tables are created

Smart Contract Issues
- Confirm Ganache is running
- Check contract deployment
- Verify Web3 provider URL

Current Limitations
- Works with local Ganache blockchain only
- Basic milestone verification
- Simple fund recovery mechanism
- Limited user verification

Next Steps
- Enhanced milestone verification system
- Basic fund recovery system
- Simple reputation system
- Essential security improvements
- User experience enhancements


## Queries
- For queries, email harshithkotian999@gmail.com
  
Note: This project is for educational purposes. Use only test ETH for development.

