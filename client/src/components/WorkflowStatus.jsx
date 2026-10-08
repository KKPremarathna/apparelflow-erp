const badgeBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "5px 9px",
  border: "1px solid",
  borderRadius: "4px",
  fontSize: "11px",
  fontWeight: 650,
  lineHeight: 1.5,
};

const badgeColors = {
  green: {
    backgroundColor: "#effaf3",
    borderColor: "#b9e7ca",
    color: "#247343",
  },
  red: {
    backgroundColor: "#fff0f2",
    borderColor: "#f4bdc5",
    color: "#b3374b",
  },
  yellow: {
    backgroundColor: "#fffaeb",
    borderColor: "#f2dc9e",
    color: "#986c12",
  },
  neutral: {
    backgroundColor: "#f5f7fb",
    borderColor: "#dfe4ee",
    color: "#64748b",
  },
};

function getStatusColor(status) {
  switch (status) {
    case "VERIFIED":
    case "APPROVED":
    case "APPROVE":
    case "GREEN":
      return "green";

    case "REJECTED":
    case "REJECT":
    case "RED":
      return "red";

    case "YELLOW":
      return "yellow";

    default:
      return "neutral";
  }
}

function getDecisionBorderColor(decision) {
  const normalized =
    typeof decision === "string" ? decision.toUpperCase() : "";

  const color = getStatusColor(normalized);

  if (color === "green") return "#36a467";
  if (color === "red") return "#cf4055";

  return "#94a3b8";
}

export function WorkflowStatusBadge({ status }) {
  const normalized =
    typeof status === "string" ? status.toUpperCase() : "";

  return (
    <span
      style={{
        ...badgeBase,
        ...badgeColors[getStatusColor(normalized)],
      }}
    >
      {status ? String(status).replaceAll("_", " ") : "Not recorded"}
    </span>
  );
}

export function QcStatusBadge({ status }) {
  const labels = {
    GREEN: "GREEN — Match",
    YELLOW: "YELLOW — Excess",
    RED: "RED — Shortage",
    UNCOUNTED: "Not counted / invalid",
  };

  const normalized =
    typeof status === "string" ? status.toUpperCase() : "";

  return (
    <span
      style={{
        ...badgeBase,
        ...badgeColors[getStatusColor(normalized)],
      }}
    >
      {labels[normalized] || status || "Not counted"}
    </span>
  );
}

export function VerificationAuditEntry({
  decision,
  children,
  className = "",
  style,
  ...props
}) {
  return (
    <article
      {...props}
      className={`audit-entry ${className}`.trim()}
      style={{
        ...style,
        borderLeftColor: getDecisionBorderColor(decision),
      }}
    >
      {children}
    </article>
  );
}

export function DecisionButton({
  variant = "approve",
  children,
  style,
  ...props
}) {
  const reject = variant === "reject";

  return (
    <button
      {...props}
      style={{
        ...style,
        backgroundColor: reject ? "#be3547" : "#23834d",
        borderColor: reject ? "#be3547" : "#23834d",
        color: "#ffffff",
      }}
    >
      {children}
    </button>
  );
}