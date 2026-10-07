export async function recordActivity(
  tx,
  { user, action, orderId, metadata }
) {
  if (!user?.id || !user?.role) {
    throw new Error("Authenticated activity actor is required.");
  }

  return tx.activityLog.create({
    data: {
      actorId: user.id,
      actorRole: user.role,
      action,
      orderId,
      metadata,
    },
  });
}