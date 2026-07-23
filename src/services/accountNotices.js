const Notification = require("../models/Notification");
const templates = require("./messageTemplates");

/**
 * The bell entry that describes a buyer's current wholesale standing.
 *
 * The decision itself already writes one, but that is a single moment in time:
 * an account approved before this existed, or one whose write was lost to a
 * failed SMS, ends up verified with nothing in the bell to say so. Reconciling
 * on read means the buyer's standing is always represented, and the keyed
 * upsert means running it on every fetch can never duplicate.
 */
const noticeFor = (user) => {
  if (user.wholesaleStatus === "approved")
    return templates.wholesaleDecision(true).inApp;
  if (user.wholesaleStatus === "rejected")
    return templates.wholesaleDecision(false).inApp;
  if (user.wholesaleStatus === "pending")
    return templates.wholesaleSubmitted(user).inApp;
  return null;
};

exports.ensureWholesaleNotice = async (user) => {
  const notice = noticeFor(user);
  if (!notice) return;

  const key = `wholesale:${user.wholesaleStatus}`;

  try {
    // Adopt an entry written before notifications carried a key or a link,
    // so it becomes tappable instead of being duplicated by the upsert below.
    await Notification.updateOne(
      { user: user._id, type: "wholesale", key: "", title: notice.title },
      { $set: { key, link: notice.link } },
    );

    await Notification.updateOne(
      { user: user._id, key },
      {
        $setOnInsert: {
          ...notice,
          user: user._id,
          type: "wholesale",
          key,
        },
      },
      { upsert: true },
    );
  } catch {
    // Reconciliation is a convenience — never let it break the bell itself.
  }
};

exports.wholesaleKey = (user) => `wholesale:${user.wholesaleStatus}`;
