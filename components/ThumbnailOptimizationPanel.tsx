"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearOrderThumbnailCaches } from "@/services/order-thumbnails";

type ThumbnailCandidate = {
  id: string;
  op_number: string;
  main_image_path: string;
};

type Feedback = { type: "success" | "error" | "warning"; text: string };

export function ThumbnailOptimizationPanel() {
  const [busy, setBusy] = useState<"analyze" | "optimize" | "clear" | "">("");
  const [candidateCount, setCandidateCount] = useState<number | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function loadCandidates() {
    const { data, error } = await supabase
      .from("orders")
      .select("id,op_number,main_image_path")
      .not("main_image_path", "is", null)
      .neq("main_image_path", "")
      .order("op_number");
    if (error) throw new Error(error.message);
    return (data || []).filter((item): item is ThumbnailCandidate => Boolean(item.id && item.main_image_path));
  }

  async function analyze() {
    if (busy) return;
    setBusy("analyze");
    setFeedback(null);
    try {
      const candidates = await loadCandidates();
      setCandidateCount(candidates.length);
      setProgress({ done: 0, total: candidates.length, errors: 0 });
      setFeedback({
        type: "success",
        text: `${candidates.length} miniatura(s) PNG podem ser preparadas no cache do sistema.`,
      });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao analisar as miniaturas." });
    } finally {
      setBusy("");
    }
  }

  async function optimize() {
    if (busy) return;
    if (!window.confirm("Preparar as miniaturas PNG de todos os pedidos? O processo pode levar alguns minutos, mas pode continuar em segundo plano enquanto esta tela permanece aberta.")) return;

    setBusy("optimize");
    setFeedback(null);
    try {
      const [{ data: sessionData }, candidates] = await Promise.all([
        supabase.auth.getSession(),
        loadCandidates(),
      ]);
      const session = sessionData.session;
      if (!session?.access_token || !session.user?.id) throw new Error("Sessão expirada. Entre novamente no sistema.");

      setCandidateCount(candidates.length);
      setProgress({ done: 0, total: candidates.length, errors: 0 });
      let done = 0;
      let errors = 0;

      for (let index = 0; index < candidates.length; index += 2) {
        const group = candidates.slice(index, index + 2);
        const results = await Promise.allSettled(group.map(async (candidate) => {
          const response = await fetch(`/api/order-thumbnails/${encodeURIComponent(candidate.id)}?warm=1`, {
            headers: { authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`Miniatura da OP ${candidate.op_number} indisponível.`);
          await response.arrayBuffer();
        }));
        done += group.length;
        errors += results.filter((result) => result.status === "rejected").length;
        setProgress({ done, total: candidates.length, errors });
      }

      setFeedback({
        type: errors ? "warning" : "success",
        text: errors
          ? `${done - errors} miniatura(s) preparadas e ${errors} falharam. Consulte o diagnóstico de integrações.`
          : `${done} miniatura(s) PNG preparadas. Os próximos acessos reutilizarão o cache do sistema.`,
      });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao otimizar as miniaturas." });
    } finally {
      setBusy("");
    }
  }

  async function clearLocalCache() {
    if (busy) return;
    setBusy("clear");
    setFeedback(null);
    try {
      const { data } = await supabase.auth.getUser();
      await clearOrderThumbnailCaches(data.user?.id);
      setFeedback({ type: "success", text: "Cache local de miniaturas limpo. As imagens visíveis serão baixadas novamente." });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao limpar o cache local." });
    } finally {
      setBusy("");
    }
  }

  const percentage = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return <div className="platform-card thumbnail-optimization-card">
    <div className="platform-card-title">
      <span>⚡</span>
      <div><small>DESEMPENHO</small><h3>Preparar miniaturas PNG</h3></div>
    </div>
    <p className="platform-card-description">
      Prepara no Supabase uma cópia PNG em resolução original para cada miniatura. O Kanban carrega os cartões visíveis e reutiliza o cache deste aparelho, sem reduzir a imagem para WebP.
    </p>

    {feedback && <div className={`platform-feedback ${feedback.type}`}>{feedback.text}</div>}

    {(busy === "optimize" || progress.done > 0) && <div className="thumbnail-optimization-progress">
      <header><b>{busy === "optimize" ? "Preparando…" : "Última execução"}</b><span>{progress.done} de {progress.total} · {percentage}%</span></header>
      <div><i style={{ width: `${percentage}%` }} /></div>
      {progress.errors > 0 && <small>{progress.errors} falha(s)</small>}
    </div>}

    <div className="platform-actions">
      <button type="button" onClick={() => void analyze()} disabled={Boolean(busy)}>{busy === "analyze" ? "Analisando…" : "Analisar"}</button>
      <button type="button" className="primary" onClick={() => void optimize()} disabled={Boolean(busy)}>{busy === "optimize" ? "Preparando…" : "Preparar todas"}</button>
      <button type="button" onClick={() => void clearLocalCache()} disabled={Boolean(busy)}>{busy === "clear" ? "Limpando…" : "Limpar cache deste aparelho"}</button>
    </div>

    {candidateCount !== null && <div className="platform-sql-summary"><span><b>Miniaturas vinculadas</b>{candidateCount}</span><span><b>Processadas</b>{progress.done}</span><span><b>Falhas</b>{progress.errors}</span></div>}
  </div>;
}
