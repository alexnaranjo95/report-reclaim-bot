import React from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

interface HtmlBlockProps {
  html?: string | null;
  className?: string;
}

function normalizeContent(input?: string | null) {
  if (!input || input.trim() === "" || input.trim() === "--" || input.trim().toLowerCase() === "null") {
    return "<div>N/A</div>";
  }
  return input.replace(/(^|\s)--(\s|$)/g, "$1N/A$2");
}

const HtmlBlock: React.FC<HtmlBlockProps> = ({ html, className }) => {
  const safe = React.useMemo(() => {
    const normalized = normalizeContent(html);
    return DOMPurify.sanitize(normalized ?? "", { USE_PROFILES: { html: true } });
  }, [html]);

  return (
    <div
      className={cn("prose prose-sm dark:prose-invert max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
};

export default HtmlBlock;
