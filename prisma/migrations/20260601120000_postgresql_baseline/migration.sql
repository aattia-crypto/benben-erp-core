-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AppMeta" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "permissionsOverride" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "label" TEXT NOT NULL,
    "category" TEXT,
    "accessHr" BOOLEAN NOT NULL DEFAULT false,
    "executePayroll" BOOLEAN NOT NULL DEFAULT false,
    "viewGeneralLedger" BOOLEAN NOT NULL DEFAULT false,
    "modifyGeneralLedger" BOOLEAN NOT NULL DEFAULT false,
    "modifyInventory" BOOLEAN NOT NULL DEFAULT false,
    "accessPos" BOOLEAN NOT NULL DEFAULT false,
    "exportReports" BOOLEAN NOT NULL DEFAULT false,
    "manageUsers" BOOLEAN NOT NULL DEFAULT false,
    "viewOperations" BOOLEAN NOT NULL DEFAULT true,
    "viewFinance" BOOLEAN NOT NULL DEFAULT false,
    "viewInventory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrgRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "logoPath" TEXT,
    "defaultPrinter" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlJournalEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "entryDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "memo" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlJournalLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "journalEntryId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "description" TEXT,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amountFx" DOUBLE PRECISION,
    "fxRate" DOUBLE PRECISION,
    "costCenterId" TEXT,

    CONSTRAINT "GlJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "bankAccountCode" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fileName" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "bankStatementId" TEXT NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "checkNumber" TEXT,
    "description" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "matchedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "bankTransactionId" TEXT NOT NULL,
    "journalLineId" TEXT,
    "journalEntryId" TEXT,
    "matchedAmount" DOUBLE PRECISION NOT NULL,
    "matchType" TEXT NOT NULL,
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ReconciliationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "defaultUsefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
    "glAssetAccountCode" TEXT NOT NULL,
    "glAccumDepAccountCode" TEXT NOT NULL,
    "glExpenseAccountCode" TEXT NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "acquisitionCost" DOUBLE PRECISION NOT NULL,
    "salvageValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "bookValue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationSchedule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "fixedAssetId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "depreciationAmount" DOUBLE PRECISION NOT NULL,
    "bookValueAfter" DOUBLE PRECISION NOT NULL,
    "journalEntryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepreciationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "runYear" INTEGER NOT NULL,
    "runMonth" INTEGER NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assetsProcessed" INTEGER NOT NULL DEFAULT 0,
    "totalDepreciation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',

    CONSTRAINT "DepreciationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLineItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "budgetPlanId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "budgetAmount" DOUBLE PRECISION NOT NULL,
    "alertThreshold" DOUBLE PRECISION,

    CONSTRAINT "BudgetLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxZone" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "postalPrefix" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaxZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "taxZoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "taxCategory" TEXT NOT NULL DEFAULT 'STANDARD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxInvoiceSnapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "invoiceRef" TEXT NOT NULL,
    "invoiceType" TEXT NOT NULL DEFAULT 'SALES',
    "originAddress" TEXT,
    "destinationAddress" TEXT,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxTotal" DOUBLE PRECISION NOT NULL,
    "grandTotal" DOUBLE PRECISION NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxInvoiceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxAuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "action" TEXT NOT NULL,
    "entityRef" TEXT,
    "detail" TEXT,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyExchangeRate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntercompanyJournalEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "fromEntityCode" TEXT NOT NULL,
    "toEntityCode" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "fromJournalEntryId" TEXT,
    "toJournalEntryId" TEXT,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntercompanyJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidationRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "parentEntityCode" TEXT NOT NULL DEFAULT 'PARENT',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "eliminationEntryId" TEXT,
    "fxRevaluationEntryId" TEXT,
    "notes" TEXT,

    CONSTRAINT "ConsolidationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArInvoice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "invoiceNumber" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "linesJson" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shipping" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "terms" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "sourceRef" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArPayment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "customerCode" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unapplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "memo" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArPaymentAllocation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ArPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArCreditMemo" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "customerCode" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "creditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalEntryId" TEXT,

    CONSTRAINT "ArCreditMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApBill" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "billNumber" TEXT NOT NULL,
    "vendorCode" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "poId" TEXT,
    "linesJson" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "billDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApPayment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "vendorCode" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "memo" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApPaymentAllocation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "paymentId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ApPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApVendorCredit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "vendorCode" TEXT NOT NULL,
    "billId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "creditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "journalEntryId" TEXT,

    CONSTRAINT "ApVendorCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmQuote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "quoteNumber" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "opportunityId" TEXT,
    "linesJson" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "convertedToInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "userId" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlPostingFingerprint" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL DEFAULT 'default',
    "fingerprint" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "module" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlPostingFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "payType" TEXT NOT NULL DEFAULT 'HOURLY',
    "taxClassification" TEXT NOT NULL,
    "baseWage" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timecard" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "totalHours" DOUBLE PRECISION NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Timecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossPay" DOUBLE PRECISION NOT NULL,
    "deductions" DOUBLE PRECISION NOT NULL,
    "netPay" DOUBLE PRECISION NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OrgRole_orgId_idx" ON "OrgRole"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRole_orgId_id_key" ON "OrgRole"("orgId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GlAccount_orgId_type_idx" ON "GlAccount"("orgId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GlAccount_orgId_code_key" ON "GlAccount"("orgId", "code");

-- CreateIndex
CREATE INDEX "GlJournalEntry_orgId_entryDate_idx" ON "GlJournalEntry"("orgId", "entryDate");

-- CreateIndex
CREATE INDEX "GlJournalEntry_orgId_source_idx" ON "GlJournalEntry"("orgId", "source");

-- CreateIndex
CREATE INDEX "GlJournalLine_journalEntryId_idx" ON "GlJournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "GlJournalLine_orgId_accountCode_idx" ON "GlJournalLine"("orgId", "accountCode");

-- CreateIndex
CREATE INDEX "GlJournalLine_costCenterId_idx" ON "GlJournalLine"("costCenterId");

-- CreateIndex
CREATE INDEX "BankStatement_orgId_bankAccountCode_statementDate_idx" ON "BankStatement"("orgId", "bankAccountCode", "statementDate");

-- CreateIndex
CREATE INDEX "BankTransaction_bankStatementId_idx" ON "BankTransaction"("bankStatementId");

-- CreateIndex
CREATE INDEX "BankTransaction_orgId_matchStatus_idx" ON "BankTransaction"("orgId", "matchStatus");

-- CreateIndex
CREATE INDEX "BankTransaction_orgId_txnDate_amount_idx" ON "BankTransaction"("orgId", "txnDate", "amount");

-- CreateIndex
CREATE INDEX "ReconciliationLog_bankTransactionId_idx" ON "ReconciliationLog"("bankTransactionId");

-- CreateIndex
CREATE INDEX "ReconciliationLog_journalLineId_idx" ON "ReconciliationLog"("journalLineId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_orgId_code_key" ON "AssetCategory"("orgId", "code");

-- CreateIndex
CREATE INDEX "FixedAsset_orgId_status_idx" ON "FixedAsset"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_orgId_assetTag_key" ON "FixedAsset"("orgId", "assetTag");

-- CreateIndex
CREATE INDEX "DepreciationSchedule_orgId_periodYear_periodMonth_status_idx" ON "DepreciationSchedule"("orgId", "periodYear", "periodMonth", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationSchedule_fixedAssetId_periodYear_periodMonth_key" ON "DepreciationSchedule"("fixedAssetId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_orgId_runYear_runMonth_key" ON "DepreciationRun"("orgId", "runYear", "runMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_orgId_code_key" ON "CostCenter"("orgId", "code");

-- CreateIndex
CREATE INDEX "BudgetPlan_orgId_fiscalYear_idx" ON "BudgetPlan"("orgId", "fiscalYear");

-- CreateIndex
CREATE INDEX "BudgetLineItem_orgId_periodYear_periodMonth_idx" ON "BudgetLineItem"("orgId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLineItem_budgetPlanId_costCenterId_accountCode_period_key" ON "BudgetLineItem"("budgetPlanId", "costCenterId", "accountCode", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "TaxZone_orgId_code_key" ON "TaxZone"("orgId", "code");

-- CreateIndex
CREATE INDEX "TaxRate_taxZoneId_taxCategory_effectiveFrom_idx" ON "TaxRate"("taxZoneId", "taxCategory", "effectiveFrom");

-- CreateIndex
CREATE INDEX "TaxInvoiceSnapshot_orgId_invoiceRef_idx" ON "TaxInvoiceSnapshot"("orgId", "invoiceRef");

-- CreateIndex
CREATE INDEX "TaxAuditLog_orgId_createdAt_idx" ON "TaxAuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "CurrencyExchangeRate_orgId_rateDate_idx" ON "CurrencyExchangeRate"("orgId", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyExchangeRate_orgId_fromCurrency_toCurrency_rateDate_key" ON "CurrencyExchangeRate"("orgId", "fromCurrency", "toCurrency", "rateDate");

-- CreateIndex
CREATE INDEX "IntercompanyJournalEntry_orgId_periodYear_periodMonth_elimi_idx" ON "IntercompanyJournalEntry"("orgId", "periodYear", "periodMonth", "eliminated");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidationRun_orgId_periodYear_periodMonth_key" ON "ConsolidationRun"("orgId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "ArInvoice_orgId_customerCode_idx" ON "ArInvoice"("orgId", "customerCode");

-- CreateIndex
CREATE INDEX "ArInvoice_orgId_status_idx" ON "ArInvoice"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ArInvoice_orgId_invoiceNumber_key" ON "ArInvoice"("orgId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "ArPayment_orgId_customerCode_idx" ON "ArPayment"("orgId", "customerCode");

-- CreateIndex
CREATE INDEX "ArPaymentAllocation_paymentId_idx" ON "ArPaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "ArPaymentAllocation_invoiceId_idx" ON "ArPaymentAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "ArCreditMemo_orgId_customerCode_idx" ON "ArCreditMemo"("orgId", "customerCode");

-- CreateIndex
CREATE INDEX "ApBill_orgId_vendorCode_idx" ON "ApBill"("orgId", "vendorCode");

-- CreateIndex
CREATE INDEX "ApBill_orgId_status_idx" ON "ApBill"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApBill_orgId_billNumber_key" ON "ApBill"("orgId", "billNumber");

-- CreateIndex
CREATE INDEX "ApPayment_orgId_vendorCode_idx" ON "ApPayment"("orgId", "vendorCode");

-- CreateIndex
CREATE INDEX "ApPaymentAllocation_paymentId_idx" ON "ApPaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "ApPaymentAllocation_billId_idx" ON "ApPaymentAllocation"("billId");

-- CreateIndex
CREATE INDEX "ApVendorCredit_orgId_vendorCode_idx" ON "ApVendorCredit"("orgId", "vendorCode");

-- CreateIndex
CREATE INDEX "CrmQuote_orgId_customerCode_idx" ON "CrmQuote"("orgId", "customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "CrmQuote_orgId_quoteNumber_key" ON "CrmQuote"("orgId", "quoteNumber");

-- CreateIndex
CREATE INDEX "ActivityLog_orgId_createdAt_idx" ON "ActivityLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_module_createdAt_idx" ON "ActivityLog"("module", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GlPostingFingerprint_orgId_fingerprint_key" ON "GlPostingFingerprint"("orgId", "fingerprint");

-- CreateIndex
CREATE INDEX "Timecard_employeeId_idx" ON "Timecard"("employeeId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlJournalLine" ADD CONSTRAINT "GlJournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlJournalLine" ADD CONSTRAINT "GlJournalLine_orgId_accountCode_fkey" FOREIGN KEY ("orgId", "accountCode") REFERENCES "GlAccount"("orgId", "code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlJournalLine" ADD CONSTRAINT "GlJournalLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankStatementId_fkey" FOREIGN KEY ("bankStatementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationLog" ADD CONSTRAINT "ReconciliationLog_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationLog" ADD CONSTRAINT "ReconciliationLog_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "GlJournalLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationLog" ADD CONSTRAINT "ReconciliationLog_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationSchedule" ADD CONSTRAINT "DepreciationSchedule_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationRun" ADD CONSTRAINT "DepreciationRun_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLineItem" ADD CONSTRAINT "BudgetLineItem_budgetPlanId_fkey" FOREIGN KEY ("budgetPlanId") REFERENCES "BudgetPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLineItem" ADD CONSTRAINT "BudgetLineItem_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_taxZoneId_fkey" FOREIGN KEY ("taxZoneId") REFERENCES "TaxZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercompanyJournalEntry" ADD CONSTRAINT "IntercompanyJournalEntry_fromJournalEntryId_fkey" FOREIGN KEY ("fromJournalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntercompanyJournalEntry" ADD CONSTRAINT "IntercompanyJournalEntry_toJournalEntryId_fkey" FOREIGN KEY ("toJournalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidationRun" ADD CONSTRAINT "ConsolidationRun_eliminationEntryId_fkey" FOREIGN KEY ("eliminationEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArInvoice" ADD CONSTRAINT "ArInvoice_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArPayment" ADD CONSTRAINT "ArPayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArPaymentAllocation" ADD CONSTRAINT "ArPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ArPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArPaymentAllocation" ADD CONSTRAINT "ArPaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ArInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArCreditMemo" ADD CONSTRAINT "ArCreditMemo_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "ArInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArCreditMemo" ADD CONSTRAINT "ArCreditMemo_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApBill" ADD CONSTRAINT "ApBill_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApPayment" ADD CONSTRAINT "ApPayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApPaymentAllocation" ADD CONSTRAINT "ApPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ApPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApPaymentAllocation" ADD CONSTRAINT "ApPaymentAllocation_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ApBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApVendorCredit" ADD CONSTRAINT "ApVendorCredit_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ApBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApVendorCredit" ADD CONSTRAINT "ApVendorCredit_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "GlJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timecard" ADD CONSTRAINT "Timecard_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

