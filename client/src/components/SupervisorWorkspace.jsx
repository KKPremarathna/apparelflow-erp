import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import SupervisorOrderDetails from "./SupervisorOrderDetails";
import "./WorkspaceLayouts.css";

const emptyForm = {
  recipeId: "",
  targetQty: "",
  fabricRollId: "",
  actualFabricYds: "",
};

function validateForm(form, recipe) {
  const errors = {};

  const quantityText = form.targetQty.trim();
  const fabricText = form.actualFabricYds.trim();

  const quantity = Number(quantityText);
  const fabric = Number(fabricText);

  if (!recipe) {
    errors.recipeId = "Select a recipe.";
  }

  if (
    !/^\d+$/.test(quantityText) ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    errors.targetQty = "Enter a positive whole number.";
  } else if (
    recipe?.components.some((component) => {
      const expected = component.piecesPerGarment * quantity;

      return (
        !Number.isSafeInteger(expected) ||
        expected <= 0 ||
        expected > 2147483647
      );
    })
  ) {
    errors.targetQty = "Quantity exceeds supported component counts.";
  }

  const rollId = form.fabricRollId.trim();

  if (!rollId || rollId.length > 100) {
    errors.fabricRollId =
      "Enter a fabric roll ID of 1–100 characters.";
  }

  if (
    !/^\d+(\.\d{1,2})?$/.test(fabricText) ||
    !Number.isFinite(fabric) ||
    fabric <= 0 ||
    fabric > 99999999.99
  ) {
    errors.actualFabricYds =
      "Enter positive fabric yards with at most 2 decimal places.";
  }

  return errors;
}

