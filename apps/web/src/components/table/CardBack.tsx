interface CardBackProps {
  small?: boolean;
}

export function CardBack({ small = false }: CardBackProps) {
  return (
    <div className={`table-card-back ${small ? "table-card-back-small" : ""}`} aria-hidden>
      <span className="table-card-back-dot" />
    </div>
  );
}
