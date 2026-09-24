const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const invalid = () => Object.assign(new Error('Invalid transaction filters'), { status: 400 });
function string(query, key, max = 200) {
  const value = query[key];
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max) throw invalid();
  return value.trim();
}
function integer(query, key, fallback, max) {
  if (query[key] === undefined) return fallback;
  const value = string(query, key, 10);
  if (!/^[1-9]\d*$/.test(value) || Number(value) > max) throw invalid();
  return Number(value);
}
function parseTransactionQuery(query, userId) {
  const filter = { user_id: userId };
  const page = integer(query, 'page', 1, 1000000);
  const limit = integer(query, 'limit', 20, 100);
  const q = string(query, 'q');
  const type = string(query, 'type', 20);
  const category = string(query, 'category');
  if (type && type !== 'ALL') {
    if (!['Income', 'Expenses'].includes(type)) throw invalid();
    filter.type = type;
  }
  if (category && category !== 'ALL') filter.category = { $regex: `^\\s*${escapeRegex(category)}\\s*$`, $options: 'i' };
  if (q) filter.$or = ['title', 'category'].map(key => ({ [key]: { $regex: escapeRegex(q), $options: 'i' } }));
  for (const key of ['from', 'to']) {
    const value = string(query, key, 30);
    if (!value) continue;
    // Explicit UTC instants; frontend converts local date-picker boundaries.
    const date = new Date(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString() !== value) throw invalid();
    filter.created_at ||= {};
    filter.created_at[key === 'from' ? '$gte' : '$lt'] = date;
  }
  if (filter.created_at?.$gte && filter.created_at?.$lt && filter.created_at.$gte >= filter.created_at.$lt) throw invalid();
  const categories = string(query, 'categories', 1);
  if (categories && categories !== '1') throw invalid();
  return { filter, page, limit, includeCategories: categories === '1' };
}

function createTransactionQueries(Transaction, mongoose) {
  async function summary(userId) {
    const [totals] = await Transaction.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, transactionCount: { $sum: 1 },
        income: { $sum: { $cond: [{ $eq: ['$type', 'Income'] }, '$amount', 0] } },
        expenses: { $sum: { $cond: [{ $eq: ['$type', 'Expenses'] }, '$amount', 0] } },
      } },
    ]).option({ maxTimeMS: 10000 });
    const { income = 0, expenses = 0, transactionCount = 0 } = totals || {};
    return { income, expenses, balance: income - expenses, transactionCount };
  }
  async function list(userId, query) {
    const { filter, page, limit, includeCategories } = parseTransactionQuery(query, userId);
    const total = await Transaction.countDocuments(filter).maxTimeMS(10000);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(page, totalPages);
    const transactions = await Transaction.find(filter)
      .select('title amount type category created_at detected_id')
      .sort({ created_at: -1, _id: -1 }).skip((currentPage - 1) * limit).limit(limit)
      .maxTimeMS(10000).lean();
    const result = { transactions, total, page: currentPage, limit, totalPages };
    if (includeCategories) {
      // Options come from the whole account, not only the current page/filter.
      const rows = await Transaction.aggregate([
        { $match: { user_id: new mongoose.Types.ObjectId(userId), category: { $type: 'string' } } },
        { $project: { label: { $trim: { input: '$category' } } } },
        { $match: { label: { $ne: '' } } },
        { $sort: { label: 1 } },
        { $group: { _id: { $toLower: '$label' }, label: { $first: '$label' } } },
        { $sort: { _id: 1 } },
      ]).option({ maxTimeMS: 10000 });
      result.categories = rows.map(row => row.label);
    }
    return result;
  }
  return { summary, list };
}
module.exports = { parseTransactionQuery, createTransactionQueries };
