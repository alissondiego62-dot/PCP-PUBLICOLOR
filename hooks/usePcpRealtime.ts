"use client";

import { useEffect } from "react";
import type { Client, Order, Profile, Sector } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";
import { reportClientEvent } from "@/services/observability-client";

type ChangePayload<T> = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Partial<T>; old: Partial<T> };
type RealtimeScope = { orders?: boolean; comments?: boolean; profiles?: boolean; clients?: boolean; sectors?: boolean };
type UsePcpRealtimeOptions = {
  enabled: boolean;
  scope: RealtimeScope;
  onOrderChange: (payload: ChangePayload<Order>) => void | Promise<void>;
  onCommentChange: (orderId: string) => void | Promise<void>;
  onProfileChange: (payload: ChangePayload<Profile>) => void;
  onClientChange: (payload: ChangePayload<Client>) => void;
  onSectorChange: (payload: ChangePayload<Sector>) => void;
};

export function usePcpRealtime({ enabled,scope,onOrderChange,onCommentChange,onProfileChange,onClientChange,onSectorChange }: UsePcpRealtimeOptions) {
  useEffect(() => {
    if (!enabled || !Object.values(scope).some(Boolean)) return;
    let channel = supabase.channel(`pcp-${Object.entries(scope).filter(([,value])=>value).map(([key])=>key).join("-")}-${Date.now()}`);
    if (scope.orders) channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => { void onOrderChange(payload as ChangePayload<Order>); });
    if (scope.comments) channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "order_comments" }, (payload) => { const record=payload.eventType==="DELETE"?payload.old:payload.new;const orderId=String((record as {order_id?:string}).order_id||"");if(orderId)void onCommentChange(orderId); });
    if (scope.profiles) channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => onProfileChange(payload as ChangePayload<Profile>));
    if (scope.clients) channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "clients" }, (payload) => onClientChange(payload as ChangePayload<Client>));
    if (scope.sectors) channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "sectors" }, (payload) => onSectorChange(payload as ChangePayload<Sector>));
    channel.subscribe((status,error)=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")void reportClientEvent({level:"warning",source:"supabase_realtime",action:"subscribe",message:error?.message||`Canal realtime em estado ${status}.`});});
    return () => { void supabase.removeChannel(channel); };
  }, [enabled,scope.orders,scope.comments,scope.profiles,scope.clients,scope.sectors,onOrderChange,onCommentChange,onProfileChange,onClientChange,onSectorChange]);
}
