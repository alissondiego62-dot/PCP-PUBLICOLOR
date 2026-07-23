"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppRole } from "@/lib/pcp-types";
import { defaultRolePermissions, type PermissionKey } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";

type RoleRow = { role: AppRole; permission_key: PermissionKey; allowed: boolean };
type OverrideRow = { permission_key: PermissionKey; allowed: boolean };

export function useAppPermissions({ userId, role, active, online }: { userId?: string | null; role?: AppRole | null; active?: boolean; online: boolean }) {
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId || !role || !active || !online) {
      setRoleRows([]); setOverrides([]); setLoading(false); return;
    }
    setLoading(true);
    const [roleResult, overrideResult] = await Promise.all([
      supabase.from("role_permissions").select("role,permission_key,allowed").eq("role", role),
      supabase.from("user_permission_overrides").select("permission_key,allowed").eq("user_id", userId),
    ]);
    if (!roleResult.error) setRoleRows((roleResult.data || []) as RoleRow[]);
    if (!overrideResult.error) setOverrides((overrideResult.data || []) as OverrideRow[]);
    setLoading(false);
  }, [active, online, role, userId]);

  useEffect(() => { void load(); }, [load]);

  const permissionMap = useMemo(() => {
    const map = new Map<PermissionKey, boolean>();
    if (role) for (const key of defaultRolePermissions[role]) map.set(key, true);
    for (const row of roleRows) map.set(row.permission_key, row.allowed);
    for (const row of overrides) map.set(row.permission_key, row.allowed);
    if (role === "admin") {
      map.set("users.manage", true);
      map.set("settings.permissions", true);
    }
    return map;
  }, [overrides, role, roleRows]);

  const has = useCallback((permission: PermissionKey) => Boolean(active && permissionMap.get(permission)), [active, permissionMap]);
  return { has, loading, reload: load };
}