function FormField({ label, name, error, children, hint }) {
  return (
    <div className="af-form-field">
      <label htmlFor={name}>{label}</label>
      {children}

      {hint && <p className="af-field-hint">{hint}</p>}

      {error && (
        <p id={`${name}-error`} className="af-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

function ChecklistItem({ complete, children }) {
  return (
    <li className={complete ? "af-check-complete" : ""}>
      <span className="af-check-icon" aria-hidden="true">
        {complete ? "✓" : "○"}
      </span>
      <span>{children}</span>
      <span className="af-sr-only">
        {complete ? " — complete" : " — incomplete"}
      </span>
    </li>
  );
}

export default function SupervisorWorkspace() {
  const [recipes, setRecipes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ ...emptyForm });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const detailsRef = useRef(null);

  const selectedRecipe = recipes.find(
    (recipe) => recipe.id === form.recipeId
  );

  const fieldErrors = validateForm(form, selectedRecipe);
  const quantity = Number(form.targetQty);

  const validQuantity =
    /^\d+$/.test(form.targetQty.trim()) &&
    Number.isSafeInteger(quantity) &&
    quantity > 0 &&
    !fieldErrors.targetQty;

  const validFabric = !fieldErrors.actualFabricYds;
  const validRoll = !fieldErrors.fabricRollId;
  const readyToSubmit = Object.keys(fieldErrors).length === 0;

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorkspace() {
      setLoading(true);
      setError("");

      try {
        const [recipeData, orderData] = await Promise.all([
          api("/recipes", { signal: controller.signal }),
          api("/orders", { signal: controller.signal }),
        ]);

        if (!controller.signal.aborted) {
          setRecipes(recipeData.recipes);
          setOrders(orderData.orders);
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

    loadWorkspace();

    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    if (selectedOrderId && !loading) {
      detailsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedOrderId, loading]);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setSuccess("");
  }

  function handleViewDetails(orderId) {
    setSelectedOrderId(orderId);

    if (selectedOrderId === orderId) {
      detailsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  async function handleCreate(event) {
    event.preventDefault();

    if (saving) return;

    setSubmitted(true);
    setError("");
    setSuccess("");

    if (Object.keys(fieldErrors).length > 0) {
      return;
    }

    setSaving(true);

    try {
      const data = await api("/orders", {
        method: "POST",
        body: {
          recipeId: form.recipeId,
          targetQty: Number(form.targetQty),
          fabricRollId: form.fabricRollId.trim(),
          actualFabricYds: Number(form.actualFabricYds),
        },
      });

      setOrders((current) => [data.order, ...current]);
      setForm({ ...emptyForm });
      setSubmitted(false);
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleResubmitted(updatedOrder) {
    setOrders((current) =>
      current.map((order) =>
        order.id === updatedOrder.id
          ? { ...order, ...updatedOrder }
          : order
      )
    );
  }

  function handleRefresh() {
    setSuccess("");
    setReloadKey((current) => current + 1);
  }

  function visibleError(name) {
    return submitted ? fieldErrors[name] : undefined;
  }

  function fieldAccessibility(name) {
    const currentError = visibleError(name);

    return {
      "aria-invalid": Boolean(currentError),
      "aria-describedby": currentError
        ? `${name}-error`
        : undefined,
    };
  }

  if (loading) {
    return (
      <section className="panel">
        <p role="status">Loading Supervisor workspace...</p>
      </section>
    );
  }

  return (
    <div>
      <section className="panel af-layout-panel">
        <div className="section-heading af-section-heading">
          <div>
            <p className="af-kicker">NEW PRODUCTION BATCH</p>
            <h2>Create cutting order</h2>
            <p className="af-subtitle">
              Enter batch details and review the preview before submitting.
            </p>
          </div>

          <span className="af-badge af-badge-neutral">
            Cutting preparation
          </span>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="af-success" role="status">
            {success}
          </p>
        )}

        <div className="af-create-grid">
          <div className="af-form-card">
            <div className="af-card-heading">
              <span className="af-card-icon" aria-hidden="true">
                01
              </span>
              <div>
                <h3>Order information</h3>
                <p>All four fields are required</p>
              </div>
            </div>

            <form
              className="af-order-form"
              onSubmit={handleCreate}
              noValidate
            >
              <FormField
                label="Recipe"
                name="recipeId"
                error={visibleError("recipeId")}
              >
                <select
                  id="recipeId"
                  name="recipeId"
                  value={form.recipeId}
                  onChange={updateField}
                  disabled={saving || recipes.length === 0}
                  required
                  {...fieldAccessibility("recipeId")}
                >
                  <option value="">Select a recipe</option>

                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.recipeCode} — {recipe.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <div className="af-form-row">
                <FormField
                  label="Target batch quantity"
                  name="targetQty"
                  error={visibleError("targetQty")}
                >
                  <input
                    id="targetQty"
                    name="targetQty"
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 50"
                    value={form.targetQty}
                    onChange={updateField}
                    disabled={saving}
                    required
                    {...fieldAccessibility("targetQty")}
                  />
                </FormField>

                <FormField
                  label="Fabric roll ID"
                  name="fabricRollId"
                  error={visibleError("fabricRollId")}
                >
                  <input
                    id="fabricRollId"
                    name="fabricRollId"
                    type="text"
                    maxLength={100}
                    placeholder="FAB-ROLL-882"
                    value={form.fabricRollId}
                    onChange={updateField}
                    disabled={saving}
                    required
                    {...fieldAccessibility("fabricRollId")}
                  />
                </FormField>
              </div>

              <FormField
                label="Actual fabric used (yards)"
                name="actualFabricYds"
                error={visibleError("actualFabricYds")}
                hint="Enter the actual amount used, with up to 2 decimal places."
              >
                <input
                  id="actualFabricYds"
                  name="actualFabricYds"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 95.00"
                  value={form.actualFabricYds}
                  onChange={updateField}
                  disabled={saving}
                  required
                  {...fieldAccessibility("actualFabricYds")}
                />
              </FormField>

              <div className="af-form-submit">
                <p className="af-subtitle">
                  Submit this batch for cutting verification.
                </p>

                <button
                  type="submit"
                  disabled={saving || recipes.length === 0}
                >
                  {saving
                    ? "Creating..."
                    : "Create & Submit for Verification"}
                </button>
              </div>
            </form>

            {recipes.length === 0 && (
              <p className="af-empty">
                No recipes available. Check the database seed.
              </p>
            )}
          </div>

          <aside
            className="af-preview-card"
            aria-label="Cutting order preview"
          >
            <div className="af-preview-heading">
              <span className="af-badge af-badge-violet">
                Live preview
              </span>
              <h3>Batch summary</h3>
              <p>
                Your batch details appear here as you complete the form.
              </p>
            </div>

            <div className="af-preview-recipe">
              <span className="af-preview-label">Selected recipe</span>
              <span className="af-preview-recipe-name">
                {selectedRecipe?.name || "No recipe selected"}
              </span>
              <span className="af-preview-category">
                {selectedRecipe
                  ? selectedRecipe.category || "—"
                  : "Select a recipe to view its category"}
              </span>
            </div>

            <dl className="af-preview-values">
              <div>
                <dt>Target quantity</dt>
                <dd>
                  {validQuantity ? `${quantity} garments` : "—"}
                </dd>
              </div>
              <div>
                <dt>Fabric roll</dt>
                <dd>{form.fabricRollId.trim() || "—"}</dd>
              </div>
              <div>
                <dt>Fabric used</dt>
                <dd>
                  {validFabric
                    ? `${Number(form.actualFabricYds).toFixed(2)} yards`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Recipe components</dt>
                <dd>
                  {selectedRecipe
                    ? selectedRecipe.components.length
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="af-checklist">
              <h4>Submission checklist</h4>
              <ul>
                <ChecklistItem complete={Boolean(selectedRecipe)}>
                  Recipe selected
                </ChecklistItem>
                <ChecklistItem complete={Boolean(validQuantity)}>
                  Valid batch quantity
                </ChecklistItem>
                <ChecklistItem complete={validRoll}>
                  Fabric roll entered
                </ChecklistItem>
                <ChecklistItem complete={validFabric}>
                  Valid fabric amount
                </ChecklistItem>
              </ul>
            </div>

            <p
              className={`af-preview-note ${
                readyToSubmit ? "af-preview-ready" : ""
              }`}
            >
              {readyToSubmit
                ? "Details complete — ready to submit for verification."
                : "Complete the required fields to prepare this batch."}
            </p>
          </aside>
        </div>
      </section>

      {selectedRecipe && (
        <section className="panel af-layout-panel">
          <div className="af-table-heading">
            <div>
              <h2>Expected component counts</h2>
              <p className="af-subtitle">
                Preview only. The backend calculates the saved counts.
              </p>
            </div>

            <span className="af-badge af-badge-neutral">
              {validQuantity ? `${quantity} garments` : "Enter quantity"}
            </span>
          </div>

          <div className="table-scroll">
            <table className="af-data-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Pieces per garment</th>
                  <th>Expected pieces</th>
                </tr>
              </thead>

              <tbody>
                {selectedRecipe.components.map((component) => (
                  <tr key={component.id}>
                    <td>{component.componentName}</td>
                    <td>{component.piecesPerGarment}</td>
                    <td>
                      {validQuantity
                        ? component.piecesPerGarment * quantity
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel af-layout-panel">
        <div className="section-heading af-section-heading">
          <div>
            <p className="af-kicker">ORDER HISTORY</p>
            <h2>My cutting orders</h2>
          </div>

          <button
            className="button-secondary"
            type="button"
            disabled={saving}
            onClick={handleRefresh}
          >
            Refresh
          </button>
        </div>

        {orders.length === 0 ? (
          <p className="af-empty">No cutting orders yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="af-data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Recipe</th>
                  <th>Quantity</th>
                  <th>Fabric yards</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="af-order-cell">{order.orderNo}</td>
                    <td>{order.recipe?.name}</td>
                    <td>{order.targetQty}</td>
                    <td>
                      {Number(order.actualFabricYds).toFixed(2)}
                    </td>
                    <td>
                      <span className="af-badge af-badge-neutral">
                        {order.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleViewDetails(order.id)}
                        aria-expanded={selectedOrderId === order.id}
                        aria-controls={
                          selectedOrderId === order.id
                            ? "supervisor-order-details"
                            : undefined
                        }
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedOrderId && (
        <div
          id="supervisor-order-details"
          ref={detailsRef}
        >
          <SupervisorOrderDetails
            key={selectedOrderId}
            orderId={selectedOrderId}
            onClose={() => setSelectedOrderId(null)}
            onResubmitted={handleResubmitted}
          />
        </div>
      )}
    </div>
  );
}