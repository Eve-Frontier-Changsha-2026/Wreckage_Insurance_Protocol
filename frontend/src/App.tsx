import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import InsurePage from './pages/insure/InsurePage';
import PolicyDetailPage from './pages/insure/PolicyDetailPage';
import ClaimPage from './pages/claims/ClaimPage';
import ClaimHistoryPage from './pages/claims/ClaimHistoryPage';
import PoolDashboard from './pages/pool/PoolDashboard';
import DepositPage from './pages/pool/DepositPage';
import WithdrawPage from './pages/pool/WithdrawPage';
import AuctionListPage from './pages/salvage/AuctionListPage';
import AuctionDetailPage from './pages/salvage/AuctionDetailPage';
import DemoPanel from './pages/demo/DemoPanel';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="insure" element={<InsurePage />} />
        <Route path="insure/:policyId" element={<PolicyDetailPage />} />
        <Route path="claims" element={<ClaimPage />} />
        <Route path="claims/history" element={<ClaimHistoryPage />} />
        <Route path="pool" element={<PoolDashboard />} />
        <Route path="pool/deposit" element={<DepositPage />} />
        <Route path="pool/withdraw" element={<WithdrawPage />} />
        <Route path="salvage" element={<AuctionListPage />} />
        <Route path="salvage/:auctionId" element={<AuctionDetailPage />} />
        <Route path="demo" element={<DemoPanel />} />
      </Route>
    </Routes>
  );
}
