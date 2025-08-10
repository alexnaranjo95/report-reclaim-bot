import React from "react";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import HtmlBlock from "./HtmlBlock";

interface VirtualizedHtmlListProps {
  items: string[];
  height?: number;
  itemSize?: number;
  className?: string;
}

const VirtualizedHtmlList: React.FC<VirtualizedHtmlListProps> = ({
  items,
  height = 480,
  itemSize = 140,
  className,
}) => {
  const Row = ({ index, style }: ListChildComponentProps) => (
    <div style={style} className="px-2">
      <div className="rounded-md border bg-card text-card-foreground shadow-sm">
        <div className="p-3">
          <HtmlBlock html={items[index]} />
        </div>
      </div>
    </div>
  );

  return (
    <div className={className}>
      <List height={height} itemCount={items.length} itemSize={itemSize} width="100%">
        {Row}
      </List>
    </div>
  );
};

export default VirtualizedHtmlList;
