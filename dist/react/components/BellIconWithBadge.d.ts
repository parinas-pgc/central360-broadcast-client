export interface BellIconWithBadgeProps {
    className?: string;
    /** Custom click handler (e.g., to navigate to a full-page inbox view). */
    onClick?: () => void;
    /** Override the default popover panel with custom content. */
    renderPanel?: (close: () => void) => React.ReactNode;
}
export declare function BellIconWithBadge({ className, onClick, renderPanel }: BellIconWithBadgeProps): import("react/jsx-runtime").JSX.Element;
