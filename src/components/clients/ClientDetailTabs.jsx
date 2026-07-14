export function ClientDetailTabs({
  activeSection,
  onChange,
  materialCount = 0,
  orderCount = 0,
}) {
  const tabs = [
    { id: "overview", label: "Dados do cliente" },
    { id: "materials", label: "Materiais", count: materialCount },
    { id: "orders", label: "Pedidos", count: orderCount },
  ];

  return (
    <nav className="client-detail-tabs" aria-label="Seções do cliente">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeSection === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
          aria-current={activeSection === tab.id ? "page" : undefined}
        >
          {tab.label}
          {typeof tab.count === "number" && (
            <span>{tab.count}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
