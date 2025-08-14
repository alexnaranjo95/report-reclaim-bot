import React from 'react';
import { DataProvider } from '../context/DataProvider';
import { Dashboard } from './credit-report/Dashboard';

const CreditReportDashboard: React.FC = () => {
  return (
    <DataProvider>
      <Dashboard />
    </DataProvider>
  );
};

export default CreditReportDashboard;