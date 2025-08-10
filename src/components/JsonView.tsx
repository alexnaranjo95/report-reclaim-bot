import React from "react";

interface JsonViewProps { data: any; }

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function syntaxHighlight(jsonString: string) {
  const escaped = escapeHtml(jsonString);
  // keys
  let highlighted = escaped.replace(/(&quot;)([^&]+?)(&quot;\s*:)/g, '<span class="text-primary">$1$2$3</span>');
  // strings
  highlighted = highlighted.replace(/:&nbsp;?(&quot;.*?&quot;)/g, ': <span class="text-emerald-600 dark:text-emerald-400">$1</span>');
  // numbers
  highlighted = highlighted.replace(/(\b-?\d+(?:\.\d+)?\b)/g, '<span class="text-amber-600 dark:text-amber-400">$1</span>');
  // booleans/null
  highlighted = highlighted.replace(/\b(true|false|null)\b/g, '<span class="text-sky-600 dark:text-sky-400">$1</span>');
  return highlighted;
}

const JsonView: React.FC<JsonViewProps> = ({ data }) => {
  const json = JSON.stringify(data ?? {}, null, 2);
  return (
    <div className="w-full rounded-md border bg-card text-card-foreground shadow-sm">
      <pre className="max-h-[60vh] overflow-auto p-4 text-left text-sm">
        <code className="whitespace-pre" dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }} />
      </pre>
    </div>
  );
};

export default JsonView;
