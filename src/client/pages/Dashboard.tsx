import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { formatCurrency, formatDate } from '../lib/formatters.js';
import { TrendingUp, Users, Calendar, DollarSign } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { StayInTouchCard } from '../components/StayInTouch.js';

interface DashboardData {
  yearlyTotal: number;
  yearlyCount: number;
  monthlyTotal: number;
  monthlyCount: number;
  activeDonorCount: number;
  recentBatches: {
    id: number;
    date: string;
    description: string | null;
    status: string;
    totalAmount: number;
    offeringCount: number;
  }[];
  categoryBreakdown: {
    categoryName: string;
    totalAmount: number;
  }[];
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    api.reports
      .dashboard()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <div className="text-red-600 p-4">Error: {error}</div>;
  }
  if (!data) {
    return <div className="text-gray-500 p-4">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      {user?.role === 'admin' && user.username !== 'demo' && <StayInTouchCard />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">This Month</p>
              <p className="stat-value tabular-nums font-mono">{formatCurrency(data.monthlyTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">{data.monthlyCount} offerings</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">This Year</p>
              <p className="stat-value tabular-nums font-mono">{formatCurrency(data.yearlyTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">{data.yearlyCount} offerings</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Active Donors</p>
              <p className="stat-value">{data.activeDonorCount}</p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Recent Batches</p>
              <p className="stat-value">{data.recentBatches.length}</p>
            </div>
            <div className="h-12 w-12 bg-orange-100 rounded-full flex items-center justify-center">
              <Calendar className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Batches</h2>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recentBatches.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <Link to={`/batches/${batch.id}`} className="text-primary-600 hover:underline font-medium">
                        {formatDate(batch.date)}
                      </Link>
                    </td>
                    <td>
                      <span className={batch.status === 'open' ? 'badge-yellow' : 'badge-green'}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="text-right font-medium font-mono">{formatCurrency(batch.totalAmount)}</td>
                    <td className="text-right">{batch.offeringCount}</td>
                  </tr>
                ))}
                {data.recentBatches.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-gray-400 py-8">
                      No batches yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Year-to-Date by Category</h2>
          </div>
          <div className="p-6 space-y-4">
            {data.categoryBreakdown.map((cat) => {
              const pct = data.yearlyTotal > 0 ? (cat.totalAmount / data.yearlyTotal) * 100 : 0;
              return (
                <div key={cat.categoryName}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{cat.categoryName}</span>
                    <span className="text-gray-600 font-mono">{formatCurrency(cat.totalAmount)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className="bg-primary-500 h-2.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {data.categoryBreakdown.length === 0 && (
              <p className="text-center text-gray-400 py-4">No data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
