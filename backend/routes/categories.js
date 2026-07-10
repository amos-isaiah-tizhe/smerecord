/**
 * routes/categories.js
 */

const express    = require('express');
const router     = express.Router();
const Category   = require('../models/Category');
const { protect }= require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.use(protect);

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const filter = { userId: req.user._id };
    if (req.query.type) filter.type = req.query.type;
    const categories = await Category.find(filter).sort({ name: 1 });
    return successResponse(res, { categories });
  } catch (e) { return errorResponse(res, e.message, 500); }
});

// POST /api/categories
router.post('/', async (req, res) => {
  try {
    const { name, type, subCategories, icon, color } = req.body;
    if (!name || !type) return errorResponse(res, 'Name and type are required');

    const category = await Category.create({
      userId: req.user._id,
      name, type,
      subCategories: subCategories || [],
      icon, color
    });
    return successResponse(res, { category }, 'Category created', 201);
  } catch (e) {
    if (e.code === 11000) return errorResponse(res, 'Category with this name already exists');
    return errorResponse(res, e.message, 500);
  }
});

// PUT /api/categories/:id — update (add/remove subcategories)
router.put('/:id', async (req, res) => {
  try {
    const cat = await Category.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { name: req.body.name, subCategories: req.body.subCategories, icon: req.body.icon, color: req.body.color },
      { new: true, runValidators: true }
    );
    if (!cat) return errorResponse(res, 'Category not found', 404);
    return successResponse(res, { category: cat }, 'Category updated');
  } catch (e) { return errorResponse(res, e.message, 500); }
});

// DELETE /api/categories/:id
router.delete('/:id', async (req, res) => {
  try {
    const cat = await Category.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!cat) return errorResponse(res, 'Category not found', 404);
    return successResponse(res, null, 'Category deleted');
  } catch (e) { return errorResponse(res, e.message, 500); }
});

module.exports = router;
