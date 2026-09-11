import type { Role } from "@prisma/client";

/**
 * Papéis e o que cada um pode fazer (item 44 do briefing).
 * O escopo por empresa (organizationId) é aplicado sempre, em toda query,
 * independentemente do papel — ver src/lib/tenant.ts.
 */

export type Action =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "assign"
  | "configure"
  | "view_all_sellers"
  | "manage_users"
  | "manage_integrations"
  | "operate_logistics";

export type Resource =
  | "lead"
  | "contact"
  | "company"
  | "customer"
  | "conversation"
  | "funnel"
  | "quote"
  | "order"
  | "shipment"
  | "product"
  | "report"
  | "integration"
  | "user"
  | "settings";

const MATRIX: Record<Role, Partial<Record<Resource, Action[]>>> = {
  ADMIN: {
    lead: ["view", "create", "edit", "delete", "assign", "view_all_sellers"],
    contact: ["view", "create", "edit", "delete"],
    company: ["view", "create", "edit", "delete"],
    customer: ["view", "create", "edit", "delete"],
    conversation: ["view", "create", "edit", "assign", "view_all_sellers"],
    funnel: ["view", "create", "edit", "delete", "configure"],
    quote: ["view", "create", "edit", "delete"],
    order: ["view", "create", "edit", "delete"],
    shipment: ["view", "create", "edit", "delete", "operate_logistics"],
    product: ["view", "create", "edit", "delete"],
    report: ["view", "view_all_sellers"],
    integration: ["view", "configure", "manage_integrations"],
    user: ["view", "create", "edit", "delete", "manage_users"],
    settings: ["view", "configure"],
  },
  MANAGER: {
    lead: ["view", "create", "edit", "assign", "view_all_sellers"],
    contact: ["view", "create", "edit"],
    company: ["view", "create", "edit"],
    customer: ["view", "create", "edit"],
    conversation: ["view", "edit", "assign", "view_all_sellers"],
    funnel: ["view", "configure"],
    quote: ["view", "create", "edit"],
    order: ["view", "create", "edit"],
    shipment: ["view", "edit"],
    product: ["view", "create", "edit"],
    report: ["view", "view_all_sellers"],
    integration: ["view"],
    user: ["view"],
    settings: ["view"],
  },
  SELLER: {
    lead: ["view", "create", "edit"],
    contact: ["view", "create", "edit"],
    company: ["view", "create", "edit"],
    customer: ["view", "create"],
    conversation: ["view", "edit"],
    funnel: ["view"],
    quote: ["view", "create", "edit"],
    order: ["view"],
    shipment: ["view"],
    product: ["view"],
    report: ["view"],
  },
  OPERATIONS: {
    lead: ["view"],
    customer: ["view"],
    order: ["view", "edit"],
    shipment: ["view", "create", "edit", "operate_logistics"],
    product: ["view"],
    quote: ["view"],
    report: ["view"],
  },
  VIEWER: {
    lead: ["view"],
    contact: ["view"],
    company: ["view"],
    customer: ["view"],
    conversation: ["view"],
    funnel: ["view"],
    quote: ["view"],
    order: ["view"],
    shipment: ["view"],
    product: ["view"],
    report: ["view"],
  },
};

export function can(role: Role, action: Action, resource: Resource): boolean {
  return MATRIX[role]?.[resource]?.includes(action) ?? false;
}

/** Vê os leads de todos os vendedores, ou só os próprios? */
export function seesAllSellers(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
