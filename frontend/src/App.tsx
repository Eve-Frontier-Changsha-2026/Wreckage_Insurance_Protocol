import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';

function Placeholder({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500 text-lg">{name} — coming soon</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Placeholder name="Dashboard" />} />
        <Route path="insure" element={<Placeholder name="Insurance" />} />
        <Route path="insure/:policyId" element={<Placeholder name="Policy Detail" />} />
        <Route path="claims" element={<Placeholder name="Claims" />} />
        <Route path="claims/history" element={<Placeholder name="Claim History" />} />
        <Route path="pool" element={<Placeholder name="LP Pool" />} />
        <Route path="pool/deposit" element={<Placeholder name="Deposit" />} />
        <Route path="pool/withdraw" element={<Placeholder name="Withdraw" />} />
        <Route path="salvage" element={<Placeholder name="Salvage Auctions" />} />
        <Route path="salvage/:auctionId" element={<Placeholder name="Auction Detail" />} />
        <Route path="demo" element={<Placeholder name="Demo Panel" />} />
      </Route>
    </Routes>
  );
}
