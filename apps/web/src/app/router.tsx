import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/app-layout';
import { BatchCustomerChangePage } from '../pages/batch-customer-change/page';
import { CustomerInventoryPage } from '../pages/customer-inventory/page';
import { CustomerManagementPage } from '../pages/customer-management/page';
import { DashboardPage } from '../pages/dashboard/page';
import { DetailDownloadPage } from '../pages/detail-download/page';
import { ExceptionPoolPage } from '../pages/exception-pool/page';
import { InboundRecordsPage } from '../pages/inbound-records/page';
import { InboundScanPage } from '../pages/inbound-scan/page';
import { OutboundPackingPage } from '../pages/outbound-packing/page';
import { PackageAlertsPage } from '../pages/package-alerts/page';
import { PackagePrealertsPage } from '../pages/package-prealerts/page';
import { SystemSettingsPage } from '../pages/system-settings/page';
import { UpcLibraryPage } from '../pages/upc-library/page';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="inbound-scan" element={<InboundScanPage />} />
          <Route path="package-prealerts" element={<PackagePrealertsPage />} />
          <Route path="package-alerts" element={<PackageAlertsPage />} />
          <Route path="inbound-records" element={<InboundRecordsPage />} />
          <Route path="customer-inventory" element={<CustomerInventoryPage />} />
          <Route path="outbound-packing" element={<OutboundPackingPage />} />
          <Route path="exception-pool" element={<ExceptionPoolPage />} />
          <Route path="batch-customer-change" element={<BatchCustomerChangePage />} />
          <Route path="detail-download" element={<DetailDownloadPage />} />
          <Route path="upc-library" element={<UpcLibraryPage />} />
          <Route path="customer-management" element={<CustomerManagementPage />} />
          <Route path="system-settings" element={<SystemSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
