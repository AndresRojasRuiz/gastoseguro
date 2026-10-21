import { Router } from 'express';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { clientInfo } from '../middleware/request-context.js';
import { uuidParam } from '../schemas/common.js';
import { CategoryCreateSchema, CategoryUpdateSchema } from '../schemas/index.js';
import * as categoryService from '../services/category.service.js';

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);

categoriesRouter.get('/', async (req, res) => {
  res.json(await categoryService.listCategories(requireAuth(req)));
});

categoriesRouter.post('/', async (req, res) => {
  const input = CategoryCreateSchema.parse(req.body);
  res.status(201).json(await categoryService.createCategory(requireAuth(req), input, clientInfo(req)));
});

categoriesRouter.patch('/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  const input = CategoryUpdateSchema.parse(req.body);
  res.json(await categoryService.updateCategory(requireAuth(req), id, input, clientInfo(req)));
});

categoriesRouter.delete('/:id', async (req, res) => {
  const { id } = uuidParam.parse(req.params);
  await categoryService.deleteCategory(requireAuth(req), id, clientInfo(req));
  res.status(204).end();
});
