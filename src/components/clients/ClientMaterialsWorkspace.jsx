import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveClientMaterial,
  createClientMaterial,
  listClientMaterials,
  normalizeMaterialForDatabase,
  updateClientMaterial,
} from "../../services/clientMaterials";
import "./ClientMaterialsWorkspace.css";

const CATEGORY_LABELS = {
  tinta: "Tintas",
  verniz_acabamento: "Vernizes e acabamentos",
  adesivo: "Adesivos",
  acm: "ACM",
  acrilico: "Acrílico",
  led: "LEDs",
  fonte: "Fontes",
  outro: "Outros",
};

const CATEGORY_ORDER = [
  "tinta",
  "verniz_acabamento",
  "adesivo",
  "acm",
  "acrilico",
  "led",
  "fonte",
  "outro",
];

const EMPTY_FORM = {
  category: "tinta",
  item_name: "",
  brand: "",
  code: "",
  catalog_page: "",
  finish: "",
  application: "",
  quantity: "",
  unit: "",
  led_temperature: "",
  led_distribution: [],
  notes: "",
};

export function ClientMaterialsWorkspace({
  client,
  supabase,
  canEdit = true,
  onCountChange,
}) {
  const clientId = client?.id;
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadMaterials = useCallback(async () => {
    if (!clientId) {
      setMaterials([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const rows = await listClientMaterials(supabase, clientId);
      setMaterials(rows);
      onCountChange?.(rows.length);
    } catch (error) {
      setMaterials([]);
      setFeedback({
        type: "error",
        message: `Não foi possível carregar os materiais: ${error.message}`,
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, onCountChange, supabase]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  const totals = useMemo(
    () =>
      materials.reduce((result, material) => {
        result[material.category] = (result[material.category] ?? 0) + 1;
        return result;
      }, {}),
    [materials],
  );

  const filteredMaterials = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLocaleLowerCase("pt-BR");

    return materials.filter((material) => {
      if (
        categoryFilter !== "all" &&
        material.category !== categoryFilter
      ) {
        return false;
      }

      if (!normalizedSearch) return true;

      const searchableText = [
        material.item_name,
        material.brand,
        material.code,
        material.catalog_page,
        material.finish,
        material.application,
        material.led_temperature,
        material.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(normalizedSearch);
    });
  }, [categoryFilter, materials, search]);

  const ledDistributionTotal = useMemo(
    () =>
      form.led_distribution.reduce(
        (total, row) => total + (Number(row.quantity) || 0),
        0,
      ),
    [form.led_distribution],
  );

  function openCreateEditor() {
    setEditingMaterial(null);
    setForm(EMPTY_FORM);
    setFeedback(null);
    setEditorOpen(true);
  }

  function openEditEditor(material) {
    setEditingMaterial(material);
    setForm({
      category: material.category ?? "tinta",
      item_name: material.item_name ?? "",
      brand: material.brand ?? "",
      code: material.code ?? "",
      catalog_page: material.catalog_page ?? "",
      finish: material.finish ?? "",
      application: material.application ?? "",
      quantity:
        material.quantity === null || material.quantity === undefined
          ? ""
          : String(material.quantity),
      unit: material.unit ?? "",
      led_temperature: material.led_temperature ?? "",
      led_distribution: Array.isArray(material.led_distribution)
        ? material.led_distribution.map((item) => ({ ...item }))
        : [],
      notes: material.notes ?? "",
    });
    setFeedback(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
    setEditingMaterial(null);
    setForm(EMPTY_FORM);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addLedRow() {
    updateField("led_distribution", [
      ...form.led_distribution,
      {
        group: "",
        position: "",
        letter: "",
        quantity: 0,
      },
    ]);
  }

  function updateLedRow(index, field, value) {
    updateField(
      "led_distribution",
      form.led_distribution.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, [field]: value }
          : row,
      ),
    );
  }

  function removeLedRow(index) {
    updateField(
      "led_distribution",
      form.led_distribution.filter(
        (_, rowIndex) => rowIndex !== index,
      ),
    );
  }

  async function saveMaterial() {
    if (!form.item_name.trim()) {
      setFeedback({
        type: "error",
        message: "Informe o material, a cor ou a referência.",
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const normalized = normalizeMaterialForDatabase(form);

      if (editingMaterial) {
        await updateClientMaterial(
          supabase,
          clientId,
          editingMaterial.id,
          normalized,
        );
      } else {
        await createClientMaterial(
          supabase,
          clientId,
          normalized,
        );
      }

      const wasEditing = Boolean(editingMaterial);
      setEditorOpen(false);
      setEditingMaterial(null);
      setForm(EMPTY_FORM);

      await loadMaterials();
      setFeedback({
        type: "success",
        message: wasEditing
          ? "Material atualizado."
          : "Material cadastrado.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: `Não foi possível salvar: ${error.message}`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function archiveMaterial(material) {
    const confirmed = window.confirm(
      `Remover "${material.item_name}" do cadastro técnico de ${client.name}?`,
    );
    if (!confirmed) return;

    setFeedback(null);

    try {
      await archiveClientMaterial(
        supabase,
        clientId,
        material.id,
      );
      await loadMaterials();
      setFeedback({
        type: "success",
        message: "Material removido do cadastro ativo.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: `Não foi possível remover: ${error.message}`,
      });
    }
  }

  return (
    <section
      className="client-materials-workspace"
      aria-label={`Materiais de ${client?.name ?? "cliente"}`}
    >
      <header className="client-materials-heading">
        <div>
          <small>MEMÓRIA TÉCNICA DO CLIENTE</small>
          <h3>Materiais e referências</h3>
          <p>
            Informações permanentes da página TINTAS: cores, códigos,
            acabamentos, aplicações, LEDs por letra e fontes.
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            className="primary client-materials-new"
            onClick={openCreateEditor}
          >
            + Novo material
          </button>
        )}
      </header>

      <div className="client-materials-summary">
        <button
          type="button"
          className={categoryFilter === "all" ? "active" : ""}
          onClick={() => setCategoryFilter("all")}
        >
          <small>Total</small>
          <strong>{materials.length}</strong>
        </button>

        {CATEGORY_ORDER.map((category) => (
          <button
            type="button"
            key={category}
            className={
              categoryFilter === category ? "active" : ""
            }
            onClick={() => setCategoryFilter(category)}
          >
            <small>{CATEGORY_LABELS[category]}</small>
            <strong>{totals[category] ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="client-materials-toolbar">
        <label>
          <span>⌕</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cor, código, marca ou aplicação..."
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setSearch("")}
            >
              ×
            </button>
          )}
        </label>

        <span>
          {filteredMaterials.length}{" "}
          {filteredMaterials.length === 1
            ? "registro"
            : "registros"}
        </span>
      </div>

      {feedback && (
        <div
          className={`client-materials-feedback ${feedback.type}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      )}

      {loading ? (
        <div className="client-materials-empty">
          Carregando materiais...
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="client-materials-empty">
          <span>◫</span>
          <b>
            {materials.length
              ? "Nenhum material encontrado"
              : "Nenhum material cadastrado"}
          </b>
          <p>
            {materials.length
              ? "Altere a busca ou o filtro selecionado."
              : "Use esta área para guardar as referências permanentes do cliente."}
          </p>
        </div>
      ) : (
        <div className="client-materials-list">
          {filteredMaterials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              canEdit={canEdit}
              onEdit={() => openEditEditor(material)}
              onArchive={() => void archiveMaterial(material)}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <MaterialEditor
          form={form}
          editing={Boolean(editingMaterial)}
          saving={saving}
          ledDistributionTotal={ledDistributionTotal}
          onFieldChange={updateField}
          onAddLedRow={addLedRow}
          onUpdateLedRow={updateLedRow}
          onRemoveLedRow={removeLedRow}
          onClose={closeEditor}
          onSave={() => void saveMaterial()}
        />
      )}
    </section>
  );
}

function MaterialCard({
  material,
  canEdit,
  onEdit,
  onArchive,
}) {
  const distribution = Array.isArray(material.led_distribution)
    ? material.led_distribution
    : [];

  const distributionTotal = distribution.reduce(
    (total, item) => total + (Number(item.quantity) || 0),
    0,
  );

  return (
    <article className="client-material-card">
      <header>
        <div>
          <span data-category={material.category}>
            {CATEGORY_LABELS[material.category] ?? "Material"}
          </span>
          <h4>{material.item_name}</h4>
        </div>

        {canEdit && (
          <div className="client-material-card-actions">
            <button type="button" onClick={onEdit}>
              Editar
            </button>
            <button
              type="button"
              className="danger"
              onClick={onArchive}
            >
              Remover
            </button>
          </div>
        )}
      </header>

      <dl className="client-material-details">
        {material.application && (
          <Detail label="Aplicação" value={material.application} wide />
        )}
        {material.brand && (
          <Detail label="Marca/catálogo" value={material.brand} />
        )}
        {material.code && (
          <Detail label="Código" value={material.code} />
        )}
        {material.catalog_page && (
          <Detail label="Página" value={material.catalog_page} />
        )}
        {material.finish && (
          <Detail label="Acabamento" value={material.finish} />
        )}
        {material.led_temperature && (
          <Detail label="LED" value={material.led_temperature} />
        )}
        {material.quantity !== null &&
          material.quantity !== undefined && (
            <Detail
              label="Quantidade"
              value={`${material.quantity} ${material.unit ?? ""}`.trim()}
            />
          )}
      </dl>

      {material.category === "led" && distribution.length > 0 && (
        <div className="client-led-distribution">
          {distribution.map((item, index) => (
            <span
              key={`${item.group}-${item.position}-${index}`}
              title={item.group || "Letreiro"}
            >
              {item.position || item.letter}:{" "}
              <b>{item.quantity}</b>
            </span>
          ))}
          <span className="total">
            Total: <b>{distributionTotal}</b>
          </span>
        </div>
      )}

      {material.notes && (
        <p className="client-material-notes">
          {material.notes}
        </p>
      )}

      <footer>
        <span>{material.source}</span>
        {material.source_row && (
          <span>Linha {material.source_row}</span>
        )}
      </footer>
    </article>
  );
}

function Detail({ label, value, wide = false }) {
  return (
    <div className={wide ? "wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MaterialEditor({
  form,
  editing,
  saving,
  ledDistributionTotal,
  onFieldChange,
  onAddLedRow,
  onUpdateLedRow,
  onRemoveLedRow,
  onClose,
  onSave,
}) {
  return (
    <div className="overlay client-material-editor-overlay">
      <section
        className="modal client-material-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-material-editor-title"
      >
        <button
          type="button"
          className="close"
          onClick={onClose}
          aria-label="Fechar"
        >
          ×
        </button>

        <p className="eyebrow">
          {editing ? "EDITAR REFERÊNCIA" : "NOVA REFERÊNCIA"}
        </p>
        <h2 id="client-material-editor-title">
          {editing
            ? "Alterar material do cliente"
            : "Cadastrar material do cliente"}
        </h2>
        <p>
          Este cadastro é permanente e não substitui os materiais de
          consumo registrados dentro de cada OS.
        </p>

        <div className="client-material-form-grid">
          <label>
            <span>Categoria *</span>
            <select
              value={form.category}
              onChange={(event) =>
                onFieldChange("category", event.target.value)
              }
            >
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>

          <label className="span-2">
            <span>Material, cor ou referência *</span>
            <input
              value={form.item_name}
              onChange={(event) =>
                onFieldChange("item_name", event.target.value)
              }
              placeholder="Ex.: Romana Antico"
              autoFocus
            />
          </label>

          <label>
            <span>Marca ou catálogo</span>
            <input
              value={form.brand}
              onChange={(event) =>
                onFieldChange("brand", event.target.value)
              }
              placeholder="Coral, Visual, Lazzuril..."
            />
          </label>

          <label>
            <span>Código</span>
            <input
              value={form.code}
              onChange={(event) =>
                onFieldChange("code", event.target.value)
              }
              placeholder="Ex.: 00800878"
            />
          </label>

          <label>
            <span>Página do catálogo</span>
            <input
              value={form.catalog_page}
              onChange={(event) =>
                onFieldChange("catalog_page", event.target.value)
              }
              placeholder="Ex.: 187"
            />
          </label>

          <label>
            <span>Acabamento</span>
            <input
              value={form.finish}
              onChange={(event) =>
                onFieldChange("finish", event.target.value)
              }
              placeholder="Fosco, brilho, metálico..."
            />
          </label>

          <label className="span-2">
            <span>Aplicação ou local</span>
            <input
              value={form.application}
              onChange={(event) =>
                onFieldChange("application", event.target.value)
              }
              placeholder="Ex.: fachada, palavra MOVA, estrutura do caixa..."
            />
          </label>

          {form.category === "led" ? (
            <>
              <label>
                <span>Temperatura ou cor do LED</span>
                <input
                  value={form.led_temperature}
                  onChange={(event) =>
                    onFieldChange(
                      "led_temperature",
                      event.target.value,
                    )
                  }
                  placeholder="Quente, frio 8K..."
                />
              </label>

              <label>
                <span>Total de módulos</span>
                <input
                  inputMode="numeric"
                  value={
                    form.led_distribution.length
                      ? ledDistributionTotal
                      : form.quantity
                  }
                  onChange={(event) =>
                    onFieldChange("quantity", event.target.value)
                  }
                  readOnly={form.led_distribution.length > 0}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                <span>Quantidade</span>
                <input
                  inputMode="decimal"
                  value={form.quantity}
                  onChange={(event) =>
                    onFieldChange("quantity", event.target.value)
                  }
                />
              </label>

              <label>
                <span>Unidade</span>
                <input
                  value={form.unit}
                  onChange={(event) =>
                    onFieldChange("unit", event.target.value)
                  }
                  placeholder="un., m, chapa..."
                />
              </label>
            </>
          )}

          <label className="span-3">
            <span>Observações</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) =>
                onFieldChange("notes", event.target.value)
              }
              placeholder="Alterações aprovadas, passos de impressão e demais detalhes."
            />
          </label>
        </div>

        {form.category === "led" && (
          <section className="client-led-editor">
            <header>
              <div>
                <small>LETREIRO</small>
                <h3>Quantidade de LEDs por letra</h3>
                <p>
                  Use A1, A2, S1 e S2 para diferenciar letras repetidas.
                </p>
              </div>

              <button type="button" onClick={onAddLedRow}>
                + Adicionar letra
              </button>
            </header>

            {form.led_distribution.length === 0 ? (
              <div className="client-led-editor-empty">
                Nenhuma distribuição informada.
              </div>
            ) : (
              <div className="client-led-editor-table">
                <div className="head">
                  <span>Palavra</span>
                  <span>Posição</span>
                  <span>Letra</span>
                  <span>LEDs</span>
                  <span />
                </div>

                {form.led_distribution.map((row, index) => (
                  <div
                    className="row"
                    key={`${index}-${row.position}`}
                  >
                    <input
                      value={row.group}
                      onChange={(event) =>
                        onUpdateLedRow(
                          index,
                          "group",
                          event.target.value,
                        )
                      }
                      placeholder="MOVA"
                    />
                    <input
                      value={row.position}
                      onChange={(event) =>
                        onUpdateLedRow(
                          index,
                          "position",
                          event.target.value,
                        )
                      }
                      placeholder="A1"
                    />
                    <input
                      value={row.letter}
                      onChange={(event) =>
                        onUpdateLedRow(
                          index,
                          "letter",
                          event.target.value,
                        )
                      }
                      placeholder="A"
                      maxLength={4}
                    />
                    <input
                      type="number"
                      min="0"
                      value={row.quantity}
                      onChange={(event) =>
                        onUpdateLedRow(
                          index,
                          "quantity",
                          Number(event.target.value),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveLedRow(index)}
                      aria-label={`Remover linha ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="client-led-editor-total">
              Total calculado: <b>{ledDistributionTotal} módulos</b>
            </div>
          </section>
        )}

        <div className="actions client-material-editor-actions">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Salvando..." : "Salvar material"}
          </button>
        </div>
      </section>
    </div>
  );
}
