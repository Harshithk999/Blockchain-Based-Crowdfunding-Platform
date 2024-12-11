// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Crowdfunding {
    struct Milestone {
        string description;
        uint256 amount;
        bool submitted;
        bool approved;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 votingEndTime;
        mapping(address => bool) hasVoted;
    }

    struct Campaign {
        address payable creator;
        uint256 goal;
        uint256 pledged;
        uint256 startTime;
        uint256 endTime;
        bool claimed;
        mapping(address => uint256) pledges;
        mapping(uint256 => Milestone) milestones;
        uint256 currentMilestone;
        bool exists;
    }

    mapping(uint256 => Campaign) public campaigns;
    uint256 public campaignCount;
    uint256 constant VOTING_DURATION = 7 days;
    uint256 constant MILESTONE_COUNT = 4;
    uint256 constant MILESTONE_PERCENTAGE = 25;

    event CampaignCreated(uint256 id, address creator, uint256 goal, uint256 startTime, uint256 endTime);
    event PledgeReceived(uint256 id, address contributor, uint256 amount);
    event MilestoneSubmitted(uint256 id, uint256 milestoneNumber, string description);
    event MilestoneVoted(uint256 id, uint256 milestoneNumber, address voter, bool vote);
    event MilestoneApproved(uint256 id, uint256 milestoneNumber, uint256 amount);
    event FundsReleased(uint256 id, uint256 milestoneNumber, uint256 amount);
    event FundsRefunded(uint256 id, address contributor, uint256 amount);

    modifier campaignExists(uint256 _id) {
        require(campaigns[_id].exists, "Campaign does not exist");
        _;
    }

    modifier onlyCreator(uint256 _id) {
        require(msg.sender == campaigns[_id].creator, "Only creator can call this");
        _;
    }

    modifier campaignActive(uint256 _id) {
        require(block.timestamp <= campaigns[_id].endTime, "Campaign has ended");
        _;
    }

    function createCampaign(uint256 _goal, uint256 _durationInDays) public {
        require(_goal > 0, "Goal must be greater than 0");
        require(_durationInDays > 0, "Duration must be greater than 0");

        campaignCount++;
        Campaign storage newCampaign = campaigns[campaignCount];
        
        newCampaign.creator = payable(msg.sender);
        newCampaign.goal = _goal;
        newCampaign.startTime = block.timestamp;
        newCampaign.endTime = block.timestamp + (_durationInDays * 1 days);
        newCampaign.exists = true;
        newCampaign.claimed = false;
        newCampaign.currentMilestone = 0;

        emit CampaignCreated(
            campaignCount, 
            msg.sender, 
            _goal, 
            newCampaign.startTime, 
            newCampaign.endTime
        );
    }

      function pledge(uint256 _id) public payable {
        Campaign storage campaign = campaigns[_id];
        require(campaign.exists, "Campaign does not exist");
        require(!campaign.claimed, "Campaign funds have been claimed");
        require(msg.value > 0, "Pledge amount must be greater than 0");
        
        uint256 newTotal = campaign.pledged + msg.value;
        require(newTotal <= campaign.goal, "Pledge exceeds campaign goal");

        campaign.pledged += msg.value;
        campaign.pledges[msg.sender] += msg.value;

        emit PledgeReceived(_id, msg.sender, msg.value);
    }

    function submitMilestone(uint256 _id, string memory _description) public 
    campaignExists(_id) 
    onlyCreator(_id) {
        Campaign storage campaign = campaigns[_id];
        require(campaign.pledged >= campaign.goal, "Campaign goal not reached");
        require(campaign.currentMilestone < MILESTONE_COUNT, "All milestones completed");
        
        Milestone storage milestone = campaign.milestones[campaign.currentMilestone];
        require(!milestone.submitted, "Milestone already submitted");

        milestone.description = _description;
        milestone.amount = (campaign.goal * MILESTONE_PERCENTAGE) / 100;
        milestone.submitted = true;
        milestone.votingEndTime = block.timestamp + VOTING_DURATION;

        emit MilestoneSubmitted(_id, campaign.currentMilestone, _description);
    }

    function voteMilestone(uint256 _id, bool _vote) public campaignExists(_id) {
        Campaign storage campaign = campaigns[_id];
        require(campaign.pledges[msg.sender] > 0, "Only contributors can vote");
        
        Milestone storage milestone = campaign.milestones[campaign.currentMilestone];
        require(milestone.submitted, "Milestone not submitted");
        require(!milestone.approved, "Milestone already approved");
        require(block.timestamp <= milestone.votingEndTime, "Voting period ended");
        require(!milestone.hasVoted[msg.sender], "Already voted");

        if (_vote) {
            milestone.yesVotes++;
        } else {
            milestone.noVotes++;
        }
        milestone.hasVoted[msg.sender] = true;

        emit MilestoneVoted(_id, campaign.currentMilestone, msg.sender, _vote);

        // Check if milestone is approved
        if (milestone.yesVotes > getTotalInvestors(_id) / 2) {
            approveMilestone(_id);
        }
    }

