"use client";

import { useEffect } from "react";
import type { Client, Order, Profile, Sector } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";
import { reportClientEvent } from "@/services/observability-client";

type ChangePayload<T> = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Partial<T>;
  old: Partial<T>;
};

type UsePcpRealtimeOptions = {
  enabled: boolean;
  onOrderChange: (payload: ChangePayload<Order>) => void | Promise<void>;
  onCommentChange: (orderId: string) => void | Promise<void>;
  onProfileChange: (payload: ChangePayload<Profile>) => void;
  onClientChange: (payload: ChangePayload<Client>) => void;
  onSectorChange: (payload: ChangePayload<Sector>) => void;
};

export function usePcpRealtime(options: UsePcpRealtimeOptions) {
  const {
    enabled,
    onOrderChange,
    onCommentChange,
    onProfileChange,
    onClientChange,
    onSectorChange,
  } = options;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`pcp-live-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        void onOrderChange(payload as ChangePayload<Order>);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_comments" }, (payload) => {
        const record = payload.eventType === "DELETE" ? payload.old : payload.new;
        const orderId = String((record as { order_id?: string }).order_id || "");
        if (orderId) void onCommentChange(orderId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
        onProfileChange(payload as ChangePayload<Profile>);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, (payload) => {
        onClientChange(payload as ChangePayload<Client>);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sectors" }, (payload) => {
        onSectorChange(payload as ChangePayload<Sector>);
      })
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void reportClientEvent({
            level: "warning",
            source: "supabase_realtime",
            action: "subscribe",
            message: error?.message || `Canal realtime em estado ${status}.`,
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, onOrderChange, onCommentChange, onProfileChange, onClientChange, onSectorChange]);
}
