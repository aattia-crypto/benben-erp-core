/** IPC channel names — mirrored in shared/types/ipc.ts */
export const IPC = {
  app: {
    getVersion: "app:getVersion",
    getPaths: "app:getPaths",
    ping: "app:ping",
    getDiagnostics: "app:getDiagnostics",
  },
  auth: {
    login: "auth:login",
    logout: "auth:logout",
    getSession: "auth:getSession",
    initializeAdmin: "auth:initializeAdmin",
    provisionUser: "auth:provisionUser",
    changePassword: "auth:changePassword",
  },
  backup: {
    create: "backup:create",
    list: "backup:list",
    restore: "backup:restore",
    getHealth: "backup:getHealth",
    setPolicy: "backup:setPolicy",
    verify: "backup:verify",
    runScheduled: "backup:runScheduled",
  },
  email: {
    send: "email:send",
    test: "email:test",
    verifyConnection: "email:verifyConnection",
  },
  dialog: {
    pickFolder: "dialog:pickFolder",
    pickFile: "dialog:pickFile",
    validatePath: "dialog:validatePath",
  },
  system: {
    getStatus: "system:getStatus",
    listActivityLogs: "system:listActivityLogs",
  },
  update: {
    check: "update:check",
    getStatus: "update:getStatus",
  },
  support: {
    exportBundle: "support:exportBundle",
  },
  hr: {
    getEmployees: "hr:getEmployees",
    listActiveEmployees: "hr:listActiveEmployees",
    createEmployee: "hr:createEmployee",
    getTimecards: "hr:getTimecards",
    createTimecard: "hr:createTimecard",
    approveTimecard: "hr:approveTimecard",
    getPayrollRuns: "hr:getPayrollRuns",
    createPayrollRun: "hr:createPayrollRun",
  },
  payroll: {
    calculate: "payroll:calculate",
    finalize: "payroll:finalize",
    importExternal: "payroll:importExternal",
  },
  permissions: {
    listRoles: "permissions:listRoles",
    updateRole: "permissions:updateRole",
    assignUserRole: "permissions:assignUserRole",
    getForUser: "permissions:getForUser",
    listUsers: "permissions:listUsers",
    deactivateUser: "permissions:deactivateUser",
    reactivateUser: "permissions:reactivateUser",
    deleteUser: "permissions:deleteUser",
    resetUserPassword: "permissions:resetUserPassword",
  },
  finance: {
    runConsolidation: "finance:runConsolidation",
    calculateTax: "finance:calculateTax",
    createSampleBudget: "finance:createSampleBudget",
  },
  ai: {
    sendQuery: "ai:sendQuery",
    saveApiKey: "ai:saveApiKey",
    getStatus: "ai:getStatus",
  },
  licensing: {
    getStatus: "licensing:getStatus",
    getMachineFingerprint: "licensing:getMachineFingerprint",
    activate: "licensing:activate",
    saveLocal: "licensing:saveLocal",
    readLocal: "licensing:readLocal",
  },
  branding: {
    get: "branding:get",
    update: "branding:update",
  },
  print: {
    printHtml: "print:printHtml",
  },
  onboarding: {
    checkAndBootstrapDatabase: "onboarding:checkAndBootstrapDatabase",
    verifyNetworkPort: "onboarding:verifyNetworkPort",
  },
  migration: {
    getStatus: "migration:getStatus",
    importSnapshot: "migration:importSnapshot",
  },
  operations: {
    inventory: {
      list: "operations:inventory:list",
      listMovements: "operations:inventory:listMovements",
      findByScan: "operations:inventory:findByScan",
      create: "operations:inventory:create",
      update: "operations:inventory:update",
      delete: "operations:inventory:delete",
      adjustStock: "operations:inventory:adjustStock",
      applyWeightedCosts: "operations:inventory:applyWeightedCosts",
      valuation: "operations:inventory:valuation",
    },
    location: {
      list: "operations:location:list",
      get: "operations:location:get",
      create: "operations:location:create",
      update: "operations:location:update",
      archive: "operations:location:archive",
    },
    manufacturing: {
      getState: "operations:manufacturing:getState",
      createBatch: "operations:manufacturing:createBatch",
      updateBatchStatus: "operations:manufacturing:updateBatchStatus",
      updateStageStatus: "operations:manufacturing:updateStageStatus",
      recordMaterialUsage: "operations:manufacturing:recordMaterialUsage",
      recordLabor: "operations:manufacturing:recordLabor",
      saveBom: "operations:manufacturing:saveBom",
      createBomVersion: "operations:manufacturing:createBomVersion",
    },
    purchasing: {
      getState: "operations:purchasing:getState",
      createOrder: "operations:purchasing:createOrder",
      submit: "operations:purchasing:submit",
      approve: "operations:purchasing:approve",
      deny: "operations:purchasing:deny",
      getPoLog: "operations:purchasing:getPoLog",
      receive: "operations:purchasing:receive",
    },
    imports: {
      list: "operations:imports:list",
      create: "operations:imports:create",
      update: "operations:imports:update",
      attachFile: "operations:imports:attachFile",
      applyLandedCost: "operations:imports:applyLandedCost",
    },
    crm: {
      getState: "operations:crm:getState",
      importEntity: "operations:crm:importEntity",
      createEntity: "operations:crm:createEntity",
      updateEntity: "operations:crm:updateEntity",
      addActivity: "operations:crm:addActivity",
      addReminder: "operations:crm:addReminder",
      completeReminder: "operations:crm:completeReminder",
    },
    pipeline: {
      getState: "operations:pipeline:getState",
      createOpportunity: "operations:pipeline:createOpportunity",
      moveStage: "operations:pipeline:moveStage",
      createTask: "operations:pipeline:createTask",
      completeTask: "operations:pipeline:completeTask",
    },
    sales: {
      getState: "operations:sales:getState",
      createQuote: "operations:sales:createQuote",
      convertQuoteToOrder: "operations:sales:convertQuoteToOrder",
      convertOrderToInvoice: "operations:sales:convertOrderToInvoice",
    },
    pos: {
      getState: "operations:pos:getState",
      saveSale: "operations:pos:saveSale",
      reverseSale: "operations:pos:reverseSale",
      flushQueue: "operations:pos:flushQueue",
      clearTransactions: "operations:pos:clearTransactions",
      getOpsState: "operations:pos:getOpsState",
      createOnlineOrder: "operations:pos:createOnlineOrder",
      updateOnlineOrderStatus: "operations:pos:updateOnlineOrderStatus",
      recordReturn: "operations:pos:recordReturn",
      recordVoid: "operations:pos:recordVoid",
    },
    loyalty: {
      list: "operations:loyalty:list",
      earnPoints: "operations:loyalty:earnPoints",
      redeemPoints: "operations:loyalty:redeemPoints",
    },
    blindspot: {
      create: "operations:blindspot:create",
      update: "operations:blindspot:update",
      delete: "operations:blindspot:delete",
      getForEntity: "operations:blindspot:getForEntity",
      uploadVideo: "operations:blindspot:uploadVideo",
    },
  },
} as const;

export const APP_NAME = "Benben ERP";
/** Isolated AppData folder for Presenter / Evaluation demo executables. */
export const DEMO_APP_NAME = "Benben ERP Demo";
/** Pre-rebrand AppData folder — used only when migrating existing installs. */
export const LEGACY_APP_NAME = "NexusCore";
/** TanStack dev server default (see renderer/ vite output). */
export const DEFAULT_UI_URL = "http://localhost:8080";