function approveMilestone(uint256 _id) internal campaignExists(_id) {
    Campaign storage campaign = campaigns[_id];
    Milestone storage milestone = campaign.milestones[campaign.currentMilestone];
    require(milestone.submitted, "Milestone not submitted");
    require(!milestone.approved, "Milestone already approved");
    require(milestone.yesVotes > getTotalInvestors(_id) / 2, "Not enough votes");

    milestone.approved = true;
    uint256 releaseAmount = (campaign.goal * MILESTONE_PERCENTAGE) / 100;

    // Transfer milestone amount to creator
    (bool success, ) = campaign.creator.call{value: releaseAmount}("");
    require(success, "Transfer failed");

    campaign.currentMilestone++;

    emit MilestoneApproved(_id, campaign.currentMilestone - 1, releaseAmount);
    emit FundsReleased(_id, campaign.currentMilestone - 1, releaseAmount);
}
    function refund(uint256 _id) public campaignExists(_id) {
        Campaign storage campaign = campaigns[_id];
        require(block.timestamp > campaign.endTime, "Campaign has not ended");
        require(campaign.pledged < campaign.goal || 
                (campaign.milestones[campaign.currentMilestone].votingEndTime < block.timestamp && 
                campaign.milestones[campaign.currentMilestone].noVotes > campaign.milestones[campaign.currentMilestone].yesVotes),
                "No refund available");

        uint256 amount = campaign.pledges[msg.sender];
        require(amount > 0, "No funds to refund");

        campaign.pledges[msg.sender] = 0;
        campaign.pledged -= amount;

        payable(msg.sender).transfer(amount);

        emit FundsRefunded(_id, msg.sender, amount);
    }

    // Helper functions
    function getTotalInvestors(uint256 _id) private view returns (uint256) {
        Campaign storage campaign = campaigns[_id];
        uint256 count = 0;
        // Note: This is a simplified way to count investors
        // In production, maintain a separate array of investors
        for (uint256 i = 0; i < campaignCount; i++) {
            if (campaign.pledges[address(uint160(i))] > 0) {
                count++;
            }
        }
        return count;
    }

    function getCampaignDetails(uint256 _id) public view returns (
        address creator,
        uint256 goal,
        uint256 pledged,
        uint256 startTime,
        uint256 endTime,
        bool claimed,
        uint256 currentMilestone
    ) {
        Campaign storage campaign = campaigns[_id];
        return (
            campaign.creator,
            campaign.goal,
            campaign.pledged,
            campaign.startTime,
            campaign.endTime,
            campaign.claimed,
            campaign.currentMilestone
        );
    }

    function getMilestoneDetails(uint256 _id, uint256 _milestone) public view returns (
        string memory description,
        uint256 amount,
        bool submitted,
        bool approved,
        uint256 yesVotes,
        uint256 noVotes,
        uint256 votingEndTime,
        bool hasVoted
    ) {
        Campaign storage campaign = campaigns[_id];
        Milestone storage milestone = campaign.milestones[_milestone];
        return (
            milestone.description,
            milestone.amount,
            milestone.submitted,
            milestone.approved,
            milestone.yesVotes,
            milestone.noVotes,
            milestone.votingEndTime,
            milestone.hasVoted[msg.sender]
        );
    }

    function getPledgeAmount(uint256 _id, address _contributor) public view returns (uint256) {
        return campaigns[_id].pledges[_contributor];
    }

    function getMilestoneCount() public pure returns (uint256) {
        return MILESTONE_COUNT;
    }

    function getMilestonePercentage() public pure returns (uint256) {
        return MILESTONE_PERCENTAGE;
    }
}