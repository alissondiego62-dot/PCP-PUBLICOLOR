"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type RepairResult = {
  ok: boolean;
  mode: "dry-run" | "applied";
  message: string;
  totals: {
    orders: number;
    pngFiles: number;
    repairable: number;
    alreadyLinked: number;
    missingPng: number;
    ambiguous: number;
    updated: number;
    errors: number;
    historyWarnings: number;
  };
  ambiguous: Array<{
    opNumber: string;
    clientName: string;
    reason: string;
    candidates: string[];
  }>;
  errors: Array<{ opNumber: string; message: string }>;
};

type Feedback = {
  type: "success" | "error" | "warning";
  text: string;
};

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Sessão expirada. Entre novamente no sistema.");
  }
  return data.session.access_token;
}

async function requestRepair(apply: boolean): Promise<RepairResult> {
  const token = await accessToken();
  const response = await fetch("/api/admin/repair-drive-thumbnails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      apply,
      confirmation: apply ? "REPARAR MINIATURAS" : "",
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as RepairResult & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Não foi possível analisar as miniaturas.");
  }

  return payload;
}

export function ThumbnailRepairSettings() {
  const [busy, setBusy] = useState<"analyze" | "apply" | "">("");
  const [result, setResult] = useState<RepairResult | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function run(apply: boolean) {
    if (busy) return;

    if (
      apply &&
      !window.confirm(
        "Restaurar agora as miniaturas usando os PNGs já presentes na aba Arquivos de cada pedido e subpedido?",
      )
    ) {
      return;
    }

    setBusy(apply ? "apply" : "analyze");
    setFeedback(null);

    try {
      const nextResult = await requestRepair(apply);
      setResult(nextResult);
      setFeedback({
        type: nextResult.totals.errors > 0 ? "warning" : "success",
        text: nextResult.message,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Falha na reparação.",
      });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="platform-admin-module">
      <div className="platform-card">
        <div className="platform-card-title">
          <span>PNG</span>
          <div>
            <small>EXECUÇÃO ÚNICA</small>
            <h3>Restaurar miniaturas da aba Arquivos</h3>
          </div>
        </div>

        <p className="platform-card-description">
          Esta ferramenta não envia arquivos novamente. Ela localiza o PNG já
          vinculado na aba Arquivos de cada pedido ou subpedido e restaura o
          campo usado pelo Kanban para mostrar a miniatura.
        </p>

        {feedback && (
          <div className={`platform-feedback ${feedback.type}`}>
            {feedback.text}
          </div>
        )}

        <div className="platform-actions">
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={Boolean(busy)}
          >
            {busy === "analyze" ? "Analisando…" : "1. Analisar miniaturas"}
          </button>

          <button
            type="button"
            className="danger"
            onClick={() => void run(true)}
            disabled={Boolean(busy) || !result || result.totals.repairable === 0}
          >
            {busy === "apply"
              ? "Restaurando…"
              : `2. Restaurar ${result?.totals.repairable || 0} miniatura(s)`}
          </button>
        </div>

        {result && (
          <>
            <div className="platform-sql-summary">
              <span>
                <b>Pedidos</b>
                {result.totals.orders}
              </span>
              <span>
                <b>PNG encontrados</b>
                {result.totals.pngFiles}
              </span>
              <span>
                <b>Para restaurar</b>
                {result.totals.repairable}
              </span>
              <span>
                <b>Já vinculados</b>
                {result.totals.alreadyLinked}
              </span>
              <span>
                <b>Sem PNG</b>
                {result.totals.missingPng}
              </span>
              <span>
                <b>Revisão manual</b>
                {result.totals.ambiguous}
              </span>
              {result.mode === "applied" && (
                <span>
                  <b>Atualizados</b>
                  {result.totals.updated}
                </span>
              )}
              {result.totals.errors > 0 && (
                <span>
                  <b>Erros</b>
                  {result.totals.errors}
                </span>
              )}
            </div>

            {result.ambiguous.length > 0 && (
              <details className="platform-sql-preview">
                <summary>Pedidos com mais de um PNG para revisar</summary>
                <div className="platform-history-list">
                  {result.ambiguous.map((item) => (
                    <article key={`${item.opNumber}-${item.clientName}`}>
                      <header>
                        <b>OP {item.opNumber}</b>
                        <span>Não alterado</span>
                      </header>
                      <small>{item.clientName}</small>
                      <p>{item.reason}</p>
                      <code>{item.candidates.join(" · ")}</code>
                    </article>
                  ))}
                </div>
              </details>
            )}

            {result.errors.length > 0 && (
              <details className="platform-sql-preview">
                <summary>Erros encontrados</summary>
                <div className="platform-history-list">
                  {result.errors.map((item) => (
                    <article key={`${item.opNumber}-${item.message}`}>
                      <header>
                        <b>OP {item.opNumber}</b>
                        <span>Erro</span>
                      </header>
                      <p>{item.message}</p>
                    </article>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        <div className="platform-danger-note">
          <b>Depois da execução</b>
          <span>
            Atualize o sistema com Ctrl + F5. Após confirmar que as miniaturas
            voltaram, esta ferramenta poderá ser removida do projeto.
          </span>
        </div>
      </div>
    </section>
  );
}
