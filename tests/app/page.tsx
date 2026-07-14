"use client";

import type { User } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CompletedOrdersView } from "@/components/CompletedOrdersView";
import { InstallationAgendaView } from "@/app/components/InstallationAgendaView";
import { ClientFormModal } from "@/components/ClientFormModal";
import { ClientsView } from "@/components/ClientsView";
import { DataImportExportSettings } from "@/components/DataImportExportSettings";
import { GoogleDriveSettings } from "@/components/GoogleDriveSettings";
import { PlatformAdministrationSettings } from "@/components/PlatformAdministrationSettings";
import { OrderDriveUpload } from "@/components/OrderDriveUpload";
import { OrderBatchForm, type OrderBatchSubmission } from "@/components/OrderBatchForm";
import { PdfOrderImporter } from "@/components/PdfOrderImporter";
import { ActivitiesView } from "@/components/ActivitiesView";
import { isPcpSectorName, menuItems, priorityLabel, roleLabel, statusDotClass, statusesForSector, statusToDb } from "@/lib/pcp-config";
import {
  dateTimeLabel,
  dueLabel,
  initials,
  installationDateTimeLabel,
  installationDateToIso,
  installationLocalToIso,
  previousBusinessDay,
  shortDateOnlyLabel,
  statusLabel,
  targetDateForOrder,
  toInstallationInputValue,
} from "@/lib/pcp-formatters";
import type {
  AuthMode,
  ChecklistItem,
  Client,
  CommentEntry,
  CreateUserResponse,
  DbStatus,
  DeadlineFilter,
  DetailTab,
  HistoryEntry,
  Order,
  OrderFileEntry,
  OrderChangeEntry,
  OrderMaterial,
  OrderPatch,
  Priority,
  Profile,
  Sector,
  SortMode,
  UiStatus,
  ViewKey,
} from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";
import { driveAuthenticatedJson, uploadFileToOrderDrive, type DriveConnectionStatus } from "@/lib/google-drive-client";
import { requiresAutomaticOrderNumber } from "@/lib/order-number";

const DEFAULT_CONSULTANTS = [
  "BRHENO SALLUM",
  "EDUARDO FURTADO",
  "FERNANDO MARTINS",
  "IGOR NOLASCO",
  "KARINE GOMES",
  "KARINE ROCHA",
  "LUCAS LEVEL",
  "LUIZ AMERICO",
  "PAULO EDUARDO",
  "WELLINGTON",
  "WESLLEY",
  "YAN RABELO",
] as const;

const UNASSIGNED_RESPONSIBLE_FILTER = "__unassigned__";
const PDF_DRIVE_THUMBNAIL_PREFIX = "gdrive-pdf:";

function driveThumbnailFileId(path: string | null | undefined) {
  const value = path?.trim() || "";
  return value.startsWith(PDF_DRIVE_THUMBNAIL_PREFIX)
    ? value.slice(PDF_DRIVE_THUMBNAIL_PREFIX.length).trim()
    : "";
}

function isPdfPageThumbnailPath(path: string | null | undefined) {
  return Boolean(path?.includes("/pdf-pages/") || driveThumbnailFileId(path));
}

function normalizedResponsibleName(value: string | null | undefined) {
  return value?.trim().toLocaleUpperCase("pt-BR") || "";
}

function orderResponsibleName(order: Order) {
  return order.consultant_name?.trim() || "Não definido";
}

function orderTargetDate(order: Order) {
  return targetDateForOrder(order.installation_scheduled_at, order.delivery_date);
}

function normalizeOrderNumberForComparison(value: string | null | undefined) {
  return String(value || "").trim().toLocaleUpperCase("pt-BR");
}

function orderTargetDateLabel(order: Order) {
  return shortDateOnlyLabel(orderTargetDate(order));
}

type OrderFamily = {
  parentOp: string;
  orders: Order[];
  hasSubOrders: boolean;
};

function orderFamilyKey(opNumber: string) {
  const normalized = opNumber.trim();
  const subOrderMatch = normalized.match(/^(.+?)-(\d+)$/);

  return {
    parentOp: subOrderMatch?.[1]?.trim() || normalized,
    childNumber: subOrderMatch ? Number(subOrderMatch[2]) : null,
    isSubOrder: Boolean(subOrderMatch),
  };
}

function compareOrderNumbers(first: Order, second: Order) {
  const firstKey = orderFamilyKey(first.op_number);
  const secondKey = orderFamilyKey(second.op_number);

  if (firstKey.childNumber !== null && secondKey.childNumber !== null) {
    return firstKey.childNumber - secondKey.childNumber;
  }

  if (firstKey.childNumber === null && secondKey.childNumber !== null) return -1;
  if (firstKey.childNumber !== null && secondKey.childNumber === null) return 1;

  return first.op_number.localeCompare(second.op_number, "pt-BR", { numeric: true });
}

