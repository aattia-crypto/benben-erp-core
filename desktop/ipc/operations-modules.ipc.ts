import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";

import { IPC } from "../constants";
import * as blindSpotService from "../services/operations/blind-spot.service";
import * as crmService from "../services/operations/crm.service";
import * as importsService from "../services/operations/imports.service";
import * as loyaltyService from "../services/operations/loyalty.service";
import * as manufacturingService from "../services/operations/manufacturing.service";
import * as pipelineService from "../services/operations/pipeline.service";
import * as posService from "../services/operations/pos.service";
import * as purchasingService from "../services/operations/purchasing.service";
import * as salesService from "../services/operations/sales.service";
import { assertTokenPermission } from "../services/permissions.service";
import type { PermissionKey } from "../services/permissions.types";
import { logger } from "../utils/logger";
import { extractToken } from "./permission-guard";
import { resolveActor } from "./audit-context";

type AuthPayload = { token?: string; orgId?: string };

function ipcError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("Operations modules IPC handler failed", {
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });
  return { ok: false as const, error: message };
}

function resolveOrgId(payload: AuthPayload): string {
  return payload.orgId?.trim() || "default";
}

async function requireOperationsRead(_event: IpcMainInvokeEvent, payload: AuthPayload) {
  const token = extractToken(payload);
  const keys: PermissionKey[] = [
    "view_operations",
    "view_inventory",
    "modify_inventory",
    "manage_users",
  ];
  for (const key of keys) {
    try {
      return await assertTokenPermission(token, key);
    } catch {
      // try next
    }
  }
  throw new Error("Permission denied: view_operations");
}

async function requireOperationsWrite(_event: IpcMainInvokeEvent, payload: AuthPayload) {
  const token = extractToken(payload);
  try {
    return await assertTokenPermission(token, "modify_inventory");
  } catch {
    return assertTokenPermission(token, "manage_users");
  }
}

