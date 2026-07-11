import { createFileRoute } from '@tanstack/react-router';
import { FinancePoApprovalsPage } from '@/lib/po-finance-approvals-page';

export const Route = createFileRoute('/finance-po-approvals')({
  component: FinancePoApprovalsPage,
});
