import React from "react";

interface JsonViewProps { data: any; }

const JsonView: React.FC<JsonViewProps> = ({ data }) => {
  return (
    <div className="w-full rounded-md border bg-card text-card-foreground shadow-sm">
      <pre className="max-h-[60vh] overflow-auto p-4 text-left text-sm">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

export default JsonView;
