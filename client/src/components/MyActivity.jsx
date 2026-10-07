import { useEffect, useState } from "react";
import { api } from "../lib/api";

const actionLabels = {
  ORDER_CREATED: "Order created",
  ORDER_RESUBMITTED: "Order resubmitted",
  COMPONENT_COUNT_UPDATED: "Component count saved",
  BATCH_APPROVED: "Batch approved",
  BATCH_REJECTED: "Batch rejected",
  SEWING_STARTED: "Sewing assembly started",
};

function describeActivity(activity) {
  const m = activity.metadata ?? {};
  switch (activity.action) {
    case "ORDER_CREATED":
      return `${m.recipeName ?? "Recipe"} • Quantity ${m.targetQty} • Fabric ${m.actualFabricYds} yards`;
    case "ORDER_RESUBMITTED":
      return `Fabric ${m.previousActualFabricYds} → ${m.newActualFabricYds} yards • Counts reset: ${m.resetComponentCount}`;
    case "COMPONENT_COUNT_UPDATED":
      return `${m.componentName ?? "Component"}: ${m.previousActualQty ?? "Not counted"} → ${m.newActualQty} • Expected ${m.expectedQty} • ${m.newStatus}`;
    case "BATCH_APPROVED":
      return `Released to sewing • Fabric variance ${m.wastagePct ?? "—"}%`;
    case "BATCH_REJECTED":
      return `Reason: ${m.rejectionNote ?? "—"}`;
    case "SEWING_STARTED":
      return `${m.previousStatus} → ${m.newStatus}`;
    default:
      return "Activity recorded.";
  }
}

export default function MyActivity() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api("/activity/my", { signal: controller.signal });
        setActivities(data.activities);
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [reloadKey]);

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>My History</h2>
        <button type="button" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}>
          Refresh history
        </button>
      </div>
      <p>Your latest 50 successful actions only. Refresh after completing an action.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p role="status">Loading history...</p> : error ? null : activities.length === 0 ? (
        <p>No recorded actions yet.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Order</th><th>Details</th></tr></thead>
            <tbody>
              {activities.map((activity) => (
                <tr key={activity.id}>
                  <td>{new Date(activity.createdAt).toLocaleString()}</td>
                  <td>{actionLabels[activity.action] ?? activity.action}</td>
                  <td>{activity.order?.orderNo ?? activity.orderId}</td>
                  <td style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                    {describeActivity(activity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
