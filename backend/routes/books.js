/**
 * routes/books.js
 */

const express     = require('express');
const router      = express.Router();
const RecordBook  = require('../models/RecordBook');
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.use(protect);

// GET  /api/books — get all books for logged-in user
router.get('/', async (req, res) => {
  try {
    const books = await RecordBook.find({
      userId: req.user._id,
      isArchived: false
    }).lean();

    // Single aggregation across all of the user's books instead of one
    // query per book (avoids N+1 query fan-out as the number of books grows).
    const totals = await Transaction.aggregate([
      { $match: { userId: req.user._id, isDeleted: false } },
      {
        $group: {
          _id: '$bookId',
          totalIncome:  { $sum: { $cond: [{ $eq: ['$type', 'income']  }, '$amount', 0] } },
          totalExpense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } }
        }
      }
    ]);

    const totalsMap = {};
    totals.forEach(t => { totalsMap[t._id.toString()] = t; });

    const booksWithTotals = books.map(book => {
      const t = totalsMap[book._id.toString()];
      return {
        ...book,
        totalIncome:  t ? t.totalIncome  : 0,
        totalExpense: t ? t.totalExpense : 0
      };
    });

    return successResponse(res, {
      books: booksWithTotals
    });

  } catch (e) {
    return errorResponse(res, e.message, 500);
  }
});

// POST /api/books — create a new book
router.post('/', async (req, res) => {
  try {
    const { name, currency, description } = req.body;
    if (!name) return errorResponse(res, 'Book name is required');

    const book = await RecordBook.create({
      userId: req.user._id,
      name, currency, description
    });
    return successResponse(res, { book }, 'Record book created', 201);
  } catch (e) { return errorResponse(res, e.message, 500); }
});

// PUT /api/books/:id — update a book
router.put('/:id', async (req, res) => {
  try {
    const book = await RecordBook.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { name: req.body.name, currency: req.body.currency, description: req.body.description },
      { new: true, runValidators: true }
    );
    if (!book) return errorResponse(res, 'Book not found', 404);
    return successResponse(res, { book }, 'Book updated');
  } catch (e) { return errorResponse(res, e.message, 500); }
});

// DELETE /api/books/:id — archive a book
router.delete('/:id', async (req, res) => {
  try {
    const book = await RecordBook.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isArchived: true },
      { new: true }
    );
    if (!book) return errorResponse(res, 'Book not found', 404);
    return successResponse(res, null, 'Record book archived');
  } catch (e) { return errorResponse(res, e.message, 500); }
});

module.exports = router;