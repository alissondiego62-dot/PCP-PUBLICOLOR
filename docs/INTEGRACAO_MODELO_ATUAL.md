# Integração no modelo atual do Publicolor 2.0

## Base considerada

- implantação de produção: `dpl_2LCRvu6EDV4KtgGhvA6JdqGMxjBY`;
- commit: `5136fc80777e65de88a5f1f90fa0c23e7fea9b85`;
- branch: `main`;
- estrutura visual identificada:
  - `client-detail-view`;
  - `client-detail-header`;
  - `client-profile-grid`;
  - `client-orders-group`;
  - paleta `--publicolor-purple-*` e `--publicolor-yellow`.

## Alteração segura

A nova implementação não substitui a página de clientes. Ela adiciona uma navegação
interna com três seções:

1. **Dados do cliente** — mantém o conteúdo atual;
2. **Materiais** — memória técnica importada da página TINTAS;
3. **Pedidos** — mantém os pedidos ativos e concluídos do cliente.

## Arquivos para copiar

```text
src/
├─ components/
│  └─ clients/
│     ├─ ClientDetailTabs.jsx
│     ├─ ClientMaterialsWorkspace.jsx
│     ├─ ClientMaterialsWorkspace.css
│     └─ ClientDetailCurrentModel.jsx
└─ services/
   └─ clientMaterials.js
```

## Pontos de edição no componente atual

Procure pelo trecho que renderiza:

```jsx
<section className="client-detail-view">
```

No topo do componente, adicione:

```jsx
const [activeClientSection, setActiveClientSection] = useState("overview");
const [clientMaterialCount, setClientMaterialCount] = useState(0);
```

Logo depois de `client-detail-header`, adicione:

```jsx
<ClientDetailTabs
  activeSection={activeClientSection}
  onChange={setActiveClientSection}
  materialCount={clientMaterialCount}
  orderCount={clientOrders.length}
/>
```

Envolva o `client-profile-grid` atual com:

```jsx
{activeClientSection === "overview" && (
  <>
    {/* client-profile-grid atual */}
  </>
)}
```

Adicione a seção de materiais:

```jsx
{activeClientSection === "materials" && (
  <ClientMaterialsWorkspace
    client={selectedClient}
    supabase={supabase}
    canEdit={canManageClients}
    onCountChange={setClientMaterialCount}
  />
)}
```

Envolva os grupos de pedidos atuais com:

```jsx
{activeClientSection === "orders" && (
  <>
    {/* client-orders-group atual */}
  </>
)}
```

## Regra importante

Não use a tabela de materiais da OS para este recurso. Esta área consulta
`client_materials`, pois representa a referência permanente do cliente.
Os materiais de consumo e reserva da produção continuam vinculados à OS.
