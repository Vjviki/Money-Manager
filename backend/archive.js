// No external side effects in transaction callbacks: MongoDB can retry them.
const transactionOptions = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } };
const MAX_ARCHIVE_SIZE = 10000;

function createArchiveService({ mongoose, User, Transaction, Backup, ArchiveReset }) {
  async function locked(userId, work) {
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        // Serialize archives and detected-payment uploads for this account, including
        // across server processes. This prevents retries re-creating archived payments.
        const owner = await User.updateOne({ _id: userId }, { $inc: { archive_revision: 1 } }, { session });
        if (!owner.matchedCount) throw new Error('Account no longer exists');
        return work(session);
      }, transactionOptions);
    } finally { await session.endSession(); }
  }

  async function addTransaction(data) {
    if (!data.detected_id) return Transaction.create(data);
    return locked(data.user_id, async session => {
      const identity = { user_id: data.user_id, detected_id: data.detected_id };
      if (await Transaction.exists(identity).session(session) || await Backup.exists(identity).session(session)) return;
      await Transaction.create([data], { session });
    });
  }

  async function archive(userId, requestId) {
    const identity = { user_id: userId, request_id: requestId };
    const completed = await ArchiveReset.findOne(identity).lean();
    if (completed) return completed.archived_count;
    // Freeze the selection before the retryable transaction. New arrivals are never
    // included by a transaction retry, even when they have backdated payment dates.
    const selection = await Transaction.find({ user_id: userId }).select('_id').limit(MAX_ARCHIVE_SIZE + 1).lean();
    if (selection.length > MAX_ARCHIVE_SIZE) throw Object.assign(new Error('Archive too large'), { status: 413 });
    const filter = { user_id: userId, _id: { $in: selection.map(row => row._id) } };
    return locked(userId, async session => {
      const previous = await ArchiveReset.findOne(identity).session(session).lean();
      if (previous) return previous.archived_count;
      const rows = await Transaction.find(filter).session(session).lean();
      if (rows.length) {
        await Backup.insertMany(rows.map(row => ({
          user_id: row.user_id, source_id: row._id,
          title: row.title, amount: row.amount, type: row.type, category: row.category,
          ...(row.detected_id ? { detected_id: row.detected_id } : {}),
          date: new Date(row.created_at).toISOString(),
          backup_month: new Date(row.created_at).toISOString().slice(0, 7),
        })), { session });
        const deleted = await Transaction.deleteMany({ user_id: userId, _id: { $in: rows.map(row => row._id) } }, { session });
        if (deleted.deletedCount !== rows.length) throw new Error('Archive selection changed');
      }
      await ArchiveReset.create([{ ...identity, archived_count: rows.length }], { session });
      return rows.length;
    });
  }
  return { archive, addTransaction };
}
module.exports = { createArchiveService };