export function registerOperationsModulesIpc(): void {
  const m = IPC.operations;

  ipcMain.handle(m.manufacturing.getState, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await manufacturingService.getManufacturingState(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.manufacturing.createBatch,
    async (event, payload: AuthPayload & { input: manufacturingService.NewBatchInputDto }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await manufacturingService.createBatch(resolveOrgId(payload), payload.input);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.manufacturing.updateBatchStatus,
    async (
      event,
      payload: AuthPayload & { batchId: string; status: manufacturingService.ProductionBatchDto["status"] },
    ) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await manufacturingService.updateBatchStatus(
          resolveOrgId(payload),
          payload.batchId,
          payload.status,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.manufacturing.updateStageStatus,
    async (
      event,
      payload: AuthPayload & {
        batchId: string;
        stageId: string;
        status: manufacturingService.ProductionStageDto["status"];
      },
    ) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await manufacturingService.updateStageStatus(
          resolveOrgId(payload),
          payload.batchId,
          payload.stageId,
          payload.status,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.manufacturing.recordMaterialUsage,
    async (event, payload: AuthPayload & { batchId: string; sku: string; qty: number }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await manufacturingService.recordMaterialUsage(
          resolveOrgId(payload),
          payload.batchId,
          payload.sku,
          payload.qty,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.manufacturing.recordLabor,
    async (
      event,
      payload: AuthPayload & { batchId: string; stageId: string; hours: number; rate?: number },
    ) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await manufacturingService.recordLabor(
          resolveOrgId(payload),
          payload.batchId,
          payload.stageId,
          payload.hours,
          payload.rate,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.manufacturing.saveBom,
    async (event, payload: AuthPayload & { bom: manufacturingService.BomVersionDto & { id?: string } }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await manufacturingService.saveBom(resolveOrgId(payload), payload.bom);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.manufacturing.createBomVersion,
    async (
      event,
      payload: AuthPayload & {
        productSku: string;
        lines: manufacturingService.BomLineDto[];
        notes?: string;
        meta?: { bomCode?: string; name?: string };
      },
    ) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await manufacturingService.createBomVersion(
          resolveOrgId(payload),
          payload.productSku,
          payload.lines,
          payload.notes,
          payload.meta,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.purchasing.getState, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await purchasingService.getPurchasingState(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.purchasing.createOrder,
    async (event, payload: AuthPayload & { order: purchasingService.PurchaseOrderDto }) => {
      try {
        await requireOperationsWrite(event, payload);
        const actor = await resolveActor(extractToken(payload));
        const data = await purchasingService.createPurchaseOrder(resolveOrgId(payload), payload.order, actor ?? undefined);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.purchasing.submit, async (event, payload: AuthPayload & { id: string }) => {
    try {
      await requireOperationsWrite(event, payload);
      const actor = await resolveActor(extractToken(payload));
      const data = await purchasingService.submitPOForApproval(resolveOrgId(payload), payload.id, actor ?? undefined);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.purchasing.approve, async (event, payload: AuthPayload & { id: string }) => {
    try {
      await assertTokenPermission(extractToken(payload), "modify_general_ledger");
      const actor = await resolveActor(extractToken(payload));
      const data = await purchasingService.approvePO(resolveOrgId(payload), payload.id, actor ?? undefined);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.purchasing.deny,
    async (event, payload: AuthPayload & { id: string; reason: string }) => {
      try {
        await assertTokenPermission(extractToken(payload), "modify_general_ledger");
        const actor = await resolveActor(extractToken(payload));
        const data = await purchasingService.denyPO(
          resolveOrgId(payload),
          payload.id,
          payload.reason,
          actor ?? undefined,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.purchasing.getPoLog, async (event, payload: AuthPayload & { poId: string }) => {
    try {
      await requireOperationsRead(event, payload);
      const data = await purchasingService.getPoLogs(resolveOrgId(payload), payload.poId);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.purchasing.receive,
    async (event, payload: AuthPayload & { id: string; sku: string; qty: number }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await purchasingService.receivePO(
          resolveOrgId(payload),
          payload.id,
          payload.sku,
          payload.qty,
          (await resolveActor(extractToken(payload))) ?? undefined,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.imports.list, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await importsService.listShipments(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.imports.create,
    async (event, payload: AuthPayload & { shipment: importsService.ImportShipmentDto }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await importsService.createShipment(resolveOrgId(payload), payload.shipment);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.imports.update,
    async (event, payload: AuthPayload & { id: string; patch: Partial<importsService.ImportShipmentDto> }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await importsService.updateShipment(resolveOrgId(payload), payload.id, payload.patch);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.imports.attachFile,
    async (event, payload: AuthPayload & { shipmentId: string; name: string; size: number }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await importsService.attachFile(
          resolveOrgId(payload),
          payload.shipmentId,
          payload.name,
          payload.size,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.imports.applyLandedCost, async (event, payload: AuthPayload & { shipmentId: string }) => {
    try {
      await requireOperationsWrite(event, payload);
      const data = await importsService.applyLandedCostToInventory(resolveOrgId(payload), payload.shipmentId);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.crm.getState, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await crmService.getCrmState(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.crm.importEntity,
    async (event, payload: AuthPayload & { input: Parameters<typeof crmService.importEntityRecord>[1] }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await crmService.importEntityRecord(resolveOrgId(payload), payload.input);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.crm.createEntity,
    async (event, payload: AuthPayload & { entity: crmService.EntityDto }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await crmService.createEntity(resolveOrgId(payload), payload.entity);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.crm.updateEntity,
    async (event, payload: AuthPayload & { id: string; patch: Partial<crmService.EntityInputDto> }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await crmService.updateEntity(resolveOrgId(payload), payload.id, payload.patch);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.crm.addActivity,
    async (
      event,
      payload: AuthPayload & {
        entityId: string;
        type: crmService.CrmActivityDto["type"];
        subject: string;
        body: string;
      },
    ) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await crmService.addActivity(
          resolveOrgId(payload),
          payload.entityId,
          payload.type,
          payload.subject,
          payload.body,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.crm.addReminder,
    async (event, payload: AuthPayload & { entityId: string; title: string; dueAt: string }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await crmService.addReminder(
          resolveOrgId(payload),
          payload.entityId,
          payload.title,
          payload.dueAt,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.crm.completeReminder, async (event, payload: AuthPayload & { id: string }) => {
    try {
      await requireOperationsWrite(event, payload);
      const data = await crmService.completeReminder(resolveOrgId(payload), payload.id);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.pipeline.getState, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await pipelineService.getPipelineState(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.pipeline.createOpportunity,
    async (event, payload: AuthPayload & { opportunity: pipelineService.OpportunityDto }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await pipelineService.createOpportunity(resolveOrgId(payload), payload.opportunity);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.pipeline.moveStage,
    async (event, payload: AuthPayload & { id: string; stage: pipelineService.PipelineStage }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await pipelineService.moveOpportunityStage(
          resolveOrgId(payload),
          payload.id,
          payload.stage,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.pipeline.createTask,
    async (event, payload: AuthPayload & { input: Omit<pipelineService.CrmTaskDto, "id" | "completed"> }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await pipelineService.createCrmTask(resolveOrgId(payload), payload.input);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.pipeline.completeTask, async (event, payload: AuthPayload & { id: string }) => {
    try {
      await requireOperationsWrite(event, payload);
      const data = await pipelineService.completeCrmTask(resolveOrgId(payload), payload.id);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.sales.getState, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await salesService.getSalesState(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.sales.createQuote,
    async (event, payload: AuthPayload & { quote: salesService.SalesQuoteDto }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await salesService.createQuote(resolveOrgId(payload), payload.quote);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.sales.convertQuoteToOrder, async (event, payload: AuthPayload & { quoteId: string }) => {
    try {
      await requireOperationsWrite(event, payload);
      const data = await salesService.convertQuoteToOrder(resolveOrgId(payload), payload.quoteId);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.sales.convertOrderToInvoice, async (event, payload: AuthPayload & { orderId: string }) => {
    try {
      await requireOperationsWrite(event, payload);
      const data = await salesService.convertOrderToInvoice(resolveOrgId(payload), payload.orderId);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.pos.getState, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await posService.getPosState(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.pos.saveSale, async (event, payload: AuthPayload & { sale: posService.PosSaleDto }) => {
    try {
      await requireOperationsWrite(event, payload);
      const data = await posService.savePosSale(resolveOrgId(payload), payload.sale);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.pos.reverseSale, async (event, payload: AuthPayload & { saleId: string }) => {
    try {
      await requireOperationsWrite(event, payload);
      const data = await posService.reversePosSale(resolveOrgId(payload), payload.saleId);
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.pos.flushQueue, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsWrite(event, payload);
      const data = await posService.flushPosQueue(resolveOrgId(payload));
      return { ok: true, data };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.pos.clearTransactions, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsWrite(event, payload);
      await posService.clearPosTransactionData(resolveOrgId(payload));
      return { ok: true, data: { cleared: true } };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(m.pos.getOpsState, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await posService.getPosOpsState(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.pos.createOnlineOrder,
    async (
      event,
      payload: AuthPayload & { input: Omit<posService.OnlineOrderDto, "id" | "orderNumber" | "placedAt" | "status"> },
    ) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await posService.createOnlineOrder(resolveOrgId(payload), payload.input);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.pos.updateOnlineOrderStatus,
    async (event, payload: AuthPayload & { id: string; status: posService.OnlineOrderStatus }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await posService.updateOnlineOrderStatus(
          resolveOrgId(payload),
          payload.id,
          payload.status,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.pos.recordReturn,
    async (
      event,
      payload: AuthPayload & {
        saleRef: string;
        lines: { sku: string; qty: number }[];
        reason: string;
        refundMethod: posService.PosReturnDto["refundMethod"];
        restocked: boolean;
      },
    ) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await posService.recordReturn(
          resolveOrgId(payload),
          payload.saleRef,
          payload.lines,
          payload.reason,
          payload.refundMethod,
          payload.restocked,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.pos.recordVoid,
    async (event, payload: AuthPayload & { saleRef: string; reason: string; managerPin?: string }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await posService.recordVoid(
          resolveOrgId(payload),
          payload.saleRef,
          payload.reason,
          payload.managerPin,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.loyalty.list, async (event, payload: AuthPayload) => {
    try {
      await requireOperationsRead(event, payload);
      return { ok: true, data: await loyaltyService.listLoyaltyAccounts(resolveOrgId(payload)) };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.loyalty.earnPoints,
    async (event, payload: AuthPayload & { customerCode: string; points: number; ref: string }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await loyaltyService.earnPoints(
          resolveOrgId(payload),
          payload.customerCode,
          payload.points,
          payload.ref,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.loyalty.redeemPoints,
    async (event, payload: AuthPayload & { customerCode: string; points: number; ref: string }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await loyaltyService.redeemPoints(
          resolveOrgId(payload),
          payload.customerCode,
          payload.points,
          payload.ref,
        );
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.blindspot.create,
    async (event, payload: AuthPayload & { entry: blindSpotService.BlindSpotEntryDto }) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await blindSpotService.createEntry(resolveOrgId(payload), payload.entry);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.blindspot.update,
    async (
      event,
      payload: AuthPayload & {
        id: string;
        patch: Partial<Omit<blindSpotService.BlindSpotEntryDto, "id" | "createdAt" | "updatedAt">>;
      },
    ) => {
      try {
        await requireOperationsWrite(event, payload);
        const data = await blindSpotService.updateEntry(resolveOrgId(payload), payload.id, payload.patch);
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(
    m.blindspot.getForEntity,
    async (event, payload: AuthPayload & { query?: blindSpotService.BlindSpotQueryDto }) => {
      try {
        await requireOperationsRead(event, payload);
        const data = await blindSpotService.getForEntity(resolveOrgId(payload), payload.query ?? {});
        return { ok: true, data };
      } catch (err) {
        return ipcError(err);
      }
    },
  );

  ipcMain.handle(m.blindspot.delete, async (event, payload: AuthPayload & { id: string }) => {
    try {
      await requireOperationsWrite(event, payload);
      await blindSpotService.deleteEntry(resolveOrgId(payload), payload.id);
      return { ok: true, data: null };
    } catch (err) {
      return ipcError(err);
    }
  });

  ipcMain.handle(
    m.blindspot.uploadVideo,
    async (event, payload: AuthPayload & { entryId: string; sourcePath: string }) => {
      try {
        await requireOperationsWrite(event, payload);
        const videoFilePath = blindSpotService.uploadBlindSpotVideo(payload.entryId, payload.sourcePath);
        return { ok: true, data: { videoFilePath } };
      } catch (err) {
        return ipcError(err);
      }
    },
  );
}
