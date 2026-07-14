import { useState } from "react";
import { ClientDetailTabs } from "./ClientDetailTabs";
import { ClientMaterialsWorkspace } from "./ClientMaterialsWorkspace";

/*
  EXEMPLO PARA O MODELO PUBLICADO NO COMMIT 5136fc8.

  O cadastro atual usa:
  - client-detail-view
  - client-detail-header
  - client-profile-grid
  - client-orders-group

  Mantenha o JSX já existente dentro dos blocos indicados.
*/

export function ClientDetailCurrentModel({
  client,
  clientOrders,
  supabase,
  canManageClients,
  onBack,
  onEdit,
  onOpenOrder,
}) {
  const [activeSection, setActiveSection] = useState("overview");
  const [materialCount, setMaterialCount] = useState(0);

  return (
    <section className="client-detail-view">
      <header className="client-detail-header">
        <button type="button" onClick={onBack}>
          ← Voltar
        </button>

        <div>
          <small>CADASTRO DO CLIENTE</small>
          <h2>{client.name}</h2>
          <p>{client.trade_name || "Sem nome fantasia"}</p>
        </div>

        <div className="client-detail-actions">
          {canManageClients && (
            <button type="button" onClick={() => onEdit(client)}>
              Editar cadastro
            </button>
          )}
        </div>
      </header>

      <ClientDetailTabs
        activeSection={activeSection}
        onChange={setActiveSection}
        materialCount={materialCount}
        orderCount={clientOrders.length}
      />

      {activeSection === "overview" && (
        <>
          {/*
            COLE AQUI, SEM ALTERAR, O client-profile-grid
            QUE JÁ EXISTE NA VERSÃO ATUAL.
          */}
          <div className="client-profile-grid">
            <article>
              <small>CONTATO</small>
              <b>{client.contact_name || "Não informado"}</b>
            </article>
            <article>
              <small>TELEFONE</small>
              <b>{client.phone || "Não informado"}</b>
            </article>
            <article>
              <small>WHATSAPP</small>
              <b>{client.whatsapp || "Não informado"}</b>
            </article>
            <article>
              <small>E-MAIL</small>
              <b>{client.email || "Não informado"}</b>
            </article>
            <article className="client-profile-address">
              <small>ENDEREÇO</small>
              <b>
                {[
                  client.address,
                  client.district,
                  client.city,
                  client.state,
                ]
                  .filter(Boolean)
                  .join(", ") || "Não informado"}
              </b>
            </article>
          </div>
        </>
      )}

      {activeSection === "materials" && (
        <ClientMaterialsWorkspace
          client={client}
          supabase={supabase}
          canEdit={canManageClients}
          onCountChange={setMaterialCount}
        />
      )}

      {activeSection === "orders" && (
        <div className="client-orders-group">
          <h3>
            Pedidos do cliente <span>{clientOrders.length}</span>
          </h3>

          <div className="client-orders-list">
            {clientOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => onOpenOrder(order)}
              >
                <b>{order.op_number}</b>
                <span>{order.description}</span>
                <small>{order.delivery_date}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
