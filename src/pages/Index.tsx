import { useState } from 'react';
import { Dashboard } from '@/components/Dashboard';
import { SessionList } from '@/components/SessionList';
import { Session } from '@/services/SessionService';

const Index = () => {
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [showCreateNew, setShowCreateNew] = useState(false);

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    setShowCreateNew(false);
  };

  const handleCreateNew = () => {
    setSelectedSession(null);
    setShowCreateNew(true);
  };

  return (
    <div className="min-h-screen flex w-full">
      <div className="w-80 border-r border-border bg-card">
        <SessionList 
          onSelectSession={handleSelectSession}
          selectedSessionId={selectedSession?.id}
          onCreateNew={handleCreateNew}
        />
      </div>
      <main className="flex-1">
        <Dashboard 
          selectedSession={selectedSession}
          showCreateNew={showCreateNew}
          onSessionCreated={handleSelectSession}
        />
      </main>
    </div>
  );
};

export default Index;
