const Notification = require("../models/Notification");
const User = require("../models/User");
const { broadcast } = require("../utils/realtime");

/**
 * Fans an operational event out to every admin account so it lands in the same
 * in-app notification feed buyers already use. `key` makes the write idempotent
 * per admin, so retries or duplicate events never stack up.
 */
exports.notifyAdmins = async ({
  title,
  message,
  type = "admin",
  link = "",
  key = "",
}) => {
  try {
    const admins = await User.find({ role: "admin" }).select("_id");
    if (!admins.length) return;

    await Promise.all(
      admins.map((admin) =>
        key
          ? Notification.updateOne(
              { user: admin._id, key },
              {
                $setOnInsert: {
                  user: admin._id,
                  title,
                  message,
                  type,
                  link,
                  key,
                },
              },
              { upsert: true },
            )
          : Notification.create({
              user: admin._id,
              title,
              message,
              type,
              link,
            }),
      ),
    );

    admins.forEach((admin) =>
      broadcast(
        "admin-updated",
        { title, message, link },
        { userId: admin._id },
      ),
    );
  } catch (error) {
    console.error("Admin notification failed:", error.message);
  }
};
