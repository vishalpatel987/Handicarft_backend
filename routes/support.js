const express = require('express');
const router = express.Router();
const {
  setSocketInstance,
  createSupportQuery,
  getAllSupportQueries,
  getSupportQueryById,
  addQueryResponse,
  updateQueryStatus,
  createSupportTicket,
  getAllSupportTickets,
  getSupportTicketById,
  addTicketMessage,
  updateTicketStatus
} = require('../controllers/supportController');

const { authenticateToken, isAdmin } = require('../middleware/auth');

// Set socket instance when routes are loaded
router.use((req, res, next) => {
  if (req.app.get('io')) {
    setSocketInstance(req.app.get('io'));
    console.log('Socket instance set in support routes');
  } else {
    console.log('No socket instance available in support routes');
  }
  next();
});

// ==================== SUPPORT QUERIES ====================

// Create a new support query (Public - no auth required)
router.post('/queries', createSupportQuery);

// Get all support queries (Admin only) or user-specific queries (User can access their own)
router.get('/queries', authenticateToken, getAllSupportQueries);

// Get support query by ID (Admin only)
router.get('/queries/:id', authenticateToken, isAdmin, getSupportQueryById);

// Add response to support query (Authenticated users can add responses to their own queries)
router.post('/queries/:id/response', authenticateToken, addQueryResponse);

// Update support query status (Admin only)
router.put('/queries/:id/status', authenticateToken, isAdmin, updateQueryStatus);

// ==================== SUPPORT TICKETS ====================

// Create a new support ticket (Public - no auth required)
router.post('/tickets', createSupportTicket);

// Get all support tickets (Admin only) or user-specific tickets (User can access their own)
router.get('/tickets', authenticateToken, getAllSupportTickets);

// Get support ticket by ID (Admin only)
router.get('/tickets/:id', authenticateToken, isAdmin, getSupportTicketById);

// Add message to support ticket (Authenticated users can add messages to their own tickets)
router.post('/tickets/:id/message', authenticateToken, addTicketMessage);

// Update support ticket status (Admin only)
router.put('/tickets/:id/status', authenticateToken, isAdmin, updateTicketStatus);


module.exports = router;
