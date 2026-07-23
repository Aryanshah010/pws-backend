const Notification = require("../models/Notification");
const templates = require("./messageTemplates");

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
  }
};

exports.wholesaleKey = (user) => `wholesale:${user.wholesaleStatus}`;
