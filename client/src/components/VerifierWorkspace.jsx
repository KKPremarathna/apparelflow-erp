import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  QcStatusBadge,
  DecisionButton,
} from "./WorkflowStatus";

function parseCount(value) {
  const text = String(value).trim();

  if (!/^\d+$/.test(text)) return null;

  const count = Number(text);

  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 2147483647
  ) {
    return null;
  }

  return count;
}

function getQcStatus(actual, expected) {
  if (actual === null) return "UNCOUNTED";
  if (actual < expected) return "RED";
  if (actual > expected) return "YELLOW";
  return "GREEN";
}

function VerificationTerminal({ orderId, onClose, onCompleted }) {
  const [order, setOrder] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrder() {
      setLoading(true);
      setError("");

      try {
        const data = await api(
          `/verification/orders/${orderId}`,
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return;

        setOrder(data.order);

        const initialDrafts = Object.fromEntries(
          data.order.verificationItems.map((item) => [
            item.id,
            item.actualQty === null ? "" : String(item.actualQty),
          ])
        );

        setDrafts(initialDrafts);
      } catch (err) {
        if (!controller.signal.aborted && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadOrder();

    return () => controller.abort();
  }, [orderId, reloadKey]);

  const items = order?.verificationItems ?? [];

  const hasUnsavedChanges = items.some((item) => {
    const draft = parseCount(drafts[item.id] ?? "");

    return draft === null || draft !== item.actualQty;
  });

  const allCountsSaved =
    items.length > 0 &&
    items.every((item) => Number.isSafeInteger(item.actualQty)) &&
    !hasUnsavedChanges;

  const hasShortage = items.some(
    (item) =>
      item.actualQty !== null &&
      item.actualQty < item.expectedQty
  );

  const canApprove = allCountsSaved && !hasShortage;

  const validReason =
    reason.trim().length > 0 &&
    reason.trim().length <= 2000;

  async function saveCount(itemId) {
    if (busy) return;

    const actualQty = parseCount(drafts[itemId] ?? "");

    setError("");
    setMessage("");

    if (actualQty === null) {
      setError(
        "Enter a non-negative whole count within the supported range."
      );
      return;
    }

    setBusy(true);

    try {
      const data = await api(`/verification/items/${itemId}`, {
        method: "PATCH",
        body: { actualQty },
      });

      setOrder((current) => ({
        ...current,
        verificationItems: current.verificationItems.map((item) =>
          item.id === itemId ? data.item : item
        ),
      }));

      setDrafts((current) => ({
        ...current,
        [itemId]: String(data.item.actualQty),
      }));

      setMessage("Component count saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecision(decision) {
    if (busy) return;

    setError("");
    setMessage("");

    if (!allCountsSaved) {
      setError("Count and save every component first.");
      return;
    }

    if (decision === "approve" && hasShortage) {
      setError("Approval blocked: component shortages exist.");
      return;
    }

    if (decision === "reject" && !validReason) {
      setError("Enter a rejection reason of 1–2000 characters.");
      return;
    }

    setBusy(true);

    try {
      const data = await api(
        `/verification/orders/${orderId}/${decision}`,
        {
          method: "POST",
          ...(decision === "reject"
            ? { body: { rejectionNote: reason.trim() } }
            : {}),
        }
      );

      onCompleted(orderId, data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function refreshDetails() {
    if (
      (hasUnsavedChanges || reason.trim()) &&
      !window.confirm(
        "Reload saved counts? Unsaved counts and the rejection note will be discarded."
      )
    ) {
      return;
    }

    setMessage("");
    setReason("");
    setReloadKey((current) => current + 1);
  }

  function closeDetails() {
    if (
      (hasUnsavedChanges || reason.trim()) &&
      !window.confirm("Close and discard unsaved inputs?")
    ) {
      return;
    }

    onClose();
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Verification terminal</h2>

        <div>
          <button
            type="button"
            onClick={refreshDetails}
            disabled={busy || loading}
          >
            Reload saved counts
          </button>{" "}

          <button
            type="button"
            onClick={closeDetails}
            disabled={busy}
          >
            Close
          </button>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {message && <p role="status">{message}</p>}

      {loading ? (
        <p role="status">Loading batch...</p>
      ) : !order ? (
        <p>
          Unable to load this pending batch. Close and refresh the list.
        </p>
      ) : (
        <>
          <p style={{ overflowWrap: "anywhere" }}>
            Order: {order.orderNo}
          </p>
          <p>Recipe: {order.recipe.name}</p>
          <p>Supervisor: {order.creator.fullName}</p>
          <p>Target quantity: {order.targetQty}</p>
          <p>Fabric roll: {order.fabricRollId}</p>
          <p>
            Actual fabric:{" "}
            {Number(order.actualFabricYds).toFixed(2)} yards
          </p>

          <p>
            (Enter each physical count and click Save. Preview status
            is not a saved verification result.)
          </p>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Expected</th>
                  <th>Actual input</th>
                  <th>Preview</th>
                  <th>Saved count / status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => {
                  const draft = drafts[item.id] ?? "";
                  const parsed = parseCount(draft);

                  const previewStatus = getQcStatus(
                    parsed,
                    item.expectedQty
                  );

                  const savedStatus = getQcStatus(
                    item.actualQty,
                    item.expectedQty
                  );

                  const isSaved =
                    parsed !== null && parsed === item.actualQty;

                  return (
                    <tr key={item.id}>
                      <td>{item.component.componentName}</td>
                      <td>{item.expectedQty}</td>

                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Actual count for ${item.component.componentName}`}
                          value={draft}
                          disabled={busy}
                          style={{ minWidth: "110px" }}
                          onChange={(event) => {
                            const value = event.target.value;

                            setDrafts((current) => ({
                              ...current,
                              [item.id]: value,
                            }));

                            setMessage("");
                          }}
                        />

                        {draft !== "" && parsed === null && (
                          <p className="error">
                            Use a non-negative whole number.
                          </p>
                        )}
                      </td>

                      <td>
                        <QcStatusBadge status={previewStatus} />
                      </td>

                      <td>
                        <p>{item.actualQty ?? "Not counted"}</p>
                        <QcStatusBadge status={savedStatus} />
                      </td>

                      <td>
                        <button
                          type="button"
                          disabled={busy || parsed === null || isSaved}
                          onClick={() => saveCount(item.id)}
                        >
                          {isSaved ? "Saved" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: "24px",
              paddingTop: "20px",
              borderTop: "1px solid #e5e9f0",
            }}
          >
            {allCountsSaved && hasShortage && (
              <p className="error">
                Shortage detected. Approval is blocked.
              </p>
            )}

            {canApprove && (
              <p style={{ color: "#247343" }}>
                All saved components match or exceed their expected
                counts. This batch can be approved.
              </p>
            )}

            <DecisionButton
              variant="approve"
              type="button"
              disabled={busy || !canApprove}
              onClick={() => handleDecision("approve")}
            >
              {busy ? "Please wait..." : "Approve Batch"}
            </DecisionButton>
          </div>

          <section
            style={{
              marginTop: "24px",
              padding: "20px",
              border: "1px solid #f4bdc5",
              borderRadius: "5px",
              backgroundColor: "#fffafb",
            }}
          >
            <h3 style={{ color: "#b3374b" }}>
              Reject batch
            </h3>

            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              <label htmlFor="rejectionNote">
                Mandatory rejection reason
              </label>

              <textarea
                id="rejectionNote"
                rows={4}
                maxLength={2000}
                value={reason}
                disabled={busy}
                placeholder="Explain why this batch should be rejected..."
                onChange={(event) => setReason(event.target.value)}
              />

              <p
                style={{
                  margin: 0,
                  color: "#8c7580",
                  fontSize: "12px",
                }}
              >
                {reason.trim().length}/2000 characters
              </p>

              <div>
                <DecisionButton
                  variant="reject"
                  type="button"
                  disabled={busy || !allCountsSaved || !validReason}
                  onClick={() => handleDecision("reject")}
                >
                  {busy ? "Please wait..." : "Reject Batch"}
                </DecisionButton>
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

export default function VerifierWorkspace() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPendingOrders() {
      setLoading(true);
      setError("");

      try {
        const data = await api("/verification/pending", {
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setOrders(data.orders);
        }
      } catch (err) {
        if (!controller.signal.aborted && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadPendingOrders();

    return () => controller.abort();
  }, [reloadKey]);

  function handleCompleted(orderId, resultMessage) {
    setOrders((current) =>
      current.filter((order) => order.id !== orderId)
    );

    setSelectedOrderId(null);
    setMessage(resultMessage);
  }

  return (
    <div>
      {selectedOrderId && (
        <VerificationTerminal
          key={selectedOrderId}
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onCompleted={handleCompleted}
        />
      )}

      <section className="panel">
        <div className="section-heading">
          <h2>Pending verification batches</h2>

          <button
            type="button"
            disabled={loading || selectedOrderId !== null}
            onClick={() => {
              setMessage("");
              setReloadKey((current) => current + 1);
            }}
          >
            Refresh list
          </button>
        </div>

        {selectedOrderId && (
          <p>
            Close the current terminal to refresh or select another batch.
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {message && <p role="status">{message}</p>}

        {loading ? (
          <p role="status">Loading pending batches...</p>
        ) : orders.length === 0 ? (
          <p>No pending batches.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Recipe</th>
                  <th>Quantity</th>
                  <th>Supervisor</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNo}</td>
                    <td>{order.recipe.name}</td>
                    <td>{order.targetQty}</td>
                    <td>{order.creator.fullName}</td>
                    <td>
                      <button
                        type="button"
                        disabled={selectedOrderId !== null}
                        onClick={() => {
                          setMessage("");
                          setSelectedOrderId(order.id);

                          window.scrollTo({
                            top: 0,
                            behavior: "smooth",
                          });
                        }}
                      >
                        Verify batch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}