function monthRange(month) {
  if (typeof month !== 'string' || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month)) {
    throw Object.assign(new Error('Choose a valid month between 2000 and 2099'), { status: 400 });
  }
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}
function budgetInput(body) {
  const category = typeof body?.category === 'string' ? body.category.trim() : '';
  const amount = body?.amount;
  if (!category || category.length > 80 || typeof amount !== 'number' || !Number.isFinite(amount) ||
      amount < 0.01 || amount > 1000000000 || Number(amount.toFixed(2)) !== amount) {
    throw Object.assign(new Error('Enter a category and a positive budget with at most two decimal places'), { status: 400 });
  }
  return { category, category_key: category.toLowerCase(), limit_paise: Math.round(amount * 100) };
}
function progress(budget, spent) {
  const spentPaise = Math.round(spent * 100);
  const remaining = budget.limit_paise - spentPaise;
  const status = remaining < 0 ? 'exceeded' : remaining === 0 ? 'reached'
    : spentPaise >= budget.limit_paise * 0.8 ? 'warning' : 'on-track';
  return { _id: budget._id, category: budget.category, amount: budget.limit_paise / 100,
    spent: spentPaise / 100, remaining: remaining / 100,
    percent: Math.round(spentPaise / budget.limit_paise * 1000) / 10, status };
}
function createBudgetHandlers({ mongoose, Budget, Transaction, Backup }) {
  const failure = (res, error) => res.status(error.status || 503).json({ error: error.status
    ? error.message : 'Unable to load or save budgets right now. Please retry.' });
  const group = { $group: { _id: { $trim: { input: { $ifNull: ['$category', 'Other'] } } }, spent: { $sum: '$amount' } } };
  return {
    list: async (req, res) => {
      let session;
      try {
        const { start, end } = monthRange(req.query.month);
        const user_id = new mongoose.Types.ObjectId(req.user.id);
        session = await mongoose.startSession();
        // One consistent snapshot across active and archived collections prevents
        // double-counting/omission while an archive transaction moves payments.
        const result = await session.withTransaction(async () => {
          const budgets = await Budget.find({ user_id, month: req.query.month }).sort({ category_key: 1 }).session(session).lean();
          const active = await Transaction.aggregate([
            { $match: { user_id, type: 'Expenses', created_at: { $gte: start, $lt: end } } }, group,
          ]).session(session).option({ maxTimeMS: 10000 });
          const [archived] = await Backup.aggregate([
            { $match: { user_id, type: 'Expenses' } },
            { $set: { payment_date: { $convert: { input: '$date', to: 'date', onError: null, onNull: null } } } },
            { $facet: {
              spending: [{ $match: { payment_date: { $gte: start, $lt: end } } }, group],
              unreadable: [{ $match: { payment_date: null } }, { $count: 'count' }],
            } },
          ]).session(session).option({ maxTimeMS: 10000 });
          const spending = new Map();
          const categories = new Map();
          for (const row of [...active, ...(archived?.spending || [])]) {
            const key = row._id.toLowerCase();
            spending.set(key, (spending.get(key) || 0) + row.spent);
            if (row._id) categories.set(key, row._id);
          }
          return { month: req.query.month, budgets: budgets.map(b => progress(b, spending.get(b.category_key) || 0)),
            categories: [...categories.values()].sort(), unreadableArchiveDates: archived?.unreadable[0]?.count || 0 };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
        res.json(result);
      } catch (error) { failure(res, error); }
      finally { if (session) await session.endSession(); }
    },
    save: async (req, res) => {
      try {
        monthRange(req.params.month);
        const input = budgetInput(req.body);
        const identity = { user_id: req.user.id, month: req.params.month, category_key: input.category_key };
        try { await Budget.updateOne(identity, { $set: input }, { upsert: true, runValidators: true }); }
        catch (error) {
          if (error.code !== 11000) throw error;
          // A simultaneous first save won the unique key; update that same budget.
          await Budget.updateOne(identity, { $set: input }, { runValidators: true });
        }
        res.json({ message: 'Budget saved' });
      } catch (error) { failure(res, error); }
    },
    remove: async (req, res) => {
      try {
        monthRange(req.params.month);
        if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid budget ID' });
        const result = await Budget.deleteOne({ _id: req.params.id, user_id: req.user.id, month: req.params.month });
        if (!result.deletedCount) return res.status(404).json({ error: 'Budget not found' });
        res.json({ message: 'Budget removed' });
      } catch (error) { failure(res, error); }
    },
  };
}
module.exports = { monthRange, budgetInput, progress, createBudgetHandlers };
