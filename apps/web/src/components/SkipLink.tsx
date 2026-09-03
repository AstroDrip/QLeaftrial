export function SkipLink({ children = "Skip to content" }: { children?: React.ReactNode }) {
  return (
    <a href="#main-content" className="skip-link" data-testid="skip-link">
      {children}
    </a>
  );
}