function buildOrderFamilies(sourceOrders: Order[]): OrderFamily[] {
  const families = new Map<string, OrderFamily>();

  sourceOrders.forEach((order) => {
    const familyKey = orderFamilyKey(order.op_number);
    const currentFamily = families.get(familyKey.parentOp);

    if (currentFamily) {
      currentFamily.orders.push(order);
      currentFamily.hasSubOrders ||= familyKey.isSubOrder;
      return;
    }

    families.set(familyKey.parentOp, {
      parentOp: familyKey.parentOp,
      orders: [order],
      hasSubOrders: familyKey.isSubOrder,
    });
  });

  return Array.from(families.values()).map((family) => ({
    ...family,
    orders: [...family.orders].sort(compareOrderNumbers),
  }));
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [newOrderInitialClientId, setNewOrderInitialClientId] = useState("");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [clientBusy, setClientBusy] = useState(false);
  const [clientError, setClientError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [expandedOrderFamilies, setExpandedOrderFamilies] = useState<Set<string>>(new Set());
  const [dragged, setDragged] = useState<string | null>(null);
  const [modal, setModal] = useState<"new" | Order | null>(null);
  const [pdfImporterOpen, setPdfImporterOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [imagePreview, setImagePreview] = useState<{ src: string; alt: string } | null>(null);
  const [imagePreviewZoom, setImagePreviewZoom] = useState(1);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [reopenOrderTarget, setReopenOrderTarget] = useState<Order | null>(null);
  const [reopeningOrder, setReopeningOrder] = useState(false);
  const [reopenError, setReopenError] = useState("");
  const [dragOverLane, setDragOverLane] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [changeHistory, setChangeHistory] = useState<OrderChangeEntry[]>([]);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [materials, setMaterials] = useState<OrderMaterial[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [orderFiles, setOrderFiles] = useState<OrderFileEntry[]>([]);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sectorFilter, setSectorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DbStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [passwordFlow, setPasswordFlow] = useState<"recovery" | "invite">("recovery");
  const [authFeedback, setAuthFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [profileBusyId, setProfileBusyId] = useState<string | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userCreateError, setUserCreateError] = useState("");
  const clientAfterSaveRef = useRef<((client: Client) => void) | null>(null);
  const boardRef = useRef<HTMLElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingBoardScroll = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [boardScrollWidth, setBoardScrollWidth] = useState(0);

  const consultantOptions = useMemo(() => {
    const names = new Set<string>(DEFAULT_CONSULTANTS);

    orders.forEach((order) => {
      const name = order.consultant_name?.trim();
      if (name) names.add(name.toUpperCase());
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [orders]);

  useEffect(() => {
    if (!imagePreview) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handlePreviewKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
      if (event.key === "+" || event.key === "=") setImagePreviewZoom((current) => Math.min(2.5, current + 0.25));
      if (event.key === "-") setImagePreviewZoom((current) => Math.max(0.5, current - 0.25));
    };

    window.addEventListener("keydown", handlePreviewKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handlePreviewKeyboard);
    };
  }, [imagePreview]);

  useEffect(() => {
    const savedSidebarState = window.localStorage.getItem("pcp-sidebar-collapsed");
    // Estado persistido do menu: atualização necessária após a montagem no navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarCollapsed(savedSidebarState === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("pcp-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const closeMobileSidebar = () => {
      if (window.innerWidth > 700) setSidebarOpen(false);
    };
    window.addEventListener("resize", closeMobileSidebar);
    return () => window.removeEventListener("resize", closeMobileSidebar);
  }, []);


  useEffect(() => {
    const hasDialog = Boolean(modal || reopenOrderTarget || userModalOpen || clientModalOpen);
    if (!hasDialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || creatingOrder || reopeningOrder || creatingUser || clientBusy) return;
      if (clientModalOpen) setClientModalOpen(false);
      else if (userModalOpen) setUserModalOpen(false);
      else if (reopenOrderTarget) setReopenOrderTarget(null);
      else if (modal) {
        setNewOrderInitialClientId("");
        setModal(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [modal, reopenOrderTarget, userModalOpen, clientModalOpen, creatingOrder, reopeningOrder, creatingUser, clientBusy]);

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    const linkType = hashParams.get("type") || searchParams.get("type");
    const inviteLink = searchParams.get("invite") === "1" || linkType === "invite";
    const recoveryLink = linkType === "recovery";
    const requestedView = searchParams.get("view");
    const driveResult = searchParams.get("drive");
    const driveMessage = searchParams.get("drive_message");
    if (requestedView === "settings") setActiveView("settings");
    if (driveResult && driveMessage) {
      if (driveResult === "connected") showNotice(driveMessage);
      else setError(driveMessage);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("drive");
      cleanUrl.searchParams.delete("drive_message");
      window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
    supabase.auth.getSession().then(({ data }) => {
      if ((inviteLink || recoveryLink) && data.session) {
        setPasswordFlow(inviteLink ? "invite" : "recovery");
        setAuthMode("update");
        setAuthFeedback(null);
      }
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (inviteLink && session)) {
        setPasswordFlow(inviteLink ? "invite" : "recovery");
        setAuthMode("update");
        setAuthFeedback(null);
      }
      if (!session) {
        setOrders([]);
        setSectors([]);
        setProfiles([]);
        setClients([]);
        setImageUrls({});
        setUserModalOpen(false);
      }
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const [sectorResult, orderResult, commentResult, profileResult, clientResult] = await Promise.all([
        supabase.from("sectors").select("id,name,position,active").order("position"),
        supabase.from("orders").select("id,op_number,client_id,client_name,description,delivery_date,priority,sector_id,status,responsible_user_id,consultant_name,main_image_path,blocked,completed_at,installation_scheduled_at,installation_address,installation_team,installation_vehicle,installation_status,installation_notes,installation_completed_at,installation_time_confirmed,materials,notes,created_at").order("position"),
        supabase.from("order_comments").select("order_id"),
        supabase.from("profiles").select("id,name,email,role,active,created_at").order("name"),
        supabase.from("clients").select("*").order("name"),
      ]);
      if (!active) return;
      const dbError = sectorResult.error || orderResult.error || commentResult.error || profileResult.error || clientResult.error;
      if (dbError) {
        const missingSchema = ["42P01", "PGRST205"].includes(dbError.code || "");
        setError(missingSchema ? "A conexão está correta, mas as tabelas ainda precisam ser instaladas no Supabase." : `Não foi possível carregar os pedidos: ${dbError.message}`);
      } else {
        setError("");
        const loadedOrders = (orderResult.data || []) as Order[];
        const loadedProfiles = (profileResult.data || []) as Profile[];
        const loadedCurrentProfile = loadedProfiles.find((profile) => profile.id === user.id && profile.active) || null;
        const loadedCanOperate = loadedCurrentProfile?.role === "admin" || loadedCurrentProfile?.role === "manager" || loadedCurrentProfile?.role === "production";
        setSectors((sectorResult.data || []) as Sector[]);
        setOrders(loadedOrders);
        setProfiles(loadedProfiles);
        setClients((clientResult.data || []) as Client[]);
        setActiveView((current) => !loadedCurrentProfile || (loadedCurrentProfile.role !== "admin" && (current === "settings" || current === "users")) ? "kanban" : current);
        setModal((current) => !loadedCanOperate && current === "new" ? null : current);
        if (loadedCurrentProfile?.role !== "admin") setUserModalOpen(false);
        if (!loadedCurrentProfile) {
          setError("Seu perfil não está ativo. Peça a um administrador para revisar o seu acesso.");
        }
        const nextImageUrls: Record<string, string> = {};
        const driveImages = loadedOrders.filter((order) => driveThumbnailFileId(order.main_image_path));
        const storedImages = loadedOrders.filter((order) =>
          order.main_image_path
          && !/^https?:\/\//i.test(order.main_image_path)
          && !driveThumbnailFileId(order.main_image_path),
        );
        loadedOrders.forEach((order) => {
          if (order.main_image_path && /^https?:\/\//i.test(order.main_image_path)) {
            nextImageUrls[order.id] = order.main_image_path;
          }
        });
        if (storedImages.length) {
          const { data: signedImages } = await supabase.storage
            .from("order-thumbnails")
            .createSignedUrls(storedImages.map((order) => order.main_image_path as string), 86400);
          storedImages.forEach((order, index) => {
            const signedUrl = signedImages?.[index]?.signedUrl;
            if (signedUrl) nextImageUrls[order.id] = signedUrl;
          });
        }
        if (driveImages.length) {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (accessToken) {
            await Promise.all(driveImages.map(async (order) => {
              const fileId = driveThumbnailFileId(order.main_image_path);
              if (!fileId) return;
              try {
                const response = await fetch(`/api/google-drive/preview?file_id=${encodeURIComponent(fileId)}`, {
                  cache: "no-store",
                  headers: { authorization: `Bearer ${accessToken}` },
                });
                if (!response.ok) return;
                nextImageUrls[order.id] = URL.createObjectURL(await response.blob());
              } catch {
                // O pedido continua disponível mesmo se a miniatura do Drive
                // estiver temporariamente indisponível.
              }
            }));
          }
        }
        if (!active) {
          Object.values(nextImageUrls).forEach((url) => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); });
          return;
        }
        setImageUrls((current) => {
          Object.values(current).forEach((url) => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); });
          return nextImageUrls;
        });
        const counts = (commentResult.data || []).reduce<Record<string, number>>((result, item) => {
          result[item.order_id] = (result[item.order_id] || 0) + 1;
          return result;
        }, {});
        setCommentCounts(counts);
      }
      setLoading(false);
    };
    void load();
    let reloadTimer: ReturnType<typeof window.setTimeout> | null = null;
    const scheduleLoad = () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      // Uma única operação no banco pode disparar vários eventos de realtime.
      // O pequeno agrupamento evita recarregar todas as listas repetidamente.
      reloadTimer = window.setTimeout(() => void load(), 220);
    };
    const channel = supabase.channel("orders-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_comments" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, scheduleLoad)
      .subscribe();
    return () => {
      active = false;
      if (reloadTimer) window.clearTimeout(reloadTimer);
      void supabase.removeChannel(channel);
    };
  }, [user, reloadToken]);

  useEffect(() => {
    if (modal && modal !== "new") void loadOrderDetails(modal.id);
  }, [modal]);

  const activeOrders = useMemo(() => orders.filter((order) => order.status !== "completed"), [orders]);
  const completedOrders = useMemo(() => orders.filter((order) => order.status === "completed"), [orders]);
  const activeSectors = useMemo(() => sectors.filter((sector) => sector.active).sort((a, b) => a.position - b.position), [sectors]);
  const currentProfile = useMemo(
    () => profiles.find((profile) => profile.id === user?.id && profile.active) || null,
    [profiles, user?.id],
  );
  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const isAdmin = currentProfile?.role === "admin";
  const canOperate = isAdmin || currentProfile?.role === "manager" || currentProfile?.role === "production";
  const canUploadFiles = Boolean(currentProfile?.active);
  const installationSector = useMemo(() => activeSectors.find((sector) => sector.name === "INSTALAÇÃO") || null, [activeSectors]);
  const installationOrders = useMemo(() => activeOrders
    .filter((order) =>
      Boolean(order.installation_scheduled_at) ||
      order.sector_id === installationSector?.id
    )
    .sort((a, b) => {
      if (a.installation_scheduled_at && b.installation_scheduled_at) {
        return new Date(a.installation_scheduled_at).getTime() - new Date(b.installation_scheduled_at).getTime();
      }
      if (a.installation_scheduled_at) return -1;
      if (b.installation_scheduled_at) return 1;
      return orderTargetDate(a).localeCompare(orderTargetDate(b));
    }), [activeOrders, installationSector?.id]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const result = activeOrders.filter((order) => {
      const matchesTerm = !term || `${order.op_number} ${order.client_name} ${order.description}`.toLocaleLowerCase("pt-BR").includes(term);
      const matchesSector = sectorFilter === "all" || order.sector_id === sectorFilter;
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || order.priority === priorityFilter;
      const normalizedResponsible = normalizedResponsibleName(order.consultant_name);
      const matchesResponsible = responsibleFilter === "all"
        || (responsibleFilter === UNASSIGNED_RESPONSIBLE_FILTER && !normalizedResponsible)
        || normalizedResponsible === responsibleFilter;
      const due = new Date(`${order.delivery_date}T12:00:00`);
      const difference = Math.round((due.getTime() - today.getTime()) / 86400000);
      const matchesDeadline = deadlineFilter === "all" || (deadlineFilter === "late" && difference < 0) || (deadlineFilter === "today" && difference === 0) || (deadlineFilter === "next7" && difference >= 0 && difference <= 7);
      return matchesTerm && matchesSector && matchesStatus && matchesPriority && matchesResponsible && matchesDeadline;
    });
    return result.sort((a, b) => {
      if (sortMode === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortMode === "delivery") return orderTargetDate(a).localeCompare(orderTargetDate(b));
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [activeOrders, search, sectorFilter, statusFilter, priorityFilter, responsibleFilter, deadlineFilter, sortMode]);

  const activeFilterCount = [sectorFilter, statusFilter, priorityFilter, responsibleFilter, deadlineFilter].filter((value) => value !== "all").length;
  const hasActiveSearch = Boolean(search.trim() || activeFilterCount > 0);
  const visibleSectors = hasActiveSearch ? activeSectors.filter((sector) => filtered.some((order) => order.sector_id === sector.id)) : activeSectors;
  useEffect(() => {
    if (activeView !== "kanban") return;

    const board = boardRef.current;
    const topScroll = topScrollRef.current;
    if (!board || !topScroll) return;

    const updateScrollWidth = () => {
      setBoardScrollWidth(board.scrollWidth);
      topScroll.scrollLeft = board.scrollLeft;
    };

    const animationFrame = window.requestAnimationFrame(updateScrollWidth);
    const resizeObserver = new ResizeObserver(updateScrollWidth);
    resizeObserver.observe(board);
    Array.from(board.children).forEach((child) => resizeObserver.observe(child));
    window.addEventListener("resize", updateScrollWidth);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollWidth);
    };
  }, [activeView, visibleSectors.length, filtered.length]);

  function syncKanbanScroll(source: HTMLElement | null, target: HTMLElement | null) {
    if (!source || !target || syncingBoardScroll.current) return;
    syncingBoardScroll.current = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingBoardScroll.current = false;
    });
  }

  const sortLabel: Record<SortMode, string> = { newest: "Mais recentes", oldest: "Mais antigos", delivery: "Instalação/entrega" };
  const viewMeta: Record<ViewKey, { eyebrow: string; title: string; description: string }> = {
    dashboard: { eyebrow: "VISÃO EXECUTIVA", title: "Dashboard da produção", description: "Acompanhe capacidade, gargalos, prazos e instalações em uma única visão." },
    kanban: { eyebrow: "VISÃO DA PRODUÇÃO", title: "Controle de pedidos", description: "Acompanhe cada etapa e mantenha as entregas no prazo." },
    orders: { eyebrow: "OPERAÇÃO", title: "Todos os pedidos", description: "Consulte e abra os pedidos ativos da produção." },
    completed: { eyebrow: "ARQUIVO", title: "Pedidos concluídos", description: "Histórico dos trabalhos que já finalizaram o fluxo." },
    installation: { eyebrow: "AGENDA DE CAMPO", title: "Agenda de instalação e entrega", description: "Consulte o mês, selecione um dia e veja todos os pedidos programados." },
    activities: { eyebrow: "ORGANIZAÇÃO DA EQUIPE", title: "Atividades", description: "Organize grupos, atividades principais e subatividades em um único lugar." },
    clients: { eyebrow: "RELACIONAMENTO", title: "Clientes", description: "Visão consolidada dos clientes e seus pedidos." },
    reports: { eyebrow: "INDICADORES", title: "Relatórios", description: "Resumo operacional atualizado diretamente do Kanban." },
    users: { eyebrow: "ADMINISTRAÇÃO", title: "Usuários e permissões", description: "Defina quem administra, opera ou apenas visualiza o sistema." },
    settings: { eyebrow: "ADMINISTRAÇÃO", title: "Configurações", description: "Conta, conexão, importação e exportação de dados." },
  };


  const listSearch = search.trim().toLocaleLowerCase("pt-BR");
  const activeOrderFamilies = useMemo(() => {
    const responsibleOrders = activeOrders.filter((order) => {
      if (responsibleFilter === "all") return true;
      const normalizedResponsible = normalizedResponsibleName(order.consultant_name);
      return responsibleFilter === UNASSIGNED_RESPONSIBLE_FILTER
        ? !normalizedResponsible
        : normalizedResponsible === responsibleFilter;
    });
    const families = buildOrderFamilies(responsibleOrders);

    return families.filter((family) => {
      const searchableContent = [
        family.parentOp,
        ...family.orders.flatMap((order) => [order.op_number, order.client_name, order.description, order.consultant_name || ""]),
      ].join(" ").toLocaleLowerCase("pt-BR");

      return !listSearch || searchableContent.includes(listSearch);
    });
  }, [activeOrders, listSearch, responsibleFilter]);

  const visibleActiveOrderCount = activeOrderFamilies.reduce((total, family) => total + family.orders.length, 0);
  const completedOrderList = completedOrders.filter((order) => !listSearch || `${order.op_number} ${order.client_name} ${order.description}`.toLocaleLowerCase("pt-BR").includes(listSearch));
  const sectorReport = activeSectors.map((sector) => ({ sector, count: activeOrders.filter((order) => order.sector_id === sector.id).length }));
  const largestSectorCount = Math.max(1, ...sectorReport.map((item) => item.count));

  function navigateTo(view: ViewKey) {
    if ((view === "settings" || view === "users") && !isAdmin) return;
    setActiveView(view);
    setSidebarOpen(false);
  }

  function cycleSortMode() {
    setSortMode((current) => current === "newest" ? "oldest" : current === "oldest" ? "delivery" : "newest");
  }

  function clearFilters() {
    setSearch("");
    setSectorFilter("all");
    setStatusFilter("all");
    setPriorityFilter("all");
    setResponsibleFilter("all");
    setDeadlineFilter("all");
  }

  function toggleOrderFamily(parentOp: string) {
    setExpandedOrderFamilies((current) => {
      const next = new Set(current);
      if (next.has(parentOp)) next.delete(parentOp);
      else next.add(parentOp);
      return next;
    });
  }

  function openOrder(order: Order, tab: DetailTab) {
    setHistory([]);
    setChangeHistory([]);
    setComments([]);
    setMaterials([]);
    setChecklist([]);
    setOrderFiles([]);
    setDetailError("");
    setDetailTab(tab);
    setModal(order);
  }

  async function loadOrderDetails(orderId: string) {
    setDetailLoading(true);
    setDetailError("");
    const [historyResult, changeResult, commentResult, materialResult, checklistResult, fileResult] = await Promise.all([
      supabase
        .from("order_history")
        .select("id,action_type,description,previous_sector_id,new_sector_id,previous_status,new_status,created_at,author:profiles!order_history_user_id_fkey(name,email)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false }),
      supabase.from("order_change_history").select("id,field_name,old_value,new_value,change_group,created_at,changed_by").eq("order_id", orderId).order("created_at", { ascending: false }),
      supabase
        .from("order_comments")
        .select("id,comment,created_at,user_id,author:profiles!order_comments_user_id_fkey(name,email)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true }),
      supabase.from("order_materials").select("id,order_id,material_name,quantity,unit,width,status,notes,created_at").eq("order_id", orderId).order("created_at"),
      supabase.from("order_checklist_items").select("id,order_id,label,category,completed,position,completed_at,created_at").eq("order_id", orderId).order("position"),
      supabase.from("order_files").select("id,order_id,uploaded_by,updated_by,origin,file_name,file_path,file_type,file_size,drive_url,drive_file_id,drive_folder_id,file_category,version,notes,is_approved,drive_modified_at,drive_last_modified_by_name,drive_last_modified_by_email,updated_at,created_at").eq("order_id", orderId).is("removed_from_order_at", null).order("drive_modified_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    ]);
    const detailsError = historyResult.error || changeResult.error || commentResult.error || materialResult.error || checklistResult.error || fileResult.error;
    if (detailsError) {
      setDetailError(`Não foi possível carregar a OS completa: ${detailsError.message}`);
    } else {
      setHistory((historyResult.data || []) as unknown as HistoryEntry[]);
      setChangeHistory((changeResult.data || []) as OrderChangeEntry[]);
      setComments((commentResult.data || []) as unknown as CommentEntry[]);
      setMaterials((materialResult.data || []) as OrderMaterial[]);
      setChecklist((checklistResult.data || []) as ChecklistItem[]);
      setOrderFiles((fileResult.data || []) as OrderFileEntry[]);
    }
    setDetailLoading(false);
  }

  function historyDescription(entry: HistoryEntry) {
    const hasProductionTransition =
      entry.previous_sector_id !== entry.new_sector_id ||
      entry.previous_status !== entry.new_status;

    if (!hasProductionTransition) return "";

    const previousSector = sectors.find((sector) => sector.id === entry.previous_sector_id)?.name || "Setor não definido";
    const nextSector = sectors.find((sector) => sector.id === entry.new_sector_id)?.name || "Setor não definido";
    return `${previousSector} · ${statusLabel(entry.previous_status)} → ${nextSector} · ${statusLabel(entry.new_status)}`;
  }

  const changeFieldLabel: Record<string, string> = {
    op_number: "Número da OP", client_name: "Cliente", description: "Serviço", delivery_date: "Prazo de produção",
    priority: "Prioridade", sector_id: "Setor de produção", status: "Status da produção", materials: "Materiais e especificações",
    notes: "Observações", consultant_name: "Consultor", installation_scheduled_at: "Data da instalação/entrega",
    installation_address: "Endereço da instalação", installation_team: "Equipe de instalação",
    installation_vehicle: "Veículo", installation_status: "Status da instalação",
    installation_notes: "Orientações da instalação", installation_completed_at: "Conclusão da instalação",
  };

  const installationStatusLabel: Record<string, string> = {
    pending: "Pendente",
    scheduled: "Agendada",
    in_progress: "Em andamento",
    completed: "Concluída",
    cancelled: "Cancelada",
  };

  function formatHistoryValue(fieldName: string, value: string | null) {
    if (!value) return "Não definido";

    if (fieldName === "sector_id") {
      return sectors.find((sector) => sector.id === value)?.name || "Setor não identificado";
    }
    if (fieldName === "status") return statusLabel(value as DbStatus);
    if (fieldName === "priority") return priorityLabel[value as Priority] || value;
    if (fieldName === "delivery_date") {
      return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
    }
    if (fieldName === "installation_scheduled_at" || fieldName === "installation_completed_at") {
      return installationDateTimeLabel(value);
    }
    if (fieldName === "installation_status") return installationStatusLabel[value] || value;

    return value;
  }

  function isChangeCoveredByOperationalHistory(entry: OrderChangeEntry) {
    const actionTypes = entry.field_name === "installation_scheduled_at"
      ? new Set(["installation_scheduled", "installation_rescheduled", "installation_cancelled"])
      : entry.field_name === "sector_id" || entry.field_name === "status"
        ? new Set(["movement", "completed", "reopened"])
        : null;

    if (!actionTypes) return false;
    const entryTime = new Date(entry.created_at).getTime();

    return history.some((historyEntry) =>
      actionTypes.has(historyEntry.action_type) &&
      Math.abs(new Date(historyEntry.created_at).getTime() - entryTime) <= 2000,
    );
  }

  const groupedChangeHistory = Array.from(
    changeHistory
      .filter((entry) => !isChangeCoveredByOperationalHistory(entry))
      .reduce<Map<string, OrderChangeEntry[]>>((groups, entry) => {
        const key = `${entry.created_at}|${entry.changed_by || "system"}|${entry.change_group}`;
        const current = groups.get(key) || [];
        current.push(entry);
        groups.set(key, current);
        return groups;
      }, new Map()),
  ).map(([key, entries]) => ({
    id: key,
    kind: "change" as const,
    created_at: entries[0].created_at,
    changed_by: entries[0].changed_by,
    entries,
  }));

  const historyTimeline = [
    ...groupedChangeHistory,
    ...history.map((entry) => ({
      id: String(entry.id),
      kind: "history" as const,
      created_at: entry.created_at,
      entry,
    })),
  ].sort((first, second) =>
    new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
  );

  function changeGroupTitle(entries: OrderChangeEntry[]) {
    if (entries.length === 1) {
      return `Alteração em ${changeFieldLabel[entries[0].field_name] || entries[0].field_name}`;
    }
    if (entries.every((entry) => entry.field_name.startsWith("installation_"))) {
      return "Dados da instalação atualizados";
    }
    return "Informações do pedido atualizadas";
  }

  async function orderNumberAlreadyExists(opNumber: string, excludeOrderId?: string) {
    const normalized = normalizeOrderNumberForComparison(opNumber);
    if (!normalized) return false;

    const { data, error: rpcError } = await supabase.rpc("order_number_exists", {
      p_order_number: normalized,
      p_exclude_order_id: excludeOrderId || null,
    });

    if (!rpcError) return Boolean(data);

    // Compatibilidade temporária enquanto a migração ainda não estiver aplicada.
    // A restrição definitiva permanece no banco após a migração.
    const { data: possibleMatches, error: queryError } = await supabase
      .from("orders")
      .select("id,op_number")
      .ilike("op_number", normalized)
      .limit(20);

    if (queryError) {
      console.error("Não foi possível validar o número da OS", { rpcError, queryError, opNumber });
      return false;
    }

    return (possibleMatches || []).some((item) =>
      item.id !== excludeOrderId
      && normalizeOrderNumberForComparison(item.op_number) === normalized,
    );
  }

  async function saveOrderSummary(event: FormEvent<HTMLFormElement>, order: Order) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const clientId = String(form.get("client_id") || "");
    const client = clients.find((item) => item.id === clientId);
    const targetDate = String(form.get("target_date") || orderTargetDate(order));
    let nextOpNumber = String(form.get("op_number") || "").trim();
    if (requiresAutomaticOrderNumber(nextOpNumber)) {
      const { data: generatedOrderNumber, error: generatedOrderNumberError } = await supabase.rpc("generate_unique_order_number");
      if (generatedOrderNumberError || !generatedOrderNumber) {
        setDetailError(`Não foi possível gerar o número automático da OS: ${generatedOrderNumberError?.message || "resposta inválida do banco"}.`);
        return;
      }
      nextOpNumber = String(generatedOrderNumber).trim();
    }

    if (await orderNumberAlreadyExists(nextOpNumber, order.id)) {
      const duplicateMessage = `A OS ${nextOpNumber} já está cadastrada. Informe outro número ou use 0000 para gerar automaticamente.`;
      setError(duplicateMessage);
      setDetailError(duplicateMessage);
      return;
    }

    await updateOrder(order, {
      op_number: nextOpNumber,
      client_id: clientId || null,
      client_name: client ? (client.trade_name || client.name) : String(form.get("client_name") || "").trim(),
      description: String(form.get("description") || "").trim(),
      installation_scheduled_at: installationDateToIso(targetDate, order.installation_scheduled_at),
      delivery_date: previousBusinessDay(targetDate),
      installation_status: order.installation_status === "completed" ? "completed" : "scheduled",
      installation_time_confirmed: order.installation_time_confirmed,
      priority: String(form.get("priority") || order.priority) as Priority,
      consultant_name: String(form.get("consultant_name") || "").trim() || null,
      materials: String(form.get("materials") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
    }, "Informações da OS atualizadas e registradas no histórico.");
    await loadOrderDetails(order.id);
  }

  async function saveProductionDetails(event: FormEvent<HTMLFormElement>, order: Order) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextSectorId = String(form.get("sector_id") || order.sector_id);
    const nextSectorName = activeSectors.find((sector) => sector.id === nextSectorId)?.name || "";
    let nextStatus = String(form.get("status") || order.status) as DbStatus;
    const pcpSpecificStatus = nextStatus === "in_transport" || nextStatus === "waiting_client";
    if (!isPcpSectorName(nextSectorName) && pcpSpecificStatus) nextStatus = "waiting";
    if (isPcpSectorName(nextSectorName) && nextStatus === "in_progress") nextStatus = "waiting";
    await updateOrder(order, {
      sector_id: nextSectorId,
      status: nextStatus,
    }, "Dados da produção atualizados e registrados no histórico.");
    await loadOrderDetails(order.id);
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal === "new") return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const text = String(form.get("comment") || "").trim();
    if (!text) return;
    setCommentSending(true);
    setDetailError("");
    const { error: commentError } = await supabase.from("order_comments").insert({ order_id: modal.id, comment: text });
    if (commentError) {
      setDetailError(`Não foi possível adicionar o comentário: ${commentError.message}`);
    } else {
      formElement.reset();
      await loadOrderDetails(modal.id);
      setNotice("Comentário adicionado.");
      window.setTimeout(() => setNotice(""), 2500);
    }
    setCommentSending(false);
  }

  async function addMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal === "new" || !canUploadFiles || workspaceBusy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setWorkspaceBusy(true);
    const payload = {
      order_id: modal.id,
      material_name: String(form.get("material_name") || "").trim(),
      quantity: Number(form.get("quantity") || 0),
      unit: String(form.get("unit") || "un"),
      width: form.get("width") ? Number(form.get("width")) : null,
      status: String(form.get("status") || "planned"),
      notes: String(form.get("notes") || "").trim() || null,
    };
    const { error: materialError } = await supabase.from("order_materials").insert(payload);
    if (materialError) setDetailError(`Não foi possível adicionar o material: ${materialError.message}`);
    else { formElement.reset(); await loadOrderDetails(modal.id); showNotice("Material adicionado à OS."); }
    setWorkspaceBusy(false);
  }

  async function deleteMaterial(material: OrderMaterial) {
    if (!canOperate || workspaceBusy || !window.confirm(`Remover ${material.material_name} desta OS?`)) return;
    setWorkspaceBusy(true);
    const { error: materialError } = await supabase.from("order_materials").delete().eq("id", material.id);
    if (materialError) setDetailError(`Não foi possível remover o material: ${materialError.message}`);
    else if (modal && modal !== "new") await loadOrderDetails(modal.id);
    setWorkspaceBusy(false);
  }

  async function createDefaultChecklist() {
    if (!modal || modal === "new" || !canOperate || workspaceBusy) return;
    const defaults = [
      ["Pré-produção", "Medidas conferidas"], ["Pré-produção", "Arte aprovada pelo cliente"],
      ["Materiais", "Materiais disponíveis ou reservados"], ["Produção", "Arquivo pronto para produção"],
      ["Qualidade", "Acabamento e medidas conferidos"], ["Instalação", "Equipe e endereço confirmados"],
    ];
    setWorkspaceBusy(true);
    const { error: checklistError } = await supabase.from("order_checklist_items").insert(defaults.map(([category, label], position) => ({ order_id: modal.id, category, label, position })));
    if (checklistError) setDetailError(`Não foi possível criar o checklist: ${checklistError.message}`);
    else { await loadOrderDetails(modal.id); showNotice("Checklist padrão criado."); }
    setWorkspaceBusy(false);
  }

  async function addChecklistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal === "new" || !canOperate || workspaceBusy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setWorkspaceBusy(true);
    const { error: checklistError } = await supabase.from("order_checklist_items").insert({ order_id: modal.id, label: String(form.get("label") || "").trim(), category: String(form.get("category") || "Geral").trim() || "Geral", position: checklist.length });
    if (checklistError) setDetailError(`Não foi possível adicionar o item: ${checklistError.message}`);
    else { formElement.reset(); await loadOrderDetails(modal.id); }
    setWorkspaceBusy(false);
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    if (!canOperate || workspaceBusy) return;
    setWorkspaceBusy(true);
    const completed = !item.completed;
    const { error: checklistError } = await supabase.from("order_checklist_items").update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq("id", item.id);
    if (checklistError) setDetailError(`Não foi possível atualizar o checklist: ${checklistError.message}`);
    else if (modal && modal !== "new") await loadOrderDetails(modal.id);
    setWorkspaceBusy(false);
  }

  async function registerDriveFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || modal === "new" || !canUploadFiles || !user || workspaceBusy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const fileName = String(form.get("file_name") || "").trim();
    const driveUrl = String(form.get("drive_url") || "").trim();
    const fileCategory = String(form.get("file_category") || "other");
    const version = String(form.get("version") || "").trim() || null;
    const notes = String(form.get("notes") || "").trim() || null;
    const isApproved = form.get("is_approved") === "on";

    if (!fileName || !driveUrl) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(driveUrl);
    } catch {
      setDetailError("Informe um link válido do Google Drive.");
      return;
    }

    const allowedHosts = new Set(["drive.google.com", "docs.google.com"]);
    if (parsedUrl.protocol !== "https:" || !allowedHosts.has(parsedUrl.hostname)) {
      setDetailError("Use um link HTTPS do Google Drive ou Google Docs.");
      return;
    }

    setWorkspaceBusy(true);
    setDetailError("");

    const { error: recordError } = await supabase.from("order_files").insert({
      order_id: modal.id,
      uploaded_by: user.id,
      origin: "manual_link",
      file_name: fileName,
      file_path: null,
      file_type: fileCategory,
      file_size: null,
      drive_url: driveUrl,
      file_category: fileCategory,
      version,
      notes,
      is_approved: isApproved,
    });

    if (recordError) {
      setDetailError(`Não foi possível vincular o arquivo: ${recordError.message}`);
    } else {
      formElement.reset();
      await loadOrderDetails(modal.id);
      showNotice("Link do Google Drive vinculado à OS.");
    }

    setWorkspaceBusy(false);
  }

  async function removeOrderFileLink(file: OrderFileEntry) {
    if (!isAdmin || !user || workspaceBusy || !window.confirm(`Remover ${file.file_name} somente desta OS? O arquivo continuará no Google Drive e voltará a aparecer caso você use Atualizar arquivos.`)) return;
    setWorkspaceBusy(true);
    setDetailError("");

    const { error: recordError } = await supabase
      .from("order_files")
      .update({
        updated_by: user.id,
        removal_mode: "unlink",
        removed_from_order_at: new Date().toISOString(),
        removed_from_order_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", file.id);

    if (recordError) {
      const migrationHint = /removal_mode|removed_from_order/i.test(recordError.message)
        ? " Execute a migração de remoção e exclusão de arquivos no Supabase."
        : "";
      setDetailError(`Não foi possível remover o arquivo da OS: ${recordError.message}.${migrationHint}`);
    } else {
      if (modal && modal !== "new") await loadOrderDetails(modal.id);
      showNotice("Arquivo removido da OS e mantido no Google Drive. Ao usar Atualizar arquivos, ele voltará a aparecer enquanto continuar na pasta da ordem.");
    }
    setWorkspaceBusy(false);
  }

  async function deleteOrderFileFromDrive(file: OrderFileEntry) {
    if (!isAdmin || !user || workspaceBusy || !file.drive_file_id) return;
    const confirmed = window.confirm(
      `Excluir definitivamente ${file.file_name} do Google Drive?\n\nEsta ação também removerá o arquivo da OS e não poderá ser desfeita.`,
    );
    if (!confirmed) return;

    setWorkspaceBusy(true);
    setDetailError("");
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        throw new Error("Sessão expirada. Entre novamente no sistema.");
      }

      const response = await fetch("/api/google-drive/delete", {
        method: "POST",
        headers: {
          authorization: `Bearer ${data.session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ record_id: file.id }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir o arquivo do Google Drive.");

      if (modal && modal !== "new") await loadOrderDetails(modal.id);
      showNotice(payload.message || "Arquivo excluído do Google Drive e removido da OS.");
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Não foi possível excluir o arquivo do Google Drive.");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function downloadOrderFile(file: OrderFileEntry) {
    if (workspaceBusy) return;
    setWorkspaceBusy(true);
    setDetailError("");
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) throw new Error("Sessão expirada. Entre novamente no sistema.");
      const response = await fetch(`/api/google-drive/download?record_id=${encodeURIComponent(file.id)}`, {
        headers: { authorization: `Bearer ${data.session.access_token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Não foi possível baixar o arquivo.");
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const encodedName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const quotedName = contentDisposition.match(/filename="([^"]+)"/i)?.[1];
      let downloadName = file.file_name;
      try {
        downloadName = encodedName ? decodeURIComponent(encodedName) : quotedName || file.file_name;
      } catch {
        downloadName = quotedName || file.file_name;
      }
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Não foi possível baixar o arquivo.");
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthFeedback(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
    if (resetError) {
      setAuthFeedback({ type: "error", text: `Não foi possível enviar o e-mail: ${resetError.message}` });
    } else {
      setAuthFeedback({ type: "success", text: "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha." });
    }
    setAuthBusy(false);
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthFeedback(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password.length < 8) {
      setAuthFeedback({ type: "error", text: "A nova senha precisa ter pelo menos 8 caracteres." });
      setAuthBusy(false);
      return;
    }
    if (password !== confirmation) {
      setAuthFeedback({ type: "error", text: "As duas senhas não são iguais." });
      setAuthBusy(false);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setAuthFeedback({ type: "error", text: `Não foi possível alterar a senha: ${updateError.message}` });
    } else {
      window.history.replaceState({}, "", window.location.pathname);
      await supabase.auth.signOut({ scope: "local" });
      setAuthMode("login");
      setAuthFeedback({ type: "success", text: "Senha alterada com sucesso. Entre novamente usando a nova senha." });
    }
    setAuthBusy(false);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setError("");
    setAuthFeedback(null);
    const form = new FormData(event.currentTarget);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
    if (authError) setError("E-mail ou senha inválidos. Confira os dados e tente novamente.");
    setAuthBusy(false);
  }

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimerRef.current = null;
    }, 3500);
  }

  function cardImageUrl(order: Order) {
    return imageUrls[order.id] || "";
  }

  async function updateOrder(order: Order, patch: OrderPatch, successMessage: string) {
    if (!canOperate) {
      setError("Seu perfil possui acesso somente para visualizar e comentar.");
      return false;
    }
    if (busyOrderId) return false;

    setBusyOrderId(order.id);
    setError("");
    setDetailError("");

    const optimisticOrder = { ...order, ...patch };
    setOrders((current) =>
      current.map((item) => (item.id === order.id ? optimisticOrder : item)),
    );
    setModal((current) =>
      current && current !== "new" && current.id === order.id
        ? optimisticOrder
        : current,
    );

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .select(
        "id,op_number,client_id,client_name,description,delivery_date,priority,sector_id,status,responsible_user_id,consultant_name,main_image_path,blocked,completed_at,installation_scheduled_at,installation_address,installation_team,installation_vehicle,installation_status,installation_notes,installation_completed_at,installation_time_confirmed,materials,notes,created_at",
      )
      .maybeSingle();

    if (updateError || !updatedOrder) {
      setOrders((current) =>
        current.map((item) => (item.id === order.id ? order : item)),
      );
      setModal((current) =>
        current && current !== "new" && current.id === order.id ? order : current,
      );

      const rawMessage =
        updateError?.message ||
        "Nenhuma linha foi atualizada. Verifique as permissões do usuário no Supabase.";
      const message = updateError?.code === "23505"
        ? "Este número de OS já está cadastrado. Informe outro número ou use 0000 para gerar automaticamente."
        : rawMessage;

      setError(`Não foi possível atualizar o pedido: ${message}`);
      setDetailError(`Não foi possível salvar os dados: ${message}`);
      console.error("Falha ao atualizar a OS", {
        orderId: order.id,
        patch,
        updateError,
        updatedOrder,
      });
      setBusyOrderId(null);
      return false;
    }

    const confirmedOrder = updatedOrder as Order;

    setOrders((current) =>
      current.map((item) => (item.id === confirmedOrder.id ? confirmedOrder : item)),
    );
    setModal((current) =>
      current && current !== "new" && current.id === confirmedOrder.id
        ? confirmedOrder
        : current,
    );

    showNotice(successMessage);
    setBusyOrderId(null);
    return true;
  }

  async function move(sectorId: string, status: UiStatus) {
    if (!canOperate || !dragged) return;
    const orderId = dragged;
    const previous = orders.find((order) => order.id === orderId);
    setDragOverLane(null);
    const nextStatus = statusToDb[status];
    setDragged(null);
    if (!previous) return;
    await updateOrder(previous, { sector_id: sectorId, status: nextStatus }, "Pedido movimentado e histórico atualizado.");
  }

  async function finishOrder(order: Order) {
    if (!canOperate) return;
    if (!window.confirm(`Finalizar a OP ${order.op_number}? O pedido sairá do Kanban ativo.`)) return;
    await updateOrder(order, { status: "completed", completed_at: new Date().toISOString(), blocked: false }, "Pedido finalizado e enviado para Concluídos.");
  }

  async function reopenCompletedOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reopenOrderTarget || !canOperate || reopeningOrder) return;

    const form = new FormData(event.currentTarget);
    const observation = String(form.get("observation") || "").trim();

    if (observation.length < 5) {
      setReopenError("Informe uma observação com pelo menos 5 caracteres.");
      return;
    }

    setReopeningOrder(true);
    setReopenError("");
    setError("");

    const { data, error: reopenRpcError } = await supabase.rpc(
      "reopen_completed_order",
      {
        target_order_id: reopenOrderTarget.id,
        reopening_observation: observation,
      },
    );

    if (reopenRpcError) {
      const message = reopenRpcError.message || "Não foi possível devolver o pedido para a produção.";
      setReopenError(message);
      setError(`Não foi possível reabrir o pedido: ${message}`);
      setReopeningOrder(false);
      return;
    }

    const reopenedOrder = Array.isArray(data) ? data[0] : data;

    if (reopenedOrder) {
      setOrders((current) =>
        current.map((order) =>
          order.id === reopenOrderTarget.id
            ? { ...order, ...reopenedOrder }
            : order,
        ),
      );
    } else {
      setOrders((current) =>
        current.map((order) =>
          order.id === reopenOrderTarget.id
            ? {
                ...order,
                status: "waiting",
                completed_at: null,
                blocked: false,
              }
            : order,
        ),
      );
    }

    setReopenOrderTarget(null);
    setReopeningOrder(false);
    showNotice(`OP ${reopenOrderTarget.op_number} devolvida para a produção.`);
  }

  async function deleteOrder(order: Order) {
    if (!isAdmin || busyOrderId) return;
    if (!window.confirm(`Apagar definitivamente a OP ${order.op_number}? Esta operação também removerá o histórico e os comentários e não poderá ser desfeita.`)) return;
    setBusyOrderId(order.id);
    setError("");
    const { data: deleted, error: deleteError } = await supabase.rpc(
      "delete_order_permanently",
      { target_order_id: order.id },
    );
    if (deleteError || deleted !== true) {
      const message = deleteError?.message || "operação não autorizada";
      const migrationHint = /delete_order_permanently|foreign key|order_history_order_id_fkey/i.test(message)
        ? " Execute a migração de correção da exclusão de pedidos."
        : "";
      setError(`Não foi possível apagar o pedido: ${message}.${migrationHint}`);
      setBusyOrderId(null);
      return;
    }
    if (order.main_image_path && !/^https?:\/\//i.test(order.main_image_path) && !driveThumbnailFileId(order.main_image_path)) {
      await supabase.storage.from("order-thumbnails").remove([order.main_image_path]);
    }
    setOrders((current) => current.filter((item) => item.id !== order.id));
    setModal((current) => current && current !== "new" && current.id === order.id ? null : current);
    setBusyOrderId(null);
    showNotice(`OP ${order.op_number} apagada com sucesso.`);
  }

  async function scheduleInstallation(event: FormEvent<HTMLFormElement>, order: Order) {
    event.preventDefault();
    if (!canOperate) return;
    const value = String(new FormData(event.currentTarget).get("scheduled_at") || "");
    if (!value) return;
    const scheduledAt = installationLocalToIso(value);
    const targetDate = value.slice(0, 10);
    await updateOrder(order, {
      installation_scheduled_at: scheduledAt,
      delivery_date: previousBusinessDay(targetDate),
      installation_status: "scheduled",
      installation_time_confirmed: true,
    }, order.installation_scheduled_at ? "Instalação ou entrega reagendada." : "Instalação ou entrega agendada.");
  }

  async function saveInstallationDetails(event: FormEvent<HTMLFormElement>, order: Order) {
    event.preventDefault();
    if (!canOperate || busyOrderId === order.id) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const scheduledValue = String(form.get("scheduled_at") || "").trim();
    const selectedStatus = String(
      form.get("installation_status") || "pending",
    ) as NonNullable<Order["installation_status"]>;

    const saved = await updateOrder(
      order,
      {
        installation_scheduled_at: scheduledValue
          ? installationLocalToIso(scheduledValue)
          : order.installation_scheduled_at,
        delivery_date: scheduledValue
          ? previousBusinessDay(scheduledValue.slice(0, 10))
          : order.delivery_date,
        installation_address:
          String(form.get("installation_address") || "").trim() || null,
        installation_team:
          String(form.get("installation_team") || "").trim() || null,
        installation_vehicle:
          String(form.get("installation_vehicle") || "").trim() || null,
        installation_status: selectedStatus,
        installation_time_confirmed: Boolean(scheduledValue),
        installation_notes:
          String(form.get("installation_notes") || "").trim() || null,
        installation_completed_at:
          selectedStatus === "completed"
            ? order.installation_completed_at || new Date().toISOString()
            : null,
      },
      "Dados da instalação atualizados.",
    );

    if (saved) {
      await loadOrderDetails(order.id);
    }
  }


  async function changeUserRole(profile: Profile, nextRole: "admin" | "production" | "viewer") {
    if (!isAdmin || profile.id === user?.id || profileBusyId) return;
    setProfileBusyId(profile.id);
    setError("");
    const { data: updatedProfile, error: profileError } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("id", profile.id)
      .select("id,name,email,role,active,created_at")
      .maybeSingle();
    if (profileError || !updatedProfile) {
      setError(`Não foi possível alterar o nível do usuário: ${profileError?.message || "operação não autorizada"}`);
    } else {
      setProfiles((current) => current.map((item) => item.id === profile.id ? updatedProfile as Profile : item));
      showNotice(`Acesso de ${profile.name || profile.email} alterado para ${roleLabel[nextRole]}.`);
    }
    setProfileBusyId(null);
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || creatingUser) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const role = String(form.get("role") || "viewer") as "admin" | "production" | "viewer";

    setCreatingUser(true);
    setUserCreateError("");

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error("Sua sessão expirou. Entre novamente no sistema.");
      }

      const response = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name, email, role }),
      });
      const payload = await response.json().catch(() => ({})) as CreateUserResponse;

      if (!response.ok || !payload.ok || !payload.user) {
        throw new Error(payload.error || "Não foi possível criar o usuário. Tente novamente.");
      }

      setProfiles((current) => [...current.filter((profile) => profile.id !== payload.user?.id), payload.user as Profile]
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "pt-BR")));
      formElement.reset();
      setUserModalOpen(false);
      showNotice("Convite enviado para " + payload.user.email + ".");
    } catch (error) {
      setUserCreateError(error instanceof Error ? error.message : "Não foi possível criar o usuário. Tente novamente.");
    } finally {
      setCreatingUser(false);
    }
  }


  function normalizedClientImportName(value: string | null | undefined) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleUpperCase("pt-BR");
  }

  async function ensureClientByName(name: string) {
    const cleanName = name.replace(/\s+/g, " ").trim();
    if (!cleanName) throw new Error("O PDF não informou o nome do cliente.");

    const normalized = normalizedClientImportName(cleanName);
    const localClient = clients.find((client) =>
      normalizedClientImportName(client.trade_name || client.name) === normalized
      || normalizedClientImportName(client.name) === normalized,
    );
    if (localClient) return localClient;

    const { data: clientId, error: ensureError } = await supabase.rpc("ensure_client_by_name", { p_name: cleanName });
    if (ensureError || !clientId) {
      throw new Error(`Não foi possível cadastrar automaticamente o cliente “${cleanName}”: ${ensureError?.message || "resposta inválida do banco"}. Execute a migração do setor PCP e cadastro automático de clientes.`);
    }

    const { data: createdClient, error: clientReadError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", String(clientId))
      .single();
    if (clientReadError || !createdClient) {
      throw new Error(`O cliente “${cleanName}” foi preparado, mas não pôde ser carregado: ${clientReadError?.message || "registro não encontrado"}.`);
    }

    const savedClient = createdClient as Client;
    setClients((current) => {
      const next = [...current.filter((client) => client.id !== savedClient.id), savedClient];
      return next.sort((a, b) => (a.trade_name || a.name).localeCompare(b.trade_name || b.name, "pt-BR"));
    });
    return savedClient;
  }

  function openNewOrder(clientId = "") {
    setNewOrderInitialClientId(clientId);
    setError("");
    setModal("new");
  }

  function openCreateClient(onSaved?: (client: Client) => void) {
    setEditingClient(null);
    setClientError("");
    clientAfterSaveRef.current = onSaved || null;
    setClientModalOpen(true);
  }

  function openEditClient(client: Client, onSaved?: (client: Client) => void) {
    setEditingClient(client);
    setClientError("");
    clientAfterSaveRef.current = onSaved || null;
    setClientModalOpen(true);
  }

  function closeClientModal() {
    if (clientBusy) return;
    setClientModalOpen(false);
    setEditingClient(null);
    clientAfterSaveRef.current = null;
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canOperate || clientBusy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim();
    if (!name) return;

    setClientBusy(true);
    setClientError("");
    const payload = {
      name,
      trade_name: String(form.get("trade_name") || "").trim() || null,
      document: String(form.get("document") || "").replace(/\D/g, "") || null,
      phone: String(form.get("phone") || "").trim() || null,
      whatsapp: String(form.get("whatsapp") || "").trim() || null,
      email: String(form.get("email") || "").trim().toLowerCase() || null,
      contact_name: String(form.get("contact_name") || "").trim() || null,
      address: String(form.get("address") || "").trim() || null,
      district: String(form.get("district") || "").trim() || null,
      city: String(form.get("city") || "").trim() || null,
      state: String(form.get("state") || "").trim().toUpperCase() || null,
      notes: String(form.get("notes") || "").trim() || null,
      active: editingClient ? form.get("active") === "on" : true,
    };

    const clientResult = editingClient
      ? await supabase.from("clients").update(payload).eq("id", editingClient.id).select("*").single()
      : await supabase.from("clients").insert({ ...payload, created_by: user?.id }).select("*").single();

    if (clientResult.error || !clientResult.data) {
      setClientError(clientResult.error?.message || "Não foi possível salvar o cliente.");
      setClientBusy(false);
      return;
    }

    const savedClient = clientResult.data as Client;
    const displayName = savedClient.trade_name || savedClient.name;
    const wasEditing = Boolean(editingClient);
    let orderSyncWarning = "";

    if (editingClient) {
      const { error: orderSyncError } = await supabase
        .from("orders")
        .update({ client_name: displayName })
        .eq("client_id", savedClient.id);
      if (orderSyncError) {
        orderSyncWarning = ` O cadastro foi salvo, mas os nomes nos pedidos não foram sincronizados: ${orderSyncError.message}`;
      } else {
        setOrders((current) => current.map((order) => order.client_id === savedClient.id ? { ...order, client_name: displayName } : order));
      }
      setClients((current) => current
        .map((client) => client.id === savedClient.id ? savedClient : client)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    } else {
      setClients((current) => [...current, savedClient].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
    }

    const afterSave = clientAfterSaveRef.current;
    setClientModalOpen(false);
    setEditingClient(null);
    clientAfterSaveRef.current = null;
    setClientBusy(false);
    formElement.reset();
    afterSave?.(savedClient);
    if (orderSyncWarning) setError(orderSyncWarning.trim());
    showNotice(wasEditing ? "Cadastro do cliente atualizado." : "Cliente cadastrado com sucesso.");
  }

  async function addOrders(submission: OrderBatchSubmission) {
    if (!canOperate) {
      setError("Seu perfil não pode cadastrar pedidos.");
      return false;
    }
    if (!user?.id) {
      setError("Sua sessão expirou. Entre novamente antes de cadastrar pedidos.");
      return false;
    }
    if (!activeSectors.length) {
      setError("Cadastre pelo menos um setor antes de criar pedidos.");
      return false;
    }

    let resolvedBaseOp = submission.baseOp.trim();
    if (requiresAutomaticOrderNumber(resolvedBaseOp)) {
      const { data: generatedOrderNumber, error: generatedOrderNumberError } = await supabase.rpc("generate_unique_order_number");
      if (generatedOrderNumberError || !generatedOrderNumber) {
        setError(`Não foi possível gerar o número automático da OS: ${generatedOrderNumberError?.message || "resposta inválida do banco"}. Execute a migração de numeração automática.`);
        return false;
      }
      resolvedBaseOp = String(generatedOrderNumber).trim();
    }

    const resolvedItems = submission.items.map((item, index) => ({
      ...item,
      opNumber: submission.mode === "batch"
        ? `${resolvedBaseOp}-${item.suffix?.trim() || String(index + 1)}`
        : resolvedBaseOp,
    }));

    const normalizedNewOps = resolvedItems.map((item) => item.opNumber.trim().toLocaleUpperCase("pt-BR"));
    const duplicatedInsideSubmission = normalizedNewOps.some((opNumber, index) => normalizedNewOps.indexOf(opNumber) !== index);
    if (duplicatedInsideSubmission) {
      setError("Existem números de OP repetidos no cadastro.");
      return false;
    }
    const existingOps = new Set(orders.map((order) => order.op_number.trim().toLocaleUpperCase("pt-BR")));
    const alreadyExists = resolvedItems.find((item) => existingOps.has(item.opNumber.trim().toLocaleUpperCase("pt-BR")));
    if (alreadyExists) {
      setError(`A OP ${alreadyExists.opNumber} já está cadastrada.`);
      return false;
    }

    const databaseChecks = await Promise.all(
      resolvedItems.map(async (item) => ({
        opNumber: item.opNumber,
        exists: await orderNumberAlreadyExists(item.opNumber),
      })),
    );
    const databaseDuplicate = databaseChecks.find((item) => item.exists);
    if (databaseDuplicate) {
      setError(`A OP ${databaseDuplicate.opNumber} já está cadastrada. Informe outro número ou use 0000 para gerar automaticamente.`);
      return false;
    }

    let availableClients = [...clients];
    const missingClientIds = Array.from(new Set(
      resolvedItems
        .map((item) => item.clientId)
        .filter((clientId) => clientId && !availableClients.some((client) => client.id === clientId)),
    ));
    if (missingClientIds.length) {
      const { data: fetchedClients, error: clientFetchError } = await supabase
        .from("clients")
        .select("*")
        .in("id", missingClientIds);
      if (clientFetchError) {
        setError(`Não foi possível confirmar o cliente recém-cadastrado: ${clientFetchError.message}`);
        return false;
      }
      availableClients = [...availableClients, ...((fetchedClients || []) as Client[])];
      setClients((current) => {
        const byId = new Map(current.map((client) => [client.id, client]));
        for (const client of (fetchedClients || []) as Client[]) byId.set(client.id, client);
        return Array.from(byId.values()).sort((a, b) => (a.trade_name || a.name).localeCompare(b.trade_name || b.name, "pt-BR"));
      });
    }

    const missingClientItem = resolvedItems.find((item) => !availableClients.some((client) => client.id === item.clientId));
    if (missingClientItem) {
      setError(`Selecione um cliente válido para a OP ${missingClientItem.opNumber}.`);
      return false;
    }

    if (resolvedItems.some((item) => item.imageSource === "pdf_page")) {
      try {
        const driveStatus = await driveAuthenticatedJson<DriveConnectionStatus>("/api/google-drive/status");
        if (!driveStatus.enabled || !driveStatus.connected) {
          setError("Conecte o Google Drive em Configurações antes de importar o PDF. As páginas serão armazenadas no Drive e usadas como miniaturas dos pedidos.");
          return false;
        }
      } catch (driveError) {
        setError(driveError instanceof Error ? driveError.message : "Não foi possível verificar a conexão com o Google Drive.");
        return false;
      }
    }

    const payloads = resolvedItems.map((item) => {
      const selectedClient = availableClients.find((client) => client.id === item.clientId) as Client;
      return {
        op_number: item.opNumber,
        client_id: selectedClient.id,
        client_name: selectedClient.trade_name || selectedClient.name,
        description: item.job,
        installation_scheduled_at: installationDateToIso(item.targetDate),
        delivery_date: previousBusinessDay(item.targetDate),
        installation_address: item.installationAddress || null,
        installation_status: "scheduled" as const,
        installation_time_confirmed: false,
        priority: item.priority,
        sector_id: item.sectorId,
        status: "waiting" as const,
        blocked: false,
        completed_at: null,
        created_by: user.id,
        consultant_name: item.consultantName || null,
        materials: item.materials || null,
        notes: item.notes || null,
      };
    });

    setCreatingOrder(true);
    setError("");
    const { data: createdOrders, error: insertError } = await supabase
      .from("orders")
      .insert(payloads)
      .select("id,op_number");

    if (insertError || !createdOrders) {
      const insertMessage = insertError?.code === "23505"
        ? "Um dos números de OP já existe no sistema. Informe outro número ou use 0000 para gerar automaticamente."
        : insertError?.code === "42501" || insertError?.message?.toLowerCase().includes("row-level security")
          ? "A política de segurança do banco bloqueou o cadastro. Execute a migração de correção da política RLS dos pedidos."
          : insertError?.message;
      setError(`Não foi possível cadastrar ${submission.mode === "batch" ? "os subpedidos" : "o pedido"}: ${insertMessage || "resposta inválida do banco"}`);
      setCreatingOrder(false);
      return false;
    }

    const createdByOp = new Map(createdOrders.map((order) => [String(order.op_number), String(order.id)]));
    const imageWarnings: string[] = [];

    // As páginas do PDF são enviadas em sequência. Isso evita que várias
    // requisições simultâneas tentem criar a mesma pasta de cliente/OP antes
    // de o Google Drive concluir a indexação da primeira criação.
    for (const item of resolvedItems) {
      if (!item.image) continue;
      const orderId = createdByOp.get(item.opNumber);
      if (!orderId) {
        imageWarnings.push(`OP ${item.opNumber}: registro criado, mas não foi possível localizar a miniatura.`);
        continue;
      }

      if (item.imageSource === "pdf_page") {
        try {
          const driveRecord = await uploadFileToOrderDrive({
            orderId,
            file: item.image,
            category: "document",
            notes: `Página da ordem de serviço importada em PDF e usada como miniatura da OP ${item.opNumber}.`,
          });
          const driveFileId = driveRecord.drive_file_id?.trim();
          if (!driveFileId) throw new Error("O Google Drive não retornou o ID do arquivo.");

          const thumbnailPath = `${PDF_DRIVE_THUMBNAIL_PREFIX}${driveFileId}`;
          const { error: imageUpdateError } = await supabase
            .from("orders")
            .update({ main_image_path: thumbnailPath })
            .eq("id", orderId);
          if (imageUpdateError) throw imageUpdateError;
        } catch (driveError) {
          imageWarnings.push(`OP ${item.opNumber}: ${driveError instanceof Error ? driveError.message : "não foi possível salvar a página no Google Drive"}`);
        }
        continue;
      }

      const imagePath = `orders/${orderId}/manual/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage.from("order-thumbnails").upload(imagePath, item.image, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) {
        imageWarnings.push(`OP ${item.opNumber}: ${uploadError.message}`);
        continue;
      }
      const { error: imageUpdateError } = await supabase.from("orders").update({ main_image_path: imagePath }).eq("id", orderId);
      if (imageUpdateError) {
        await supabase.storage.from("order-thumbnails").remove([imagePath]);
        imageWarnings.push(`OP ${item.opNumber}: ${imageUpdateError.message}`);
      }
    }

    setNewOrderInitialClientId("");
    setModal(null);
    setCreatingOrder(false);
    if (imageWarnings.length) setError(`Pedidos cadastrados. Falhas nas miniaturas: ${imageWarnings.join(" | ")}`);
    showNotice(submission.mode === "batch" ? `${resolvedItems.length} subpedidos cadastrados na OP ${resolvedBaseOp}.` : `Pedido ${resolvedBaseOp} cadastrado com sucesso.`);
    return true;
  }

  if (!authReady) return <div className="screen-loader"><span>PK</span><p>Preparando o sistema…</p></div>;

  if (authMode === "update" || !user) return <main className="login-shell">
    <section className="login-brand">
      <div className="login-logo"><img src="/publicolor-logo.png" alt="Publicolor" /></div><p className="eyebrow">CONTROLE DE PRODUÇÃO</p>
      <h1>Todos os pedidos.<br />Cada etapa. Um só lugar.</h1>
      <p>Acompanhe o fluxo da produção, identifique atrasos e mantenha sua equipe alinhada.</p>
      <div className="login-points"><span>✓ Kanban por setor</span><span>✓ Histórico automático</span><span>✓ Acesso protegido</span></div>
    </section>
    <section className="login-panel">{authMode === "update" ? <form className="login-card" onSubmit={updatePassword}>
      <p className="eyebrow">{passwordFlow === "invite" ? "PRIMEIRO ACESSO" : "RECUPERAÇÃO DE ACESSO"}</p><h2>{passwordFlow === "invite" ? "Defina sua senha" : "Crie uma nova senha"}</h2><p>{passwordFlow === "invite" ? "Crie a senha que você usará para entrar no sistema." : "Escolha uma senha segura com pelo menos 8 caracteres."}</p>
      {authFeedback && <div className={authFeedback.type === "error" ? "auth-error" : "auth-success"}>{authFeedback.text}</div>}
      <label>Nova senha<input type="password" name="password" placeholder="Mínimo de 8 caracteres" minLength={8} required autoComplete="new-password" /></label>
      <label>Confirmar nova senha<input type="password" name="confirmation" placeholder="Digite novamente" minLength={8} required autoComplete="new-password" /></label>
      <button type="submit" className="primary login-button" disabled={authBusy}>{authBusy ? "Salvando…" : "Salvar nova senha"}</button>
    </form> : authMode === "forgot" ? <form className="login-card" onSubmit={requestPasswordReset}>
      <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p><h2>Recuperar senha</h2><p>Informe seu e-mail para receber o link de recuperação.</p>
      {authFeedback && <div className={authFeedback.type === "error" ? "auth-error" : "auth-success"}>{authFeedback.text}</div>}
      <label>E-mail<input type="email" name="email" placeholder="voce@empresa.com.br" required autoComplete="email" /></label>
      <button type="submit" className="primary login-button" disabled={authBusy}>{authBusy ? "Enviando…" : "Enviar link de recuperação"}</button>
      <button type="button" className="back-login" onClick={() => { setAuthMode("login"); setAuthFeedback(null); }}>← Voltar para o login</button>
    </form> : <form className="login-card" onSubmit={signIn}>
      <p className="eyebrow">ÁREA RESTRITA</p><h2>Entrar no sistema</h2><p>Use o acesso fornecido pelo administrador.</p>
      {error && <div className="auth-error">{error}</div>}
      {authFeedback && <div className={authFeedback.type === "error" ? "auth-error" : "auth-success"}>{authFeedback.text}</div>}
      <label>E-mail<input type="email" name="email" placeholder="voce@empresa.com.br" required autoComplete="email" /></label>
      <label>Senha<input type="password" name="password" placeholder="Sua senha" required autoComplete="current-password" /></label>
      <button type="button" className="forgot-password" onClick={() => { setAuthMode("forgot"); setAuthFeedback(null); setError(""); }}>Esqueci minha senha</button>
      <button type="submit" className="primary login-button" disabled={authBusy}>{authBusy ? "Entrando…" : "Entrar"}</button>
      <small>Novos acessos são criados pelo administrador.</small>
    </form>}</section>
  </main>;

  return <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside className={`sidebar ${sidebarOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
      <div className="brand"><span className="brand-logo"><img src="/publicolor-logo.png" alt="Publicolor" /></span><div><b>Publicolor</b><small>PCP · Controle da produção</small></div><button type="button" className="sidebar-collapse-button" aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"} title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"} onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? "»" : "«"}</button></div>
      <nav>{menuItems.map((item) => <button type="button" key={item.key} className={activeView === item.key ? "active" : ""} onClick={() => navigateTo(item.key)}><i>{item.icon}</i><span>{item.label}</span></button>)}{isAdmin && <button type="button" className={activeView === "users" ? "active" : ""} onClick={() => navigateTo("users")}><i>♙</i><span>Usuários</span></button>}</nav>
      <div className="side-bottom">{isAdmin && <button type="button" className={`side-link ${activeView === "settings" ? "active" : ""}`} onClick={() => navigateTo("settings")}><i>⚙</i><span>Configurações</span></button>}<button type="button" className="logout" onClick={() => void supabase.auth.signOut()}>Sair</button><div className="user"><i>{initials(user.email)}</i><span><b>{user.email?.split("@")[0]}</b><small>{currentProfile ? roleLabel[currentProfile.role] : "Carregando acesso…"}</small></span></div></div>
    </aside>
    {sidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
    <section className="content">
      <header><div className="page-heading"><button type="button" className="mobile-menu-button" aria-label="Abrir menu" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>☰</button><div><p className="eyebrow">{viewMeta[activeView].eyebrow}</p><h1>{viewMeta[activeView].title}</h1><p>{viewMeta[activeView].description}</p></div></div><div className="header-actions"><span className="sync-status">● Conectado</span>{currentProfile && <span className="role-badge" data-role={isAdmin ? "admin" : canOperate ? "operator" : "user"}>{roleLabel[currentProfile.role]}</span>}{canOperate && (activeView === "kanban" || activeView === "orders") && <div className="header-order-actions"><button type="button" className="pdf-import-header-button" onClick={() => { setError(""); setPdfImporterOpen(true); }} disabled={!activeSectors.length}>⇧ Importar PDF</button><button type="button" className="primary header-new-order" onClick={() => openNewOrder()} disabled={!activeSectors.length}>＋ Novo pedido</button></div>}</div></header>
      {error && <div className="db-alert"><b>Atenção</b><span>{error}</span></div>}{notice && <div className="toast">✓ {notice}</div>}
      {activeView === "dashboard" && <section className="v3-dashboard">
        <div className="v3-hero">
          <div><span>PUBLICOLOR PCP</span><h2>Visão geral da operação</h2><p>Prioridades, gargalos e compromissos de instalação atualizados em tempo real.</p></div>
          {canOperate && <div className="dashboard-order-actions"><button type="button" onClick={() => { setError(""); setPdfImporterOpen(true); }}>⇧ Importar PDF</button><button type="button" className="primary" onClick={() => openNewOrder()}>＋ Nova ordem</button></div>}
        </div>
        <div className="v3-kpi-grid">
          <article><i>▦</i><small>Pedidos ativos</small><strong>{activeOrders.length}</strong><span>Em todo o fluxo</span></article>
          <article><i>◷</i><small>Aguardando</small><strong>{activeOrders.filter((o) => o.status === "waiting").length}</strong><span>Dependem de ação</span></article>
          <article className="danger"><i>!</i><small>Atrasados</small><strong>{activeOrders.filter((o) => dueLabel(o.delivery_date).startsWith("Atrasado")).length}</strong><span>Fora do prazo</span></article>
          <article><i>↗</i><small>Em produção</small><strong>{activeOrders.filter((o) => o.status === "in_progress").length}</strong><span>Trabalho ativo</span></article>
          <article><i>⌂</i><small>Instalações/entregas</small><strong>{installationOrders.filter((o) => o.installation_scheduled_at).length}</strong><span>Com data definida</span></article>
          <article><i>✓</i><small>Concluídos</small><strong>{completedOrders.length}</strong><span>Histórico total</span></article>
        </div>
        <div className="v3-dashboard-grid">
          <article className="v3-panel">
            <header><div><span>CAPACIDADE</span><h3>Pedidos por setor</h3></div><button type="button" onClick={() => navigateTo("kanban")}>Abrir Kanban →</button></header>
            <div className="v3-sector-list">{sectorReport.map((item) => <div key={item.sector.id}><label><span>{item.sector.name}</span><b>{item.count}</b></label><div><i style={{ width: `${(item.count / largestSectorCount) * 100}%` }} /></div></div>)}</div>
          </article>
          <article className="v3-panel">
            <header><div><span>AGENDA</span><h3>Próximas instalações/entregas</h3></div><button type="button" onClick={() => navigateTo("installation")}>Ver agenda →</button></header>
            <div className="v3-install-list">{installationOrders.filter((o) => o.installation_scheduled_at).slice(0, 5).map((order) => <button type="button" key={order.id} onClick={() => openOrder(order, "installation")}><time>{new Date(order.installation_scheduled_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Manaus" })}<small>{order.installation_time_confirmed ? new Date(order.installation_scheduled_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Manaus" }) : "Horário a definir"}</small></time><span><b>OP {order.op_number}</b><small>{order.client_name}</small></span><i>›</i></button>)}{!installationOrders.some((o) => o.installation_scheduled_at) && <div className="view-empty">Nenhuma instalação ou entrega programada.</div>}</div>
          </article>
        </div>
      </section>}

      {activeView === "kanban" && <>
      <section className="metrics">
        <article><span className="metric-icon blue">▦</span><div><small>Pedidos ativos</small><strong>{activeOrders.length}</strong><em>Base atualizada</em></div></article>
        <article><span className="metric-icon yellow">◷</span><div><small>Aguardando</small><strong>{activeOrders.filter((o) => o.status === "waiting").length}</strong><em>Em fila de produção</em></div></article>
        <article><span className="metric-icon red">!</span><div><small>Atrasados</small><strong>{activeOrders.filter((o) => dueLabel(o.delivery_date).startsWith("Atrasado")).length}</strong><em className="danger">Requer atenção</em></div></article>
        <article><span className="metric-icon amber">⌑</span><div><small>Produção para hoje</small><strong>{activeOrders.filter((o) => dueLabel(o.delivery_date) === "Prazo hoje").length}</strong><em>Prioridade do dia</em></div></article>
        <article><span className="metric-icon green">↗</span><div><small>Em andamento</small><strong>{activeOrders.filter((o) => o.status === "in_progress").length}</strong><em>Produção ativa</em></div></article>
        <article><span className="metric-icon magenta">◉</span><div><small>Instalações/entregas</small><strong>{installationOrders.filter((o) => o.installation_scheduled_at).length}</strong><em>Com data definida</em></div></article>
      </section>
      <section className="toolbar"><label className="search-field">⌕<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por OP, cliente ou serviço…" />{search && <button type="button" className="search-clear" aria-label="Limpar busca" onClick={() => setSearch("")}>×</button>}</label><button type="button" className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}>☷ Filtros {activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button><button type="button" className="sort-button" onClick={cycleSortMode} title="Clique para alterar a ordenação">↕ {sortLabel[sortMode]}</button><span>{loading ? "Atualizando…" : `${filtered.length} pedido${filtered.length === 1 ? "" : "s"} encontrado${filtered.length === 1 ? "" : "s"}`}</span></section>
      {filtersOpen && <>
        <button type="button" className="filters-backdrop" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)} />
        <section className="filters-panel" aria-label="Filtros do Kanban">
          <div className="filters-panel-head"><div><b>Filtros</b><span>Refine os pedidos exibidos no Kanban.</span></div><button type="button" aria-label="Fechar filtros" onClick={() => setFiltersOpen(false)}>×</button></div>
          <label>Setor<select value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)}><option value="all">Todos os setores</option>{activeSectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | DbStatus)}><option value="all">Todos os status</option><option value="waiting">Aguardando</option><option value="in_progress">Em andamento</option><option value="in_transport">Em transporte</option><option value="waiting_client">Aguardando cliente</option></select></label>
          <label>Prioridade<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as "all" | Priority)}><option value="all">Todas as prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select></label>
          <label>Responsável<select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option value="all">Todos os responsáveis</option><option value={UNASSIGNED_RESPONSIBLE_FILTER}>Sem responsável</option>{consultantOptions.map((consultant) => <option key={consultant} value={normalizedResponsibleName(consultant)}>{consultant}</option>)}</select></label>
          <label>Prazo de produção<select value={deadlineFilter} onChange={(event) => setDeadlineFilter(event.target.value as DeadlineFilter)}><option value="all">Todos os prazos</option><option value="late">Atrasados</option><option value="today">Produção para hoje</option><option value="next7">Próximos 7 dias</option></select></label>
          <button type="button" className="clear-filters" onClick={clearFilters} disabled={!activeFilterCount && !search}>Limpar busca e filtros</button>
          <button className="apply-filters" type="button" onClick={() => setFiltersOpen(false)}>Aplicar filtros</button>
        </section>
      </>}
      <div
        className="board-top-scroll"
        ref={topScrollRef}
        onScroll={() => syncKanbanScroll(topScrollRef.current, boardRef.current)}
        aria-label="Rolagem horizontal superior do Kanban"
      >
        <div className="board-top-scroll-spacer" style={{ width: `${boardScrollWidth}px` }} />
      </div>
      <section
        className="board"
        ref={boardRef}
        onScroll={() => syncKanbanScroll(boardRef.current, topScrollRef.current)}
      >
        {visibleSectors.map((sector) => <article className="sector" key={sector.id}>
          <div className="sector-head"><div><i>{String(sector.position).padStart(2, "0")}</i><h2>{sector.name}</h2></div><span>{filtered.filter((o) => o.sector_id === sector.id).length}</span></div>
          <div className="sector-body">
          {statusesForSector(sector.name).map((status) => <div className={`lane ${dragOverLane === `${sector.id}:${status}` ? "drag-over" : ""}`} key={status} aria-label={`${sector.name} — ${status}`} onDragOver={(event) => { if (!canOperate) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverLane(`${sector.id}:${status}`); }} onDrop={() => void move(sector.id, status)}>
            <div className="lane-head"><b><i className={`dot ${statusDotClass(status)}`} />{status}</b><span>{filtered.filter((o) => o.sector_id === sector.id && o.status === statusToDb[status]).length}</span></div>
            {filtered.filter((o) => o.sector_id === sector.id && o.status === statusToDb[status]).map((order) => <div draggable={canOperate && busyOrderId !== order.id} aria-disabled={!canOperate} onDragStart={(event) => { if (!canOperate) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; setDragged(order.id); }} onDragEnd={() => { setDragged(null); setDragOverLane(null); }} onClick={() => openOrder(order, "history")} className={`order ${priorityLabel[order.priority].toLowerCase()} ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-order" : ""}`} key={order.id}>
              {isAdmin && <button type="button" className="delete-order-button" aria-label={`Apagar OP ${order.op_number}`} title="Apagar pedido" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void deleteOrder(order); }}>⌫</button>}
              {cardImageUrl(order) ? <button
                type="button"
                className={`order-thumbnail ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-thumbnail" : ""}`}
                aria-label={`Ampliar miniatura da OP ${order.op_number}`}
                title="Clique para ampliar"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setImagePreviewZoom(1);
                  setImagePreview({ src: cardImageUrl(order), alt: `Miniatura da OP ${order.op_number}` });
                }}
              ><img src={cardImageUrl(order)} alt={`Miniatura da OP ${order.op_number}`} width={160} height={160} loading="lazy" /></button> : <div className={`order-thumbnail ${isPdfPageThumbnailPath(order.main_image_path) ? "pdf-page-thumbnail" : ""}`}><div className="order-thumbnail-empty" aria-label="Pedido sem miniatura"><span>PNG</span><small>Sem miniatura</small></div></div>}
              <div className="order-top"><b>OP {order.op_number}</b><div className="order-badges"><span className={`tag ${priorityLabel[order.priority].toLowerCase()}`}>{priorityLabel[order.priority]}</span></div></div>
              <h3>{order.client_name}</h3><p className="order-service">{order.description}</p>
              <div className="order-responsible" title={`Responsável: ${orderResponsibleName(order)}`}><span>{initials(orderResponsibleName(order))}</span><div><small>RESPONSÁVEL</small><b>{orderResponsibleName(order)}</b></div></div>
              <div className={`due order-deadlines ${dueLabel(order.delivery_date).startsWith("Atrasado") ? "late" : ""}`}><span>Inst./entrega: <b>{orderTargetDateLabel(order)}</b></span><small>Produção: {dueLabel(order.delivery_date)}</small></div>
              {canOperate && <div className="workflow-actions"><button type="button" className="finish-order" disabled={busyOrderId === order.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void finishOrder(order); }}>✓ Finalizar</button></div>}
              <footer className="card-actions"><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openOrder(order, "history"); }}>↺ Histórico</button><button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openOrder(order, "comments"); }}>◌ {commentCounts[order.id] || 0} Comentários</button></footer>
            </div>)}
            {!filtered.some((o) => o.sector_id === sector.id && o.status === statusToDb[status]) && <div className="empty-lane">{canOperate ? "Solte um pedido aqui" : "Nenhum pedido"}</div>}
          </div>)}
          </div>
        </article>)}
        {!loading && hasActiveSearch && !filtered.length && <div className="search-empty"><span>⌕</span><b>Nenhum pedido encontrado</b><p>Tente alterar o termo pesquisado ou limpar os filtros.</p><button type="button" onClick={clearFilters}>Limpar busca e filtros</button></div>}
        {!loading && !activeSectors.length && !error && <div className="empty-board">Nenhum setor cadastrado.</div>}
      </section>
      </>}

      {activeView === "orders" && <section className="management-view orders-management-view">
        <div className="view-toolbar orders-view-toolbar">
          <label className="orders-search-field">⌕<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar OP, subpedido, cliente, serviço ou responsável…" /></label>
          <label className="orders-responsible-filter"><span>Responsável</span><select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}><option value="all">Todos</option><option value={UNASSIGNED_RESPONSIBLE_FILTER}>Sem responsável</option>{consultantOptions.map((consultant) => <option key={consultant} value={normalizedResponsibleName(consultant)}>{consultant}</option>)}</select></label>
          {(search || responsibleFilter !== "all") && <button type="button" className="orders-clear-filter" onClick={() => { setSearch(""); setResponsibleFilter("all"); }}>Limpar</button>}
          <span>{activeOrderFamilies.length} OP(s) · {visibleActiveOrderCount} pedido(s) ativo(s)</span>
        </div>
        <div className="responsive-table grouped-orders-table">
          <div className="table-head"><span>OP</span><span>Cliente e serviço</span><span>Setor</span><span>Responsável</span><span>Instalação / entrega</span><span>Ação</span></div>
          {activeOrderFamilies.map((family) => {
            const isFamily = family.hasSubOrders || family.orders.length > 1;
            const isExpanded = expandedOrderFamilies.has(family.parentOp);
            const firstOrder = family.orders[0];
            const clientsInFamily = Array.from(new Set(family.orders.map((order) => order.client_name)));
            const sectorNames = Array.from(new Set(family.orders.map((order) => sectors.find((sector) => sector.id === order.sector_id)?.name || "—")));
            const responsibleNames = Array.from(new Set(family.orders.map(orderResponsibleName)));
            const familyResponsible = responsibleNames.length === 1 ? responsibleNames[0] : `${responsibleNames.length} responsáveis`;
            const nextDeliveryOrder = [...family.orders].sort((first, second) => orderTargetDate(first).localeCompare(orderTargetDate(second)))[0];
            const familyIsLate = family.orders.some((order) => dueLabel(order.delivery_date).startsWith("Atrasado"));
            const familyId = `order-family-${firstOrder.id}`;

            return <div className={`order-family ${isExpanded ? "expanded" : ""}`} key={family.parentOp}>
              <article className={`table-row order-parent-row ${isFamily ? "has-children" : "single-order"}`}>
                <b className="order-parent-op">
                  {isFamily ? <button
                    type="button"
                    className="order-family-toggle"
                    aria-expanded={isExpanded}
                    aria-controls={familyId}
                    aria-label={`${isExpanded ? "Recolher" : "Expandir"} OP ${family.parentOp}`}
                    onClick={() => toggleOrderFamily(family.parentOp)}
                  ><span aria-hidden="true">›</span></button> : <span className="order-family-toggle-placeholder" />}
                  <span>OP {family.parentOp}</span>
                  {isFamily && <small>{family.orders.length} subpedido(s)</small>}
                </b>
                <div className="order-client-cell" data-label="Cliente e serviço">
                  <strong>{clientsInFamily.length === 1 ? clientsInFamily[0] : `${clientsInFamily.length} clientes`}</strong>
                  <small>{isFamily ? `Pedido pai com ${family.orders.length} itens vinculados. Expanda para consultar cada subpedido.` : firstOrder.description}</small>
                </div>
                <span className="order-sector-cell" data-label="Setor">{sectorNames.length === 1 ? sectorNames[0] : `${sectorNames.length} setores`}</span>
                <span className="order-responsible-cell" data-label="Responsável"><i>{initials(familyResponsible)}</i><b>{familyResponsible}</b></span>
                <span className={`order-delivery-cell ${familyIsLate ? "table-late" : ""}`} data-label="Instalação / entrega"><b>{isFamily ? `Próxima: ${orderTargetDateLabel(nextDeliveryOrder)}` : orderTargetDateLabel(firstOrder)}</b><small>Produção: {isFamily ? dueLabel(nextDeliveryOrder.delivery_date) : dueLabel(firstOrder.delivery_date)}</small></span>
                <button type="button" onClick={() => isFamily ? toggleOrderFamily(family.parentOp) : openOrder(firstOrder, "history")}>
                  {isFamily ? isExpanded ? "Recolher" : "Ver subpedidos" : "Ver pedido"}
                </button>
              </article>

              {isFamily && isExpanded && <div className="order-family-children" id={familyId}>
                {family.orders.map((order) => <article className="table-row order-child-row" key={order.id}>
                  <b className="order-child-op"><span aria-hidden="true">↳</span> OP {order.op_number}</b>
                  <div className="order-client-cell" data-label="Cliente e serviço"><strong>{order.client_name}</strong><small>{order.description}</small></div>
                  <span className="order-sector-cell" data-label="Setor">{sectors.find((sector) => sector.id === order.sector_id)?.name || "—"}</span>
                  <span className="order-responsible-cell" data-label="Responsável"><i>{initials(orderResponsibleName(order))}</i><b>{orderResponsibleName(order)}</b></span>
                  <span className={`order-delivery-cell ${dueLabel(order.delivery_date).startsWith("Atrasado") ? "table-late" : ""}`} data-label="Instalação / entrega"><b>{orderTargetDateLabel(order)}</b><small>Produção: {dueLabel(order.delivery_date)}</small></span>
                  <button type="button" onClick={() => openOrder(order, "history")}>Ver pedido</button>
                </article>)}
              </div>}
            </div>;
          })}
        </div>
        {!activeOrderFamilies.length && <div className="view-empty">Nenhum pedido ativo encontrado.</div>}
      </section>}

      {activeView === "completed" && <CompletedOrdersView
        search={search}
        orders={completedOrderList}
        sectors={sectors}
        canOperate={canOperate}
        onSearchChange={setSearch}
        onOpenHistory={(order) => openOrder(order, "history")}
        onReopen={(order) => {
          setReopenError("");
          setReopenOrderTarget(order);
        }}
      />}

      {activeView === "installation" && <InstallationAgendaView
        orders={activeOrders}
        sectors={sectors}
        installationSector={installationSector}
        canOperate={canOperate}
        busyOrderId={busyOrderId}
        onOpenOrder={openOrder}
        onSchedule={(event, order) => void scheduleInstallation(event, order)}
      />}

      {activeView === "activities" && <ActivitiesView profiles={profiles} currentUserId={user.id} canOperate={canOperate} />}

      {activeView === "clients" && <ClientsView
        clients={clients}
        orders={orders}
        canOperate={canOperate}
        onOpenOrder={openOrder}
        onNewClient={() => openCreateClient()}
        onEditClient={openEditClient}
        onNewOrder={(client) => openNewOrder(client.id)}
      />}

      {activeView === "reports" && <section className="management-view"><div className="summary-strip"><article><small>Pedidos ativos</small><strong>{activeOrders.length}</strong></article><article><small>Em andamento</small><strong>{activeOrders.filter((order) => order.status === "in_progress").length}</strong></article><article><small>Atrasados</small><strong>{activeOrders.filter((order) => dueLabel(order.delivery_date).startsWith("Atrasado")).length}</strong></article><article><small>Urgentes</small><strong>{activeOrders.filter((order) => order.priority === "urgent").length}</strong></article></div><div className="report-card"><div className="report-heading"><div><b>Distribuição por setor</b><small>Pedidos ativos neste momento</small></div><span>Atualização automática</span></div><div className="sector-bars">{sectorReport.map((item) => <div className="sector-bar" key={item.sector.id}><label><span>{item.sector.name}</span><b>{item.count}</b></label><div><i style={{ width: `${(item.count / largestSectorCount) * 100}%` }} /></div></div>)}</div></div></section>}

      {activeView === "users" && isAdmin && <section className="management-view">
        <div className="users-panel">
          <header>
            <div><h2>Níveis de acesso</h2><p>Administrador gerencia tudo; Operador trabalha nos pedidos; Usuário apenas visualiza e comenta.</p></div>
            <div className="users-panel-actions"><span className="role-badge" data-role="admin">Somente administrador</span><button type="button" className="primary new-user-button" onClick={() => { setUserCreateError(""); setUserModalOpen(true); }}>＋ Novo usuário</button></div>
          </header>
          {profiles.map((profile) => <article className="user-role-row" key={profile.id}><div><b>{profile.name || profile.email.split("@")[0]}</b><small>{profile.email} · {profile.active ? "Ativo" : "Inativo"}</small><span className="current-user-label">{profile.id === user.id ? "Sua conta" : roleLabel[profile.role]}</span></div><select className="user-role-select" value={profile.role === "manager" ? "production" : profile.role} disabled={profile.id === user.id || profileBusyId === profile.id || !profile.active} onChange={(event) => void changeUserRole(profile, event.target.value as "admin" | "production" | "viewer")} aria-label={`Nível de acesso de ${profile.name || profile.email}`}><option value="admin">Administrador</option><option value="production">Operador</option><option value="viewer">Usuário</option></select></article>)}
        </div>
        <div className="settings-security-note">ⓘ Use “Novo usuário” para enviar um convite. A pessoa criará a própria senha no primeiro acesso.</div>
      </section>}

      {activeView === "settings" && isAdmin && <section className="management-view settings-view">
        <div className="settings-grid">
          <div className="settings-security-note">🔒 Os dados de conexão ficam protegidos na hospedagem e não são exibidos no navegador. Somente administradores visualizam esta área.</div>
          <article className="settings-card"><span className="settings-icon">◉</span><div><small>CONTA ADMINISTRADORA</small><b>{user.email}</b><p>Seu acesso está autenticado e protegido pelo Supabase.</p></div></article>
          <article className="settings-card"><span className="settings-icon">◆</span><div><small>BANCO DE DADOS</small><b>Supabase conectado</b><p>Pedidos, comentários, agenda e histórico estão sincronizados.</p></div></article>
          <article className="settings-card"><span className="settings-icon">▦</span><div><small>SETORES ATIVOS</small><b>{activeSectors.length} setores</b><p>A ordem dos setores segue a configuração do banco.</p></div></article>
          <article className="settings-card"><span className="settings-icon">✓</span><div><small>STATUS DO SISTEMA</small><b>Operacional</b><p>Interface e serviços carregados corretamente.</p></div></article>
        </div>
        <PlatformAdministrationSettings />
        <GoogleDriveSettings />
        <DataImportExportSettings orders={orders} clients={clients} sectors={sectors} onImportComplete={() => setReloadToken((current) => current + 1)} />
      </section>}
    </section>
    {pdfImporterOpen && <div className="overlay pdf-import-overlay" onMouseDown={() => { if (!creatingOrder) setPdfImporterOpen(false); }}><div className="modal pdf-import-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-import-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="close" aria-label="Fechar importador de PDF" disabled={creatingOrder} onClick={() => setPdfImporterOpen(false)}>×</button>
      <p className="eyebrow">IMPORTAÇÃO DE ORDEM DE SERVIÇO</p><h2 id="pdf-import-title">Cadastrar pedidos a partir de PDF</h2><p>O sistema identifica os campos, cria um item para cada página e usa a própria página como miniatura da OS.</p>
      <PdfOrderImporter
        clients={clients}
        sectors={activeSectors}
        consultants={consultantOptions}
        busy={creatingOrder}
        onSubmit={addOrders}
        onCancel={() => setPdfImporterOpen(false)}
        onCreateClient={openCreateClient}
        onEditClient={openEditClient}
        onEnsureClient={ensureClientByName}
      />
    </div></div>}
    {modal && <div className="overlay" onMouseDown={() => { if (!creatingOrder) { setNewOrderInitialClientId(""); setModal(null); } }}><div className={`modal ${modal === "new" ? "order-create-modal" : ""}`} role="dialog" aria-modal="true" aria-label={modal === "new" ? "Cadastrar pedido" : `Ordem de serviço ${modal.op_number}`} onMouseDown={(e) => e.stopPropagation()}><button type="button" className="close" aria-label="Fechar" disabled={creatingOrder} onClick={() => { setNewOrderInitialClientId(""); setModal(null); }}>×</button>
      {modal === "new" ? <><p className="eyebrow">NOVO REGISTRO</p><h2>Cadastrar pedido ou OP</h2><p>Cadastre um pedido único ou todos os subpedidos da mesma OP em uma única operação.</p><OrderBatchForm
        key={`new-order-${newOrderInitialClientId || "empty"}`}
        clients={clients}
        sectors={activeSectors}
        consultants={consultantOptions}
        initialClientId={newOrderInitialClientId}
        busy={creatingOrder}
        externalError={error}
        onSubmit={async (submission) => { await addOrders(submission); }}
        onCancel={() => { setNewOrderInitialClientId(""); setModal(null); }}
        onCreateClient={openCreateClient}
        onEditClient={openEditClient}
      /></> : <>
        <div className="v3-order-header">
          {cardImageUrl(modal) ? <button
            type="button"
            className={`v3-order-image ${isPdfPageThumbnailPath(modal.main_image_path) ? "pdf-page-thumbnail" : ""}`}
            aria-label={`Ampliar miniatura da OP ${modal.op_number}`}
            title="Clique para ampliar"
            onClick={() => {
              setImagePreviewZoom(1);
              setImagePreview({ src: cardImageUrl(modal), alt: `Miniatura da OP ${modal.op_number}` });
            }}
          ><img src={cardImageUrl(modal)} alt={`Miniatura da OP ${modal.op_number}`} /></button> : <div className="v3-order-image"><span>PNG<br />Sem miniatura</span></div>}
          <div><p className="eyebrow">ORDEM DE SERVIÇO · OP {modal.op_number}</p><h2>{modal.description}</h2><p>{modal.client_name}</p><div className="v3-order-badges"><span data-priority={modal.priority}>{priorityLabel[modal.priority]}</span><span>{statusLabel(modal.status)}</span><span>{sectors.find((s) => s.id === modal.sector_id)?.name || "—"}</span></div></div>
        </div>
        <div className="detail-tabs v3-detail-tabs">
          <button type="button" className={detailTab === "summary" ? "active" : ""} onClick={() => setDetailTab("summary")}>Resumo</button>
          <button type="button" className={detailTab === "production" ? "active" : ""} onClick={() => setDetailTab("production")}>Produção</button>
          <button type="button" className={detailTab === "materials" ? "active" : ""} onClick={() => setDetailTab("materials")}>Materiais <span>{materials.length}</span></button>
          <button type="button" className={detailTab === "files" ? "active" : ""} onClick={() => setDetailTab("files")}>Arquivos <span>{orderFiles.length}</span></button>
          <button type="button" className={detailTab === "checklist" ? "active" : ""} onClick={() => setDetailTab("checklist")}>Checklist <span>{checklist.filter((item) => item.completed).length}/{checklist.length}</span></button>
          <button type="button" className={detailTab === "installation" ? "active" : ""} onClick={() => setDetailTab("installation")}>Instalação/entrega</button>
          <button type="button" className={detailTab === "history" ? "active" : ""} onClick={() => setDetailTab("history")}>Histórico</button>
          <button type="button" className={detailTab === "comments" ? "active" : ""} onClick={() => setDetailTab("comments")}>Comentários <span>{commentCounts[modal.id] || 0}</span></button>
        </div>
        {detailError && <div className="auth-error">{detailError}</div>}
        {detailLoading ? <div className="detail-loading">Carregando informações…</div> : detailTab === "summary" ? <form className="v3-order-summary editable-order-form" onSubmit={(event) => void saveOrderSummary(event, modal)}>
          <div className="form-grid">
            <label>Número da OP<input name="op_number" defaultValue={modal.op_number} placeholder="Vazio ou 0000 = automático" /><small>Deixe vazio ou use 0000 para gerar um número único.</small></label>
            <label>Cliente<select name="client_id" defaultValue={modal.client_id || ""}><option value="">Cliente sem cadastro</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.name}</option>)}</select></label>
            <label className="wide">Serviço<textarea name="description" defaultValue={modal.description} required /></label>
            <label>Data da instalação ou entrega<input type="date" name="target_date" defaultValue={orderTargetDate(modal)} required /><small>Prazo de produção: {shortDateOnlyLabel(modal.delivery_date)}. Ao alterar a data, o prazo será recalculado para 1 dia útil antes.</small></label>
            <label>Prioridade<select name="priority" defaultValue={modal.priority}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
            <label className="wide">Consultor responsável<select name="consultant_name" defaultValue={modal.consultant_name || ""}><option value="">Não definido</option>{consultantOptions.map((consultant) => <option key={consultant} value={consultant}>{consultant}</option>)}</select></label>
            <label className="wide">Materiais e especificações<textarea name="materials" defaultValue={modal.materials || ""} /></label>
            <label className="wide">Observações gerais<textarea name="notes" defaultValue={modal.notes || ""} /></label>
          </div>
          <div className="detail-grid"><div><small>CLIENTE</small><b>{modal.client_name}</b></div><div><small>INSTALAÇÃO / ENTREGA</small><b>{orderTargetDateLabel(modal)}</b></div><div><small>PRAZO DE PRODUÇÃO</small><b>{dueLabel(modal.delivery_date)}</b></div><div><small>CONSULTOR</small><b>{modal.consultant_name || "Não definido"}</b></div><div><small>CRIADO EM</small><b>{dateTimeLabel(modal.created_at)}</b></div></div>
          {canOperate && <div className="actions"><button type="submit" className="primary" disabled={busyOrderId === modal.id}>{busyOrderId === modal.id ? "Salvando…" : "Salvar alterações"}</button></div>}
        </form> : detailTab === "production" ? <form className="v3-production-panel editable-order-form" onSubmit={(event) => void saveProductionDetails(event, modal)}>
          <div className="form-grid">
            <label>Setor atual<select name="sector_id" defaultValue={modal.sector_id}>{activeSectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
            <label>Status<select name="status" defaultValue={modal.status}>{statusesForSector(activeSectors.find((sector) => sector.id === modal.sector_id)?.name).map((status) => <option key={status} value={statusToDb[status]}>{status}</option>)}<option value="paused">Pausado</option><option value="completed">Concluído</option></select></label>
          </div>
          <div className="v3-production-actions">{canOperate && <button type="submit" className="primary" disabled={busyOrderId === modal.id}>{busyOrderId === modal.id ? "Salvando…" : "Salvar produção"}</button>}{canOperate && modal.status !== "completed" && <button type="button" onClick={() => void finishOrder(modal)}>Finalizar ordem</button>}</div>
        </form> : detailTab === "materials" ? <div className="os-workspace-panel">
          <div className="os-section-heading"><div><small>PLANEJAMENTO DE INSUMOS</small><h3>Materiais da ordem</h3></div><span>{materials.length} item(ns)</span></div>
          <div className="os-material-table"><div className="os-table-head"><span>Material</span><span>Quantidade</span><span>Status</span><span></span></div>{materials.map((material) => <div className="os-table-row" key={material.id}><div><b>{material.material_name}</b><small>{material.notes || "Sem observação"}{material.width ? ` · largura ${material.width} m` : ""}</small></div><span>{material.quantity} {material.unit}</span><span className={`material-status ${material.status}`}>{material.status === "reserved" ? "Reservado" : material.status === "consumed" ? "Consumido" : "Previsto"}</span><button type="button" onClick={() => void deleteMaterial(material)} disabled={!canOperate || workspaceBusy}>×</button></div>)}</div>
          {!materials.length && <div className="workspace-empty">Nenhum material estruturado. Use o formulário abaixo para iniciar o planejamento.</div>}
          {canOperate && <form className="os-inline-form" onSubmit={addMaterial}><input name="material_name" placeholder="Material" required /><input name="quantity" type="number" min="0.01" step="0.01" placeholder="Qtd." required /><select name="unit"><option>un</option><option>m</option><option>m²</option><option>chapa</option><option>litro</option><option>kg</option></select><input name="width" type="number" min="0" step="0.01" placeholder="Largura (m)" /><select name="status"><option value="planned">Previsto</option><option value="reserved">Reservado</option><option value="consumed">Consumido</option></select><input name="notes" placeholder="Observação" /><button type="submit" className="primary" disabled={workspaceBusy}>Adicionar</button></form>}
        </div> : detailTab === "files" ? <div className="os-workspace-panel">
          <div className="os-section-heading"><div><small>GOOGLE DRIVE</small><h3>Arquivos e pastas da ordem</h3></div><span>Upload automático e vínculo manual</span></div>
          <div className="drive-guidance"><b>Organização automática no Drive</b><span>O sistema cria a estrutura Cliente → OP → Subpedido → Arte, Aprovação, Produção, Documentos, Fotos, Instalação e Outros. A sincronização percorre todas as subpastas da ordem.</span></div>
          <OrderDriveUpload
            orderId={modal.id}
            opNumber={modal.op_number}
            canOperate={canUploadFiles}
            onUploaded={() => loadOrderDetails(modal.id)}
            onSynchronized={(files) => setOrderFiles(files)}
            onError={setDetailError}
            onNotice={showNotice}
          />
          {canUploadFiles && <details className="drive-manual-link"><summary>Vincular um link existente do Google Drive manualmente</summary><form className="drive-link-form" onSubmit={registerDriveFile}>
            <input name="file_name" placeholder="Nome do arquivo ou pasta" required />
            <input name="drive_url" type="url" placeholder="https://drive.google.com/..." required />
            <select name="file_category" defaultValue="art"><option value="art">Arte</option><option value="approval">Aprovação</option><option value="production">Produção</option><option value="photo">Fotos</option><option value="installation">Instalação</option><option value="document">Documento</option><option value="other">Outro</option></select>
            <input name="version" placeholder="Versão (ex.: V3)" />
            <input name="notes" placeholder="Observação" />
            <label className="drive-approved-check"><input name="is_approved" type="checkbox" /> Arte aprovada</label>
            <button type="submit" className="primary" disabled={workspaceBusy}>{workspaceBusy ? "Salvando…" : "Vincular link"}</button>
          </form></details>}
          <div className="os-file-grid">{orderFiles.map((file) => {
            const addedBy = profilesById.get(file.uploaded_by);
            const updatedBy = file.updated_by ? profilesById.get(file.updated_by) : null;
            const originLabel = file.origin === "drive_upload"
              ? "Enviado pelo sistema por"
              : file.origin === "drive_sync"
                ? "Localizado no Drive e vinculado por"
                : file.origin === "manual_link"
                  ? "Link vinculado por"
                  : "Registrado por";
            const driveEditor = file.drive_last_modified_by_name || file.drive_last_modified_by_email;
            return <article key={file.id} className={`os-file-card drive-file-card ${file.is_approved ? "approved" : ""}`}>
              <div className="file-icon">{file.file_category === "art" ? "ARTE" : file.file_category === "approval" ? "OK" : file.file_category === "production" ? "PROD" : file.file_category === "photo" ? "FOTO" : file.file_category === "installation" ? "INST" : file.file_category === "document" ? "DOC" : "LINK"}</div>
              <div className="file-card-content">
                <b title={file.file_name}>{file.file_name}</b>
                <small>{file.version ? `${file.version} · ` : ""}{file.file_category === "art" ? "Arte" : file.file_category === "approval" ? "Aprovação" : file.file_category === "production" ? "Produção" : file.file_category === "photo" ? "Fotos" : file.file_category === "installation" ? "Instalação" : file.file_category === "document" ? "Documento" : "Outro"} · {dateTimeLabel(file.created_at)}</small>
                {file.notes && <p>{file.notes}</p>}
                {file.is_approved && <em>ARTE APROVADA</em>}
                <div className="file-audit-info">
                  <span><strong>{originLabel}</strong> {addedBy?.name || addedBy?.email || "Usuário não identificado"}</span>
                  {updatedBy && <span><strong>Última sincronização no Publicolor:</strong> {updatedBy.name || updatedBy.email} · {dateTimeLabel(file.updated_at)}</span>}
                  {driveEditor && <span><strong>Última alteração no Google Drive:</strong> {driveEditor}{file.drive_modified_at ? ` · ${dateTimeLabel(file.drive_modified_at)}` : ""}</span>}
                </div>
                <div className="file-actions">
                  {file.drive_file_id && <button type="button" onClick={() => void downloadOrderFile(file)} disabled={workspaceBusy}>Baixar</button>}
                  {file.drive_url && <a href={file.drive_url} target="_blank" rel="noreferrer">Abrir no Drive</a>}
                  {isAdmin && <button className="file-unlink-button" type="button" onClick={() => void removeOrderFileLink(file)} disabled={workspaceBusy}>Remover da OS</button>}
                  {isAdmin && file.drive_file_id && <button className="file-delete-drive-button" type="button" onClick={() => void deleteOrderFileFromDrive(file)} disabled={workspaceBusy}>Excluir do Drive</button>}
                </div>
              </div>
            </article>;
          })}</div>
          {!orderFiles.length && <div className="workspace-empty">Nenhum arquivo vinculado. Envie diretamente ao Drive ou cadastre um link existente.</div>}
        </div> : detailTab === "checklist" ? <div className="os-workspace-panel">
          <div className="os-section-heading"><div><small>LIBERAÇÃO E QUALIDADE</small><h3>Checklist da ordem</h3></div><span>{checklist.filter((item) => item.completed).length} de {checklist.length} concluídos</span></div>
          {!checklist.length && canOperate && <button type="button" className="checklist-template-button" onClick={() => void createDefaultChecklist()} disabled={workspaceBusy}>Criar checklist padrão da Publicolor</button>}
          <div className="os-checklist-list">{checklist.map((item) => <label key={item.id} className={item.completed ? "completed" : ""}><input type="checkbox" checked={item.completed} onChange={() => void toggleChecklistItem(item)} disabled={!canOperate || workspaceBusy} /><span><b>{item.label}</b><small>{item.category}</small></span></label>)}</div>
          {canOperate && <form className="checklist-add-form" onSubmit={addChecklistItem}><input name="label" placeholder="Novo item de conferência" required /><input name="category" placeholder="Categoria" defaultValue="Geral" /><button type="submit" className="primary" disabled={workspaceBusy}>Adicionar item</button></form>}
        </div> : detailTab === "installation" ? <form className="v3-installation-form" onSubmit={(event) => void saveInstallationDetails(event, modal)}>
          <div className="form-grid">
            <label>Data e hora da instalação ou entrega<input type="datetime-local" name="scheduled_at" defaultValue={toInstallationInputValue(modal.installation_scheduled_at)} required /><small>O prazo de produção será ajustado automaticamente para 1 dia útil antes.</small></label>
            <label>Status<select name="installation_status" defaultValue={modal.installation_status || "pending"}><option value="pending">Aguardando agendamento</option><option value="scheduled">Agendada</option><option value="in_progress">Equipe em campo</option><option value="completed">Concluída</option><option value="cancelled">Cancelada</option></select></label>
            <label className="wide">Endereço<input name="installation_address" defaultValue={modal.installation_address || ""} placeholder="Endereço completo da instalação" /></label>
            <label>Equipe<input name="installation_team" defaultValue={modal.installation_team || ""} placeholder="Ex.: Equipe 01" /></label>
            <label>Veículo<input name="installation_vehicle" defaultValue={modal.installation_vehicle || ""} placeholder="Ex.: Fiorino / placa" /></label>
            <label className="wide">Orientações<textarea name="installation_notes" defaultValue={modal.installation_notes || ""} placeholder="Acesso, contato no local, equipamentos e observações..." /></label>
          </div>
          <div className="actions"><button type="button" onClick={() => navigateTo("installation")}>Abrir agenda</button>{canOperate && <button type="submit" className="primary" disabled={busyOrderId === modal.id}>{busyOrderId === modal.id ? "Salvando…" : "Salvar instalação"}</button>}</div>
        </form> : detailTab === "history" ? <div className="detail-feed">
          {historyTimeline.map((item) => {
            if (item.kind === "change") {
              const author = item.changed_by ? profiles.find((profile) => profile.id === item.changed_by)?.name || "Usuário" : "Sistema";
              return <article className="feed-entry changed" key={`change-${item.id}`}><i>✎</i><div><b>{changeGroupTitle(item.entries)}</b><div className="history-change-list">{item.entries.map((entry) => <p key={entry.id}><strong>{changeFieldLabel[entry.field_name] || entry.field_name}</strong><span>{formatHistoryValue(entry.field_name, entry.old_value)} → {formatHistoryValue(entry.field_name, entry.new_value)}</span></p>)}</div><small>{author} · {dateTimeLabel(item.created_at)}</small></div></article>;
            }

            const detail = historyDescription(item.entry);
            return <article className="feed-entry" key={`history-${item.entry.id}`}><i>↺</i><div><b>{item.entry.description}</b>{detail && <p>{detail}</p>}<small>{item.entry.author?.name || item.entry.author?.email || "Sistema"} · {dateTimeLabel(item.entry.created_at)}</small></div></article>;
          })}
          <article className="feed-entry created"><i>✓</i><div><b>Pedido criado</b><p>O pedido entrou no fluxo de produção.</p><small>{dateTimeLabel(modal.created_at)}</small></div></article>
        </div> : <div className="comments-panel">
          <div className="comments-list">{comments.length ? comments.map((comment) => <article className="comment-entry" key={comment.id}><i>{initials(comment.author?.email || user.email)}</i><div><b>{comment.author?.name || comment.author?.email || "Usuário"}</b><p>{comment.comment}</p><small>{dateTimeLabel(comment.created_at)}</small></div></article>) : <div className="no-comments"><b>Nenhum comentário ainda</b><span>Use o campo abaixo para iniciar a conversa.</span></div>}</div>
          <form className="comment-form" onSubmit={addComment}><textarea name="comment" placeholder="Adicionar comentário sobre este pedido…" maxLength={4000} required /><button type="submit" className="primary" disabled={commentSending}>{commentSending ? "Enviando…" : "Enviar comentário"}</button></form>
        </div>}
      </>}
    </div></div>}
    {imagePreview && <div className="overlay image-preview-overlay" onMouseDown={() => setImagePreview(null)}>
      <div className="image-preview-modal" role="dialog" aria-modal="true" aria-label="Visualização ampliada da miniatura" onMouseDown={(event) => event.stopPropagation()}>
        <header className="image-preview-toolbar">
          <div><small>MINIATURA DA ORDEM</small><b>{imagePreview.alt}</b></div>
          <button type="button" className="image-preview-close" aria-label="Fechar imagem ampliada" title="Fechar" onClick={() => setImagePreview(null)}>×</button>
        </header>
        <div className="image-preview-stage">
          <div className="image-preview-canvas" style={{ width: `${imagePreviewZoom * 100}%`, height: `${imagePreviewZoom * 100}%` }}>
            <img src={imagePreview.src} alt={imagePreview.alt} />
          </div>
        </div>
        <footer className="image-preview-controls">
          <button type="button" aria-label="Diminuir zoom" disabled={imagePreviewZoom <= 0.5} onClick={() => setImagePreviewZoom((current) => Math.max(0.5, current - 0.25))}>−</button>
          <button type="button" className="image-preview-zoom-value" title="Restaurar zoom" onClick={() => setImagePreviewZoom(1)}>{Math.round(imagePreviewZoom * 100)}%</button>
          <button type="button" aria-label="Aumentar zoom" disabled={imagePreviewZoom >= 2.5} onClick={() => setImagePreviewZoom((current) => Math.min(2.5, current + 0.25))}>＋</button>
        </footer>
      </div>
    </div>}
    {reopenOrderTarget && <div className="overlay" onMouseDown={() => { if (!reopeningOrder) setReopenOrderTarget(null); }}>
      <div className="modal reopen-order-modal" role="dialog" aria-modal="true" aria-labelledby="reopen-order-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" aria-label="Fechar reabertura do pedido" disabled={reopeningOrder} onClick={() => setReopenOrderTarget(null)}>×</button>
        <p className="eyebrow">PEDIDO CONCLUÍDO</p>
        <h2 id="reopen-order-title">Voltar OP {reopenOrderTarget.op_number} para a produção</h2>
        <p>O pedido retornará ao mesmo setor em que foi concluído, com status <b>Aguardando</b>.</p>
        <div className="reopen-order-summary">
          <b>{reopenOrderTarget.client_name}</b>
          <span>{reopenOrderTarget.description}</span>
          <small>Setor: {sectors.find((sector) => sector.id === reopenOrderTarget.sector_id)?.name || "Não identificado"}</small>
        </div>
        <form className="reopen-order-form" onSubmit={reopenCompletedOrder}>
          {reopenError && <div className="auth-error">{reopenError}</div>}
          <label>Observação obrigatória<textarea name="observation" minLength={5} maxLength={2000} placeholder="Explique por que o pedido precisa voltar para a produção..." required autoFocus /></label>
          <div className="actions">
            <button type="button" disabled={reopeningOrder} onClick={() => setReopenOrderTarget(null)}>Cancelar</button>
            <button type="submit" className="primary" disabled={reopeningOrder}>{reopeningOrder ? "Devolvendo…" : "Confirmar retorno"}</button>
          </div>
        </form>
      </div>
    </div>}
    <ClientFormModal open={clientModalOpen} busy={clientBusy} error={clientError} client={editingClient} onClose={closeClientModal} onSubmit={saveClient} />
    {userModalOpen && isAdmin && <div className="overlay" onMouseDown={() => { if (!creatingUser) setUserModalOpen(false); }}>
      <div className="modal user-invite-modal" role="dialog" aria-modal="true" aria-labelledby="new-user-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" aria-label="Fechar cadastro de usuário" disabled={creatingUser} onClick={() => setUserModalOpen(false)}>×</button>
        <p className="eyebrow">ACESSO DA EQUIPE</p>
        <h2 id="new-user-title">Criar novo usuário</h2>
        <p>Informe os dados abaixo. A pessoa receberá um convite por e-mail para definir a própria senha.</p>
        <form className="user-invite-form" onSubmit={createUser}>
          {userCreateError && <div className="auth-error invite-feedback">{userCreateError}</div>}
          <div className="form-grid">
            <label className="wide">Nome completo<input name="name" minLength={2} maxLength={120} placeholder="Nome da pessoa" required autoComplete="name" /></label>
            <label className="wide">E-mail<input name="email" type="email" maxLength={254} placeholder="pessoa@empresa.com.br" required autoComplete="email" /></label>
            <label className="wide">Nível de acesso<select name="role" defaultValue="viewer"><option value="viewer">Usuário — visualiza e comenta</option><option value="production">Operador — movimenta e agenda</option><option value="admin">Administrador — acesso completo</option></select></label>
          </div>
          <div className="invite-help">O convite é individual. Não compartilhe o link recebido por e-mail com outras pessoas.</div>
          <div className="actions"><button type="button" disabled={creatingUser} onClick={() => setUserModalOpen(false)}>Cancelar</button><button type="submit" className="primary" disabled={creatingUser}>{creatingUser ? "Enviando convite…" : "Enviar convite"}</button></div>
        </form>
      </div>
    </div>}
  </main>;
}
