/**
 * controllers/transactionController.js
 *
 * Handles creating, reading, updating, and deleting transactions.
 * This is called CRUD (Create, Read, Update, Delete).
 */

const Transaction = require('../models/Transaction');
const { successResponse, errorResponse, escapeRegex } = require('../utils/helpers');

// ─────────────────────────────────────────
// CREATE TRANSACTION
// POST /api/transactions
// ─────────────────────────────────────────
const createTransaction = async (req, res) => {
  try {
    const {
      bookId, type, amount, paymentMethod,
      category, subCategory, description,
      date, referenceNumber, tags
    } = req.body;

    const tx = await Transaction.create({
      userId:          req.user._id,  // from JWT middleware
      bookId,
      type,
      amount:          parseFloat(amount),
      paymentMethod:   paymentMethod || 'cash',
      category:        category || 'Uncategorized',
      subCategory:     subCategory || '',
      description:     description || '',
      date:            new Date(date),
      referenceNumber: referenceNumber || '',
      tags:            tags || []
    });

    return successResponse(res, { transaction: tx }, 'Transaction saved', 201);

  } catch (error) {
    return errorResponse(res, error.message || 'Failed to save transaction', 500);
  }
};

// ─────────────────────────────────────────
// GET ALL TRANSACTIONS (with filtering)
// GET /api/transactions?bookId=xxx&type=income&from=2024-01-01&to=2024-12-31
// ─────────────────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const {
      bookId, type, paymentMethod,
      category, from, to,
      search, page = 1, limit = 50,
      sortBy = 'date', sortOrder = 'desc'
    } = req.query;

    // Build a MongoDB filter object
    // We start with the user's ID so they only see their own data
    const filter = {
      userId:    req.user._id,
      isDeleted: false
    };

    if (bookId)        filter.bookId        = bookId;
    if (type)          filter.type          = type;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (category)      filter.category      = category;

    // Date range filter
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);  // $gte = greater than or equal
      if (to)   filter.date.$lte = new Date(to);    // $lte = less than or equal
    }

    // Text search across description and category
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { description: { $regex: safeSearch, $options: 'i' } }, // case-insensitive
        { category:    { $regex: safeSearch, $options: 'i' } }
      ];
    }

    // Pagination: skip past previous pages
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Execute the query
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter)
    ]);

    return successResponse(res, {
      transactions,
      pagination: {
        total,
        page:       parseInt(page),
        limit:      parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// ─────────────────────────────────────────
// GET SINGLE TRANSACTION
// GET /api/transactions/:id
// ─────────────────────────────────────────
const getTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findOne({
      _id:       req.params.id,
      userId:    req.user._id,
      isDeleted: false
    });

    if (!tx) return errorResponse(res, 'Transaction not found', 404);

    return successResponse(res, { transaction: tx });

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// ─────────────────────────────────────────
// UPDATE TRANSACTION
// PUT /api/transactions/:id
// ─────────────────────────────────────────
const updateTransaction = async (req, res) => {
  try {
    const allowedFields = [
      'type', 'amount', 'paymentMethod',
      'category', 'subCategory', 'description',
      'date', 'referenceNumber', 'tags'
    ];

    // Only update the fields that were sent
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.amount) updates.amount = parseFloat(updates.amount);
    if (updates.date)   updates.date   = new Date(updates.date);

    const tx = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      updates,
      { new: true, runValidators: true }
    );

    if (!tx) return errorResponse(res, 'Transaction not found', 404);

    return successResponse(res, { transaction: tx }, 'Transaction updated');

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// ─────────────────────────────────────────
// DELETE TRANSACTION (soft delete)
// DELETE /api/transactions/:id
// ─────────────────────────────────────────
const deleteTransaction = async (req, res) => {
  try {
    const tx = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isDeleted: true },
      { new: true }
    );

    if (!tx) return errorResponse(res, 'Transaction not found', 404);

    return successResponse(res, null, 'Transaction deleted');

  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  createTransaction,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction
};
